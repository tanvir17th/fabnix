import {
  DomainError,
  ErrorCode,
  STANDARD_UNITS,
  UnitDefinition,
  calculateLine,
  decompose,
  equivalents,
  formatMeasurement,
  fromInches,
  parseMeasurementText,
  toInches,
} from '../src';

const std: UnitDefinition[] = STANDARD_UNITS.map((u) => ({ ...u }));
const gira225: UnitDefinition = { id: 'u-gira-1', code: 'GIRA', kind: 'GIRA', symbol: 'gira', inchesPerUnit: '2.25', version: 1 };
const units = [...std, gira225];
const YARD = units.find((u) => u.code === 'YARD')!;
const METRE = units.find((u) => u.code === 'METRE')!;

function expectDomainError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return e as DomainError;
  }
  throw new Error(`expected DomainError ${code}`);
}

describe('AC-006 — 1 Gira = 2.25 in: 5 yards 4 Gira', () => {
  const r = toInches(
    [
      { unit: 'YARD', value: '5' },
      { unit: 'GIRA', value: '4' },
    ],
    units,
  );

  it('= 189 inches', () => {
    expect(r.inches.toFixed(4)).toBe('189.0000');
  });

  it('= 5.25 yards', () => {
    expect(fromInches(r.inches, YARD).toString()).toBe('5.25');
  });

  it('= ৳1,050.00 at ৳200/yd (Appendix A)', () => {
    const line = calculateLine({ lengthInches: r.inches, priceUnitInches: '36', unitRate: '200' });
    expect(line.quantity).toBe('5.2500');
    expect(line.grossAmount).toBe('1050.00');
    expect(line.lineTotal).toBe('1050.00');
  });

  it('snapshots the exact factors used (FR-019)', () => {
    expect(r.snapshot).toEqual([
      { code: 'YARD', inchesPerUnit: '36' },
      { code: 'GIRA', unitId: 'u-gira-1', version: 1, inchesPerUnit: '2.25' },
    ]);
  });
});

describe('toInches', () => {
  it('uses the shop-specific Gira factor, never a global one (FR-013, AC-004)', () => {
    const shopB = [...std, { ...gira225, inchesPerUnit: '2.5' }];
    expect(toInches([{ unit: 'GIRA', value: '4' }], units).inches.toString()).toBe('9');
    expect(toInches([{ unit: 'GIRA', value: '4' }], shopB).inches.toString()).toBe('10');
  });

  it('rejects GIRA when the shop has not configured it', () => {
    expectDomainError(() => toInches([{ unit: 'GIRA', value: '1' }], std), ErrorCode.GIRA_NOT_CONFIGURED);
  });

  it('rejects unknown units', () => {
    expectDomainError(() => toInches([{ unit: 'HAAT', value: '1' }], units), ErrorCode.UNIT_NOT_AVAILABLE);
  });

  it('accepts custom shop units', () => {
    const haat: UnitDefinition = { code: 'HAAT', kind: 'CUSTOM', symbol: 'haat', inchesPerUnit: '18' };
    expect(toInches([{ unit: 'haat', value: '2' }], [...units, haat]).inches.toString()).toBe('36');
  });

  it('is case-insensitive on unit codes', () => {
    expect(toInches([{ unit: 'yard', value: '1' }], units).inches.toString()).toBe('36');
  });

  it('rejects negatives, empty, zero, duplicates, garbage and excess precision', () => {
    expectDomainError(() => toInches([], units), ErrorCode.MEASUREMENT_EMPTY);
    expectDomainError(() => toInches([{ unit: 'YARD', value: '-1' }], units), ErrorCode.MEASUREMENT_NEGATIVE);
    expectDomainError(() => toInches([{ unit: 'YARD', value: '0' }], units), ErrorCode.MEASUREMENT_EMPTY);
    expectDomainError(
      () => toInches([{ unit: 'YARD', value: '1' }, { unit: 'YARD', value: '2' }], units),
      ErrorCode.MEASUREMENT_DUPLICATE_UNIT,
    );
    expectDomainError(() => toInches([{ unit: 'YARD', value: 'abc' }], units), ErrorCode.MEASUREMENT_INVALID_VALUE);
    expectDomainError(() => toInches([{ unit: 'YARD', value: '1e3' }], units), ErrorCode.MEASUREMENT_INVALID_VALUE);
    expectDomainError(() => toInches([{ unit: 'YARD', value: '1.125' }], units), ErrorCode.MEASUREMENT_TOO_PRECISE);
  });

  it('allows zero when explicitly requested', () => {
    expect(toInches([{ unit: 'YARD', value: '0' }], units, { allowZero: true }).inches.toString()).toBe('0');
  });

  it('accepts Bangla digits', () => {
    expect(toInches([{ unit: 'YARD', value: '৫' }, { unit: 'GIRA', value: '৪' }], units).inches.toString()).toBe('189');
  });

  it('avoids float error: 0.1 yd + 0.2 yd = exactly 10.8 in', () => {
    const r = toInches([{ unit: 'YARD', value: '0.3' }], units);
    expect(r.inches.toString()).toBe('10.8');
  });

  it('rounds metric input to 4 dp HALF_UP at storage precision', () => {
    // 1 m = 39.37007874 in → stored 39.3701
    const r = toInches([{ unit: 'METRE', value: '1' }], units);
    expect(r.exactInches.toString()).toBe('39.37007874');
    expect(r.inches.toString()).toBe('39.3701');
  });

  it('honours 1 yd = 0.9144 m (reference constant)', () => {
    const inches = toInches([{ unit: 'YARD', value: '1' }], units).inches;
    expect(fromInches(inches, METRE).toDecimalPlaces(4).toString()).toBe('0.9144');
  });
});

