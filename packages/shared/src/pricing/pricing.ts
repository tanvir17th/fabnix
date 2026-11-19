import { D, Decimal, DecimalInput, HUNDRED, RoundingMode, ZERO, round, roundingConst, sum, toFixedString } from '../money/decimal';
import { DomainError, ErrorCode } from '../errors/domain-error';
import { LENGTH_STORAGE_DP } from '../measurement/convert';
import DecimalLib from 'decimal.js';

export type TaxMode = 'NONE' | 'EXCLUSIVE' | 'INCLUSIVE';
export type CashRounding = 'NONE' | 'NEAREST_1' | 'NEAREST_5';
export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED';

export interface Discount {
  type: DiscountType;
  /** PERCENT: 0–100. FIXED: amount in shop currency. */
  value: DecimalInput;
}

/**
 * Documented rounding policy (BR-011, SRS §15 decision #3):
 *  1. Line gross   = round(totalInches × unitRate ÷ priceUnitInches)
 *  2. Line discount= round(gross × pct/100) | fixed (must not exceed gross)
 *  3. Invoice discount is computed on Σ(gross − line discount), then allocated
 *     pro-rata to lines by largest-remainder so allocations sum EXACTLY.
 *  4. Tax per line on its taxable amount (after both discounts), rounded.
 *  5. Totals are sums of rounded line values → lines always add up.
 *  6. Optional cash rounding is a separate, visible adjustment.
 * All rounding uses `currencyPrecision` and the shop's `roundingMode`.
 */
export interface PricingPolicy {
  currencyPrecision: number;
  roundingMode: RoundingMode;
  taxMode: TaxMode;
  cashRounding: CashRounding;
}

export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  currencyPrecision: 2,
  roundingMode: 'HALF_UP',
  taxMode: 'NONE',
  cashRounding: 'NONE',
};

export interface LineInput {
  /** Length of one cut in canonical inches (already 4 dp). */
  lengthInches: DecimalInput;
  /** Identical cuts. Default 1. */
  pieces?: number;
  /** Inches in the unit the rate is quoted in (36 for per-yard). */
  priceUnitInches: DecimalInput;
  unitRate: DecimalInput;
  discount?: Discount;
  /** Percent, e.g. "15". Ignored when taxMode = NONE. */
  taxRate?: DecimalInput;
}

