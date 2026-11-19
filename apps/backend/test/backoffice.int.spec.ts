import { createTestApp, TestApp, uniq } from './utils/test-app';
import { ShopFixture, login, ownerWithShop, product, publishProduct, publishStore, register, stockOf, superAdmin } from './utils/fixtures';

/** Purchases (FR-055/056/057), expenses (FR-058/059/062), reports (FR-066…070, FR-061), audit (FR-084), admin (FR-073…077, FR-133, FR-136). */
describe('back office: purchasing, expenses, reports, audit & admin', () => {
  let t: TestApp;
  let f: ShopFixture;
  let productId: string;
  let supplierId: string;
  let purchaseId: string;
  // Reports work in the SHOP's timezone (BR-014), so "today" is the Asia/Dhaka date.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

  beforeAll(async () => {
    t = await createTestApp();
    f = await ownerWithShop(t);
    productId = (await product(t, f, { name: 'Khadi', slug: 'khadi', sellingRate: '300' })).id;
  });
  afterAll(() => t.close());
  const owner = () => t.api.as(f.token);

  it('FR-055/056: a posted purchase stocks in with landed cost per inch', async () => {
    supplierId = (await owner().post(`/shops/${f.shopId}/suppliers`, { name: 'Narsingdi Mills', phone: '01999000111' })).body.id;
    const r = await owner().post(
      `/shops/${f.shopId}/purchases`,
      {
        branchId: f.branchId,
        supplierId,
        purchaseDate: today,
        supplierInvoiceRef: 'NM-77',
        items: [{ productId, measurement: '10 yd', unitCost: '150' }],
        discountAmount: '100',
        otherCharges: '40',
        payments: [{ paymentMethodId: f.cashMethodId, amount: '1000' }],
      },
      { idem: uniq('pur') },
    );
    expect(r.status).toBe(201);
    purchaseId = r.body.id;
    // 10 yd × 150 = 1500 − 100 + 40 = 1440; paid 1000 → due 440
    expect(r.body).toMatchObject({ status: 'POSTED', subtotal: '1500', total: '1440', paidAmount: '1000', dueAmount: '440', paymentStatus: 'PARTIALLY_PAID' });
    expect(r.body.purchaseNumber).toMatch(/^PUR-\d{4}-000001$/);
    expect(r.body.items[0]).toMatchObject({ receivedInches: '360', costPerInch: '4' }); // 1440 / 360
    expect(await stockOf(t, f, productId)).toEqual({ onHand: '360.0000', reserved: '0.0000' });
    const inv = await t.prisma.inventory.findFirstOrThrow({ where: { productId } });
    expect(inv.avgCostPerInch.toFixed(4)).toBe('4.0000');
    expect((await owner().get(`/shops/${f.shopId}/suppliers/${supplierId}`)).body.balancePayable).toBe('440');
  });

  it('FR-057: supplier payments settle dues and block overpayment', async () => {
    expect((await owner().post(`/shops/${f.shopId}/purchases/${purchaseId}/payments`, { paymentMethodId: f.cashMethodId, amount: '441' })).body.code).toBe('OVERPAYMENT_NOT_ALLOWED');
    const r = await owner().post(`/shops/${f.shopId}/purchases/${purchaseId}/payments`, { paymentMethodId: f.cashMethodId, amount: '440' });
    expect(r.body).toMatchObject({ dueAmount: '0', paymentStatus: 'PAID' });
    expect((await owner().get(`/shops/${f.shopId}/suppliers/${supplierId}`)).body.balancePayable).toBe('0');
  });

  it('a purchase can be reversed only while the stock is still on hand', async () => {
    const p2 = await owner().post(`/shops/${f.shopId}/purchases`, { branchId: f.branchId, supplierId, purchaseDate: today, items: [{ productId, measurement: '1 yd', unitCost: '150' }] }, { idem: uniq('pur') });
    const c = await owner().post(`/shops/${f.shopId}/purchases/${p2.body.id}/cancel`, { reason: 'Wrong delivery' });
    expect(c.body.status).toBe('CANCELLED');
    expect(await stockOf(t, f, productId)).toEqual({ onHand: '360.0000', reserved: '0.0000' });
    const moves = await t.prisma.stockMovement.findMany({ where: { purchaseItemId: c.body.items[0].id }, orderBy: { createdAt: 'asc' } });
    expect(moves.map((m) => m.type)).toEqual(['PURCHASE_IN', 'PURCHASE_CANCEL_OUT']);
    // the reversed purchase's cost is taken back out of the moving average
    const inv = await t.prisma.inventory.findFirstOrThrow({ where: { productId } });
    expect(Number(inv.avgCostPerInch)).toBeCloseTo(4, 5);
  });

  it('FR-058/062: expenses are recorded and voided, never deleted', async () => {
    const cats = await owner().get(`/shops/${f.shopId}/expense-categories`);
    expect(cats.body.map((c: { nameKey: string }) => c.nameKey)).toContain('expenses.rent');
    const rent = cats.body.find((c: { nameKey: string }) => c.nameKey === 'expenses.rent');
    const e1 = await owner().post(`/shops/${f.shopId}/expenses`, { categoryId: rent.id, amount: '5000', expenseDate: today, paymentMethodId: f.cashMethodId, note: 'November rent' });
    expect(e1.status).toBe(201);
    const e2 = await owner().post(`/shops/${f.shopId}/expenses`, { categoryId: rent.id, amount: '999', expenseDate: today });
    await owner().post(`/shops/${f.shopId}/expenses/${e2.body.id}/void`, { reason: 'Duplicate entry' });
    const list = await owner().get(`/shops/${f.shopId}/expenses?from=${today}&to=${today}`);
    expect(list.body.total).toBe('5000');
    expect(list.body.items).toHaveLength(2);
  });

  it('FR-066/067/061: dashboard, sales report, CSV export and profit estimate', async () => {
    const sale = await owner().post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId, measurement: '2 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '600' }] }, { idem: uniq() });
    expect(sale.status).toBe(201);

    const d = await owner().get(`/shops/${f.shopId}/reports/dashboard`);
    expect(d.status).toBe(200);
    expect(d.body.today).toMatchObject({ posSalesCount: 1, posSalesTotal: '600' });
    // collections today: sale +600, supplier payments are NOT customer collections
    expect(d.body.today.collections).toBe('600');
    expect(d.body.trend).toHaveLength(7);
    expect(d.body.activity.length).toBeGreaterThan(0);

    const r = await owner().get(`/shops/${f.shopId}/reports/sales?from=${today}&to=${today}`);
    expect(r.body.totals).toMatchObject({ count: 1, gross: '600.00', net: '600.00', paid: '600.00', due: '0.00' });
    expect(r.body.topProducts[0]).toMatchObject({ name: 'Khadi', inches: '72.0000', revenue: '600.00' });
    expect(r.body.paymentMethods).toEqual([{ method: 'CASH', total: '600.00' }]);

    const csv = await owner().get(`/shops/${f.shopId}/reports/sales?from=${today}&to=${today}&format=csv`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toBe('day,count,gross,discounts,tax,net,paid,due');
    expect(await t.prisma.auditLog.count({ where: { shopId: f.shopId, action: 'report.export' } })).toBe(1);

    const p = await owner().get(`/shops/${f.shopId}/reports/profit?from=${today}&to=${today}`);
    // revenue 600, COGS 72 in × 4 = 288, expenses 5000
    expect(p.body).toMatchObject({ revenue: '600.00', costOfGoodsSold: '288.00', grossProfit: '312.00', expenses: '5000.00', netProfit: '-4688.00', grossMarginPercent: '52.00' });
    expect(p.body.basisKeys).toHaveLength(3);

    const bad = await owner().get(`/shops/${f.shopId}/reports/sales?from=2020-01-01&to=2026-01-01`);
    expect(bad.status).toBe(400);
    expect(bad.body.params.maxDays).toBe(366);
  });

  it('FR-084: audit search is shop-scoped and filterable; reports need permission', async () => {
    const a = await owner().get(`/shops/${f.shopId}/audit-logs?action=purchase.`);
    expect(a.body.items.map((i: { action: string }) => i.action)).toEqual(expect.arrayContaining(['purchase.post', 'purchase.cancel']));
    expect(a.body.items.every((i: { shopId: string }) => i.shopId === f.shopId)).toBe(true);
    const other = await ownerWithShop(t, 'Other');
    expect((await t.api.as(other.token).get(`/shops/${f.shopId}/audit-logs`)).status).toBe(404);
  });

  it('discovers published storefronts only', async () => {
    await publishStore(t, f, 'khadi-house');
    await publishProduct(t, f, productId);
    const hidden = await ownerWithShop(t, 'Hidden Shop');
    await t.api.as(hidden.token).put(`/shops/${hidden.shopId}/storefront`, { slug: 'hidden-shop', displayName: 'Hidden' });
    const r = await t.api.anon.get('/public/shops');
    expect(r.body.items.map((s: { slug: string }) => s.slug)).toEqual(['khadi-house']);
    expect(r.body.items[0].productCount).toBe(1);
    expect((await t.api.anon.get('/public/shops?q=khadi')).body.items).toHaveLength(1);
    expect((await t.api.anon.get('/public/shops?q=zzz')).body.items).toHaveLength(0);
  });

  describe('Super Admin console', () => {
    let admin: Awaited<ReturnType<typeof superAdmin>>;
    beforeAll(async () => {
      admin = await superAdmin(t);
    });
    const a = () => t.api.as(admin.token);

    it('FR-136: platform stats', async () => {
      const r = await a().get('/admin/stats');
      expect(r.status).toBe(200);
      expect(r.body.activeStorefronts).toBe(1);
      expect(r.body.publishedListings).toBe(1);
      expect(r.body.usersByType.SHOPKEEPER).toBeGreaterThanOrEqual(3);
    });

    it('A1.1: suspend a user — sessions revoked, no secrets exposed, audited', async () => {
      const victim = await register(t, 'CUSTOMER', 'Spammy User');
      const list = await a().get('/admin/users?type=CUSTOMER');
      expect(list.body.items[0]).not.toHaveProperty('passwordHash');
      expect(list.body.items[0]).not.toHaveProperty('twoFactorSecretEnc');
      const r = await a().patch(`/admin/users/${victim.userId}/status`, { status: 'SUSPENDED', reason: 'Fraudulent orders' });
      expect(r.body.status).toBe('SUSPENDED');
      expect((await t.api.as(victim.token).get('/users/me')).body.code).toBe('ACCOUNT_SUSPENDED');
      expect((await t.api.anon.post('/auth/login', { type: 'CUSTOMER', identifier: victim.email, password: victim.password })).body.code).toBe('ACCOUNT_SUSPENDED');
      expect((await a().patch(`/admin/users/${admin.userId}/status`, { status: 'SUSPENDED', reason: 'Self lockout' })).body.code).toBe('PRIVILEGE_ESCALATION');
      await a().patch(`/admin/users/${victim.userId}/status`, { status: 'ACTIVE', reason: 'Appeal accepted' });
      expect((await login(t, 'CUSTOMER', victim.email, victim.password)).token).toBeTruthy();
    });

    it('FR-074/075: plans and subscriptions are managed with reasons', async () => {
      const plans = await a().get('/admin/plans');
      const starter = plans.body.find((p: { code: string }) => p.code === 'STARTER');
      const up = await a().patch(`/admin/plans/${starter.id}`, { priceMonthly: '1199', reason: 'Market validation round 1' });
      expect(up.body.priceMonthly).toBe('1199');
      const sub = await a().patch(`/admin/shops/${f.shopId}/subscription`, { planId: starter.id, status: 'ACTIVE', reason: 'Paid by bKash TX123' });
      expect(sub.body).toMatchObject({ status: 'ACTIVE', plan: { code: 'STARTER' } });
    });

    it('FR-133: hiding a listing removes it from the storefront', async () => {
      const list = await a().get('/admin/products?q=Khadi');
      expect(list.body.items[0]).toMatchObject({ name: 'Khadi', moderationStatus: 'VISIBLE' });
      const r = await a().patch(`/admin/products/${productId}/moderation`, { moderationStatus: 'HIDDEN', reason: 'Misleading photos' });
      expect(r.body.moderationStatus).toBe('HIDDEN');
      expect((await t.api.anon.get('/public/shops/khadi-house/products')).body.total).toBe(0);
      expect((await owner().put(`/shops/${f.shopId}/products/${productId}/publication`, { published: true })).body.code).toBe('PRODUCT_NOT_SELLABLE');
    });

    it('AC-029: admin audit trail lists every privileged action with its reason', async () => {
      const r = await a().get('/admin/audit-logs?kind=admin');
      const actions = r.body.items.map((i: { action: string }) => i.action);
      expect(actions).toEqual(expect.arrayContaining(['user.suspend', 'user.reactivate', 'plan.update', 'subscription.update', 'product.moderation.hide']));
      expect(r.body.items.every((i: { reason: string }) => i.reason.length >= 5)).toBe(true);
      const shopLogs = await a().get(`/admin/audit-logs?kind=shop&shopId=${f.shopId}`);
      expect(shopLogs.body.items.length).toBeGreaterThan(0);
      expect(shopLogs.body.items.every((i: { shopId: string }) => i.shopId === f.shopId)).toBe(true);
    });
  });
});
