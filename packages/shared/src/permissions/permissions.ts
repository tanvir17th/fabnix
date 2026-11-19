/**
 * Permission catalog. Shop permissions are granted via ShopRole presets
 * (owner/manager/cashier/stock_operator are presets, NOT user types — §A1.2).
 * Platform permissions are granted to SUPER_ADMIN users via AdminRole.
 */
export const ShopPermission = {
  SHOP_SETTINGS_VIEW: 'shop.settings.view',
  SHOP_SETTINGS_MANAGE: 'shop.settings.manage',
  BRANCH_MANAGE: 'branch.manage',
  STAFF_VIEW: 'staff.view',
  STAFF_MANAGE: 'staff.manage',
  UNITS_MANAGE: 'units.manage',
  CATALOG_VIEW: 'catalog.view',
  CATALOG_MANAGE: 'catalog.manage',
  CATALOG_PUBLISH: 'catalog.publish',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_OPENING: 'inventory.opening',
  INVENTORY_OVERSELL: 'inventory.oversell',
  POS_SALE_CREATE: 'pos.sale.create',
  POS_DISCOUNT_APPLY: 'pos.discount.apply',
  POS_PRICE_OVERRIDE: 'pos.price.override',
  SALES_VIEW_OWN: 'sales.view_own',
  SALES_VIEW_ALL: 'sales.view_all',
  SALES_CANCEL: 'sales.cancel',
  PAYMENTS_COLLECT: 'payments.collect',
  PAYMENT_METHODS_MANAGE: 'payment_methods.manage',
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_MANAGE: 'customers.manage',
  STOREFRONT_MANAGE: 'storefront.manage',
  ORDERS_VIEW: 'orders.view',
  ORDERS_MANAGE: 'orders.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  PURCHASES_MANAGE: 'purchases.manage',
  SUPPLIERS_MANAGE: 'suppliers.manage',
  EXPENSES_MANAGE: 'expenses.manage',
  SUBSCRIPTION_MANAGE: 'subscription.manage',
} as const;
export type ShopPermission = (typeof ShopPermission)[keyof typeof ShopPermission];

export const PlatformPermission = {
  SHOPS_VIEW: 'platform.shops.view',
  SHOPS_MANAGE: 'platform.shops.manage',
  STOREFRONTS_MODERATE: 'platform.storefronts.moderate',
  USERS_MANAGE: 'platform.users.manage',
  AUDIT_VIEW: 'platform.audit.view',
  SUPPORT_ACCESS: 'platform.support.access',
  PLANS_MANAGE: 'platform.plans.manage',
} as const;
export type PlatformPermission = (typeof PlatformPermission)[keyof typeof PlatformPermission];

export const ALL_SHOP_PERMISSIONS: ShopPermission[] = Object.values(ShopPermission);
export const ALL_PLATFORM_PERMISSIONS: PlatformPermission[] = Object.values(PlatformPermission);

/** Permissions that are always audited when granted/revoked or exercised. */
export const SENSITIVE_PERMISSIONS: ReadonlySet<string> = new Set([
  ShopPermission.POS_PRICE_OVERRIDE,
  ShopPermission.INVENTORY_OVERSELL,
  ShopPermission.SALES_CANCEL,
  ShopPermission.STAFF_MANAGE,
  ShopPermission.SUBSCRIPTION_MANAGE,
  ...ALL_PLATFORM_PERMISSIONS,
]);

const P = ShopPermission;

export interface RolePreset {
  key: 'owner' | 'manager' | 'cashier' | 'stock_operator';
  name: string;
  isOwnerRole: boolean;
  permissions: ShopPermission[];
}

export const ROLE_PRESETS: RolePreset[] = [
  { key: 'owner', name: 'Owner', isOwnerRole: true, permissions: ALL_SHOP_PERMISSIONS },
  {
    key: 'manager',
    name: 'Manager',
    isOwnerRole: false,
    permissions: ALL_SHOP_PERMISSIONS.filter((p) => p !== P.SUBSCRIPTION_MANAGE && p !== P.INVENTORY_OVERSELL),
  },
  {
    key: 'cashier',
    name: 'Cashier',
    isOwnerRole: false,
    permissions: [
      P.CATALOG_VIEW, P.INVENTORY_VIEW, P.POS_SALE_CREATE, P.POS_DISCOUNT_APPLY, P.SALES_VIEW_OWN,
      P.PAYMENTS_COLLECT, P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE, P.ORDERS_VIEW,
    ],
  },
  {
    key: 'stock_operator',
    name: 'Stock Operator',
    isOwnerRole: false,
    permissions: [
      P.CATALOG_VIEW, P.CATALOG_MANAGE, P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_OPENING,
      P.PURCHASES_MANAGE, P.SUPPLIERS_MANAGE,
    ],
  },
];

export function permissionLabelKey(code: string): string {
  return `permissions.${code}`;
}
