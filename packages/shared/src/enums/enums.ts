/**
 * Runtime mirrors of the Prisma enums that clients need. Kept here so the
 * web/mobile apps never import the Prisma client. A backend test asserts these
 * stay in sync with schema.prisma.
 */
export const UserType = { CUSTOMER: 'CUSTOMER', SHOPKEEPER: 'SHOPKEEPER', SUPER_ADMIN: 'SUPER_ADMIN' } as const;
export type UserType = (typeof UserType)[keyof typeof UserType];

export const Language = { bn: 'bn', en: 'en' } as const;
export type Language = (typeof Language)[keyof typeof Language];
export const DEFAULT_LANGUAGE: Language = 'bn';

export const SaleStatus = {
  DRAFT: 'DRAFT', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED', PARTIALLY_RETURNED: 'PARTIALLY_RETURNED', RETURNED: 'RETURNED',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const PaymentMethodType = {
  CASH: 'CASH', CARD: 'CARD', BANK_TRANSFER: 'BANK_TRANSFER', BKASH: 'BKASH', NAGAD: 'NAGAD', ROCKET: 'ROCKET',
  CASH_ON_DELIVERY: 'CASH_ON_DELIVERY', ONLINE_GATEWAY: 'ONLINE_GATEWAY', STORE_CREDIT: 'STORE_CREDIT', OTHER: 'OTHER',
} as const;
export type PaymentMethodType = (typeof PaymentMethodType)[keyof typeof PaymentMethodType];

export const StockMovementType = {
  OPENING: 'OPENING', PURCHASE_IN: 'PURCHASE_IN', PURCHASE_CANCEL_OUT: 'PURCHASE_CANCEL_OUT', SALE_OUT: 'SALE_OUT',
  SALE_CANCEL_IN: 'SALE_CANCEL_IN', SALE_RETURN_IN: 'SALE_RETURN_IN', ORDER_RESERVE: 'ORDER_RESERVE',
  ORDER_RESERVATION_RELEASE: 'ORDER_RESERVATION_RELEASE', ORDER_DEDUCT_OUT: 'ORDER_DEDUCT_OUT', ORDER_CANCEL_IN: 'ORDER_CANCEL_IN',
  ORDER_RETURN_IN: 'ORDER_RETURN_IN', ADJUSTMENT_IN: 'ADJUSTMENT_IN', ADJUSTMENT_OUT: 'ADJUSTMENT_OUT', DAMAGE_OUT: 'DAMAGE_OUT',
  TRANSFER_OUT: 'TRANSFER_OUT', TRANSFER_IN: 'TRANSFER_IN',
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const StorefrontStatus = { UNPUBLISHED: 'UNPUBLISHED', PUBLISHED: 'PUBLISHED', PAUSED: 'PAUSED' } as const;
export type StorefrontStatus = (typeof StorefrontStatus)[keyof typeof StorefrontStatus];

export const StockVisibility = { HIDE: 'HIDE', STATUS_ONLY: 'STATUS_ONLY', EXACT: 'EXACT' } as const;
export type StockVisibility = (typeof StockVisibility)[keyof typeof StockVisibility];

export type AvailabilityStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
