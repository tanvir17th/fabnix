import { z } from 'zod';
import { normalizeDigits } from '../money/format';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Non-negative decimal as STRING with at most `dp` places. Bangla digits accepted. */
export const decimalString = (dp = 2, opts: { allowZero?: boolean } = {}) =>
  z
    .union([z.string(), z.number().int().nonnegative()])
    .transform((v) => normalizeDigits(String(v)).trim())
    .refine((v) => new RegExp(`^\\d+(\\.\\d{1,${dp}})?$`).test(v), { message: `decimal_max_${dp}dp` })
    .refine((v) => opts.allowZero === true || /[1-9]/.test(v), { message: 'must_be_positive' });

export const money = decimalString(2);
export const moneyOrZero = decimalString(2, { allowZero: true });
export const percent = decimalString(4, { allowZero: true }).refine((v) => Number(v) <= 100, { message: 'max_100' });

export const uuid = z.uuid();
export const languageSchema = z.enum(['bn', 'en']);
export const userTypePortal = z.enum(['CUSTOMER', 'SHOPKEEPER', 'SUPER_ADMIN']);
export const phoneSchema = z
  .string()
  .transform((v) => normalizeDigits(v).replace(/[\s-]/g, ''))
  .transform((v) => (/^01\d{9}$/.test(v) ? `+88${v}` : v)) // BD local → E.164
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), { message: 'invalid_phone' });
export const emailSchema = z.email().transform((v) => v.trim().toLowerCase());
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/, { message: 'invalid_slug' })
  .refine((s) => !s.includes('--'), { message: 'invalid_slug' });

/**
 * PATCH-style schema from a create schema: every field optional and NO
 * defaults applied. Plain `.partial()` keeps Zod defaults, so an edit that only
 * sends `purchaseRate` would also reset `priceUnitCode` to YARD (and similar
 * for currency, payment-method switches and delivery fees).
 */
export function updateOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([k, v]) => [k, v instanceof z.ZodDefault ? (v.unwrap() as z.ZodType) : v]),
  );
  return z.object(shape).partial() as unknown as ReturnType<z.ZodObject<T>['partial']>;
}

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// ---------------------------------------------------------------------------
// Measurement & pricing
// ---------------------------------------------------------------------------

export const measurementComponentSchema = z.object({
  unit: z.string().trim().toUpperCase().min(1).max(20),
  value: decimalString(2, { allowZero: true }),
});

/** Either structured components or quick-entry text ("5 yd 4 gira"). */
export const measurementInput = z.union([
  z.array(measurementComponentSchema).min(1).max(5),
  z.string().trim().min(1).max(60),
]);

export const discountSchema = z
  .object({ type: z.enum(['NONE', 'PERCENT', 'FIXED']), value: decimalString(4, { allowZero: true }) })
  .refine((d) => d.type !== 'PERCENT' || Number(d.value) <= 100, { message: 'max_100', path: ['value'] });

export const calculationSchema = z.object({
  measurement: measurementInput,
  pieces: z.number().int().min(1).max(999).default(1),
  productId: uuid.optional(),
  unitRate: decimalString(4, { allowZero: true }).optional(),
  priceUnitCode: z.string().toUpperCase().optional(),
  discount: discountSchema.optional(),
});

// ---------------------------------------------------------------------------
// Auth & users
// ---------------------------------------------------------------------------

const password = z.string().min(8, { message: 'password_min_8' }).max(128);

export const registerSchema = z
  .object({
    type: z.enum(['CUSTOMER', 'SHOPKEEPER']),
    fullName: z.string().trim().min(2).max(150),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password,
    preferredLanguage: languageSchema.optional(),
  })
  .refine((v) => v.email || v.phone, { message: 'email_or_phone_required', path: ['email'] });

export const loginSchema = z.object({
  type: userTypePortal,
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(20).optional() });

export const requestCodeSchema = z.object({
  type: userTypePortal,
  identifier: z.string().trim().min(3).max(254),
});

export const verifyContactSchema = requestCodeSchema.extend({ code: z.string().regex(/^\d{6}$/) });
export const resetPasswordSchema = verifyContactSchema.extend({ newPassword: password });

