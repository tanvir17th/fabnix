import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, TestApp, uniq } from './utils/test-app';
import { ShopFixture, openingStock, ownerWithShop, product } from './utils/fixtures';

/**
 * FR-061 profit estimate — reproduces the reported screen:
 *   Lilan 10.5 yd × ৳150 (cost ৳100/yd) + Print 10 yd × ৳120 (sold with NO purchase price)
 *   Revenue 2,775 · COGS 1,050 · Expenses 50 · Net 1,675  ← Print's cost missing.
 * After the fix, Print at ৳90/yd adds 900 → COGS 1,950 · Gross 825 · Net 775.
 */
describe('profit report: cost of fabric sold (COGS)', () => {
  let t: TestApp;
  let f: ShopFixture;
  let lilan: string;
  let print: string;
  let today: string;

  beforeAll(async () => {
    t = await createTestApp();
    f = await ownerWithShop(t);
    today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
    lilan = (await product(t, f, { name: 'Lilan', sku: uniq('LIL'), sellingRate: '150', purchaseRate: '100' })).id;
    print = (await product(t, f, { name: 'Print', sku: uniq('PRT'), sellingRate: '120', purchaseRate: undefined })).id;
    await openingStock(t, f, lilan, '100 yd');
    await openingStock(t, f, print, '100 yd');
    const sale = await t.api.as(f.token).post(
      `/shops/${f.shopId}/sales`,
      { branchId: f.branchId, items: [{ productId: lilan, measurement: '10.5 yd' }, { productId: print, measurement: '10 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '2775' }] },
      { idem: uniq() },
    );
    expect(sale.status).toBe(201);
    const cats = await t.api.as(f.token).get(`/shops/${f.shopId}/expense-categories`);
    await t.api.as(f.token).post(`/shops/${f.shopId}/expenses`, { categoryId: cats.body[0].id, amount: '50', expenseDate: today });
  });
  afterAll(() => t.close());

  const profit = async () => (await t.api.as(f.token).get(`/shops/${f.shopId}/reports/profit?from=${today}&to=${today}`)).body;
  const printLine = () => t.prisma.saleItem.findFirstOrThrow({ where: { productId: print } });

  it('reproduces the bug state: Print sold without a purchase price is flagged, not silently free', async () => {
    expect(await profit()).toMatchObject({
      revenue: '2775.00',
      costOfGoodsSold: '1050.00', // 10.5 yd × ৳100
      grossProfit: '1725.00',
      expenses: '50.00',
      netProfit: '1675.00',
      uncostedLines: 1,
      estimatedCostLines: 0,
    });
  });

  it('report falls back to the fabric’s CURRENT purchase price for lines with no recorded cost', async () => {
    // Price set without the backfill (e.g. data from before this fix).
    await t.prisma.product.update({ where: { id: print }, data: { purchaseRate: '90' } });
    expect((await printLine()).costPerInch?.toFixed(2)).toBe('0.00');
    expect(await profit()).toMatchObject({
      costOfGoodsSold: '1950.00', // 1,050 + 10 yd × ৳90
      grossProfit: '825.00',
      netProfit: '775.00',
      estimatedCostLines: 1,
      uncostedLines: 0,
    });
    await t.prisma.product.update({ where: { id: print }, data: { purchaseRate: null } });
  });

  it('setting the purchase price via Edit backfills the uncosted sale line (and audits it)', async () => {
    const r = await t.api.as(f.token).patch(`/shops/${f.shopId}/products/${print}`, { purchaseRate: '90' });
    expect(r.status).toBe(200);
    expect((await printLine()).costPerInch?.toFixed(10)).toBe('2.5000000000'); // ৳90 / 36 in
    expect(await profit()).toMatchObject({ costOfGoodsSold: '1950.00', grossProfit: '825.00', netProfit: '775.00', estimatedCostLines: 0, uncostedLines: 0 });
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'stock.revalue', targetId: print }, orderBy: { createdAt: 'desc' } });
    expect(audit?.after).toMatchObject({ backfilledSaleLines: 1, backfilledOrderLines: 0 });
  });

  it('never rewrites a cost that WAS recorded at sale time', async () => {
    await t.api.as(f.token).patch(`/shops/${f.shopId}/products/${lilan}`, { purchaseRate: '120' });
    const lilanLine = await t.prisma.saleItem.findFirstOrThrow({ where: { productId: lilan } });
    expect(lilanLine.costPerInch?.toFixed(4)).toBe('2.7778'); // still ৳100/yd
    expect((await profit()).costOfGoodsSold).toBe('1950.00');
  });

  it('values per-metre fabrics in metres (no yard/metre unit mismatch)', async () => {
    const silk = (await product(t, f, { name: 'Silk', sku: uniq('SLK'), sellingRate: '900', priceUnitCode: 'METRE', purchaseRate: undefined })).id;
    await openingStock(t, f, silk, '10 m');
    await t.api.as(f.token).post(
      `/shops/${f.shopId}/sales`,
      { branchId: f.branchId, items: [{ productId: silk, measurement: '2 m' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '1800' }] },
      { idem: uniq() },
    );
    await t.prisma.product.update({ where: { id: silk }, data: { purchaseRate: '500' } }); // fallback path
    const p = await profit();
    expect(p.costOfGoodsSold).toBe('2950.00'); // 1,950 + 2 m × ৳500
    expect(p.estimatedCostLines).toBe(1);
  });

  it('the migration backfills existing uncosted lines', async () => {
    await t.prisma.saleItem.updateMany({ where: { productId: print }, data: { costPerInch: 0 } });
    const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '20261122000000_backfill_missing_line_costs', 'migration.sql'), 'utf8');
    for (const stmt of sql.split(';').map((x) => x.replace(/--.*$/gm, '').trim()).filter(Boolean)) await t.prisma.$executeRawUnsafe(stmt);
    expect((await printLine()).costPerInch?.toFixed(10)).toBe('2.5000000000');
  });
});
