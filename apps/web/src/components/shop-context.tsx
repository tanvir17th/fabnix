'use client';

import { createContext, useContext } from 'react';
import type { PricingPolicy } from '@fabnix/shared';

export interface ShopAccess {
  shop: { id: string; name: string; code: string; status: string; currency: string; timezone: string };
  role: { name: string; presetKey: string | null };
  isOwner: boolean;
  permissions: string[];
  allBranches: boolean;
  branchIds: string[];
  pos: PricingPolicy & {
    defaultTaxRate: string;
    defaultDisplayUnitCode: string;
    lengthDisplayPrecision: number;
    defaultInvoiceLanguage: 'bn' | 'en';
    allowPartialPayment: boolean;
    allowDueSales: boolean;
  };
}

interface ShopCtx {
  shopId: string;
  access: ShopAccess;
  base: string;
  can: (permission: string) => boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<ShopCtx | null>(null);
export const ShopProvider = Ctx.Provider;

export function useShop(): ShopCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShop outside ShopProvider');
  return v;
}
