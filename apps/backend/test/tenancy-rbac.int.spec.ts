import { createTestApp, TestApp, uniq } from './utils/test-app';
import { Session, ShopFixture, login, openingStock, ownerWithShop, product, register } from './utils/fixtures';

/** BR-001, §10.1, §A1.2 — AC-002, AC-011, AC-012, AC-027. */
describe('tenant isolation & RBAC', () => {
  let t: TestApp;
  let A: ShopFixture;
  let B: ShopFixture;
  let pA: string;
  let pB: string;
  let saleA: string;
  let cashier: Session;
  let cashierMemberId: string;

  beforeAll(async () => {
    t = await createTestApp();
    A = await ownerWithShop(t, 'Shop Alpha');
    B = await ownerWithShop(t, 'Shop Beta');
    pA = (await product(t, A, { name: 'Alpha Silk' })).id;
    pB = (await product(t, B, { name: 'Beta Linen' })).id;
    await openingStock(t, A, pA, '30 yd');
    await openingStock(t, B, pB, '30 yd');
    saleA = (await t.api.as(A.token).post(`/shops/${A.shopId}/sales`, { branchId: A.branchId, items: [{ productId: pA, measurement: '1 yd' }], payments: [{ paymentMethodId: A.cashMethodId, amount: '200' }] }, { idem: uniq() })).body.id;
  });
  afterAll(() => t.close());

  describe('AC-012 / AC-027: Shop B cannot read, write or infer Shop A data', () => {
    it.each([
      ['shop', () => `/shops/${A.shopId}`],
      ['settings', () => `/shops/${A.shopId}/settings`],
      ['products', () => `/shops/${A.shopId}/products`],
      ['product', () => `/shops/${A.shopId}/products/${pA}`],
      ['sales', () => `/shops/${A.shopId}/sales`],
      ['sale', () => `/shops/${A.shopId}/sales/${saleA}`],
      ['inventory', () => `/shops/${A.shopId}/inventory`],
      ['orders', () => `/shops/${A.shopId}/orders`],
    ])('GET %s of another shop → 404', async (_, path) => {
      const r = await t.api.as(B.token).get(path());
      expect(r.status).toBe(404);
    });

    it('a nonexistent shop and a foreign shop are indistinguishable', async () => {
      const foreign = await t.api.as(B.token).get(`/shops/${A.shopId}`);
      const missing = await t.api.as(B.token).get(`/shops/01900000-0000-7000-8000-000000000000`);
      expect(foreign.status).toBe(missing.status);
      expect(foreign.body.code).toBe(missing.body.code);
    });

    it('swapping in foreign IDs inside its own shop scope fails', async () => {
      const b = t.api.as(B.token);
      expect((await b.get(`/shops/${B.shopId}/products/${pA}`)).status).toBe(404);
      expect((await b.get(`/shops/${B.shopId}/sales/${saleA}`)).status).toBe(404);
      const s1 = await b.post(`/shops/${B.shopId}/sales`, { branchId: B.branchId, items: [{ productId: pA, measurement: '1 yd' }] }, { idem: uniq() });
      expect(s1.status).toBe(404);
      const s2 = await b.post(`/shops/${B.shopId}/sales`, { branchId: A.branchId, items: [{ productId: pB, measurement: '1 yd' }] }, { idem: uniq() });
      expect(s2.status).toBe(404);
      const s3 = await b.post(`/shops/${B.shopId}/sales`, { branchId: B.branchId, items: [{ productId: pB, measurement: '1 yd' }], payments: [{ paymentMethodId: A.cashMethodId, amount: '200' }] }, { idem: uniq() });
      expect(s3.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      expect((await b.post(`/shops/${B.shopId}/inventory/adjustments`, { branchId: B.branchId, productId: pA, type: 'ADJUSTMENT_IN', measurement: '1 yd', reason: 'probe' })).status).toBe(404);
      expect((await b.patch(`/shops/${B.shopId}/products/${pA}`, { name: 'hacked' })).status).toBe(404);
      expect((await t.prisma.product.findUniqueOrThrow({ where: { id: pA } })).name).toBe('Alpha Silk');
    });

    it('filters cannot widen scope: listing B products never returns A rows', async () => {
      const r = await t.api.as(B.token).get(`/shops/${B.shopId}/products?q=Alpha`);
      expect(r.body.items).toEqual([]);
    });

    it('composite FKs stop cross-tenant references even if app code were wrong', async () => {
      await expect(
        t.prisma.$executeRawUnsafe(
          `INSERT INTO inventory (id, "shopId", "branchId", "productId", "updatedAt") VALUES (gen_random_uuid(), '${B.shopId}', '${B.branchId}', '${pA}', now())`,
        ),
      ).rejects.toThrow(/foreign key/);
    });
  });

  describe('AC-011: staff permissions are enforced server-side', () => {
    it('owner invites a cashier who accepts with their own verified account', async () => {
      const email = `${uniq('cashier')}@example.com`;
      cashier = await register(t, 'SHOPKEEPER', 'Cashier Rafi', email);
      const roles = await t.api.as(A.token).get(`/shops/${A.shopId}/roles`);
      const cashierRole = roles.body.find((r: { presetKey: string }) => r.presetKey === 'cashier');
      const inv = await t.api.as(A.token).post(`/shops/${A.shopId}/invitations`, { email, roleId: cashierRole.id });
      expect(inv.status).toBe(201);
      const token = t.messaging.lastTo(email, 'staff.invitation')!.params.token!;
      // someone else cannot redeem it
      const stranger = await register(t, 'SHOPKEEPER', 'Stranger');
      expect((await t.api.as(stranger.token).post('/invitations/accept', { token })).status).toBe(403);
      const acc = await t.api.as(cashier.token).post('/invitations/accept', { token });
      expect(acc.status).toBe(201);
      cashierMemberId = acc.body.memberId;
      expect((await t.api.as(cashier.token).post('/invitations/accept', { token })).body.code).toBe('INVALID_OR_EXPIRED_CODE');
    });

    it('cashier can sell and search but not manage', async () => {
      const c = t.api.as(cashier.token);
      expect((await c.get(`/shops/${A.shopId}/products`)).status).toBe(200);
      const s = await c.post(`/shops/${A.shopId}/sales`, { branchId: A.branchId, items: [{ productId: pA, measurement: '1 yd' }], payments: [{ paymentMethodId: A.cashMethodId, amount: '200' }] }, { idem: uniq() });
      expect(s.status).toBe(201);

      const denied: Array<[string, Promise<{ status: number; body: { code: string; params?: { permission?: string } } }>]> = [
        ['catalog.manage', c.post(`/shops/${A.shopId}/products`, { name: 'X', sku: 'X1', sellingRate: '1' })],
        ['shop.settings.manage', c.patch(`/shops/${A.shopId}/settings`, { allowNegativeStock: true })],
        ['shop.settings.view', c.get(`/shops/${A.shopId}/settings`)],
        ['sales.cancel', c.post(`/shops/${A.shopId}/sales/${s.body.id}/cancel`, { reason: 'nope nope' })],
        ['inventory.adjust', c.post(`/shops/${A.shopId}/inventory/adjustments`, { branchId: A.branchId, productId: pA, type: 'ADJUSTMENT_IN', measurement: '1 yd', reason: 'free stock' })],
        ['units.manage', c.put(`/shops/${A.shopId}/units/GIRA/factor`, { inchesPerUnit: '3' })],
        ['staff.manage', c.post(`/shops/${A.shopId}/roles`, { name: 'Boss', permissions: [] })],
        ['pos.price.override', c.post(`/shops/${A.shopId}/sales`, { branchId: A.branchId, items: [{ productId: pA, measurement: '1 yd', rateOverride: { unitRate: '1', reason: 'friend price' } }] }, { idem: uniq() })],
      ];
      for (const [perm, call] of denied) {
        const r = await call;
        expect([perm, r.status, r.body.code]).toEqual([perm, 403, 'PERMISSION_DENIED']);
        expect(r.body.params?.permission).toBe(perm);
      }
    });

    it('GET /shops/:id/me reports effective permissions for the UI', async () => {
      const me = await t.api.as(cashier.token).get(`/shops/${A.shopId}/me`);
      expect(me.body).toMatchObject({ isOwner: false, role: { presetKey: 'cashier' }, pos: { currencyPrecision: 2, taxMode: 'NONE' } });
      expect(me.body.permissions).toContain('pos.sale.create');
      expect(me.body.permissions).not.toContain('catalog.manage');
      expect((await t.api.as(A.token).get(`/shops/${A.shopId}/me`)).body.permissions).toContain('subscription.manage');
    });

    it('sales.view_own: cashier sees only their own sales', async () => {
      const list = await t.api.as(cashier.token).get(`/shops/${A.shopId}/sales`);
      expect(list.body.items.length).toBe(1);
      expect(list.body.items[0].cashierUserId).toBe(cashier.userId);
      expect((await t.api.as(cashier.token).get(`/shops/${A.shopId}/sales/${saleA}`)).status).toBe(404);
    });

    it('no privilege escalation: a staff manager cannot grant what they lack', async () => {
      const role = await t.api.as(A.token).post(`/shops/${A.shopId}/roles`, { name: 'Supervisor', permissions: ['staff.view', 'staff.manage', 'catalog.view'] });
      expect(role.status).toBe(201);
      const upd = await t.api.as(A.token).patch(`/shops/${A.shopId}/members/${cashierMemberId}`, { roleId: role.body.id });
      expect(upd.status).toBe(200);
      const esc = await t.api.as(cashier.token).post(`/shops/${A.shopId}/roles`, { name: 'Overrider', permissions: ['pos.price.override'] });
      expect(esc.status).toBe(403);
      expect(esc.body.code).toBe('PRIVILEGE_ESCALATION');
      // and cannot touch the owner membership
      const members = await t.api.as(cashier.token).get(`/shops/${A.shopId}/members`);
      const ownerMember = members.body.find((m: { isOwner: boolean }) => m.isOwner);
      expect((await t.api.as(cashier.token).patch(`/shops/${A.shopId}/members/${ownerMember.id}`, { status: 'SUSPENDED' })).body.code).toBe('OWNER_IMMUTABLE');
      const audit = await t.prisma.auditLog.count({ where: { shopId: A.shopId, action: 'member.permission_change' } });
      expect(audit).toBeGreaterThanOrEqual(1);
    });

    it('suspended staff lose access immediately', async () => {
      await t.api.as(A.token).patch(`/shops/${A.shopId}/members/${cashierMemberId}`, { status: 'SUSPENDED' });
      expect((await t.api.as(cashier.token).get(`/shops/${A.shopId}`)).status).toBe(404);
      const mine = await t.api.as(cashier.token).get('/users/me/shops');
      expect(mine.body).toEqual([]);
    });

    it('customers can never use shop routes', async () => {
      const cust = await register(t, 'CUSTOMER', 'Shopper');
      const r = await t.api.as(cust.token).get(`/shops/${A.shopId}`);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('WRONG_PORTAL');
    });
  });

  it('AC-002: two users of the same shop keep independent languages', async () => {
    const staff = await login(t, 'SHOPKEEPER', cashier.email);
    await t.api.as(A.token).patch('/users/me/preferences', { preferredLanguage: 'bn' });
    await t.api.as(staff.token).patch('/users/me/preferences', { preferredLanguage: 'en' });
    expect((await t.api.as(A.token).get('/users/me')).body.preferredLanguage).toBe('bn');
    expect((await t.api.as(staff.token).get('/users/me')).body.preferredLanguage).toBe('en');
    // NFR-L10N-005: shop data is untouched by personal language changes
    expect((await t.api.as(A.token).get(`/shops/${A.shopId}/settings`)).body.defaultInvoiceLanguage).toBe('bn');
  });
});