export const updatePreferencesSchema = z
  .object({ preferredLanguage: languageSchema.optional(), timezone: z.string().max(64).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_update' });

export const updateProfileSchema = z.object({ fullName: z.string().trim().min(2).max(150) });

// ---------------------------------------------------------------------------
// Shops, branches, staff
// ---------------------------------------------------------------------------

export const createShopSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/).optional(),
  legalName: z.string().trim().max(200).optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  addressLine: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().length(2).toUpperCase().default('BD'),
  timezone: z.string().max(64).default('Asia/Dhaka'),
  currency: z.string().length(3).toUpperCase().default('BDT'),
  defaultLanguage: languageSchema.default('bn'),
  businessCategory: z.string().trim().max(80).optional(),
});
export const updateShopSchema = updateOf(createShopSchema.omit({ code: true }));

export const updateShopSettingsSchema = z
  .object({
    dateFormat: z.string().max(20),
    numberLocale: z.enum(['bn-BD', 'en-IN', 'en-US']),
    currencyPrecision: z.number().int().min(0).max(4),
    roundingMode: z.enum(['HALF_UP', 'HALF_EVEN']),
    cashRounding: z.enum(['NONE', 'NEAREST_1', 'NEAREST_5']),
    lengthDisplayPrecision: z.number().int().min(0).max(4),
    taxMode: z.enum(['NONE', 'EXCLUSIVE', 'INCLUSIVE']),
    defaultTaxRate: percent,
    taxRegistrationNo: z.string().max(40).nullable(),
    allowNegativeStock: z.boolean(),
    defaultLowStockInches: decimalString(4, { allowZero: true }),
    defaultDisplayUnitCode: z.string().toUpperCase().max(20),
    defaultInvoiceLanguage: languageSchema,
    invoicePrefix: z.string().toUpperCase().regex(/^[A-Z0-9]{1,12}$/),
    invoiceYearlyReset: z.boolean(),
    invoiceFooterNote: z.string().max(500).nullable(),
    businessHours: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))).nullable(),
    reservationTtlMinutes: z.number().int().min(15).max(4320),
    stockDeductionMilestone: z.enum(['ON_CONFIRMATION', 'ON_DISPATCH']),
    allowPartialPayment: z.boolean(),
    allowDueSales: z.boolean(),
  })
  .partial();

export const branchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/),
  phone: phoneSchema.optional(),
  addressLine: z.string().trim().max(300).optional(),
  isDefault: z.boolean().optional(),
});
export const updateBranchSchema = branchSchema.partial().extend({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional() });

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  permissions: z.array(z.string()).max(100),
});
export const updateRoleSchema = createRoleSchema.partial();

export const inviteMemberSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    roleId: uuid,
    branchIds: z.array(uuid).max(50).default([]),
  })
  .refine((v) => v.email || v.phone, { message: 'email_or_phone_required' });

export const acceptInvitationSchema = z.object({ token: z.string().min(20) });

export const updateMemberSchema = z
  .object({
    roleId: uuid.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']).optional(),
    allBranches: z.boolean().optional(),
    branchIds: z.array(uuid).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_update' });

export const paymentMethodSchema = z.object({
  type: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH_ON_DELIVERY', 'OTHER']),
  label: z.string().trim().min(1).max(60),
  instructions: z.string().max(500).optional(),
  accountRef: z.string().max(60).optional(),
  availableInPos: z.boolean().default(true),
  availableOnline: z.boolean().default(false),
});
export const updatePaymentMethodSchema = updateOf(paymentMethodSchema).extend({ isActive: z.boolean().optional() });

// ---------------------------------------------------------------------------
// Measurement units
// ---------------------------------------------------------------------------

export const createUnitSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{0,19}$/),
  kind: z.enum(['GIRA', 'CUSTOM']),
  name: z.string().trim().min(1).max(50),
  symbol: z.string().trim().min(1).max(12),
  inchesPerUnit: decimalString(8),
  enabledForPos: z.boolean().default(true),
  enabledOnline: z.boolean().default(true),
});

/** Changing the factor creates a new version (BR-004). */
export const updateUnitFactorSchema = z.object({ inchesPerUnit: decimalString(8) });

