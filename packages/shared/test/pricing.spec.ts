import {
  D,
  DomainError,
  ErrorCode,
  InvalidDecimalError,
  allocate,
  applyCashRounding,
  assertPaymentWithinDue,
  calculateInvoice,
  calculateLine,
  formatMoney,
  normalizeDigits,
  round,
  summarizePayment,
  sum,
  toBanglaDigits,
} from '../src';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as DomainError).code;
  }
  return undefined;
};

describe('decimal safety (BR-010)', () => {
  it('rejects binary floats but accepts safe integers and strings', () => {
    expect(() => D(0.1)).toThrow(InvalidDecimalError);
    expect(() => D('1e5')).toThrow(InvalidDecimalError);
    expect(() => D('')).toThrow(InvalidDecimalError);
    expect(D(200).toString()).toBe('200');
    expect(D('0.1').plus('0.2').toString()).toBe('0.3');
    expect(D(10n).toString()).toBe('10');
    expect(D({ toString: () => '12.50' }).toString()).toBe('12.5');
  });

  it('rounds HALF_UP by default and HALF_EVEN on request', () => {
    expect(round('2.345', 2).toString()).toBe('2.35');
    expect(round('2.345', 2, 'HALF_EVEN').toString()).toBe('2.34');
    expect(round('2.355', 2, 'HALF_EVEN').toString()).toBe('2.36');
  });

  it('sums exactly', () => {
    expect(sum(['0.1', '0.2', '0.3']).toString()).toBe('0.6');
  });
});

describe('calculateLine (FR-017)', () => {
  it('prices per yard', () => {
    const l = calculateLine({ lengthInches: '189', priceUnitInches: '36', unitRate: '200' });
    expect(l).toMatchObject({ quantity: '5.2500', grossAmount: '1050.00', lineTotal: '1050.00', taxAmount: '0.00' });
  });

  it('prices per metre using metre inches', () => {
    // 2 m at ৳300/m
    const l = calculateLine({ lengthInches: '78.7402', priceUnitInches: '39.37007874', unitRate: '300' });
    expect(l.grossAmount).toBe('600.00');
  });

  it('multiplies by pieces', () => {
    const l = calculateLine({ lengthInches: '90', pieces: 3, priceUnitInches: '36', unitRate: '120' });
    expect(l.totalLengthInches).toBe('270.0000');
    expect(l.grossAmount).toBe('900.00');
  });

  it('rounds the line gross HALF_UP to currency precision', () => {
    // 1 inch at ৳100/yd = 2.7777… → 2.78
    expect(calculateLine({ lengthInches: '1', priceUnitInches: '36', unitRate: '100' }).grossAmount).toBe('2.78');
  });

  it('supports zero-decimal currencies', () => {
    const l = calculateLine({ lengthInches: '1', priceUnitInches: '36', unitRate: '100' }, { currencyPrecision: 0 });
    expect(l.grossAmount).toBe('3');
  });

  it('applies percent and fixed line discounts', () => {
    expect(calculateLine({ lengthInches: '189', priceUnitInches: '36', unitRate: '200', discount: { type: 'PERCENT', value: '10' } })).toMatchObject({
      discountAmount: '105.00',
      lineTotal: '945.00',
    });
    expect(calculateLine({ lengthInches: '189', priceUnitInches: '36', unitRate: '200', discount: { type: 'FIXED', value: '50' } }).lineTotal).toBe('1000.00');
  });

  it('rejects discounts that exceed the line or are out of range', () => {
    expect(code(() => calculateLine({ lengthInches: '36', priceUnitInches: '36', unitRate: '100', discount: { type: 'FIXED', value: '101' } }))).toBe(
      ErrorCode.DISCOUNT_EXCEEDS_AMOUNT,
    );
    expect(code(() => calculateLine({ lengthInches: '36', priceUnitInches: '36', unitRate: '100', discount: { type: 'PERCENT', value: '101' } }))).toBe(
      ErrorCode.DISCOUNT_INVALID,
    );
    expect(code(() => calculateLine({ lengthInches: '36', priceUnitInches: '36', unitRate: '100', discount: { type: 'FIXED', value: '-1' } }))).toBe(
      ErrorCode.DISCOUNT_INVALID,
    );
  });

  it('rejects invalid pieces, negative rate and zero price unit', () => {
    expect(code(() => calculateLine({ lengthInches: '36', pieces: 0, priceUnitInches: '36', unitRate: '1' }))).toBe(ErrorCode.MEASUREMENT_INVALID_VALUE);
    expect(code(() => calculateLine({ lengthInches: '36', priceUnitInches: '36', unitRate: '-1' }))).toBe(ErrorCode.DISCOUNT_INVALID);
    expect(code(() => calculateLine({ lengthInches: '36', priceUnitInches: '0', unitRate: '1' }))).toBe(ErrorCode.UNIT_NOT_AVAILABLE);
  });
});

