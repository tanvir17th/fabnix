import request from 'supertest';
import { createTestApp, TestApp, uniq } from './utils/test-app';
import {
  Session,
  ShopFixture,
  checkoutBody,
  configureGira,
  openingStock,
  ownerWithShop,
  pngImage,
  product,
  publishProduct,
  publishStore,
  register,
  stockOf,
  superAdmin,
} from './utils/fixtures';

/** SRS v1.1 §A2–A5: AC-015 … AC-030 (except AC-023, see concurrency spec). */
describe('online storefront, cart, checkout & order lifecycle', () => {
  let t: TestApp;
  let f: ShopFixture;
  let store: Awaited<ReturnType<typeof publishStore>>;
  let p1: { id: string; slug: string };
  let p2: { id: string; slug: string };
  let alice: Session;
  let bob: Session;
  const slug = 'abc-fabrics';

  beforeAll(async () => {
    t = await createTestApp();
    f = await ownerWithShop(t);
    await configureGira(t, f, '2.25');
    p1 = await product(t, f, { name: 'Jamdani Cotton', slug: 'jamdani-cotton', sellingRate: '200', color: 'Indigo', fabricType: 'Cotton' });
    p2 = await product(t, f, { name: 'Unlisted Silk', slug: 'unlisted-silk', sellingRate: '900' });
    await openingStock(t, f, p1.id, '20 yd');
    await openingStock(t, f, p2.id, '20 yd');
    alice = await register(t, 'CUSTOMER', 'Alice Akter');
    bob = await register(t, 'CUSTOMER', 'Bob Biswas');
  });
  afterAll(() => t.close());

  const owner = () => t.api.as(f.token);
  const as = (s: Session) => t.api.as(s.token);
  const addToCart = (s: Session, measurement: unknown = '5 yd 4 gira', productId = p1.id) => as(s).post(`/me/carts/${slug}/items`, { productId, measurement });
  const checkout = (s: Session, extra: Record<string, unknown> = {}, idem = uniq('order')) =>
    as(s).post(`/me/carts/${slug}/checkout`, checkoutBody(store.homeId, f.codMethodId, extra), { idem });
  const placeOrder = async (s: Session, measurement: unknown = '1 yd') => {
    await addToCart(s, measurement);
    const r = await checkout(s);
    if (r.status !== 201) throw new Error(`checkout ${r.status} ${JSON.stringify(r.body)}`);
    return r.body as { id: string; items: Array<{ id: string }> };
  };

  describe('AC-015: storefront setup and unique URL', () => {
    it('rejects reserved slugs and requires delivery + online payment before publishing', async () => {
      const reserved = await owner().put(`/shops/${f.shopId}/storefront`, { slug: 'admin', displayName: 'Admin' });
      expect(reserved.body.code).toBe('SLUG_RESERVED');
      await owner().put(`/shops/${f.shopId}/storefront`, { slug, displayName: 'ABC Fabrics Online' });
      const early = await owner().post(`/shops/${f.shopId}/storefront/visibility`, { action: 'PUBLISH' });
      expect(early.status).toBe(409);
      expect(early.body.params.missing).toEqual(expect.arrayContaining(['enabled', 'delivery_option']));
      store = await publishStore(t, f, slug);
      await publishProduct(t, f, p1.id);
    });

    it('slugs are globally unique', async () => {
      const other = await ownerWithShop(t, 'Copycat');
      const r = await t.api.as(other.token).put(`/shops/${other.shopId}/storefront`, { slug, displayName: 'Copy' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('SLUG_TAKEN');
    });
  });

  describe('AC-016: fabric photos', () => {
    it('uploads, validates, re-encodes to WebP, reorders and serves images', async () => {
      const up = (buf: Buffer, name = 'fabric.png') =>
        request(t.http).post(`/api/v1/shops/${f.shopId}/products/${p1.id}/images`).set('Authorization', `Bearer ${f.token}`).attach('file', buf, name);
      const a = await up(await pngImage(1200, 900));
      expect(a.status).toBe(201);
      expect(a.body).toMatchObject({ sortOrder: 0, width: 1200, height: 900 });
      expect(a.body.thumbnailUrl).toMatch(/thumb\.webp$/);
      const b = await up(await pngImage(900, 900, { r: 20, g: 40, b: 120 }));
      expect(b.body.sortOrder).toBe(1);

      expect((await up(await pngImage(300, 300))).body.params.reason).toBe('too_small');
      expect((await up(Buffer.from('not an image at all'), 'evil.png')).body.params.reason).toBe('unreadable');

      const re = await owner().put(`/shops/${f.shopId}/products/${p1.id}/images-order`, { imageIds: [b.body.id, a.body.id] });
      expect(re.body.map((i: { id: string }) => i.id)).toEqual([b.body.id, a.body.id]);

      const path = new URL(b.body.thumbnailUrl as string).pathname; // /media/shops/…/thumb.webp
      const file = await request(t.http).get(path);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toMatch(/image\/webp/);
    });
  });

  describe('AC-017 / AC-018: public catalog and live price', () => {
    it('lists only published products of THIS shop', async () => {
      const r = await t.api.anon.get(`/public/shops/${slug}/products`);
      expect(r.status).toBe(200);
      expect(r.body.items.map((i: { slug: string }) => i.slug)).toEqual(['jamdani-cotton']);
      expect(r.body.items[0]).toMatchObject({ price: '200', priceUnitCode: 'YARD', availability: { status: 'IN_STOCK', availableInches: null } });
      expect((await t.api.anon.get(`/public/shops/${slug}/products/unlisted-silk`)).status).toBe(404);
      expect((await t.api.anon.get(`/public/shops/${slug}/products?color=indigo&fabricType=cotton&maxPrice=250&inStock=true`)).body.total).toBe(1);
      expect((await t.api.anon.get(`/public/shops/${slug}/products?minPrice=500`)).body.total).toBe(0);
    });

    it('store profile exposes online units (incl. Gira), delivery options and payment methods', async () => {
      const r = await t.api.anon.get(`/public/shops/${slug}`);
      expect(r.body).toMatchObject({ slug, orderable: true, currency: 'BDT' });
      expect(r.body.units.map((u: { code: string }) => u.code)).toContain('GIRA');
      expect(r.body.deliveryOptions).toHaveLength(2);
      expect(r.body.paymentMethods.map((m: { type: string }) => m.type)).toEqual(['CASH_ON_DELIVERY']);
    });

    it('product detail with ordered images and a live quote', async () => {
      const d = await t.api.anon.get(`/public/shops/${slug}/products/jamdani-cotton`);
      expect(d.body.images).toHaveLength(2);
      const q = await t.api.anon.post(`/public/shops/${slug}/products/jamdani-cotton/quote`, { measurement: '5 yd 4 gira' });
      expect(q.status).toBe(200);
      expect(q.body).toMatchObject({ lengthInches: '189.0000', quantity: '5.2500', grossAmount: '1050.00', lineTotal: '1050.00', enteredDisplay: '5 yd 4 gira' });
    });
  });

  describe('checkout', () => {
    let orderId: string;
    let checkoutKey: string;

    it('cart prices lines live', async () => {
      const r = await addToCart(alice);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ itemsTotal: '1050.00', hasChanges: false });
    });

    it('AC-019: checkout revalidates price — a changed price returns CART_CHANGED and refreshes the cart', async () => {
      await owner().patch(`/shops/${f.shopId}/products/${p1.id}`, { sellingRate: '220' });
      const r = await checkout(alice);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('CART_CHANGED');
      expect(r.body.params.changes).toEqual([expect.objectContaining({ reason: 'PRICE_CHANGED', unitRate: '220', lineTotal: '1155.00' })]);
      const cart = await as(alice).get(`/me/carts/${slug}`);
      expect(cart.body).toMatchObject({ itemsTotal: '1155.00', hasChanges: false });
      const wrongTotal = await checkout(alice, { expectedTotal: '1110' });
      expect(wrongTotal.body.code).toBe('CART_CHANGED');
      expect(wrongTotal.body.params.total).toBe('1215.00');
    });

    it('AC-020: one order + one reservation, idempotent on retry', async () => {
      checkoutKey = uniq('order');
      const r = await checkout(alice, { expectedTotal: '1215' }, checkoutKey);
      expect(r.status).toBe(201);
      orderId = r.body.id;
      expect(r.body).toMatchObject({ status: 'PENDING_CONFIRMATION', subtotal: '1155', deliveryFee: '60', total: '1215', paymentStatus: 'UNPAID', paymentMethodType: 'CASH_ON_DELIVERY' });
      expect(r.body.orderNumber).toMatch(/^ORD-\d{4}-000001$/);
      expect(r.body.items[0]).toMatchObject({ quantityInches: '189', unitRate: '220', enteredDisplay: '5 yd 4 gira' });
      expect(r.body.items[0].conversionSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'GIRA', inchesPerUnit: '2.25' })]));
      expect(await stockOf(t, f, p1.id)).toEqual({ onHand: '720.0000', reserved: '189.0000' });

      const replay = await as(alice).post(`/me/carts/${slug}/checkout`, checkoutBody(store.homeId, f.codMethodId, { expectedTotal: '1215' }), { idem: checkoutKey });
      expect(replay.status).toBe(201);
      expect(replay.body.id).toBe(orderId);
      expect(await t.prisma.onlineOrder.count({ where: { shopId: f.shopId } })).toBe(1);
      expect(await t.prisma.inventoryReservation.count({ where: { orderId } })).toBe(1);
      expect(await stockOf(t, f, p1.id)).toEqual({ onHand: '720.0000', reserved: '189.0000' });
      // cart was converted
      expect((await as(alice).get(`/me/carts/${slug}`)).body.items).toEqual([]);
      // shop CRM record linked to the customer
      expect(await t.prisma.customer.count({ where: { shopId: f.shopId, userId: alice.userId } })).toBe(1);
    });

    it('reserved stock is unavailable to POS too (same ledger)', async () => {
      // 720 on hand − 189 reserved = 531 available; 15 yd = 540 must fail.
      const r = await owner().post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId: p1.id, measurement: '15 yd' }] }, { idem: uniq() });
      expect(r.body.code).toBe('STOCK_INSUFFICIENT');
      expect(r.body.params.availableInches).toBe('531.0000');
    });

    it('AC-021: shopkeeper sees the order and gets notified', async () => {
      const inbox = await owner().get(`/shops/${f.shopId}/orders?status=PENDING_CONFIRMATION`);
      expect(inbox.body.items.map((o: { id: string }) => o.id)).toEqual([orderId]);
      expect(inbox.body.statusCounts).toEqual({ PENDING_CONFIRMATION: 1 });
      const n = await owner().get('/me/notifications');
      expect(n.body.items.map((i: { type: string }) => i.type)).toContain('order.placed');
    });

    it('AC-026: customer B cannot see or act on customer A\'s order', async () => {
      expect((await as(bob).get(`/me/orders/${orderId}`)).status).toBe(404);
      expect((await as(bob).post(`/me/orders/${orderId}/cancel`, { reason: 'mischief' })).status).toBe(404);
      expect((await as(bob).get('/me/orders')).body.items).toEqual([]);
      // and cannot replay A's idempotency key to fetch it
      const steal = await as(bob).post(`/me/carts/${slug}/checkout`, checkoutBody(store.homeId, f.codMethodId, { expectedTotal: '1215' }), { idem: checkoutKey });
      expect(steal.status).not.toBe(201);
    });

    it('AC-022: full lifecycle with timestamped history, deduction at confirmation, COD payment', async () => {
      const bad = await owner().post(`/shops/${f.shopId}/orders/${orderId}/status`, { to: 'DELIVERED' });
      expect(bad.body.code).toBe('ORDER_TRANSITION_INVALID');

      const c = await owner().post(`/shops/${f.shopId}/orders/${orderId}/confirm`);
      expect(c.status).toBe(201);
      expect(c.body.status).toBe('CONFIRMED');
      expect(c.body.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
      expect(await stockOf(t, f, p1.id)).toEqual({ onHand: '531.0000', reserved: '0.0000' });
      expect(c.body.reservations[0].status).toBe('CONSUMED');

      await owner().post(`/shops/${f.shopId}/orders/${orderId}/notes`, { visibility: 'INTERNAL', body: 'Check selvedge' });
      await owner().post(`/shops/${f.shopId}/orders/${orderId}/notes`, { visibility: 'CUSTOMER', body: 'Your fabric is being cut' });
      expect((await owner().post(`/shops/${f.shopId}/orders/${orderId}/status`, { to: 'READY_FOR_PICKUP' })).body.code).toBe('ORDER_TRANSITION_INVALID'); // home delivery
      for (const to of ['PROCESSING', 'DISPATCHED', 'DELIVERED']) {
        const r = await owner().post(`/shops/${f.shopId}/orders/${orderId}/status`, { to, ...(to === 'DISPATCHED' ? { provider: 'Pathao', trackingReference: 'PTH-123' } : {}) });
        expect([to, r.status]).toEqual([to, 201]);
      }
      const over = await owner().post(`/shops/${f.shopId}/orders/${orderId}/payments`, { paymentMethodId: f.codMethodId, amount: '1215.01' }, { idem: uniq() });
      expect(over.body.code).toBe('OVERPAYMENT_NOT_ALLOWED');
      const paid = await owner().post(`/shops/${f.shopId}/orders/${orderId}/payments`, { paymentMethodId: f.codMethodId, amount: '1215' }, { idem: uniq() });
      expect(paid.body.paymentStatus).toBe('PAID');
      const done = await owner().post(`/shops/${f.shopId}/orders/${orderId}/status`, { to: 'COMPLETED' });
      expect(done.body.delivery).toMatchObject({ provider: 'Pathao', trackingReference: 'PTH-123', status: 'DELIVERED' });

      const mine = await as(alice).get(`/me/orders/${orderId}`);
      expect(mine.body.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(['PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED']);
      expect(mine.body.statusHistory.every((h: { createdAt: string }) => !!Date.parse(h.createdAt))).toBe(true);
      expect(mine.body.notes.map((n: { body: string }) => n.body)).toEqual(['Your fabric is being cut']); // internal hidden (FR-115)
      expect(mine.body.reservations).toBeUndefined();
      const n = await as(alice).get('/me/notifications');
      expect(n.body.items.filter((i: { type: string }) => i.type === 'order.status_changed').length).toBe(5);
      const moves = await t.prisma.stockMovement.findMany({ where: { orderItemId: mine.body.items[0].id }, orderBy: { createdAt: 'asc' } });
      expect(moves.map((m) => m.type)).toEqual(['ORDER_RESERVE', 'ORDER_DEDUCT_OUT']); // FR-122
    });
  });

  describe('AC-024: reservations release exactly once', () => {
    it('reject releases; a second reject/cancel is refused', async () => {
      const before = await stockOf(t, f, p1.id);
      const o = await placeOrder(bob, '2 yd');
      expect((await stockOf(t, f, p1.id)).reserved).toBe('72.0000');
      const noReason = await owner().post(`/shops/${f.shopId}/orders/${o.id}/reject`, { reason: '' });
      expect(noReason.status).toBe(400);
      const r = await owner().post(`/shops/${f.shopId}/orders/${o.id}/reject`, { reason: 'Colour discontinued' });
      expect(r.body).toMatchObject({ status: 'REJECTED', rejectionReason: 'Colour discontinued' });
      expect(await stockOf(t, f, p1.id)).toEqual(before);
      expect((await owner().post(`/shops/${f.shopId}/orders/${o.id}/reject`, { reason: 'again' })).status).toBe(409);
      expect((await owner().post(`/shops/${f.shopId}/orders/${o.id}/cancel`, { reason: 'again' })).status).toBe(409);
      expect(await t.prisma.stockMovement.count({ where: { orderItemId: o.items[0]!.id, type: 'ORDER_RESERVATION_RELEASE' } })).toBe(1);
    });

    it('racing reject vs customer cancel: exactly one wins, one release', async () => {
      const before = await stockOf(t, f, p1.id);
      const o = await placeOrder(bob, '1 yd');
      const results = await Promise.all([
        owner().post(`/shops/${f.shopId}/orders/${o.id}/reject`, { reason: 'Out of stock' }),
        as(bob).post(`/me/orders/${o.id}/cancel`, { reason: 'Changed my mind' }),
        owner().post(`/shops/${f.shopId}/orders/${o.id}/cancel`, { reason: 'Duplicate' }),
      ]);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(await stockOf(t, f, p1.id)).toEqual(before);
      expect(await t.prisma.stockMovement.count({ where: { orderItemId: o.items[0]!.id, type: 'ORDER_RESERVATION_RELEASE' } })).toBe(1);
    });

    it('FR-120: expired holds are released by the sweeper, once', async () => {
      const before = await stockOf(t, f, p1.id);
      const o = await placeOrder(bob, '1 yd');
      await t.prisma.inventoryReservation.updateMany({ where: { orderId: o.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      const { OrdersService } = await import('../src/modules/orders/orders.service');
      const svc = t.app.get(OrdersService);
      const [a, b] = await Promise.all([svc.sweepExpiredReservations(), svc.sweepExpiredReservations()]);
      expect(a + b).toBe(1);
      expect(await svc.sweepExpiredReservations()).toBe(0);
      const order = await t.prisma.onlineOrder.findUniqueOrThrow({ where: { id: o.id }, include: { reservations: true } });
      expect(order).toMatchObject({ status: 'CANCELLED', cancelledByType: 'SYSTEM', cancelReason: 'RESERVATION_EXPIRED' });
      expect(order.reservations[0]!.status).toBe('EXPIRED');
      expect(await stockOf(t, f, p1.id)).toEqual(before);
    });

    it('cancelling a confirmed (deducted) order restocks via a compensating movement', async () => {
      const before = await stockOf(t, f, p1.id);
      const o = await placeOrder(bob, '1 yd');
      await owner().post(`/shops/${f.shopId}/orders/${o.id}/confirm`);
      expect(Number((await stockOf(t, f, p1.id)).onHand)).toBe(Number(before.onHand) - 36);
      const r = await owner().post(`/shops/${f.shopId}/orders/${o.id}/cancel`, { reason: 'Customer unreachable' });
      expect(r.body.status).toBe('CANCELLED');
      expect(await stockOf(t, f, p1.id)).toEqual(before);
      const moves = await t.prisma.stockMovement.findMany({ where: { orderItemId: o.items[0]!.id }, orderBy: { createdAt: 'asc' } });
      expect(moves.map((m) => m.type)).toEqual(['ORDER_RESERVE', 'ORDER_DEDUCT_OUT', 'ORDER_CANCEL_IN']);
      expect(moves[2]!.reversesMovementId).toBe(moves[1]!.id);
    });

    it('ON_DISPATCH milestone keeps the hold through confirmation and deducts at dispatch', async () => {
      await owner().patch(`/shops/${f.shopId}/settings`, { stockDeductionMilestone: 'ON_DISPATCH' });
      const before = await stockOf(t, f, p1.id);
      const o = await placeOrder(bob, '1 yd');
      const c = await owner().post(`/shops/${f.shopId}/orders/${o.id}/confirm`);
      expect(c.body.reservations[0]).toMatchObject({ status: 'ACTIVE', expiresAt: null });
      expect((await stockOf(t, f, p1.id)).onHand).toBe(before.onHand);
      await owner().post(`/shops/${f.shopId}/orders/${o.id}/status`, { to: 'DISPATCHED' });
      expect(Number((await stockOf(t, f, p1.id)).onHand)).toBe(Number(before.onHand) - 36);
      expect((await stockOf(t, f, p1.id)).reserved).toBe(before.reserved);
      await owner().patch(`/shops/${f.shopId}/settings`, { stockDeductionMilestone: 'ON_CONFIRMATION' });
    });
  });

  describe('AC-028 / AC-029: platform control', () => {
    it('paused storefront stays browsable but takes no orders', async () => {
      await owner().post(`/shops/${f.shopId}/storefront/visibility`, { action: 'PAUSE' });
      expect((await t.api.anon.get(`/public/shops/${slug}`)).body.orderable).toBe(false);
      await addToCart(bob, '1 yd');
      const r = await checkout(bob);
      expect(r.body.code).toBe('STOREFRONT_NOT_AVAILABLE');
      await owner().post(`/shops/${f.shopId}/storefront/visibility`, { action: 'PUBLISH' });
    });

    it('Super Admin suspends the storefront and the shop; every action is audited with a reason', async () => {
      const admin = await superAdmin(t);
      expect((await as(bob).patch(`/admin/storefronts/${store.storefrontId}/suspension`, { suspended: true, reason: 'Fake listings' })).body.code).toBe('WRONG_PORTAL');
      expect((await t.api.as(admin.token).patch(`/admin/storefronts/${store.storefrontId}/suspension`, { suspended: true, reason: 'bad' })).status).toBe(400);

      const s = await t.api.as(admin.token).patch(`/admin/storefronts/${store.storefrontId}/suspension`, { suspended: true, reason: 'Reported counterfeit listings' });
      expect(s.status).toBe(200);
      expect((await t.api.anon.get(`/public/shops/${slug}`)).status).toBe(404);
      expect((await checkout(bob)).status).toBe(404);
      expect((await owner().post(`/shops/${f.shopId}/storefront/visibility`, { action: 'PUBLISH' })).body.code).toBe('STOREFRONT_NOT_AVAILABLE');
      await t.api.as(admin.token).patch(`/admin/storefronts/${store.storefrontId}/suspension`, { suspended: false, reason: 'Appeal accepted' });
      expect((await t.api.anon.get(`/public/shops/${slug}`)).status).toBe(200);

      const sh = await t.api.as(admin.token).patch(`/admin/shops/${f.shopId}/status`, { status: 'SUSPENDED', reason: 'Unpaid subscription' });
      expect(sh.body.status).toBe('SUSPENDED');
      expect((await t.api.anon.get(`/public/shops/${slug}`)).status).toBe(404);
      expect((await owner().get(`/shops/${f.shopId}/products`)).status).toBe(200); // read-only
      const write = await owner().post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId: p1.id, measurement: '1 yd' }] }, { idem: uniq() });
      expect(write.body.code).toBe('SHOP_SUSPENDED');
      await t.api.as(admin.token).patch(`/admin/shops/${f.shopId}/status`, { status: 'ACTIVE', reason: 'Payment received' });

      const logs = await t.prisma.adminAuditLog.findMany({ where: { adminUserId: admin.userId }, orderBy: { createdAt: 'asc' } });
      expect(logs.map((l) => [l.action, l.reason])).toEqual([
        ['storefront.suspend', 'Reported counterfeit listings'],
        ['storefront.reinstate', 'Appeal accepted'],
        ['shop.status', 'Unpaid subscription'],
        ['shop.status', 'Payment received'],
      ]);
      expect(logs.every((l) => l.targetShopId === f.shopId && !!l.requestId)).toBe(true);
    });
  });
});
