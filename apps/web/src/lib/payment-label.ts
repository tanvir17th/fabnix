'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Names a shop gets by default (or that simply restate the type). These follow the UI language;
 * anything else is a name the shop chose, e.g. "bKash Personal 017…", and is shown as typed.
 */
const DEFAULT_LABELS: Record<string, string[]> = {
  CASH: ['cash', 'নগদ'],
  CARD: ['card', 'কার্ড'],
  BANK_TRANSFER: ['bank', 'bank transfer', 'ব্যাংক', 'ব্যাংক ট্রান্সফার'],
  BKASH: ['bkash', 'বিকাশ'],
  NAGAD: ['nagad', 'নগদ', 'নগদ (মোবাইল)'],
  ROCKET: ['rocket', 'রকেট'],
  CASH_ON_DELIVERY: ['cash on delivery', 'cod', 'ক্যাশ অন ডেলিভারি'],
  ONLINE_GATEWAY: ['online payment', 'অনলাইন পেমেন্ট'],
  STORE_CREDIT: ['store credit', 'স্টোর ক্রেডিট'],
  OTHER: ['other', 'অন্যান্য'],
};

// NFC: Bangla letters such as য় have two valid Unicode spellings.
const normalize = (s: string) => s.normalize('NFC').trim().toLowerCase();
const DEFAULTS = Object.fromEntries(Object.entries(DEFAULT_LABELS).map(([type, labels]) => [type, new Set(labels.map(normalize))]));

export function usePaymentMethodLabel() {
  const t = useTranslations('paymentType');
  return useCallback((m: { type: string; label: string }) => (DEFAULTS[m.type]?.has(normalize(m.label)) && t.has(m.type) ? t(m.type) : m.label), [t]);
}