export interface LineResult {
  totalLengthInches: string;
  /** Quantity in the price unit (e.g. 5.25 yards), 4 dp. */
  quantity: string;
  unitRate: string;
  grossAmount: string;
  discountAmount: string;
  allocatedInvoiceDiscount: string;
  taxableAmount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface InvoiceInput {
  lines: LineInput[];
  invoiceDiscount?: Discount;
  deliveryFee?: DecimalInput;
  policy?: Partial<PricingPolicy>;
}

export interface InvoiceResult {
  lines: LineResult[];
  subtotal: string;
  lineDiscountTotal: string;
  invoiceDiscountAmount: string;
  taxTotal: string;
  deliveryFee: string;
  roundingAdjustment: string;
  grandTotal: string;
  policy: PricingPolicy;
}

function discountAmount(base: Decimal, d: Discount | undefined, p: PricingPolicy): Decimal {
  if (!d || d.type === 'NONE') return ZERO;
  const v = D(d.value);
  if (v.isNegative()) throw new DomainError(ErrorCode.DISCOUNT_INVALID);
  if (d.type === 'PERCENT') {
    if (v.greaterThan(HUNDRED)) throw new DomainError(ErrorCode.DISCOUNT_INVALID);
    return round(base.times(v).div(HUNDRED), p.currencyPrecision, p.roundingMode);
  }
  const fixed = round(v, p.currencyPrecision, p.roundingMode);
  if (fixed.greaterThan(base)) {
    throw new DomainError(ErrorCode.DISCOUNT_EXCEEDS_AMOUNT, { discount: fixed.toString(), amount: base.toString() });
  }
  return fixed;
}

/** Largest-remainder allocation of `total` across `weights`, in currency minor units. */
export function allocate(total: DecimalInput, weights: DecimalInput[], precision: number): Decimal[] {
  const t = D(total);
  const w = weights.map(D);
  const wSum = sum(w);
  if (t.isZero() || wSum.isZero()) return w.map(() => ZERO);
  const unit = new Decimal(1).div(new Decimal(10).pow(precision));
  const raw = w.map((x) => t.times(x).div(wSum));
  const floored = raw.map((x) => x.toDecimalPlaces(precision, DecimalLib.ROUND_DOWN));
  let leftover = t.minus(sum(floored)).div(unit).round().toNumber();
  const order = raw
    .map((x, i) => ({ i, rem: x.minus(floored[i]!) }))
    .sort((a, b) => b.rem.comparedTo(a.rem) || a.i - b.i);
  for (let k = 0; leftover > 0 && order.length; k = (k + 1) % order.length, leftover--) {
    const idx = order[k]!.i;
    floored[idx] = floored[idx]!.plus(unit);
  }
  return floored;
}

/** Quantity in price units (e.g. yards) for display, 4 dp. */
export function quantityInPriceUnits(totalInches: DecimalInput, priceUnitInches: DecimalInput): Decimal {
  return D(totalInches).div(D(priceUnitInches)).toDecimalPlaces(LENGTH_STORAGE_DP);
}

/** Full invoice/order calculation (FR-017, FR-018, FR-038, FR-101, FR-105). */
export function calculateInvoice(input: InvoiceInput): InvoiceResult {
  const p: PricingPolicy = { ...DEFAULT_PRICING_POLICY, ...input.policy };
  const dp = p.currencyPrecision;
  const r = (x: Decimal) => round(x, dp, p.roundingMode);

  const stage1 = input.lines.map((line) => {
    const pieces = line.pieces ?? 1;
    if (!Number.isInteger(pieces) || pieces < 1) throw new DomainError(ErrorCode.MEASUREMENT_INVALID_VALUE, { field: 'pieces' });
    const unitRate = D(line.unitRate);
    if (unitRate.isNegative()) throw new DomainError(ErrorCode.DISCOUNT_INVALID, { field: 'unitRate' });
    const priceUnitInches = D(line.priceUnitInches);
    if (!priceUnitInches.greaterThan(0)) throw new DomainError(ErrorCode.UNIT_NOT_AVAILABLE);
    const totalInches = D(line.lengthInches).toDecimalPlaces(LENGTH_STORAGE_DP).times(pieces);
    const gross = r(totalInches.times(unitRate).div(priceUnitInches));
    const disc = discountAmount(gross, line.discount, p);
    return { line, totalInches, unitRate, priceUnitInches, gross, disc, net: gross.minus(disc) };
  });

  const netBase = sum(stage1.map((s) => s.net));
  const invoiceDiscount = discountAmount(netBase, input.invoiceDiscount, p);
  const allocations = allocate(invoiceDiscount, stage1.map((s) => s.net), dp);

  const lines: LineResult[] = stage1.map((s, i) => {
    const alloc = allocations[i]!;
    const taxable = s.net.minus(alloc);
    const rate = p.taxMode === 'NONE' ? ZERO : D(s.line.taxRate ?? 0);
    let tax = ZERO;
    let lineTotal = taxable;
    if (p.taxMode === 'EXCLUSIVE') {
      tax = r(taxable.times(rate).div(HUNDRED));
      lineTotal = taxable.plus(tax);
    } else if (p.taxMode === 'INCLUSIVE') {
      tax = r(taxable.times(rate).div(HUNDRED.plus(rate)));
    }
    const f = (x: Decimal) => toFixedString(x, dp, p.roundingMode);
    return {
      totalLengthInches: toFixedString(s.totalInches, LENGTH_STORAGE_DP),
      quantity: quantityInPriceUnits(s.totalInches, s.priceUnitInches).toFixed(LENGTH_STORAGE_DP),
      unitRate: s.unitRate.toString(),
      grossAmount: f(s.gross),
      discountAmount: f(s.disc),
      allocatedInvoiceDiscount: f(alloc),
      taxableAmount: f(taxable),
      taxRate: rate.toFixed(4),
      taxAmount: f(tax),
      lineTotal: f(lineTotal),
    };
  });

  const deliveryFee = r(D(input.deliveryFee ?? 0));
  if (deliveryFee.isNegative()) throw new DomainError(ErrorCode.DISCOUNT_INVALID, { field: 'deliveryFee' });
  const itemsTotal = sum(lines.map((l) => l.lineTotal));
  const preRounding = itemsTotal.plus(deliveryFee);
  const grand = applyCashRounding(preRounding, p.cashRounding);
  const f = (x: Decimal) => toFixedString(x, dp, p.roundingMode);

  return {
    lines,
    subtotal: f(sum(stage1.map((s) => s.gross))),
    lineDiscountTotal: f(sum(stage1.map((s) => s.disc))),
    invoiceDiscountAmount: f(invoiceDiscount),
    taxTotal: f(sum(lines.map((l) => l.taxAmount))),
    deliveryFee: f(deliveryFee),
    roundingAdjustment: f(grand.minus(preRounding)),
    grandTotal: f(grand),
    policy: p,
  };
}

export function applyCashRounding(amount: DecimalInput, mode: CashRounding): Decimal {
  const a = D(amount);
  switch (mode) {
    case 'NEAREST_1':
      return a.toDecimalPlaces(0, roundingConst('HALF_UP'));
    case 'NEAREST_5':
      return a.div(5).toDecimalPlaces(0, roundingConst('HALF_UP')).times(5);
    default:
      return a;
  }
}

/** Single-line convenience (calculator preview, cart line). */
export function calculateLine(line: LineInput, policy?: Partial<PricingPolicy>): LineResult {
  return calculateInvoice({ lines: [line], policy }).lines[0]!;
}

// ---------------------------------------------------------------------------
// Payments (FR-040, BR-008, FR-125)
// ---------------------------------------------------------------------------

export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

export function summarizePayment(
  total: DecimalInput,
  paid: DecimalInput,
  refunded: DecimalInput = 0,
  precision = 2,
): { due: string; status: PaymentStatus } {
  const t = D(total);
  const pd = D(paid);
  const rf = D(refunded);
  const net = pd.minus(rf);
  const due = Decimal.max(t.minus(net), ZERO);
  let status: PaymentStatus;
  if (rf.greaterThan(0)) status = rf.greaterThanOrEqualTo(pd) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  else if (pd.isZero()) status = 'UNPAID';
  else if (pd.lessThan(t)) status = 'PARTIALLY_PAID';
  else status = 'PAID';
  return { due: due.toFixed(precision), status };
}

/** Blocks overpayment unless advance credit is supported (BR-008). */
export function assertPaymentWithinDue(total: DecimalInput, alreadyPaid: DecimalInput, amount: DecimalInput): void {
  const remaining = D(total).minus(D(alreadyPaid));
  if (D(amount).greaterThan(remaining)) {
    throw new DomainError(ErrorCode.OVERPAYMENT_NOT_ALLOWED, { remaining: remaining.toFixed(2), amount: D(amount).toFixed(2) });
  }
}