describe('equivalents / decompose / format (FR-015)', () => {
  it('shows equivalents in all configured units', () => {
    expect(equivalents('189', units)).toEqual([
      { unit: 'YARD', symbol: 'yd', value: '5.25' },
      { unit: 'INCH', symbol: 'in', value: '189.00' },
      { unit: 'METRE', symbol: 'm', value: '4.80' },
      { unit: 'CM', symbol: 'cm', value: '480.06' },
      { unit: 'GIRA', symbol: 'gira', value: '84.00' },
    ]);
  });

  it('decomposes 189 in into 5 yd 4 gira', () => {
    expect(decompose('189', [YARD, gira225])).toEqual([
      { unit: 'YARD', value: '5' },
      { unit: 'GIRA', value: '4' },
    ]);
  });

  it('decomposes with fractional remainder in the last unit', () => {
    expect(decompose('190', [YARD, gira225])).toEqual([
      { unit: 'YARD', value: '5' },
      { unit: 'GIRA', value: '4.44' },
    ]);
  });

  it('omits zero leading components and handles sub-yard lengths', () => {
    expect(decompose('9', [YARD, gira225])).toEqual([{ unit: 'GIRA', value: '4' }]);
    expect(decompose('0', [YARD, gira225])).toEqual([{ unit: 'GIRA', value: '0' }]);
    expect(decompose('10', [])).toEqual([]);
  });

  it('formats with symbols or localized labels', () => {
    const c = [{ unit: 'YARD', value: '5' }, { unit: 'GIRA', value: '4' }];
    expect(formatMeasurement(c, units)).toBe('5 yd 4 gira');
    expect(formatMeasurement(c, units, { YARD: 'গজ', GIRA: 'গিরা' })).toBe('5 গজ 4 গিরা');
  });
});

describe('parseMeasurementText (POS quick entry)', () => {
  it.each([
    ['5 yd 4 gira', [{ unit: 'YARD', value: '5' }, { unit: 'GIRA', value: '4' }]],
    ['5y4g', [{ unit: 'YARD', value: '5' }, { unit: 'GIRA', value: '4' }]],
    ['5 yards, 4 gira', [{ unit: 'YARD', value: '5' }, { unit: 'GIRA', value: '4' }]],
    ['5 yd + 9 in', [{ unit: 'YARD', value: '5' }, { unit: 'INCH', value: '9' }]],
    ['৫ গজ ৪ গিরা', [{ unit: 'YARD', value: '5' }, { unit: 'GIRA', value: '4' }]],
    ['2.5m', [{ unit: 'METRE', value: '2.5' }]],
    ['120 cm', [{ unit: 'CM', value: '120' }]],
    ['3 GIRA', [{ unit: 'GIRA', value: '3' }]],
  ])('parses %s', (text, expected) => {
    expect(parseMeasurementText(text, units)).toEqual(expected);
  });

  it('uses the default unit for a bare number', () => {
    expect(parseMeasurementText('3', units, 'YARD')).toEqual([{ unit: 'YARD', value: '3' }]);
  });

  it('fails on unknown words, empty input and bare numbers without default', () => {
    expectDomainError(() => parseMeasurementText('5 bananas', units), ErrorCode.MEASUREMENT_UNPARSEABLE);
    expectDomainError(() => parseMeasurementText('  ', units), ErrorCode.MEASUREMENT_EMPTY);
    expectDomainError(() => parseMeasurementText('5', units), ErrorCode.MEASUREMENT_UNPARSEABLE);
    expectDomainError(() => parseMeasurementText('yd', units), ErrorCode.MEASUREMENT_UNPARSEABLE);
  });

  it('resolves gira alias even when unconfigured, so toInches reports GIRA_NOT_CONFIGURED', () => {
    const c = parseMeasurementText('4 gira', std);
    expect(c).toEqual([{ unit: 'GIRA', value: '4' }]);
    expectDomainError(() => toInches(c, std), ErrorCode.GIRA_NOT_CONFIGURED);
  });

  it('round-trips into toInches', () => {
    expect(toInches(parseMeasurementText('5 yd 4 gira', units), units).inches.toString()).toBe('189');
  });
});
