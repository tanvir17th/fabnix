import DecimalLib from 'decimal.js';

/**
 * Isolated Decimal constructor for all FABNIX arithmetic (BR-010).
 * 34 significant digits (IEEE 754 decimal128 equivalent) — far beyond the
 * Decimal(14,4)/(18,8) storage precision, so intermediate results never lose
 * information before the single, explicit rounding step.
 */
export const Decimal = DecimalLib.clone({
  precision: 34,
  rounding: DecimalLib.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Decimal = InstanceType<typeof Decimal>;

/** Accepted wire/DB representations. JS numbers are accepted ONLY when they are safe integers. */
export type DecimalInput = string | Decimal | bigint | number | { toString(): string };

const DECIMAL_STRING = /^-?(?:\d+)(?:\.\d+)?$/;

export class InvalidDecimalError extends Error {
  constructor(readonly input: unknown) {
    super(`Invalid decimal value: ${String(input)}`);
    this.name = 'InvalidDecimalError';
  }
}

/**
 * Convert to Decimal. Rejects binary floats (e.g. 0.1) to stop float values
 * leaking into money/length math; callers must send strings like "0.1".
 * Prisma.Decimal instances are accepted via their toString().
 */
export function D(value: DecimalInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new InvalidDecimalError(value);
    return new Decimal(value);
  }
  if (typeof value === 'bigint') return new Decimal(value.toString());
  const s = typeof value === 'string' ? value.trim() : value?.toString?.();
  if (typeof s !== 'string' || !DECIMAL_STRING.test(s)) throw new InvalidDecimalError(value);
  return new Decimal(s);
}

export function isDecimalString(s: unknown): s is string {
  return typeof s === 'string' && DECIMAL_STRING.test(s.trim());
}

export const ZERO = new Decimal(0);
export const HUNDRED = new Decimal(100);

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN';

export function roundingConst(mode: RoundingMode): DecimalLib.Rounding {
  return mode === 'HALF_EVEN' ? DecimalLib.ROUND_HALF_EVEN : DecimalLib.ROUND_HALF_UP;
}

/** Round to `dp` decimal places with the shop's rounding mode. */
export function round(value: DecimalInput, dp: number, mode: RoundingMode = 'HALF_UP'): Decimal {
  return D(value).toDecimalPlaces(dp, roundingConst(mode));
}

/** Fixed-scale string for the wire / DB, e.g. toFixedString(1050, 2) → "1050.00". */
export function toFixedString(value: DecimalInput, dp: number, mode: RoundingMode = 'HALF_UP'): string {
  return D(value).toFixed(dp, roundingConst(mode));
}

export function sum(values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(D(v)), ZERO);
}

export function max(a: DecimalInput, b: DecimalInput): Decimal {
  return Decimal.max(D(a), D(b));
}

export function min(a: DecimalInput, b: DecimalInput): Decimal {
  return Decimal.min(D(a), D(b));
}