export const updateUnitFlagsSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    symbol: z.string().trim().min(1).max(12),
    enabledForPos: z.boolean(),
    enabledOnline: z.boolean(),
    sortOrder: z.number().int().min(0).max(999),
    isActive: z.boolean(),
  })
  .partial();

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  parentId: uuid.nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export const updateCategorySchema = categorySchema.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() });

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).optional(),
  categoryId: uuid.nullable().optional(),
  description: z.string().max(5000).optional(),
  fabricType: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  color: z.string().trim().max(60).optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  pattern: z.string().trim().max(60).optional(),
  material: z.string().trim().max(120).optional(),
  widthInches: decimalString(2).optional(),
  priceUnitCode: z.string().trim().toUpperCase().default('YARD'),
  sellingRate: decimalString(4, { allowZero: true }),
  purchaseRate: decimalString(4, { allowZero: true }).optional(),
  taxRate: percent.nullable().optional(),
  lowStockThresholdInches: decimalString(4, { allowZero: true }).nullable().optional(),
  minOrderInches: decimalString(4).nullable().optional(),
  orderStepInches: decimalString(4).nullable().optional(),
  availableInPos: z.boolean().default(true),
});
export const updateProductSchema = updateOf(createProductSchema)
  .extend({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional() });

export const publishProductSchema = z.object({ published: z.boolean() });
export const reorderImagesSchema = z.object({ imageIds: z.array(uuid).min(1).max(20) });
export const imageAltSchema = z.object({ altText: z.string().max(200).nullable() });

export const productListQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: uuid.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  fabricType: z.string().max(80).optional(),
  barcode: z.string().max(64).optional(),
  published: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const openingStockSchema = z.object({
  branchId: uuid,
  productId: uuid,
  measurement: measurementInput,
  unitCostPerPriceUnit: decimalString(4, { allowZero: true }).optional(),
});

export const stockAdjustmentSchema = z.object({
  branchId: uuid,
  productId: uuid,
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE_OUT']),
  measurement: measurementInput,
  reason: z.string().trim().min(3).max(300),
});

export const inventoryListQuery = paginationQuery.extend({
  branchId: uuid.optional(),
  lowStockOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  q: z.string().trim().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  addressLine: z.string().trim().max(300).optional(),
  notes: z.string().max(2000).optional(),
});
export const updateCustomerSchema = customerSchema.partial();

// ---------------------------------------------------------------------------
// POS sales
// ---------------------------------------------------------------------------

export const saleLineSchema = z.object({
  productId: uuid,
  measurement: measurementInput,
  pieces: z.number().int().min(1).max(999).default(1),
  discount: discountSchema.optional(),
  rateOverride: z.object({ unitRate: decimalString(4, { allowZero: true }), reason: z.string().trim().min(3).max(300) }).optional(),
});

export const salePaymentSchema = z.object({
  paymentMethodId: uuid,
  amount: money,
  reference: z.string().trim().max(100).optional(),
});

export const createSaleSchema = z.object({
  branchId: uuid,
  customerId: uuid.optional(),
  items: z.array(saleLineSchema).min(1).max(100),
  invoiceDiscount: discountSchema.optional(),
  payments: z.array(salePaymentSchema).max(10).default([]),
  invoiceLanguage: languageSchema.optional(),
  notes: z.string().max(1000).optional(),
});

