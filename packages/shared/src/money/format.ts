import { D, DecimalInput, toFixedString } from './decimal';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Replace Bangla digits (০-৯) with ASCII digits. Used before parsing user input. */
export function normalizeDigits(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => String(BN_DIGITS.indexOf(ch)));
}

/** Render ASCII digits as Bangla digits. */
export function toBanglaDigits(input: string): string {
  return input.replace(/[0-9]/g, (ch) => BN_DIGITS[Number(ch)]!);
}

export interface FormatMoneyOptions {
  currency: string;
  /** BCP-47 number locale, e.g. "bn-BD" (Bangla digits, lakh grouping), "en-IN", "en-US". */
  locale?: string;
  precision?: number;
}

/**
 * Locale-aware currency display (NFR-L10N-008). Formats the exact decimal
 * string (Intl accepts numeric strings) so no float conversion happens.
 */
export function formatMoney(value: DecimalInput, opts: FormatMoneyOptions): string {
  const precision = opts.precision ?? 2;
  const fixed = toFixedString(D(value), precision);
  const nf = new Intl.NumberFormat(opts.locale ?? 'en-US', {
    style: 'currency',
    currency: opts.currency,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return nf.format(fixed as unknown as number);
}

export function formatNumber(value: DecimalInput, locale = 'en-US', precision = 2): string {
  const fixed = toFixedString(D(value), precision);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  }).format(fixed as unknown as number);
}
