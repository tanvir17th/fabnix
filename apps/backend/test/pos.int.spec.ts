import { createTestApp, TestApp, uniq } from './utils/test-app';
import { ShopFixture, configureGira, openingStock, ownerWithShop, product, stockOf } from './utils/fixtures';

/** Measurement engine over HTTP + POS sale lifecycle: AC-004…AC-010, AC-013. */
describe('measurement & POS sales', () => {
  let t: TestApp;
  let f: ShopFixture;
  let productId: string;
  let firstSaleId: string;

  beforeAll(async () => {
    t = await createTestApp();
    f = await ownerWithShop(t);
  });
  afterAll(() => t.close());

  const owner = () => t.api.as(f.token);
  const sale = (body: Record<string, unknown>, idem = uniq('sale')) => owner().post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, ...body }, { idem });

  it('rejects Gira until the shop configures it (FR-013)', async () => {
    const r = await owner().post(`/shops/${f.shopId}/calculations`, { measurement: '5 yd 4 gira' });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('GIRA_NOT_CONFIGURED');
    const units = await owner().get(`/shops/${f.shopId}/units`);
    expect(units.body.map((u: { code: string }) => u.code).sort()).toEqual(['CM', 'INCH', 'METRE', 'YARD']);
  });

  it('standard units are immutable', async () => {
    const r = await owner().put(`/shops/${f.shopId}/units/YARD/factor`, { inchesPerUnit: '30' });
    expect(r.body.code).toBe('UNIT_STANDARD_IMMUTABLE');
  });

  it('AC-006: 1 Gira = 2.25 in → 5 yd 4 gira = 189 in = 5.25 yd = ৳1,050 at ৳200/yd', async () => {
    await configureGira(t, f, '2.25');
    const r = await owner().post(`/shops/${f.shopId}/calculations`, { measurement: '5 yd 4 gira', unitRate: '200', priceUnitCode: 'YARD' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      lengthInches: '189.0000',
      enteredDisplay: '5 yd 4 gira',
      breakdown: [{ unit: 'YARD', value: '5' }, { unit: 'GIRA', value: '4' }],
      price: { priceUnitCode: 'YARD', quantity: '5.2500', grossAmount: '1050.00', lineTotal: '1050.00' },
    });
    expect(r.body.equivalents).toEqual(expect.arrayContaining([{ unit: 'YARD', symbol: 'yd', value: '5.25' }, { unit: 'GIRA', symbol: 'gira', value: '84.00' }]));
    // structured input and Bangla digits give the same answer
    const bn = await owner().post(`/shops/${f.shopId}/calculations`, { measurement: [{ unit: 'YARD', value: '৫' }, { unit: 'GIRA', value: '৪' }] });
    expect(bn.body.lengthInches).toBe('189.0000');
  });

  it('records opening stock once', async () => {
    productId = (await product(t, f, { name: 'Cotton Lawn', sku: 'CL-001', sellingRate: '200', purchaseRate: '120' })).id;
    const o = await openingStock(t, f, productId, '20 yd');
    expect(o.onHandInches).toBe('720.0000');
    const again = await owner().post(`/shops/${f.shopId}/inventory/opening`, { branchId: f.branchId, productId, measurement: '1 yd' });
    expect(again.status).toBe(409);
  });

  it('AC-007/AC-005: a sale deducts exactly 189 in and snapshots the conversion and price', async () => {
    const key = uniq('sale');
    const r = await sale({ items: [{ productId, measurement: '5 yd 4 gira' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '1050' }] }, key);
    expect(r.status).toBe(201);
    firstSaleId = r.body.id;
    expect(r.body).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID', grandTotal: '1050', paidAmount: '1050', dueAmount: '0', invoiceLanguage: 'bn' });
    expect(r.body.invoiceNumber).toMatch(/^INV-\d{4}-000001$/);
    const item = r.body.items[0];
    expect(item).toMatchObject({ productName: 'Cotton Lawn', lengthInches: '189', totalLengthInches: '189', unitRate: '200', priceUnitCode: 'YARD', priceUnitInches: '36', lineTotal: '1050', enteredDisplay: '5 yd 4 gira' });
    expect(item.conversionSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'GIRA', inchesPerUnit: '2.25', version: 1 })]));
    expect(await stockOf(t, f, productId)).toEqual({ onHand: '531.0000', reserved: '0.0000' });

    // AC-013: replay → same sale, no second deduction
    const replay = await owner().post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId, measurement: '5 yd 4 gira' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '1050' }] }, { idem: key });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.id).toBe(firstSaleId);
    expect(await t.prisma.stockMovement.count({ where: { shopId: f.shopId, type: 'SALE_OUT' } })).toBe(1);
    expect(await stockOf(t, f, productId)).toEqual({ onHand: '531.0000', reserved: '0.0000' });

    const reused = await owner().post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId, measurement: '1 yd' }] }, { idem: key });
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const noKey = await owner().post(`/shops/${f.shopId}/sales`, { branchId: f.branchId, items: [{ productId, measurement: '1 yd' }] });
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('AC-004/AC-005: changing Gira versions the unit; history keeps the old factor', async () => {
    const v2 = await owner().put(`/shops/${f.shopId}/units/GIRA/factor`, { inchesPerUnit: '2.5' });
    expect(v2.status).toBe(200);
    expect(v2.body).toMatchObject({ code: 'GIRA', version: 2, inchesPerUnit: '2.5' });

    const old = await owner().get(`/shops/${f.shopId}/sales/${firstSaleId}`);
    expect(old.body.items[0].lengthInches).toBe('189');
    expect(old.body.items[0].conversionSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'GIRA', inchesPerUnit: '2.25', version: 1 })]));

    const s = await sale({ items: [{ productId, measurement: '4 gira' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '55.56' }] });
    expect(s.status).toBe(201);
    expect(s.body.items[0]).toMatchObject({ lengthInches: '10', grossAmount: '55.56' }); // 10/36×200 = 55.555… → 55.56
    expect(s.body.items[0].conversionSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'GIRA', inchesPerUnit: '2.5', version: 2 })]));
    const all = await t.prisma.measurementUnit.findMany({ where: { shopId: f.shopId, code: 'GIRA' }, orderBy: { version: 'asc' } });
    expect(all.map((u) => [u.version, u.isActive])).toEqual([[1, false], [2, true]]);
  });

  it('AC-008: over-selling is blocked with a localizable code and stock is untouched', async () => {
    const before = await stockOf(t, f, productId);
    const r = await sale({ items: [{ productId, measurement: '100 yd' }], payments: [] });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('STOCK_INSUFFICIENT');
    expect(r.body.params).toMatchObject({ productId, availableInches: '521.0000', requestedInches: '3600.0000' });
    expect(await stockOf(t, f, productId)).toEqual(before);
    // aggregated demand across lines of the same product is validated too
    const split = await sale({ items: [{ productId, measurement: '10 yd' }, { productId, measurement: '10 yd' }] });
    expect(split.body.code).toBe('STOCK_INSUFFICIENT');
  });

  it('AC-010: partial payment, due collection and overpayment blocking', async () => {
    const noCustomer = await sale({ items: [{ productId, measurement: '2 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '150' }] });
    expect(noCustomer.body.code).toBe('DUE_REQUIRES_CUSTOMER');
    const over = await sale({ items: [{ productId, measurement: '2 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '401' }] });
    expect(over.body.code).toBe('OVERPAYMENT_NOT_ALLOWED');

    const customer = await owner().post(`/shops/${f.shopId}/customers`, { name: 'Karim Mia', phone: '01811000000' });
    const s = await sale({ customerId: customer.body.id, items: [{ productId, measurement: '2 yd' }], payments: [{ paymentMethodId: f.cashMethodId, amount: '150' }] });
    expect(s.status).toBe(201);
    expect(s.body).toMatchObject({ grandTotal: '400', paidAmount: '150', dueAmount: '250', paymentStatus: 'PARTIALLY_PAID' });
    expect((await owner().get(`/shops/${f.shopId}/customers/${customer.body.id}`)).body.balanceDue).toBe('250');

    const tooMuch = await owner().post(`/shops/${f.shopId}/sales/${s.body.id}/payments`, { paymentMethodId: f.cashMethodId, amount: '250.01' }, { idem: uniq('pay') });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('OVERPAYMENT_NOT_ALLOWED');
    const pay = await owner().post(`/shops/${f.shopId}/sales/${s.body.id}/payments`, { paymentMethodId: f.cashMethodId, amount: '250' }, { idem: uniq('pay') });
    expect(pay.status).toBe(201);
    expect(pay.body).toMatchObject({ paidAmount: '400', dueAmount: '0', paymentStatus: 'PAID' });
    expect((await owner().get(`/shops/${f.shopId}/customers/${customer.body.id}`)).body.balanceDue).toBe('0');
  });

  it('FR-037/FR-038: price override needs a reason and is audited; discounts and tax break down', async () => {
    const noReason = await sale({ items: [{ productId, measurement: '1 yd', rateOverride: { unitRate: '180' } }] });
    expect(noReason.status).toBe(400);
    await owner().patch(`/shops/${f.shopId}/settings`, { taxMode: 'EXCLUSIVE', defaultTaxRate: '15' });
    const r = await sale({
      items: [{ productId, measurement: '1 yd', rateOverride: { unitRate: '180', reason: 'Regular customer' }, discount: { type: 'PERCENT', value: '10' } }],
      invoiceDiscount: { type: 'FIXED', value: '12' },
      payments: [{ paymentMethodId: f.cashMethodId, amount: '172.5' }],
    });
    expect(r.status).toBe(201);
    // 180 − 18 (10%) = 162 − 12 invoice = 150 taxable → +22.50 tax = 172.50
    expect(r.body).toMatchObject({ subtotal: '180', lineDiscountTotal: '18', invoiceDiscountAmount: '12', taxTotal: '22.5', grandTotal: '172.5', taxMode: 'EXCLUSIVE' });
    expect(r.body.items[0]).toMatchObject({ listUnitRate: '200', unitRate: '180', rateOverridden: true, overrideReason: 'Regular customer', allocatedInvoiceDiscount: '12', taxAmount: '22.5' });
    const audit = await t.prisma.auditLog.findFirst({ where: { shopId: f.shopId, action: 'price.override', targetId: r.body.id } });
    expect(audit).toMatchObject({ reason: 'Regular customer', actorUserId: f.userId });
    await owner().patch(`/shops/${f.shopId}/settings`, { taxMode: 'NONE' });
  });

  it('AC-009: cancellation compensates stock and payments and preserves the original', async () => {
    const before = await stockOf(t, f, productId);
    const r = await owner().post(`/shops/${f.shopId}/sales/${firstSaleId}/cancel`, { reason: 'Customer changed mind' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'CANCELLED', refundedAmount: '1050', dueAmount: '0', paymentStatus: 'REFUNDED' });
    expect(Number((await stockOf(t, f, productId)).onHand)).toBeCloseTo(Number(before.onHand) + 189, 4);

    const itemId = r.body.items[0].id;
    const moves = await t.prisma.stockMovement.findMany({ where: { saleItemId: itemId }, orderBy: { createdAt: 'asc' } });
    expect(moves.map((m) => [m.type, m.deltaOnHandInches.toFixed(4)])).toEqual([['SALE_OUT', '-189.0000'], ['SALE_CANCEL_IN', '189.0000']]);
    expect(moves[1]!.reversesMovementId).toBe(moves[0]!.id);
    const pays = await t.prisma.payment.findMany({ where: { saleId: firstSaleId }, orderBy: { createdAt: 'asc' } });
    expect(pays.map((p) => [p.direction, p.status, p.amount.toFixed(2)])).toEqual([['IN', 'REVERSED', '1050.00'], ['OUT', 'POSTED', '1050.00']]);

    const again = await owner().post(`/shops/${f.shopId}/sales/${firstSaleId}/cancel`, { reason: 'twice' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SALE_NOT_CANCELLABLE');
  });

  it('BR-009/BR-015: the database itself refuses to erase ledger rows', async () => {
    await expect(t.prisma.$executeRawUnsafe(`DELETE FROM stock_movements WHERE "shopId" = '${f.shopId}'`)).rejects.toThrow(/append-only/);
    await expect(t.prisma.$executeRawUnsafe(`UPDATE stock_movements SET "deltaOnHandInches" = 0 WHERE "shopId" = '${f.shopId}'`)).rejects.toThrow(/append-only/);
    await expect(t.prisma.$executeRawUnsafe(`DELETE FROM sales WHERE "shopId" = '${f.shopId}'`)).rejects.toThrow(/not permitted/);
    await expect(t.prisma.$executeRawUnsafe(`UPDATE payments SET amount = 1 WHERE "saleId" = '${firstSaleId}'`)).rejects.toThrow(/append-only/);
  });

  it('FR-031: damage write-off below the threshold raises a low-stock notification', async () => {
    const r = await owner().post(`/shops/${f.shopId}/inventory/adjustments`, { branchId: f.branchId, productId, type: 'DAMAGE_OUT', measurement: '8 yd', reason: 'Water damage' });
    expect(r.status).toBe(201);
    const inv = await owner().get(`/shops/${f.shopId}/inventory?lowStockOnly=true`);
    expect(inv.body.items).toEqual([expect.objectContaining({ product: expect.objectContaining({ id: productId }), lowStock: true })]);
    const notes = await t.api.as(f.token).get('/me/notifications');
    expect(notes.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'stock.low', titleKey: 'notifications.stock.low.title' })]));
    const ledger = await owner().get(`/shops/${f.shopId}/inventory/products/${productId}/ledger`);
    expect(ledger.body.items[0]).toMatchObject({ type: 'DAMAGE_OUT', reason: 'Water damage' });
  });

  it('FR-046/FR-048: invoice view is built from snapshots, language selectable per invoice', async () => {
    await owner().patch(`/shops/${f.shopId}`, { name: 'Renamed Shop' });
    const inv = await owner().get(`/shops/${f.shopId}/sales/${firstSaleId}/invoice?lang=en`);
    expect(inv.status).toBe(200);
    expect(inv.body).toMatchObject({ language: 'en', shop: { name: 'ABC Fabrics' }, lines: [expect.objectContaining({ measurementDisplay: '5 yd 4 gira', quantity: '5.2500', lineTotal: '1050' })] });
  });
});