describe('tax modes (FR-038)', () => {
  const base = { lengthInches: '36', priceUnitInches: '36', unitRate: '1000', taxRate: '15' };

  it('NONE ignores the rate', () => {
    expect(calculateLine(base, { taxMode: 'NONE' })).toMatchObject({ taxAmount: '0.00', taxRate: '0.0000', lineTotal: '1000.00' });
  });

  it('EXCLUSIVE adds tax on top', () => {
    expect(calculateLine(base, { taxMode: 'EXCLUSIVE' })).toMatchObject({ taxAmount: '150.00', lineTotal: '1150.00' });
  });

  it('INCLUSIVE extracts tax from the price', () => {
    // 1000 × 15/115 = 130.434… → 130.43
    expect(calculateLine(base, { taxMode: 'INCLUSIVE' })).toMatchObject({ taxAmount: '130.43', lineTotal: '1000.00' });
  });

  it('taxes after discount', () => {
    const l = calculateLine({ ...base, discount: { type: 'PERCENT', value: '10' } }, { taxMode: 'EXCLUSIVE' });
    expect(l).toMatchObject({ taxableAmount: '900.00', taxAmount: '135.00', lineTotal: '1035.00' });
  });
});

describe('calculateInvoice (rounding policy BR-011)', () => {
  it('produces the FR-018 breakdown and lines always add up to the total', () => {
    const inv = calculateInvoice({
      lines: [
        { lengthInches: '189', priceUnitInches: '36', unitRate: '200' }, // 1050
        { lengthInches: '10', priceUnitInches: '36', unitRate: '333' }, // 92.50
        { lengthInches: '7', priceUnitInches: '36', unitRate: '111' }, // 21.58
      ],
      invoiceDiscount: { type: 'FIXED', value: '100' },
      deliveryFee: '60',
      policy: { taxMode: 'EXCLUSIVE' },
    });
    expect(inv.subtotal).toBe('1164.08');
    expect(inv.invoiceDiscountAmount).toBe('100.00');
    const allocated = sum(inv.lines.map((l) => l.allocatedInvoiceDiscount));
    expect(allocated.toFixed(2)).toBe('100.00');
    const lineTotals = sum(inv.lines.map((l) => l.lineTotal));
    expect(lineTotals.plus(inv.deliveryFee).plus(inv.roundingAdjustment).toFixed(2)).toBe(inv.grandTotal);
    expect(inv.grandTotal).toBe('1124.08');
  });

  it('applies percent invoice discount on the post-line-discount base', () => {
    const inv = calculateInvoice({
      lines: [{ lengthInches: '36', priceUnitInches: '36', unitRate: '1000', discount: { type: 'FIXED', value: '100' } }],
      invoiceDiscount: { type: 'PERCENT', value: '10' },
    });
    expect(inv).toMatchObject({ lineDiscountTotal: '100.00', invoiceDiscountAmount: '90.00', grandTotal: '810.00' });
  });

  it('rejects an invoice discount larger than the base', () => {
    expect(
      code(() =>
        calculateInvoice({ lines: [{ lengthInches: '36', priceUnitInches: '36', unitRate: '10' }], invoiceDiscount: { type: 'FIXED', value: '11' } }),
      ),
    ).toBe(ErrorCode.DISCOUNT_EXCEEDS_AMOUNT);
  });

  it('rejects negative delivery fee', () => {
    expect(code(() => calculateInvoice({ lines: [], deliveryFee: '-1' }))).toBe(ErrorCode.DISCOUNT_INVALID);
  });

  it('cash rounding is a visible adjustment', () => {
    const inv = calculateInvoice({
      lines: [{ lengthInches: '1', priceUnitInches: '36', unitRate: '100' }], // 2.78
      policy: { cashRounding: 'NEAREST_1' },
    });
    expect(inv).toMatchObject({ grandTotal: '3.00', roundingAdjustment: '0.22' });
    expect(applyCashRounding('1052.40', 'NEAREST_5').toString()).toBe('1050');
    expect(applyCashRounding('1052.50', 'NEAREST_5').toString()).toBe('1055');
    expect(applyCashRounding('1052.49', 'NONE').toString()).toBe('1052.49');
  });

  it('handles an empty invoice', () => {
    expect(calculateInvoice({ lines: [] }).grandTotal).toBe('0.00');
  });
});

