import { D, Decimal, DecimalInput, ZERO, isDecimalString, toFixedString } from '../money/decimal';
import { normalizeDigits } from '../money/format';
import { DomainError, ErrorCode } from '../errors/domain-error';
import { UNIT_ALIASES, UnitDefinition } from './units';

/** Canonical storage precision for lengths (Decimal(14,4) inches, BR-003). */
export const LENGTH_STORAGE_DP = 4;

/** One entered component, e.g. { unit: "GIRA", value: "4" }. Values are decimal strings. */
export interface MeasurementComponent {
  unit: string;
  value: string;
}

/** Frozen conversion facts stored on each sale/order line (FR-019, FR-123). */
export interface ConversionSnapshotEntry {
  code: string;
  unitId?: string;
  version?: number;
  inchesPerUnit: string;
}

export interface ToInchesOptions {
  /** Max decimal places accepted per component value (SRS §15 decision #2). Default 2. */
  maxValueDp?: number;
  /** Allow a total of zero (e.g. calculator scratch). Default false. */
  allowZero?: boolean;
}

export interface ToInchesResult {
  /** Rounded to 4 dp — the value persisted and used for stock & pricing. */
  inches: Decimal;
  /** Unrounded sum, for diagnostics/tests. */
  exactInches: Decimal;
  components: MeasurementComponent[];
  snapshot: ConversionSnapshotEntry[];
}

function unitIndex(units: ReadonlyArray<UnitDefinition>): Map<string, UnitDefinition> {
  const map = new Map<string, UnitDefinition>();
  for (const u of units) map.set(u.code.toUpperCase(), u);
  return map;
}

function snapshotOf(u: UnitDefinition): ConversionSnapshotEntry {
  const entry: ConversionSnapshotEntry = { code: u.code, inchesPerUnit: D(u.inchesPerUnit).toString() };
  if (u.id) entry.unitId = u.id;
  if (u.version !== undefined) entry.version = u.version;
  return entry;
}

/**
 * Convert a mixed measurement (e.g. 5 yd + 4 gira) to canonical inches using
 * ONLY the units supplied — i.e. the shop's currently active, enabled units.
 * A unit missing from `units` (such as an unconfigured GIRA) is rejected.
 */
export function toInches(
  components: ReadonlyArray<MeasurementComponent>,
  units: ReadonlyArray<UnitDefinition>,
  opts: ToInchesOptions = {},
): ToInchesResult {
  const maxDp = opts.maxValueDp ?? 2;
  if (!components.length) throw new DomainError(ErrorCode.MEASUREMENT_EMPTY);

  const index = unitIndex(units);
  const seen = new Set<string>();
  const used = new Map<string, UnitDefinition>();
  let exact: Decimal = ZERO;
  const normalized: MeasurementComponent[] = [];

  for (const c of components) {
    const code = String(c.unit ?? '').toUpperCase();
    const unit = index.get(code);
    if (!unit) {
      throw new DomainError(code === 'GIRA' ? ErrorCode.GIRA_NOT_CONFIGURED : ErrorCode.UNIT_NOT_AVAILABLE, { unit: code });
    }
    if (seen.has(code)) throw new DomainError(ErrorCode.MEASUREMENT_DUPLICATE_UNIT, { unit: code });
    seen.add(code);

    const raw = normalizeDigits(String(c.value ?? '').trim());
    if (!isDecimalString(raw)) throw new DomainError(ErrorCode.MEASUREMENT_INVALID_VALUE, { unit: code, value: String(c.value) });
    const value = D(raw);
    if (value.isNegative()) throw new DomainError(ErrorCode.MEASUREMENT_NEGATIVE, { unit: code });
    if (value.decimalPlaces() > maxDp) throw new DomainError(ErrorCode.MEASUREMENT_TOO_PRECISE, { unit: code, maxDp });

    const factor = D(unit.inchesPerUnit);
    if (!factor.greaterThan(0)) throw new DomainError(ErrorCode.UNIT_NOT_AVAILABLE, { unit: code });
    exact = exact.plus(value.times(factor));
    used.set(code, unit);
    normalized.push({ unit: unit.code, value: value.toString() });
  }

  const inches = exact.toDecimalPlaces(LENGTH_STORAGE_DP);
  if (!opts.allowZero && inches.isZero()) throw new DomainError(ErrorCode.MEASUREMENT_EMPTY);

  return {
    inches,
    exactInches: exact,
    components: normalized,
    snapshot: [...used.values()].map(snapshotOf),
  };
}

