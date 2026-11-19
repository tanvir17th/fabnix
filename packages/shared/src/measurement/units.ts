import { DecimalInput } from '../money/decimal';

export type UnitKind = 'INCH' | 'YARD' | 'METRE' | 'CENTIMETRE' | 'GIRA' | 'CUSTOM';

/** A shop's unit as the engine needs it (mirrors measurement_units). */
export interface UnitDefinition {
  id?: string;
  code: string;
  kind: UnitKind;
  symbol: string;
  name?: string;
  /** Inches in ONE of this unit. Decimal string, e.g. "36", "2.25". */
  inchesPerUnit: DecimalInput;
  version?: number;
}

/** Reference constants (SRS §4.3): 1 yd = 36 in; 1 in = 2.54 cm; 1 yd = 0.9144 m. */
export const INCHES_PER_YARD = '36';
/** 100 / 2.54, stored at the DB's 8-dp conversion precision. */
export const INCHES_PER_METRE = '39.37007874';
/** 1 / 2.54 at 8 dp. */
export const INCHES_PER_CENTIMETRE = '0.39370079';

/** Fixed units every shop gets on creation. GIRA is deliberately absent (FR-013). */
export const STANDARD_UNITS: ReadonlyArray<Required<Pick<UnitDefinition, 'code' | 'kind' | 'symbol' | 'name'>> & { inchesPerUnit: string; nameKey: string; sortOrder: number }> = [
  { code: 'YARD', kind: 'YARD', symbol: 'yd', name: 'Yard', nameKey: 'units.yard', inchesPerUnit: INCHES_PER_YARD, sortOrder: 1 },
  { code: 'INCH', kind: 'INCH', symbol: 'in', name: 'Inch', nameKey: 'units.inch', inchesPerUnit: '1', sortOrder: 3 },
  { code: 'METRE', kind: 'METRE', symbol: 'm', name: 'Metre', nameKey: 'units.metre', inchesPerUnit: INCHES_PER_METRE, sortOrder: 4 },
  { code: 'CM', kind: 'CENTIMETRE', symbol: 'cm', name: 'Centimetre', nameKey: 'units.centimetre', inchesPerUnit: INCHES_PER_CENTIMETRE, sortOrder: 5 },
];

/**
 * One-tap onboarding suggestions ONLY — never applied automatically.
 * The owner must explicitly confirm a Gira factor (SRS §15 decision #1).
 */
export const GIRA_PRESET_SUGGESTIONS = ['2.25', '2.5', '3'] as const;

/**
 * Text aliases (lower-case) → unit kind, for the quick-entry parser.
 * Bangla: গজ = yard, গিরা/গিরে = gira, ইঞ্চি = inch, মিটার = metre, সেমি = cm.
 */
export const UNIT_ALIASES: Record<string, Exclude<UnitKind, 'CUSTOM'>> = {
  y: 'YARD', yd: 'YARD', yds: 'YARD', yard: 'YARD', yards: 'YARD', 'গজ': 'YARD',
  in: 'INCH', inch: 'INCH', inches: 'INCH', '"': 'INCH', 'ইঞ্চি': 'INCH', 'ইঞ্চ': 'INCH',
  g: 'GIRA', gira: 'GIRA', giras: 'GIRA', gera: 'GIRA', 'গিরা': 'GIRA', 'গিরে': 'GIRA',
  m: 'METRE', metre: 'METRE', metres: 'METRE', meter: 'METRE', meters: 'METRE', 'মিটার': 'METRE',
  cm: 'CENTIMETRE', centimetre: 'CENTIMETRE', centimetres: 'CENTIMETRE', centimeter: 'CENTIMETRE', centimeters: 'CENTIMETRE', 'সেমি': 'CENTIMETRE', 'সেন্টিমিটার': 'CENTIMETRE',
};
