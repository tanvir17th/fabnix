'use client';

import { useLocale } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { D, formatMoney, isDecimalString, toBanglaDigits } from '@fabnix/shared';

/**
 * Locale-aware display (NFR-L10N-008). Stored values stay locale-neutral
 * strings; only rendering changes with the user's language.
 */
export function useFormat() {
  const locale = useLocale();
  const numberLocale = locale === 'bn' ? 'bn-BD' : 'en-US';

  const money = useCallback(
    (value: unknown, currency = 'BDT') => {
      const s = value === null || value === undefined ? '0' : String(value);
      if (!isDecimalString(s)) return s;
      return formatMoney(s, { currency, locale: numberLocale, precision: 2 });
    },
    [numberLocale],
  );

  const number = useCallback(
    (value: unknown, dp = 2) => {
      const s = String(value ?? '0');
      if (!isDecimalString(s)) return s;
      return new Intl.NumberFormat(numberLocale, { maximumFractionDigits: dp }).format(D(s).toFixed(dp) as unknown as number);
    },
    [numberLocale],
  );

  const digits = useCallback((s: string | number) => (locale === 'bn' ? toBanglaDigits(String(s)) : String(s)), [locale]);

  const date = useCallback(
    (iso: string | Date | null | undefined, withTime = false) => {
      if (!iso) return '—';
      return new Intl.DateTimeFormat(numberLocale, {
        dateStyle: 'medium',
        ...(withTime ? { timeStyle: 'short' } : {}),
        timeZone: 'Asia/Dhaka',
      }).format(new Date(iso));
    },
    [numberLocale],
  );

  /** Inches → yards display, e.g. "5.25". */
  const yards = useCallback((inches: unknown, dp = 2) => number(D(String(inches ?? '0')).div(36).toFixed(dp), dp), [number]);

  return useMemo(() => ({ money, number, digits, date, yards, numberLocale }), [money, number, digits, date, yards, numberLocale]);
}
