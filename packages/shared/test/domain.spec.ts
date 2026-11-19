import {
  ALL_SHOP_PERMISSIONS,
  DomainError,
  ErrorCode,
  ROLE_PRESETS,
  allowedTransitions,
  assertTransition,
  canTransition,
  holdsReservation,
  isDeductionPoint,
  schemas,
} from '../src';

describe('order state machine (§A3.1)', () => {
  it('lets a shopkeeper confirm/reject/cancel a pending order', () => {
    expect(allowedTransitions('PENDING_CONFIRMATION', 'SHOPKEEPER').sort()).toEqual(['CANCELLED', 'CONFIRMED', 'REJECTED']);
  });

  it('lets a customer only cancel while pending', () => {
    expect(allowedTransitions('PENDING_CONFIRMATION', 'CUSTOMER')).toEqual(['CANCELLED']);
    expect(allowedTransitions('CONFIRMED', 'CUSTOMER')).toEqual([]);
  });

  it('routes pickup vs home delivery', () => {
    expect(canTransition('PROCESSING', 'READY_FOR_PICKUP', 'SHOPKEEPER', 'PICKUP')).toBe(true);
    expect(canTransition('PROCESSING', 'READY_FOR_PICKUP', 'SHOPKEEPER', 'HOME_DELIVERY')).toBe(false);
    expect(canTransition('PROCESSING', 'DISPATCHED', 'SHOPKEEPER', 'HOME_DELIVERY')).toBe(true);
  });

  it('forbids skipping or leaving terminal states', () => {
    expect(canTransition('PENDING_CONFIRMATION', 'DELIVERED', 'SHOPKEEPER')).toBe(false);
    expect(canTransition('DISPATCHED', 'CANCELLED', 'SHOPKEEPER')).toBe(false);
    expect(allowedTransitions('COMPLETED', 'SHOPKEEPER')).toEqual([]);
    expect(allowedTransitions('CANCELLED', 'SYSTEM')).toEqual([]);
  });

  it('requires a reason for reject/cancel', () => {
    expect(() => assertTransition('PENDING_CONFIRMATION', 'REJECTED', 'SHOPKEEPER')).toThrow(DomainError);
    try {
      assertTransition('PENDING_CONFIRMATION', 'REJECTED', 'SHOPKEEPER', { reason: '  ' });
    } catch (e) {
      expect((e as DomainError).code).toBe(ErrorCode.REASON_REQUIRED);
    }
    expect(() => assertTransition('PENDING_CONFIRMATION', 'REJECTED', 'SHOPKEEPER', { reason: 'Out of stock' })).not.toThrow();
    try {
      assertTransition('DELIVERED', 'CONFIRMED', 'SHOPKEEPER');
    } catch (e) {
      expect((e as DomainError).code).toBe(ErrorCode.ORDER_TRANSITION_INVALID);
    }
  });

  it('marks the configured deduction milestone (FR-121)', () => {
    expect(isDeductionPoint('CONFIRMED', 'ON_CONFIRMATION')).toBe(true);
    expect(isDeductionPoint('DISPATCHED', 'ON_CONFIRMATION')).toBe(false);
    expect(isDeductionPoint('DISPATCHED', 'ON_DISPATCH')).toBe(true);
    expect(isDeductionPoint('READY_FOR_PICKUP', 'ON_DISPATCH')).toBe(true);
    expect(holdsReservation('PENDING_CONFIRMATION', 'ON_CONFIRMATION')).toBe(true);
    expect(holdsReservation('CONFIRMED', 'ON_CONFIRMATION')).toBe(false);
    expect(holdsReservation('PROCESSING', 'ON_DISPATCH')).toBe(true);
  });
});

describe('role presets (§A1.2)', () => {
  it('owner holds every shop permission; presets only use catalog codes', () => {
    const owner = ROLE_PRESETS.find((r) => r.key === 'owner')!;
    expect(new Set(owner.permissions)).toEqual(new Set(ALL_SHOP_PERMISSIONS));
    for (const r of ROLE_PRESETS) for (const p of r.permissions) expect(ALL_SHOP_PERMISSIONS).toContain(p);
  });

  it('cashier cannot override prices or manage catalog', () => {
    const cashier = ROLE_PRESETS.find((r) => r.key === 'cashier')!;
    expect(cashier.permissions).not.toContain('pos.price.override');
    expect(cashier.permissions).not.toContain('catalog.manage');
  });
});

describe('zod schemas', () => {
  it('normalizes BD phone numbers and Bangla digits', () => {
    expect(schemas.phoneSchema.parse('০১৭১১-২২৩৩৪৪')).toBe('+8801711223344');
    expect(schemas.phoneSchema.safeParse('12345').success).toBe(false);
  });

  it('validates decimal strings', () => {
    expect(schemas.money.parse('1050.5')).toBe('1050.5');
    expect(schemas.money.parse(200)).toBe('200');
    expect(schemas.money.safeParse('0').success).toBe(false);
    expect(schemas.moneyOrZero.parse('0')).toBe('0');
    expect(schemas.money.safeParse('1.234').success).toBe(false);
    expect(schemas.money.safeParse('-1').success).toBe(false);
    expect(schemas.percent.safeParse('100.5').success).toBe(false);
  });

  it('requires email or phone on register', () => {
    expect(schemas.registerSchema.safeParse({ type: 'CUSTOMER', fullName: 'Rahim', password: 'secret123' }).success).toBe(false);
    expect(schemas.registerSchema.parse({ type: 'CUSTOMER', fullName: 'Rahim', email: 'R@X.com', password: 'secret123' }).email).toBe('r@x.com');
  });

  it('accepts structured or text measurement on a sale line', () => {
    const base = { productId: '0190f0c4-0000-7000-8000-000000000001' };
    expect(schemas.saleLineSchema.parse({ ...base, measurement: '5 yd 4 gira' }).pieces).toBe(1);
    expect(schemas.saleLineSchema.parse({ ...base, measurement: [{ unit: 'yard', value: '5' }] }).measurement).toEqual([{ unit: 'YARD', value: '5' }]);
  });

  it('validates storefront slugs', () => {
    expect(schemas.slugSchema.parse('ABC-Fabrics')).toBe('abc-fabrics');
    expect(schemas.slugSchema.safeParse('a--b').success).toBe(false);
    expect(schemas.slugSchema.safeParse('-abc').success).toBe(false);
    expect(schemas.slugSchema.safeParse('ab').success).toBe(false);
    expect(schemas.slugSchema.safeParse('abc').success).toBe(true);
  });
});
