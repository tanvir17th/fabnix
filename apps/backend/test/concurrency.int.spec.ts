import { D, sum } from '@fabnix/shared';
import { createTestApp, TestApp, uniq } from './utils/test-app';
import { Session, ShopFixture, checkoutBody, openingStock, ownerWithShop, product, publishProduct, publishStore, register, stockOf } from './utils/fixtures';

/**
 * AC-023 / FR-119: concurrent online checkouts and in-store POS sales share
 * one lock and one ledger, so they cannot oversell; AC-013 under a burst.
 */
describe('concurrency', () => {
  let t: TestApp;
  let f: ShopFixture;
  let productId: string;
  let homeId: string;
  let customers: Session[];
  const slug = 'race-fabrics';
  const N = 10;

  beforeAll(async () => {
    t = await createTestApp({ DB_POOL_MAX: '40' });
    f = await ownerWithShop(t, 'Race Fabrics');
    productId = (await product(t, f, { name: 'Scarce Muslin', slug: 'scarce-muslin', sellingRate: '100' })).id;
    await openingStock(t, f, productId, '10 yd'); // 360 in
    homeId = (await publishStore(t, f, slug)).homeId;
    await publishProduct(t, f, productId);
    customers = await Promise.all(Array.from({ length: N }, (_, i) => register(t, 'CUSTOMER', `Racer ${i}`)));
    for (const c of customers) {
      const r = await t.api.as(c.token).post(`/me/carts/${slug}/items`, { productId, measurement: '2 yd' });
      expect(r.status).toBe(201);
    }
  });
  afterAll(() => t.close());

  it('AC-023: 10 POS sales + 10 online checkouts of 2 yd race for 10 yd → exactly 5 succeed, never negative', async () => {
    const pos = Array.from({ length: N }, () =>
      t.api.as(f.token).post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId, measurement: '2 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '200' }] }, { idem: uniq('pos') }),
    );
    const online = customers.map((c) => t.api.as(c.token).post(`/me/carts/${slug}/checkout`, checkoutBody(homeId, f.codMethodId), { idem: uniq('web') }));
    const results = await Promise.all([...pos, ...online]);

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status !== 201);
    expect(ok).toHaveLength(5);
    expect(rejected.every((r) => r.status === 409 && r.body.code === 'STOCK_INSUFFICIENT')).toBe(true);

    const posOk = results.slice(0, N).filter((r) => r.status === 201).length;
    const webOk = results.slice(N).filter((r) => r.status === 201).length;
    const s = await stockOf(t, f, productId);
    expect(s).toEqual({ onHand: (360 - 72 * posOk).toFixed(4), reserved: (72 * webOk).toFixed(4) });
    expect(D(s.onHand).minus(s.reserved).toString()).toBe('0');

    // Ledger replays to the stored balance, with no intermediate negative availability.
    const moves = await t.prisma.stockMovement.findMany({ where: { shopId: f.shopId, productId }, orderBy: { createdAt: 'asc' } });
    expect(sum(moves.map((m) => m.deltaOnHandInches.toString())).toFixed(4)).toBe(s.onHand);
    expect(sum(moves.map((m) => m.deltaReservedInches.toString())).toFixed(4)).toBe(s.reserved);
    for (const m of moves) expect(D(m.onHandAfterInches.toString()).minus(m.reservedAfterInches.toString()).isNegative()).toBe(false);
    expect(await t.prisma.inventoryReservation.count({ where: { shopId: f.shopId, status: 'ACTIVE' } })).toBe(webOk);
  });

  it('AC-013: a burst of identical requests with one Idempotency-Key creates one sale', async () => {
    await t.api.as(f.token).post(`/shops/${f.shopId}/inventory/adjustments`, { branchId: f.branchId, productId, type: 'ADJUSTMENT_IN', measurement: '5 yd', reason: 'Restock for test' });
    const key = uniq('burst');
    const body = { branchId: f.branchId, items: [{ productId, measurement: '1 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '100' }] };
    const results = await Promise.all(Array.from({ length: 8 }, () => t.api.as(f.token).post(`/shops/${f.shopId}/sales`, body, { idem: key })));
    const created = results.filter((r) => r.status === 201);
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(new Set(created.map((r) => r.body.id)).size).toBe(1);
    expect(results.every((r) => r.status === 201 || (r.status === 409 && r.body.code === 'IDEMPOTENCY_IN_PROGRESS'))).toBe(true);
    expect(await t.prisma.sale.count({ where: { shopId: f.shopId, idempotencyKey: key } })).toBe(1);
    const sale = await t.prisma.sale.findFirstOrThrow({ where: { shopId: f.shopId, idempotencyKey: key }, include: { items: true } });
    expect(await t.prisma.stockMovement.count({ where: { saleItemId: sale.items[0]!.id } })).toBe(1);
  });

  it('BR-002: concurrent sales get unique, gap-free invoice numbers', async () => {
    // 1 in at ৳100/yd = 2.777… → ৳2.78
    const paid = await Promise.all(
      Array.from({ length: 6 }, () =>
        t.api.as(f.token).post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId, measurement: '1 in' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '2.78' }] }, { idem: uniq('inv') }),
      ),
    );
    expect(paid.every((r) => r.status === 201)).toBe(true);
    const all = await t.prisma.sale.findMany({ where: { shopId: f.shopId }, select: { invoiceNumber: true } });
    const seq = all.map((s) => Number(s.invoiceNumber!.split('-').pop())).sort((a, b) => a - b);
    expect(seq).toEqual(Array.from({ length: seq.length }, (_, i) => i + 1));
  });
});