describe('allocate (largest remainder)', () => {
  it('sums exactly to the total', () => {
    const parts = allocate('100', ['1', '1', '1'], 2);
    expect(parts.map(String)).toEqual(['33.34', '33.33', '33.33']);
    expect(sum(parts).toString()).toBe('100');
  });

  it('is proportional', () => {
    expect(allocate('10', ['300', '100'], 2).map(String)).toEqual(['7.5', '2.5']);
  });

  it('returns zeros for zero total or zero weights', () => {
    expect(allocate('0', ['1', '2'], 2).map(String)).toEqual(['0', '0']);
    expect(allocate('5', ['0', '0'], 2).map(String)).toEqual(['0', '0']);
  });
});

describe('payments (FR-040, BR-008)', () => {
  it('derives status and due', () => {
    expect(summarizePayment('1050', '0')).toEqual({ due: '1050.00', status: 'UNPAID' });
    expect(summarizePayment('1050', '500')).toEqual({ due: '550.00', status: 'PARTIALLY_PAID' });
    expect(summarizePayment('1050', '1050')).toEqual({ due: '0.00', status: 'PAID' });
    expect(summarizePayment('1050', '1050', '200')).toEqual({ due: '200.00', status: 'PARTIALLY_REFUNDED' });
    expect(summarizePayment('1050', '1050', '1050')).toEqual({ due: '1050.00', status: 'REFUNDED' });
  });

  it('blocks overpayment (AC-010)', () => {
    expect(() => assertPaymentWithinDue('1050', '1000', '50')).not.toThrow();
    expect(code(() => assertPaymentWithinDue('1050', '1000', '50.01'))).toBe(ErrorCode.OVERPAYMENT_NOT_ALLOWED);
  });
});

describe('locale formatting (NFR-L10N-008)', () => {
  it('formats BDT in English and Bangla', () => {
    expect(formatMoney('1050', { currency: 'BDT', locale: 'en-US' })).toMatch(/^BDT\s1,050\.00$/);
    const bn = formatMoney('1050', { currency: 'BDT', locale: 'bn-BD' });
    expect(bn).toContain('৳');
    expect(bn).toContain('১,০৫০.০০');
  });

  it('converts digits both ways', () => {
    expect(normalizeDigits('৫.২৫')).toBe('5.25');
    expect(toBanglaDigits('1050')).toBe('১০৫০');
  });
});