/** Inches → value in `unit` (unrounded). */
export function fromInches(inches: DecimalInput, unit: UnitDefinition): Decimal {
  return D(inches).div(D(unit.inchesPerUnit));
}

/** Equivalent values in every given unit (FR-015), rounded for display. */
export function equivalents(
  inches: DecimalInput,
  units: ReadonlyArray<UnitDefinition>,
  dp = 2,
): Array<{ unit: string; symbol: string; value: string }> {
  return units.map((u) => ({ unit: u.code, symbol: u.symbol, value: toFixedString(fromInches(inches, u), dp) }));
}

/**
 * Split inches into a descending unit combination, e.g. 189 in with
 * [YARD, GIRA@2.25] → 5 yd 4 gira. All but the last unit are whole numbers;
 * the last carries the remainder rounded to `dp`.
 */
export function decompose(
  inches: DecimalInput,
  unitsDescending: ReadonlyArray<UnitDefinition>,
  dp = 2,
): MeasurementComponent[] {
  if (!unitsDescending.length) return [];
  let remaining = D(inches);
  const out: MeasurementComponent[] = [];
  unitsDescending.forEach((u, i) => {
    const factor = D(u.inchesPerUnit);
    const isLast = i === unitsDescending.length - 1;
    const qty = isLast ? remaining.div(factor).toDecimalPlaces(dp) : remaining.div(factor).floor();
    remaining = remaining.minus(qty.times(factor));
    if (!qty.isZero() || (isLast && out.length === 0)) out.push({ unit: u.code, value: qty.toString() });
  });
  return out;
}

/** "5 yd 4 gira" — symbols come from the unit table (or a localized label map). */
export function formatMeasurement(
  components: ReadonlyArray<MeasurementComponent>,
  units: ReadonlyArray<UnitDefinition>,
  labels?: Record<string, string>,
): string {
  const index = unitIndex(units);
  return components
    .map((c) => `${c.value} ${labels?.[c.unit.toUpperCase()] ?? index.get(c.unit.toUpperCase())?.symbol ?? c.unit.toLowerCase()}`)
    .join(' ');
}

const KIND_DEFAULT_CODE: Record<Exclude<UnitDefinition['kind'], 'CUSTOM'>, string> = {
  YARD: 'YARD',
  INCH: 'INCH',
  GIRA: 'GIRA',
  METRE: 'METRE',
  CENTIMETRE: 'CM',
};

const TOKEN = /\s*(\d+(?:\.\d+)?)\s*([^\d\s.,+]*)\s*(?:,|\+|and|ও)?/uy;

/**
 * Parse quick-entry text such as "5 yd 4 gira", "5y4g", "৫ গজ ৪ গিরা",
 * "2.5m". A bare trailing number uses `defaultUnit`. Unknown words fail.
 */
export function parseMeasurementText(
  text: string,
  units: ReadonlyArray<UnitDefinition>,
  defaultUnit?: string,
): MeasurementComponent[] {
  const input = normalizeDigits(text).toLowerCase().trim();
  if (!input) throw new DomainError(ErrorCode.MEASUREMENT_EMPTY);

  const byKind = new Map<string, UnitDefinition>();
  const byToken = new Map<string, UnitDefinition>();
  for (const u of units) {
    if (u.kind !== 'CUSTOM' && !byKind.has(u.kind)) byKind.set(u.kind, u);
    byToken.set(u.code.toLowerCase(), u);
    byToken.set(u.symbol.toLowerCase(), u);
  }

  const out: MeasurementComponent[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < input.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(input);
    if (!m || m[0].length === 0) throw new DomainError(ErrorCode.MEASUREMENT_UNPARSEABLE, { text });
    pos = TOKEN.lastIndex;
    const [, value, word] = m as unknown as [string, string, string];
    let unitCode: string | undefined;
    if (!word) {
      unitCode = defaultUnit;
    } else {
      const direct = byToken.get(word);
      if (direct) {
        unitCode = direct.code;
      } else {
        const kind = UNIT_ALIASES[word];
        // Unknown-to-shop kinds (e.g. unconfigured GIRA) still resolve to their
        // canonical code so toInches() can raise the precise error.
        if (kind) unitCode = byKind.get(kind)?.code ?? KIND_DEFAULT_CODE[kind];
      }
    }
    if (!unitCode) throw new DomainError(ErrorCode.MEASUREMENT_UNPARSEABLE, { text, token: word || value });
    out.push({ unit: unitCode.toUpperCase(), value });
  }
  if (!out.length) throw new DomainError(ErrorCode.MEASUREMENT_UNPARSEABLE, { text });
  return out;
}