export const collectPaymentSchema = salePaymentSchema.extend({ note: z.string().max(300).optional() });
export const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const saleListQuery = paginationQuery.extend({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(['DRAFT', 'COMPLETED', 'CANCELLED', 'PARTIALLY_RETURNED', 'RETURNED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional(),
  customerId: uuid.optional(),
  cashierUserId: uuid.optional(),
  branchId: uuid.optional(),
  invoiceNumber: z.string().max(40).optional(),
});

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------

export const storefrontSchema = z.object({
  slug: slugSchema,
  displayName: z.string().trim().min(2).max(150),
  tagline: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  contactPhone: phoneSchema.nullable().optional(),
  whatsappPhone: phoneSchema.nullable().optional(),
  contactEmail: emailSchema.nullable().optional(),
  addressLine: z.string().max(300).nullable().optional(),
  deliveryCoverage: z.string().max(1000).nullable().optional(),
  openingStatusNote: z.string().max(200).nullable().optional(),
  acceptingOrders: z.boolean().optional(),
  fulfilmentBranchId: uuid.optional(),
  stockVisibility: z.enum(['HIDE', 'STATUS_ONLY', 'EXACT']).optional(),
  minOrderAmount: money.nullable().optional(),
  returnPolicy: z.string().max(5000).nullable().optional(),
  termsText: z.string().max(10000).nullable().optional(),
  deliveryInfo: z.string().max(2000).nullable().optional(),
});
export const updateStorefrontSchema = storefrontSchema.partial();

export const storefrontVisibilitySchema = z.object({
  action: z.enum(['ENABLE', 'DISABLE', 'PUBLISH', 'UNPUBLISH', 'PAUSE']),
});

export const deliveryOptionSchema = z.object({
  method: z.enum(['HOME_DELIVERY', 'PICKUP']),
  name: z.string().trim().min(1).max(80),
  chargeType: z.enum(['FLAT', 'FREE_OVER_THRESHOLD']).default('FLAT'),
  flatFee: moneyOrZero.default('0'),
  freeOverAmount: money.nullable().optional(),
  estimatedDaysMin: z.number().int().min(0).max(60).optional(),
  estimatedDaysMax: z.number().int().min(0).max(60).optional(),
});
export const updateDeliveryOptionSchema = updateOf(deliveryOptionSchema).extend({ isActive: z.boolean().optional() });

export const publicProductQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(120).optional(),
  color: z.string().max(60).optional(),
  fabricType: z.string().max(80).optional(),
  minPrice: decimalString(2, { allowZero: true }).optional(),
  maxPrice: decimalString(2, { allowZero: true }).optional(),
  inStock: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
});

export const quoteSchema = z.object({
  measurement: measurementInput,
  pieces: z.number().int().min(1).max(999).default(1),
});

// ---------------------------------------------------------------------------
// Cart, checkout, orders
// ---------------------------------------------------------------------------

export const addCartItemSchema = z.object({
  productId: uuid,
  measurement: measurementInput,
  pieces: z.number().int().min(1).max(99).default(1),
});
export const updateCartItemSchema = z.object({
  measurement: measurementInput.optional(),
  pieces: z.number().int().min(1).max(99).optional(),
});

export const checkoutSchema = z.object({
  deliveryOptionId: uuid,
  paymentMethodId: uuid,
  recipientName: z.string().trim().min(2).max(150),
  recipientPhone: phoneSchema,
  recipientEmail: emailSchema.optional(),
  addressLine: z.string().trim().max(300).optional(),
  area: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  deliveryInstructions: z.string().trim().max(500).optional(),
  invoiceLanguage: languageSchema.optional(),
  /** Grand total the customer reviewed (FR-105). Mismatch → 409 CART_CHANGED. */
  expectedTotal: money.optional(),
});

export const orderStatusUpdateSchema = z.object({
  to: z.enum(['PROCESSING', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'COMPLETED']),
  note: z.string().trim().max(500).optional(),
  provider: z.string().trim().max(80).optional(),
  trackingReference: z.string().trim().max(100).optional(),
  trackingUrl: z.url().max(500).optional(),
});
export const orderNoteSchema = z.object({
  visibility: z.enum(['INTERNAL', 'CUSTOMER']).default('INTERNAL'),
  body: z.string().trim().min(1).max(2000),
});
export const orderListQuery = paginationQuery.extend({
  status: z
    .enum(['PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'PROCESSING', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'CANCELLED'])
    .optional(),
  paymentStatus: z.enum(['UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional(),
  q: z.string().trim().max(60).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

export const adminShopStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']),
  reason: z.string().trim().min(5).max(500),
});
export const adminStorefrontSuspendSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().min(5).max(500),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type MeasurementInput = z.infer<typeof measurementInput>;

// ---------------------------------------------------------------------------
// Suppliers, purchases, expenses (FR-054…FR-062)
// ---------------------------------------------------------------------------

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(150),
  contactPerson: z.string().trim().max(150).optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  addressLine: z.string().trim().max(300).optional(),
  notes: z.string().max(2000).optional(),
});
export const updateSupplierSchema = supplierSchema.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() });

