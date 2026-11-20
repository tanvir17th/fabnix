import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, TestApp, uniq } from './utils/test-app';
import { ShopFixture, openingStock, ownerWithShop, product } from './utils/fixtures';

/**
 * Stock valuation (FR-033, FR-068): value = on-hand × CURRENT unit purchase price,
 * exact decimals; purchase price edits revalue stock immediately.
 */
describe('stock valuation & purchase price sync', () => {
  let t: TestApp;
  let f: ShopFixture;

  beforeAll(async () => {
    t = await createTestApp();
    f = await ownerWithShop(t);
  });
  afterAll(() => t.close());

  const owner = () => t.api.as(f.token);
  const stockRow = async (productId: string) => {
    const r = await owner().get(`/shops/${f.shopId}/inventory?limit=100`);
    return r.body.items.find((i: { product: { id: string } }) => i.product.id === productId);
  };

  it('a fabric created without a purchase price shows no price and no (fake 0.00) value', async () => {
    const print = await product(t, f, { name: 'Print', sku: 'PRINT-1', sellingRate: '120', purchaseRate: undefined });
    await openingStock(t, f, print.id, '20 yd');
    const row = await stockRow(print.id);
    expect(row).toMatchObject({ purchasePrice: null, valuation: null, priceUnitCode: 'YARD', onHandInches: '720.0000' });
  });

  it('adding the purchase price later via Edit updates price, value and stock records immediately', async () => {
    const lilan = await product(t, f, { name: 'Lilan', sku: 'LILAN-1', sellingRate: '200', purchaseRate: undefined });
    await openingStock(t, f, lilan.id, '20 yd');
    const r = await owner().patch(`/shops/${f.shopId}/products/${lilan.id}`, { purchaseRate: '150' });
    expect(r.status).toBe(200);
    expect(await stockRow(lilan.id)).toMatchObject({ purchasePrice: '150.00', valuation: '3000.00' }); // 20 yd × 150
    const inv = await t.prisma.inventory.findFirstOrThrow({ where: { productId: lilan.id } });
    expect(inv.avgCostPerInch.toFixed(10)).toBe('4.1666666667'); // 150 / 36 at 10 dp
    const audit = await t.prisma.auditLog.findFirst({ where: { shopId: f.shopId, action: 'stock.revalue', targetId: lilan.id } });
    expect(audit?.before).toMatchObject({ purchaseRate: null });
    expect(audit?.after).toMatchObject({ purchaseRate: '150', inventoryRows: 1 });
  });

  it('Voyel: 6,000 yd at ৳70 is exactly 420,000.00 (was 419,999.90), and at ৳80 exactly 480,000.00', async () => {
    const voyel = await product(t, f, { name: 'Voyel', sku: uniq('VOY'), sellingRate: '120', purchaseRate: '70' });
    await openingStock(t, f, voyel.id, '6000 yd');
    expect(await stockRow(voyel.id)).toMatchObject({ purchasePrice: '70.00', valuation: '420000.00' });

    await owner().patch(`/shops/${f.shopId}/products/${voyel.id}`, { purchaseRate: '80' });
    expect(await stockRow(voyel.id)).toMatchObject({ purchasePrice: '80.00', valuation: '480000.00' });

    // COGS uses the revalued cost too — 10 yd sold costs exactly 800.00.
    const sale = await owner().post(
      `/shops/${f.shopId}/sales`,
      { branchId: f.branchId, items: [{ productId: voyel.id, measurement: '10 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '1200' }] },
      { idem: uniq() },
    );
    expect(sale.status).toBe(201);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
    const profit = await owner().get(`/shops/${f.shopId}/reports/profit?from=${today}&to=${today}`);
    expect(profit.body).toMatchObject({ revenue: '1200.00', costOfGoodsSold: '800.00', grossProfit: '400.00' });
    expect(await stockRow(voyel.id)).toMatchObject({ valuation: '479200.00' }); // 5,990 yd × 80
  });

  it('values per-metre fabrics in metres', async () => {
    const silk = await product(t, f, { name: 'Silk', sku: uniq('SILK'), sellingRate: '900', purchaseRate: '500', priceUnitCode: 'METRE' });
    await openingStock(t, f, silk.id, '3 m');
    expect(await stockRow(silk.id)).toMatchObject({ purchasePrice: '500.00', priceUnitCode: 'METRE', valuation: '1500.00' });
  });

  it('editing only the purchase price does not reset other fields (Zod default regression)', async () => {
    const p = await product(t, f, { name: 'Muslin', sku: uniq('MUS'), sellingRate: '300', priceUnitCode: 'METRE', availableInPos: false });
    await owner().patch(`/shops/${f.shopId}/products/${p.id}`, { purchaseRate: '210' });
    const after = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ priceUnitCode: 'METRE', availableInPos: false });
    expect(after.purchaseRate?.toString()).toBe('210');

    // same class of bug: toggling a delivery option must keep its fee; editing the shop keeps currency
    await owner().put(`/shops/${f.shopId}/storefront`, { slug: uniq('shop').toLowerCase().replace(/[^a-z0-9-]/g, ''), displayName: 'S' });
    const opt = await owner().post(`/shops/${f.shopId}/storefront/delivery-options`, { method: 'HOME_DELIVERY', name: 'Dhaka', flatFee: '60' });
    await owner().patch(`/shops/${f.shopId}/storefront/delivery-options/${opt.body.id}`, { isActive: false });
    expect((await t.prisma.deliveryOption.findUniqueOrThrow({ where: { id: opt.body.id } })).flatFee.toFixed(2)).toBe('60.00');
    await owner().patch(`/shops/${f.shopId}`, { name: 'Renamed' });
    expect(await t.prisma.shop.findUniqueOrThrow({ where: { id: f.shopId } })).toMatchObject({ currency: 'BDT', defaultLanguage: 'bn', timezone: 'Asia/Dhaka' });
  });

  it('the migration resyncs stale stock records from the current purchase price', async () => {
    const p = await product(t, f, { name: 'Stale', sku: uniq('STL'), sellingRate: '100', purchaseRate: '80' });
    await openingStock(t, f, p.id, '6000 yd');
    // Simulate pre-fix data: cost captured at ৳70 with 6-dp truncation.
    await t.prisma.inventory.updateMany({ where: { productId: p.id }, data: { avgCostPerInch: '1.944444' } });
    const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '20261121000000_cost_precision_and_revalue', 'migration.sql'), 'utf8');
    const update = sql.slice(sql.indexOf('UPDATE "inventory"'));
    await t.prisma.$executeRawUnsafe(update);
    const inv = await t.prisma.inventory.findFirstOrThrow({ where: { productId: p.id } });
    expect(inv.avgCostPerInch.toFixed(10)).toBe('2.2222222222');
    expect(await stockRow(p.id)).toMatchObject({ valuation: '480000.00' });
  });
});
