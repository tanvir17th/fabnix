import { createTestApp, TestApp, uniq } from './utils/test-app';
import { ShopFixture, openingStock, ownerWithShop, product } from './utils/fixtures';

/**
 * Stock table: Total fabric · On hand · Stock value (on hand × SELLING price) · Total profit
 * (Σ actual sold amount − purchase cost). Every stock event must update the row immediately.
 */
describe('stock table: total fabric, on hand, stock value, total profit', () => {
  let t: TestApp;
  let f: ShopFixture;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

  beforeAll(async () => {
    t = await createTestApp();
    f = await ownerWithShop(t);
  });
  afterAll(() => t.close());

  const owner = () => t.api.as(f.token);
  const row = async (productId: string) => {
    const r = await owner().get(`/shops/${f.shopId}/inventory?limit=100`);
    return r.body.items.find((i: { product: { id: string } }) => i.product.id === productId);
  };
  const yd = (n: number) => (n * 36).toFixed(4);
  const sell = async (productId: string, measurement: string, amount: string, extra: Record<string, unknown> = {}) => {
    const r = await owner().post(
      `/shops/${f.shopId}/sales`,
      { branchId: f.branchId, items: [{ productId, measurement, ...extra }], payments: [{ paymentMethodId: f.cashMethodId, amount }] },
      { idem: uniq() },
    );
    expect(r.status).toBe(201);
    return r.body;
  };

  it('example 1: 10 yd at ৳10/yd selling → stock value 100.00; nothing sold → profit 0.00', async () => {
    const p = await product(t, f, { name: 'Cotton', sku: uniq('COT'), sellingRate: '10', purchaseRate: '8' });
    await openingStock(t, f, p.id, '10 yd');
    expect(await row(p.id)).toMatchObject({
      totalReceivedInches: yd(10),
      onHandInches: yd(10),
      sellingPrice: '10.00',
      purchasePrice: '8.00',
      valuation: '100.00',
      totalPurchaseValue: '80.00', // 10 yd × ৳8
      soldInches: '0.0000',
      totalProfit: '0.00',
    });
  });

  it('example 2: purchase ৳100, 1 yd sold at ৳150 → profit 50.00; on hand and value drop, total fabric stays', async () => {
    const p = await product(t, f, { name: 'Lilan', sku: uniq('LIL'), sellingRate: '150', purchaseRate: '100' });
    await openingStock(t, f, p.id, '10 yd');
    await sell(p.id, '1 yd', '150');
    expect(await row(p.id)).toMatchObject({
      totalReceivedInches: yd(10),
      onHandInches: yd(9),
      valuation: '1350.00', // 9 yd × 150
      totalPurchaseValue: '1000.00', // total fabric 10 yd × ৳100 — selling doesn't change it
      soldInches: yd(1),
      totalProfit: '50.00',
    });
  });

  it('adjust-in and purchases add to total fabric; adjust-out/damage reduce on hand only', async () => {
    const p = await product(t, f, { name: 'Khadi', sku: uniq('KHD'), sellingRate: '300', purchaseRate: '200' });
    await openingStock(t, f, p.id, '10 yd');
    await owner().post(`/shops/${f.shopId}/inventory/adjustments`, { branchId: f.branchId, productId: p.id, type: 'ADJUSTMENT_IN', measurement: '5 yd', reason: 'Found roll' });
    expect(await row(p.id)).toMatchObject({ totalReceivedInches: yd(15), onHandInches: yd(15), valuation: '4500.00' });

    const supplierId = (await owner().post(`/shops/${f.shopId}/suppliers`, { name: 'Mills', phone: '01999000222' })).body.id;
    const pur = await owner().post(
      `/shops/${f.shopId}/purchases`,
      { branchId: f.branchId, supplierId, purchaseDate: today, items: [{ productId: p.id, measurement: '10 yd', unitCost: '200' }] },
      { idem: uniq('pur') },
    );
    expect(pur.status).toBe(201);
    expect(await row(p.id)).toMatchObject({ totalReceivedInches: yd(25), onHandInches: yd(25), valuation: '7500.00' });

    await owner().post(`/shops/${f.shopId}/inventory/adjustments`, { branchId: f.branchId, productId: p.id, type: 'DAMAGE_OUT', measurement: '2 yd', reason: 'Water damage' });
    expect(await row(p.id)).toMatchObject({ totalReceivedInches: yd(25), onHandInches: yd(23), valuation: '6900.00', totalProfit: '0.00' });

    // reversing the purchase takes it back out of total fabric
    await owner().post(`/shops/${f.shopId}/purchases/${pur.body.id}/cancel`, { reason: 'Wrong delivery' });
    expect(await row(p.id)).toMatchObject({ totalReceivedInches: yd(15), onHandInches: yd(13), totalPurchaseValue: '3000.00' });
  });

  it('profit uses the ACTUAL sold price (discounts) and reverts when a sale is cancelled', async () => {
    const p = await product(t, f, { name: 'Silk', sku: uniq('SLK'), sellingRate: '150', purchaseRate: '100' });
    await openingStock(t, f, p.id, '10 yd');
    // 2 yd at 150 with ৳20 off the line → sold for 280; cost 200 → profit 80
    const sale = await sell(p.id, '2 yd', '280', { discount: { type: 'FIXED', value: '20' } });
    expect(await row(p.id)).toMatchObject({ onHandInches: yd(8), soldInches: yd(2), totalProfit: '80.00', valuation: '1200.00' });

    const c = await owner().post(`/shops/${f.shopId}/sales/${sale.id}/cancel`, { reason: 'Customer changed mind' });
    expect(c.status).toBe(201);
    expect(await row(p.id)).toMatchObject({ totalReceivedInches: yd(10), onHandInches: yd(10), soldInches: '0.0000', totalProfit: '0.00', valuation: '1500.00' });
  });

  it('a fabric sold without any purchase price shows no profit (not a fake full-revenue profit)', async () => {
    const p = await product(t, f, { name: 'Print', sku: uniq('PRT'), sellingRate: '120', purchaseRate: undefined });
    await openingStock(t, f, p.id, '10 yd');
    await sell(p.id, '1 yd', '120');
    expect(await row(p.id)).toMatchObject({ purchasePrice: null, valuation: '1080.00', totalPurchaseValue: null, totalProfit: null, uncostedSoldLines: 1 });
    await owner().patch(`/shops/${f.shopId}/products/${p.id}`, { purchaseRate: '90' });
    expect(await row(p.id)).toMatchObject({ totalProfit: '30.00', uncostedSoldLines: 0 });
  });

  it('stock value follows selling-price edits immediately', async () => {
    const p = await product(t, f, { name: 'Voyel', sku: uniq('VOY'), sellingRate: '120', purchaseRate: '70' });
    await openingStock(t, f, p.id, '6000 yd');
    expect(await row(p.id)).toMatchObject({ valuation: '720000.00', totalPurchaseValue: '420000.00' }); // 6,000 yd × ৳70
    await owner().patch(`/shops/${f.shopId}/products/${p.id}`, { sellingRate: '125' });
    expect((await row(p.id)).valuation).toBe('750000.00');
  });

  it('your table: Print 500.5 yd × ৳90 = 45,045.00 and Lilan 800 yd × ৳100 = 80,000.00', async () => {
    const print = await product(t, f, { name: 'Print 500', sku: uniq('PRT'), sellingRate: '120', purchaseRate: '90' });
    await openingStock(t, f, print.id, '500.5 yd');
    await sell(print.id, '10 yd', '1200');
    expect(await row(print.id)).toMatchObject({ totalReceivedInches: yd(500.5), totalPurchaseValue: '45045.00' });
    const lilan = await product(t, f, { name: 'Lilan 800', sku: uniq('LIL'), sellingRate: '150', purchaseRate: '100' });
    await openingStock(t, f, lilan.id, '800 yd');
    expect((await row(lilan.id)).totalPurchaseValue).toBe('80000.00');
    await owner().patch(`/shops/${f.shopId}/products/${lilan.id}`, { purchaseRate: '110' });
    expect((await row(lilan.id)).totalPurchaseValue).toBe('88000.00'); // follows purchase-price edits
  });
});
