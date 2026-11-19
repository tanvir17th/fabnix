import type { PricingPolicy } from '@fabnix/shared';
import type { ShopSettings } from '../../generated/prisma/client';

/** Shop settings → shared pricing engine policy (BR-011). */
export function pricingPolicy(s: Pick<ShopSettings, 'currencyPrecision' | 'roundingMode' | 'taxMode' | 'cashRounding'>): PricingPolicy {
  return { currencyPrecision: s.currencyPrecision, roundingMode: s.roundingMode, taxMode: s.taxMode, cashRounding: s.cashRounding };
}

/** Frozen copy of the policy for the transaction snapshot. */
export function policySnapshot(s: ShopSettings) {
  return {
    ...pricingPolicy(s),
    defaultTaxRate: s.defaultTaxRate.toString(),
    lengthDisplayPrecision: s.lengthDisplayPrecision,
    allowNegativeStock: s.allowNegativeStock,
  };
}