export const purchaseLineSchema = z.object({
  productId: uuid,
  measurement: measurementInput,
  /** Cost per the product's price unit (e.g. per yard). */
  unitCost: decimalString(4, { allowZero: true }),
});

export const createPurchaseSchema = z.object({
  branchId: uuid,
  supplierId: uuid,
  purchaseDate: z.iso.date(),
  supplierInvoiceRef: z.string().trim().max(60).optional(),
  items: z.array(purchaseLineSchema).min(1).max(100),
  discountAmount: moneyOrZero.default('0'),
  otherCharges: moneyOrZero.default('0'),
  payments: z.array(z.object({ paymentMethodId: uuid, amount: money, reference: z.string().max(100).optional() })).max(5).default([]),
  notes: z.string().max(1000).optional(),
});

export const supplierPaymentSchema = z.object({
  paymentMethodId: uuid,
  amount: money,
  reference: z.string().trim().max(100).optional(),
  note: z.string().max(300).optional(),
});

export const purchaseListQuery = paginationQuery.extend({
  supplierId: uuid.optional(),
  status: z.enum(['DRAFT', 'POSTED', 'CANCELLED']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const expenseCategorySchema = z.object({ name: z.string().trim().min(1).max(80) });

export const expenseSchema = z.object({
  categoryId: uuid,
  branchId: uuid.optional(),
  paymentMethodId: uuid.optional(),
  amount: money,
  expenseDate: z.iso.date(),
  note: z.string().max(1000).optional(),
});

export const expenseListQuery = paginationQuery.extend({
  categoryId: uuid.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

// ---------------------------------------------------------------------------
// Reports & audit (FR-066…FR-070, FR-084)
// ---------------------------------------------------------------------------

export const reportRangeQuery = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  branchId: uuid.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

export const auditListQuery = paginationQuery.extend({
  actorUserId: uuid.optional(),
  action: z.string().max(80).optional(),
  targetType: z.string().max(60).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

// ---------------------------------------------------------------------------
// Platform admin (FR-073…FR-077, FR-133, FR-136)
// ---------------------------------------------------------------------------

export const adminUserListQuery = paginationQuery.extend({
  type: z.enum(['CUSTOMER', 'SHOPKEEPER', 'SUPER_ADMIN']).optional(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  q: z.string().trim().max(100).optional(),
});
export const adminUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(5).max(500),
});
export const adminPlanUpdateSchema = z
  .object({
    priceMonthly: moneyOrZero,
    priceYearly: moneyOrZero,
    trialDays: z.number().int().min(0).max(365),
    graceDays: z.number().int().min(0).max(90),
    maxUsers: z.number().int().min(1).nullable(),
    maxBranches: z.number().int().min(1).nullable(),
    maxProducts: z.number().int().min(1).nullable(),
    maxImagesPerProduct: z.number().int().min(1).max(30),
    onlineStoreEnabled: z.boolean(),
    isActive: z.boolean(),
    isPublic: z.boolean(),
  })
  .partial()
  .extend({ reason: z.string().trim().min(5).max(500) });
export const adminSubscriptionSchema = z.object({
  planId: uuid.optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']).optional(),
  currentPeriodEnd: z.iso.datetime({ offset: true }).optional(),
  reason: z.string().trim().min(5).max(500),
});
export const adminProductListQuery = paginationQuery.extend({
  moderationStatus: z.enum(['VISIBLE', 'UNDER_REVIEW', 'HIDDEN', 'REMOVED']).optional(),
  q: z.string().trim().max(100).optional(),
});
export const adminModerationSchema = z.object({
  moderationStatus: z.enum(['VISIBLE', 'HIDDEN', 'REMOVED']),
  reason: z.string().trim().min(5).max(500),
});
export const adminAuditQuery = auditListQuery.extend({
  kind: z.enum(['admin', 'shop']).default('admin'),
  shopId: uuid.optional(),
});
export const publicShopListQuery = paginationQuery.extend({ q: z.string().trim().max(100).optional() });
