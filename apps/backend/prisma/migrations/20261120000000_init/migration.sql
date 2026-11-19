-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('CUSTOMER', 'SHOPKEEPER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('bn', 'en');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET', 'LOGIN_OTP', 'GUEST_CONTACT_VERIFY');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('SHOP', 'PLATFORM');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('INCH', 'YARD', 'METRE', 'CENTIMETRE', 'GIRA', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('NONE', 'EXCLUSIVE', 'INCLUSIVE');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('HALF_UP', 'HALF_EVEN');

-- CreateEnum
CREATE TYPE "CashRounding" AS ENUM ('NONE', 'NEAREST_1', 'NEAREST_5');

-- CreateEnum
CREATE TYPE "StockDeductionMilestone" AS ENUM ('ON_CONFIRMATION', 'ON_DISPATCH');

-- CreateEnum
CREATE TYPE "StockVisibility" AS ENUM ('HIDE', 'STATUS_ONLY', 'EXACT');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('VISIBLE', 'UNDER_REVIEW', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'PURCHASE_IN', 'PURCHASE_CANCEL_OUT', 'SALE_OUT', 'SALE_CANCEL_IN', 'SALE_RETURN_IN', 'ORDER_RESERVE', 'ORDER_RESERVATION_RELEASE', 'ORDER_DEDUCT_OUT', 'ORDER_CANCEL_IN', 'ORDER_RETURN_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE_OUT', 'TRANSFER_OUT', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('POS', 'ONLINE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED', 'PARTIALLY_RETURNED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH_ON_DELIVERY', 'ONLINE_GATEWAY', 'STORE_CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'ONLINE_ORDER', 'PURCHASE', 'RETURN', 'TRANSFER');

-- CreateEnum
CREATE TYPE "StorefrontStatus" AS ENUM ('UNPUBLISHED', 'PUBLISHED', 'PAUSED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('HOME_DELIVERY', 'PICKUP');

-- CreateEnum
CREATE TYPE "DeliveryChargeType" AS ENUM ('FLAT', 'ZONE', 'FREE_OVER_THRESHOLD');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'PROCESSING', 'READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderReturnState" AS ENUM ('NONE', 'PARTIAL', 'FULL');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CUSTOMER', 'SHOPKEEPER', 'SUPER_ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('INTERNAL', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PACKED', 'DISPATCHED', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StockDisposition" AS ENUM ('RESTOCK', 'DAMAGED', 'DISCARD');

-- CreateEnum
CREATE TYPE "PaymentTxnStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('STOREFRONT', 'PRODUCT', 'PRODUCT_IMAGE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('HIDE', 'REMOVE', 'RESTORE', 'SUSPEND_STOREFRONT', 'REINSTATE_STOREFRONT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "type" "UserType" NOT NULL,
    "fullName" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(20),
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "preferredLanguage" "Language",
    "timezone" VARCHAR(64),
    "avatarKey" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecretEnc" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "suspendedReason" TEXT,
    "anonymizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userAgent" VARCHAR(512),
    "ipAddress" VARCHAR(45),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "rotatedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "purpose" "VerificationPurpose" NOT NULL,
    "destination" VARCHAR(254) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "code" VARCHAR(80) NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "labelKey" VARCHAR(120) NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "shop_roles" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "presetKey" VARCHAR(40),
    "isOwnerRole" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_role_permissions" (
    "shopId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,

    CONSTRAINT "shop_role_permissions_pkey" PRIMARY KEY ("roleId","permissionCode")
);

-- CreateTable
CREATE TABLE "shop_members" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "allBranches" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMPTZ(3),
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_member_branches" (
    "shopId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "branchId" UUID NOT NULL,

    CONSTRAINT "shop_member_branches_pkey" PRIMARY KEY ("memberId","branchId")
);

-- CreateTable
CREATE TABLE "shop_invitations" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(20),
    "tokenHash" VARCHAR(64) NOT NULL,
    "branchIds" UUID[],
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("roleId","permissionCode")
);

-- CreateTable
CREATE TABLE "admin_user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "grantedById" UUID,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "legalName" VARCHAR(200),
    "code" VARCHAR(12) NOT NULL,
    "logoKey" TEXT,
    "phone" VARCHAR(20),
    "email" VARCHAR(254),
    "addressLine" VARCHAR(300),
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "country" CHAR(2) NOT NULL DEFAULT 'BD',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Dhaka',
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "defaultLanguage" "Language" NOT NULL DEFAULT 'bn',
    "businessCategory" VARCHAR(80),
    "status" "ShopStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "statusReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_settings" (
    "shopId" UUID NOT NULL,
    "dateFormat" VARCHAR(20) NOT NULL DEFAULT 'dd/MM/yyyy',
    "numberLocale" VARCHAR(10) NOT NULL DEFAULT 'bn-BD',
    "currencyPrecision" SMALLINT NOT NULL DEFAULT 2,
    "roundingMode" "RoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "cashRounding" "CashRounding" NOT NULL DEFAULT 'NONE',
    "lengthDisplayPrecision" SMALLINT NOT NULL DEFAULT 2,
    "taxMode" "TaxMode" NOT NULL DEFAULT 'NONE',
    "defaultTaxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxRegistrationNo" VARCHAR(40),
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "defaultLowStockInches" DECIMAL(14,4) NOT NULL DEFAULT 360,
    "defaultDisplayUnitCode" VARCHAR(20) NOT NULL DEFAULT 'YARD',
    "defaultInvoiceLanguage" "Language" NOT NULL DEFAULT 'bn',
    "invoicePrefix" VARCHAR(12) NOT NULL DEFAULT 'INV',
    "invoiceYearlyReset" BOOLEAN NOT NULL DEFAULT true,
    "invoiceFooterNote" TEXT,
    "businessHours" JSONB,
    "reservationTtlMinutes" INTEGER NOT NULL DEFAULT 1440,
    "stockDeductionMilestone" "StockDeductionMilestone" NOT NULL DEFAULT 'ON_CONFIRMATION',
    "allowPartialPayment" BOOLEAN NOT NULL DEFAULT true,
    "allowDueSales" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "phone" VARCHAR(20),
    "addressLine" VARCHAR(300),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_units" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "kind" "UnitKind" NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "nameKey" VARCHAR(80),
    "symbol" VARCHAR(12) NOT NULL,
    "inchesPerUnit" DECIMAL(18,8) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isStandard" BOOLEAN NOT NULL DEFAULT false,
    "enabledForPos" BOOLEAN NOT NULL DEFAULT true,
    "enabledOnline" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "supersededById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "measurement_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_payment_methods" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "instructions" TEXT,
    "accountRef" VARCHAR(60),
    "availableInPos" BOOLEAN NOT NULL DEFAULT true,
    "availableOnline" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "shopId" UUID NOT NULL,
    "docType" "DocumentType" NOT NULL,
    "periodKey" VARCHAR(8) NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "padding" SMALLINT NOT NULL DEFAULT 6,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("shopId","docType","periodKey")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "parentId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "categoryId" UUID,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "barcode" VARCHAR(64),
    "description" TEXT,
    "fabricType" VARCHAR(80),
    "brand" VARCHAR(80),
    "color" VARCHAR(60),
    "colorHex" CHAR(7),
    "pattern" VARCHAR(60),
    "material" VARCHAR(120),
    "widthInches" DECIMAL(8,2),
    "priceUnitCode" VARCHAR(20) NOT NULL DEFAULT 'YARD',
    "sellingRate" DECIMAL(14,4) NOT NULL,
    "purchaseRate" DECIMAL(14,4),
    "taxRate" DECIMAL(7,4),
    "lowStockThresholdInches" DECIMAL(14,4),
    "minOrderInches" DECIMAL(14,4),
    "orderStepInches" DECIMAL(14,4),
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "availableInPos" BOOLEAN NOT NULL DEFAULT true,
    "isPublishedOnline" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'VISIBLE',
    "moderationReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "mediumKey" TEXT,
    "mimeType" VARCHAR(40) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "altText" VARCHAR(200),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'VISIBLE',
    "moderationReason" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "onHandInches" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reservedInches" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "avgCostPerInch" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lastMovementAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "deltaOnHandInches" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "deltaReservedInches" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "onHandAfterInches" DECIMAL(14,4) NOT NULL,
    "reservedAfterInches" DECIMAL(14,4) NOT NULL,
    "unitCostPerInch" DECIMAL(18,6),
    "saleItemId" UUID,
    "orderItemId" UUID,
    "reservationId" UUID,
    "purchaseItemId" UUID,
    "transferItemId" UUID,
    "returnItemId" UUID,
    "reversesMovementId" UUID,
    "reason" VARCHAR(300),
    "actorUserId" UUID,
    "actorType" "ActorType" NOT NULL DEFAULT 'SHOPKEEPER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "reservedInches" DECIMAL(14,4) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "releaseReason" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "transferNumber" VARCHAR(32) NOT NULL,
    "fromBranchId" UUID NOT NULL,
    "toBranchId" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "dispatchedById" UUID,
    "dispatchedAt" TIMESTAMPTZ(3),
    "receivedById" UUID,
    "receivedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lengthInches" DECIMAL(14,4) NOT NULL,
    "receivedInches" DECIMAL(14,4),

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "userId" UUID,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(254),
    "addressLine" VARCHAR(300),
    "notes" TEXT,
    "balanceDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" VARCHAR(40),
    "recipientName" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "addressLine" VARCHAR(300) NOT NULL,
    "area" VARCHAR(100),
    "city" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "country" CHAR(2) NOT NULL DEFAULT 'BD',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_identities" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(254),
    "verifiedAt" TIMESTAMPTZ(3),
    "claimedByUserId" UUID,
    "claimedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contactPerson" VARCHAR(150),
    "phone" VARCHAR(20),
    "email" VARCHAR(254),
    "addressLine" VARCHAR(300),
    "notes" TEXT,
    "balancePayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'POS',
    "invoiceNumber" VARCHAR(40),
    "customerId" UUID,
    "cashierUserId" UUID NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "currency" CHAR(3) NOT NULL,
    "invoiceLanguage" "Language" NOT NULL,
    "taxMode" "TaxMode" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineDiscountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "invoiceDiscountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "invoiceDiscountValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "invoiceDiscountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundingAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shopSnapshot" JSONB,
    "customerSnapshot" JSONB,
    "calcPolicySnapshot" JSONB,
    "notes" TEXT,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "soldAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lineNo" SMALLINT NOT NULL,
    "productName" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "enteredMeasurement" JSONB NOT NULL,
    "enteredDisplay" VARCHAR(80) NOT NULL,
    "lengthInches" DECIMAL(14,4) NOT NULL,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "totalLengthInches" DECIMAL(14,4) NOT NULL,
    "conversionSnapshot" JSONB NOT NULL,
    "priceUnitCode" VARCHAR(20) NOT NULL,
    "priceUnitInches" DECIMAL(18,8) NOT NULL,
    "listUnitRate" DECIMAL(14,4) NOT NULL,
    "unitRate" DECIMAL(14,4) NOT NULL,
    "rateOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" VARCHAR(300),
    "overrideById" UUID,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedInvoiceDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "costPerInch" DECIMAL(18,6),
    "returnedInches" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "saleId" UUID,
    "orderId" UUID,
    "returnId" UUID,
    "customerId" UUID,
    "paymentMethodId" UUID NOT NULL,
    "methodType" "PaymentMethodType" NOT NULL,
    "direction" "PaymentDirection" NOT NULL DEFAULT 'IN',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'POSTED',
    "reference" VARCHAR(100),
    "paymentTxnId" UUID,
    "reversesPaymentId" UUID,
    "note" VARCHAR(300),
    "receivedById" UUID,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "returnNumber" VARCHAR(32) NOT NULL,
    "channel" "SaleChannel" NOT NULL,
    "saleId" UUID,
    "orderId" UUID,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reasonCode" VARCHAR(40) NOT NULL,
    "reasonText" TEXT,
    "evidenceKeys" TEXT[],
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requestedByType" "ActorType" NOT NULL,
    "requestedById" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "saleItemId" UUID,
    "orderItemId" UUID,
    "returnedInches" DECIMAL(14,4) NOT NULL,
    "refundAmount" DECIMAL(14,2) NOT NULL,
    "disposition" "StockDisposition" NOT NULL DEFAULT 'RESTOCK',

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseNumber" VARCHAR(32) NOT NULL,
    "supplierInvoiceRef" VARCHAR(60),
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "purchaseDate" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "idempotencyKey" VARCHAR(80),
    "createdById" UUID NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMPTZ(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lineNo" SMALLINT NOT NULL,
    "productName" VARCHAR(200) NOT NULL,
    "enteredMeasurement" JSONB NOT NULL,
    "receivedInches" DECIMAL(14,4) NOT NULL,
    "conversionSnapshot" JSONB NOT NULL,
    "costUnitCode" VARCHAR(20) NOT NULL,
    "costUnitInches" DECIMAL(18,8) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "costPerInch" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseId" UUID,
    "paymentMethodId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(100),
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'POSTED',
    "reversesPaymentId" UUID,
    "paidAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(300),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameKey" VARCHAR(80),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "branchId" UUID,
    "categoryId" UUID NOT NULL,
    "paymentMethodId" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "note" TEXT,
    "attachmentKey" TEXT,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'POSTED',
    "reversesExpenseId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storefronts" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "StorefrontStatus" NOT NULL DEFAULT 'UNPUBLISHED',
    "displayName" VARCHAR(150) NOT NULL,
    "tagline" VARCHAR(200),
    "description" TEXT,
    "logoKey" TEXT,
    "bannerKey" TEXT,
    "contactPhone" VARCHAR(20),
    "whatsappPhone" VARCHAR(20),
    "contactEmail" VARCHAR(254),
    "addressLine" VARCHAR(300),
    "deliveryCoverage" TEXT,
    "openingStatusNote" VARCHAR(200),
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "fulfilmentBranchId" UUID NOT NULL,
    "stockVisibility" "StockVisibility" NOT NULL DEFAULT 'STATUS_ONLY',
    "minOrderAmount" DECIMAL(14,2),
    "returnPolicy" TEXT,
    "termsText" TEXT,
    "deliveryInfo" TEXT,
    "allowGuestCheckout" BOOLEAN NOT NULL DEFAULT false,
    "adminSuspended" BOOLEAN NOT NULL DEFAULT false,
    "adminSuspendReason" TEXT,
    "adminSuspendedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "storefronts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_options" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "chargeType" "DeliveryChargeType" NOT NULL DEFAULT 'FLAT',
    "flatFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freeOverAmount" DECIMAL(14,2),
    "estimatedDaysMin" SMALLINT,
    "estimatedDaysMax" SMALLINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "deliveryOptionId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "areaCodes" TEXT[],
    "fee" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_carts" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "customerUserId" UUID,
    "guestId" UUID,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "online_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "enteredMeasurement" JSONB NOT NULL,
    "lengthInches" DECIMAL(14,4) NOT NULL,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "conversionSnapshot" JSONB NOT NULL,
    "displayedUnitRate" DECIMAL(14,4) NOT NULL,
    "displayedLineTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_orders" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "storefrontId" UUID NOT NULL,
    "fulfilmentBranchId" UUID NOT NULL,
    "orderNumber" VARCHAR(40) NOT NULL,
    "invoiceNumber" VARCHAR(40),
    "customerUserId" UUID,
    "guestId" UUID,
    "customerId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "returnState" "OrderReturnState" NOT NULL DEFAULT 'NONE',
    "currency" CHAR(3) NOT NULL,
    "invoiceLanguage" "Language" NOT NULL,
    "taxMode" "TaxMode" NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundingAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentMethodType" "PaymentMethodType" NOT NULL,
    "recipientName" VARCHAR(150) NOT NULL,
    "recipientPhone" VARCHAR(20) NOT NULL,
    "recipientEmail" VARCHAR(254),
    "addressLine" VARCHAR(300),
    "area" VARCHAR(100),
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "deliveryInstructions" VARCHAR(500),
    "deliveryOptionId" UUID NOT NULL,
    "deliveryOptionSnapshot" JSONB NOT NULL,
    "shopSnapshot" JSONB NOT NULL,
    "calcPolicySnapshot" JSONB NOT NULL,
    "stockDeductionMilestone" "StockDeductionMilestone" NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "placedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "rejectedAt" TIMESTAMPTZ(3),
    "rejectionReason" VARCHAR(300),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByType" "ActorType",
    "cancelReason" VARCHAR(300),
    "stockDeductedAt" TIMESTAMPTZ(3),
    "dispatchedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "online_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_order_items" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lineNo" SMALLINT NOT NULL,
    "productName" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "imageKey" TEXT,
    "productSnapshot" JSONB NOT NULL,
    "enteredMeasurement" JSONB NOT NULL,
    "enteredDisplay" VARCHAR(80) NOT NULL,
    "lengthInches" DECIMAL(14,4) NOT NULL,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "quantityInches" DECIMAL(14,4) NOT NULL,
    "conversionSnapshot" JSONB NOT NULL,
    "priceUnitCode" VARCHAR(20) NOT NULL,
    "priceUnitInches" DECIMAL(18,8) NOT NULL,
    "unitRate" DECIMAL(14,4) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "costPerInch" DECIMAL(18,6),
    "returnedInches" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" UUID,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_notes" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_revisions" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "proposedTotal" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedById" UUID NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(80),
    "trackingReference" VARCHAR(100),
    "trackingUrl" VARCHAR(500),
    "fee" DECIMAL(14,2) NOT NULL,
    "packedAt" TIMESTAMPTZ(3),
    "dispatchedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "failureReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "providerReference" VARCHAR(120),
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentTxnStatus" NOT NULL DEFAULT 'INITIATED',
    "providerPayload" JSONB,
    "verifiedAt" TIMESTAMPTZ(3),
    "failureReason" VARCHAR(300),
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "providerEventId" VARCHAR(120) NOT NULL,
    "paymentTxnId" UUID,
    "signatureVerified" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(60) NOT NULL,
    "actorId" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" SMALLINT,
    "responseBody" JSONB,
    "resourceId" UUID,
    "lockedUntil" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "shopId" UUID,
    "type" VARCHAR(60) NOT NULL,
    "titleKey" VARCHAR(120) NOT NULL,
    "bodyKey" VARCHAR(120) NOT NULL,
    "params" JSONB,
    "link" VARCHAR(300),
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" VARCHAR(120),
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "failureReason" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId","type","channel")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "nameKey" VARCHAR(80) NOT NULL,
    "descriptionKey" VARCHAR(80),
    "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
    "priceMonthly" DECIMAL(14,2) NOT NULL,
    "priceYearly" DECIMAL(14,2) NOT NULL,
    "trialDays" SMALLINT NOT NULL DEFAULT 14,
    "graceDays" SMALLINT NOT NULL DEFAULT 7,
    "maxUsers" INTEGER,
    "maxBranches" INTEGER,
    "maxProducts" INTEGER,
    "maxStorageMb" INTEGER,
    "maxImagesPerProduct" SMALLINT NOT NULL DEFAULT 8,
    "onlineStoreEnabled" BOOLEAN NOT NULL DEFAULT true,
    "features" JSONB NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "trialEndsAt" TIMESTAMPTZ(3),
    "currentPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMPTZ(3) NOT NULL,
    "graceEndsAt" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "invoiceNumber" VARCHAR(40) NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "paidAt" TIMESTAMPTZ(3),
    "paymentRef" VARCHAR(100),
    "confirmedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "shopId" UUID,
    "actorUserId" UUID,
    "actorType" "ActorType" NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "targetType" VARCHAR(60) NOT NULL,
    "targetId" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "reason" VARCHAR(500),
    "supportSessionId" UUID,
    "requestId" VARCHAR(64),
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "permissionCode" VARCHAR(80) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "targetType" VARCHAR(60) NOT NULL,
    "targetId" VARCHAR(64),
    "targetShopId" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "supportSessionId" UUID,
    "requestId" VARCHAR(64),
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_sessions" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "ticketId" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "support_access_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "reporterUserId" UUID,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "reasonCode" VARCHAR(40) NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "reportId" UUID,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "ticketNumber" VARCHAR(20) NOT NULL,
    "requesterUserId" UUID NOT NULL,
    "shopId" UUID,
    "orderId" UUID,
    "subject" VARCHAR(200) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedAdminId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachmentKeys" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_type_email_key" ON "users"("type", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_type_phone_key" ON "users"("type", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "verification_tokens_destination_purpose_idx" ON "verification_tokens"("destination", "purpose");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_purpose_idx" ON "verification_tokens"("userId", "purpose");

-- CreateIndex
CREATE INDEX "permissions_scope_idx" ON "permissions"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "shop_roles_shopId_id_key" ON "shop_roles"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_roles_shopId_name_key" ON "shop_roles"("shopId", "name");

-- CreateIndex
CREATE INDEX "shop_role_permissions_shopId_idx" ON "shop_role_permissions"("shopId");

-- CreateIndex
CREATE INDEX "shop_members_userId_status_idx" ON "shop_members"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shop_members_shopId_id_key" ON "shop_members"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_members_shopId_userId_key" ON "shop_members"("shopId", "userId");

-- CreateIndex
CREATE INDEX "shop_member_branches_shopId_idx" ON "shop_member_branches"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_invitations_tokenHash_key" ON "shop_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "shop_invitations_shopId_idx" ON "shop_invitations"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shops_code_key" ON "shops"("code");

-- CreateIndex
CREATE INDEX "shops_status_idx" ON "shops"("status");

-- CreateIndex
CREATE INDEX "shops_ownerUserId_idx" ON "shops"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_shopId_id_key" ON "branches"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_shopId_code_key" ON "branches"("shopId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_shopId_id_key" ON "measurement_units"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_units_shopId_code_version_key" ON "measurement_units"("shopId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "shop_payment_methods_shopId_id_key" ON "shop_payment_methods"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_payment_methods_shopId_label_key" ON "shop_payment_methods"("shopId", "label");

-- CreateIndex
CREATE INDEX "categories_shopId_parentId_idx" ON "categories"("shopId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_shopId_id_key" ON "categories"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_shopId_slug_key" ON "categories"("shopId", "slug");

-- CreateIndex
CREATE INDEX "products_shopId_status_idx" ON "products"("shopId", "status");

-- CreateIndex
CREATE INDEX "products_shopId_categoryId_idx" ON "products"("shopId", "categoryId");

-- CreateIndex
CREATE INDEX "products_shopId_isPublishedOnline_moderationStatus_status_idx" ON "products"("shopId", "isPublishedOnline", "moderationStatus", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopId_id_key" ON "products"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopId_sku_key" ON "products"("shopId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopId_barcode_key" ON "products"("shopId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopId_slug_key" ON "products"("shopId", "slug");

-- CreateIndex
CREATE INDEX "product_images_shopId_productId_sortOrder_idx" ON "product_images"("shopId", "productId", "sortOrder");

-- CreateIndex
CREATE INDEX "inventory_shopId_productId_idx" ON "inventory"("shopId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_shopId_branchId_productId_key" ON "inventory"("shopId", "branchId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversesMovementId_key" ON "stock_movements"("reversesMovementId");

-- CreateIndex
CREATE INDEX "stock_movements_shopId_branchId_productId_createdAt_idx" ON "stock_movements"("shopId", "branchId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopId_createdAt_idx" ON "stock_movements"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_shopId_type_createdAt_idx" ON "stock_movements"("shopId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_saleItemId_idx" ON "stock_movements"("saleItemId");

-- CreateIndex
CREATE INDEX "stock_movements_orderItemId_idx" ON "stock_movements"("orderItemId");

-- CreateIndex
CREATE INDEX "stock_movements_purchaseItemId_idx" ON "stock_movements"("purchaseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_orderItemId_key" ON "inventory_reservations"("orderItemId");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_expiresAt_idx" ON "inventory_reservations"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "inventory_reservations_shopId_orderId_idx" ON "inventory_reservations"("shopId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_shopId_id_key" ON "inventory_reservations"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_shopId_orderItemId_key" ON "inventory_reservations"("shopId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_shopId_id_key" ON "stock_transfers"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_shopId_transferNumber_key" ON "stock_transfers"("shopId", "transferNumber");

-- CreateIndex
CREATE INDEX "stock_transfer_items_shopId_transferId_idx" ON "stock_transfer_items"("shopId", "transferId");

-- CreateIndex
CREATE INDEX "customers_shopId_name_idx" ON "customers"("shopId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopId_id_key" ON "customers"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopId_phone_key" ON "customers"("shopId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopId_userId_key" ON "customers"("shopId", "userId");

-- CreateIndex
CREATE INDEX "customer_addresses_userId_idx" ON "customer_addresses"("userId");

-- CreateIndex
CREATE INDEX "guest_identities_phone_idx" ON "guest_identities"("phone");

-- CreateIndex
CREATE INDEX "suppliers_shopId_name_idx" ON "suppliers"("shopId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_shopId_id_key" ON "suppliers"("shopId", "id");

-- CreateIndex
CREATE INDEX "sales_shopId_soldAt_idx" ON "sales"("shopId", "soldAt");

-- CreateIndex
CREATE INDEX "sales_shopId_status_soldAt_idx" ON "sales"("shopId", "status", "soldAt");

-- CreateIndex
CREATE INDEX "sales_shopId_paymentStatus_idx" ON "sales"("shopId", "paymentStatus");

-- CreateIndex
CREATE INDEX "sales_shopId_customerId_idx" ON "sales"("shopId", "customerId");

-- CreateIndex
CREATE INDEX "sales_shopId_cashierUserId_soldAt_idx" ON "sales"("shopId", "cashierUserId", "soldAt");

-- CreateIndex
CREATE INDEX "sales_shopId_branchId_soldAt_idx" ON "sales"("shopId", "branchId", "soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shopId_id_key" ON "sales"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shopId_invoiceNumber_key" ON "sales"("shopId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sales_shopId_idempotencyKey_key" ON "sales"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "sale_items_shopId_productId_idx" ON "sale_items"("shopId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_shopId_id_key" ON "sale_items"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_saleId_lineNo_key" ON "sale_items"("saleId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentTxnId_key" ON "payments"("paymentTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reversesPaymentId_key" ON "payments"("reversesPaymentId");

-- CreateIndex
CREATE INDEX "payments_shopId_receivedAt_idx" ON "payments"("shopId", "receivedAt");

-- CreateIndex
CREATE INDEX "payments_shopId_saleId_idx" ON "payments"("shopId", "saleId");

-- CreateIndex
CREATE INDEX "payments_shopId_orderId_idx" ON "payments"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "payments_shopId_customerId_idx" ON "payments"("shopId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_shopId_idempotencyKey_key" ON "payments"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "returns_shopId_status_idx" ON "returns"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "returns_shopId_id_key" ON "returns"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_shopId_returnNumber_key" ON "returns"("shopId", "returnNumber");

-- CreateIndex
CREATE INDEX "return_items_shopId_returnId_idx" ON "return_items"("shopId", "returnId");

-- CreateIndex
CREATE INDEX "purchases_shopId_purchaseDate_idx" ON "purchases"("shopId", "purchaseDate");

-- CreateIndex
CREATE INDEX "purchases_shopId_supplierId_idx" ON "purchases"("shopId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_shopId_id_key" ON "purchases"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_shopId_purchaseNumber_key" ON "purchases"("shopId", "purchaseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_shopId_idempotencyKey_key" ON "purchases"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "purchase_items_shopId_productId_idx" ON "purchase_items"("shopId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_shopId_id_key" ON "purchase_items"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_purchaseId_lineNo_key" ON "purchase_items"("purchaseId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_reversesPaymentId_key" ON "supplier_payments"("reversesPaymentId");

-- CreateIndex
CREATE INDEX "supplier_payments_shopId_supplierId_idx" ON "supplier_payments"("shopId", "supplierId");

-- CreateIndex
CREATE INDEX "supplier_payments_shopId_paidAt_idx" ON "supplier_payments"("shopId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_shopId_id_key" ON "expense_categories"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_shopId_name_key" ON "expense_categories"("shopId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_reversesExpenseId_key" ON "expenses"("reversesExpenseId");

-- CreateIndex
CREATE INDEX "expenses_shopId_expenseDate_idx" ON "expenses"("shopId", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_shopId_categoryId_expenseDate_idx" ON "expenses"("shopId", "categoryId", "expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "storefronts_shopId_key" ON "storefronts"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "storefronts_slug_key" ON "storefronts"("slug");

-- CreateIndex
CREATE INDEX "storefronts_status_isEnabled_adminSuspended_idx" ON "storefronts"("status", "isEnabled", "adminSuspended");

-- CreateIndex
CREATE UNIQUE INDEX "storefronts_shopId_id_key" ON "storefronts"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_options_shopId_id_key" ON "delivery_options"("shopId", "id");

-- CreateIndex
CREATE INDEX "delivery_zones_shopId_deliveryOptionId_idx" ON "delivery_zones"("shopId", "deliveryOptionId");

-- CreateIndex
CREATE INDEX "online_carts_customerUserId_status_idx" ON "online_carts"("customerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "online_carts_shopId_id_key" ON "online_carts"("shopId", "id");

-- CreateIndex
CREATE INDEX "cart_items_cartId_idx" ON "cart_items"("cartId");

-- CreateIndex
CREATE INDEX "online_orders_shopId_status_placedAt_idx" ON "online_orders"("shopId", "status", "placedAt");

-- CreateIndex
CREATE INDEX "online_orders_shopId_paymentStatus_idx" ON "online_orders"("shopId", "paymentStatus");

-- CreateIndex
CREATE INDEX "online_orders_shopId_customerId_idx" ON "online_orders"("shopId", "customerId");

-- CreateIndex
CREATE INDEX "online_orders_customerUserId_placedAt_idx" ON "online_orders"("customerUserId", "placedAt");

-- CreateIndex
CREATE INDEX "online_orders_shopId_placedAt_idx" ON "online_orders"("shopId", "placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_shopId_id_key" ON "online_orders"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_shopId_orderNumber_key" ON "online_orders"("shopId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_shopId_invoiceNumber_key" ON "online_orders"("shopId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_shopId_idempotencyKey_key" ON "online_orders"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "online_order_items_shopId_productId_idx" ON "online_order_items"("shopId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "online_order_items_shopId_id_key" ON "online_order_items"("shopId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "online_order_items_orderId_lineNo_key" ON "online_order_items"("orderId", "lineNo");

-- CreateIndex
CREATE INDEX "order_status_history_shopId_orderId_createdAt_idx" ON "order_status_history"("shopId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_notes_shopId_orderId_createdAt_idx" ON "order_notes"("shopId", "orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_revisions_orderId_revisionNo_key" ON "order_revisions"("orderId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_orderId_key" ON "deliveries"("orderId");

-- CreateIndex
CREATE INDEX "deliveries_shopId_status_idx" ON "deliveries"("shopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_shopId_orderId_key" ON "deliveries"("shopId", "orderId");

-- CreateIndex
CREATE INDEX "payment_transactions_shopId_orderId_idx" ON "payment_transactions"("shopId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_providerReference_key" ON "payment_transactions"("provider", "providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_shopId_idempotencyKey_key" ON "payment_transactions"("shopId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_providerEventId_key" ON "payment_webhook_events"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_actorId_key_key" ON "idempotency_records"("scope", "actorId", "key");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_channel_idx" ON "notifications"("status", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_channel_dedupeKey_key" ON "notifications"("userId", "channel", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_userId_idx" ON "push_devices"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_shopId_key" ON "subscriptions"("shopId");

-- CreateIndex
CREATE INDEX "subscriptions_status_currentPeriodEnd_idx" ON "subscriptions"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_invoiceNumber_key" ON "subscription_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "subscription_invoices_shopId_periodStart_idx" ON "subscription_invoices"("shopId", "periodStart");

-- CreateIndex
CREATE INDEX "audit_logs_shopId_createdAt_idx" ON "audit_logs"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_shopId_actorUserId_createdAt_idx" ON "audit_logs"("shopId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_shopId_action_createdAt_idx" ON "audit_logs"("shopId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_shopId_targetType_targetId_idx" ON "audit_logs"("shopId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminUserId_createdAt_idx" ON "admin_audit_logs"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_targetShopId_createdAt_idx" ON "admin_audit_logs"("targetShopId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_createdAt_idx" ON "admin_audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "support_access_sessions_shopId_startedAt_idx" ON "support_access_sessions"("shopId", "startedAt");

-- CreateIndex
CREATE INDEX "support_access_sessions_adminUserId_endedAt_idx" ON "support_access_sessions"("adminUserId", "endedAt");

-- CreateIndex
CREATE INDEX "content_reports_status_createdAt_idx" ON "content_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "content_reports_targetType_targetId_idx" ON "content_reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "moderation_actions_targetType_targetId_idx" ON "moderation_actions"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticketNumber_key" ON "support_tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_createdAt_idx" ON "support_tickets"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_requesterUserId_idx" ON "support_tickets"("requesterUserId");

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticketId_createdAt_idx" ON "support_ticket_messages"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_roles" ADD CONSTRAINT "shop_roles_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_role_permissions" ADD CONSTRAINT "shop_role_permissions_shopId_roleId_fkey" FOREIGN KEY ("shopId", "roleId") REFERENCES "shop_roles"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_role_permissions" ADD CONSTRAINT "shop_role_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_members" ADD CONSTRAINT "shop_members_shopId_roleId_fkey" FOREIGN KEY ("shopId", "roleId") REFERENCES "shop_roles"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_member_branches" ADD CONSTRAINT "shop_member_branches_shopId_memberId_fkey" FOREIGN KEY ("shopId", "memberId") REFERENCES "shop_members"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_member_branches" ADD CONSTRAINT "shop_member_branches_shopId_branchId_fkey" FOREIGN KEY ("shopId", "branchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_invitations" ADD CONSTRAINT "shop_invitations_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_invitations" ADD CONSTRAINT "shop_invitations_shopId_roleId_fkey" FOREIGN KEY ("shopId", "roleId") REFERENCES "shop_roles"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_invitations" ADD CONSTRAINT "shop_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_units" ADD CONSTRAINT "measurement_units_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_payment_methods" ADD CONSTRAINT "shop_payment_methods_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_shopId_parentId_fkey" FOREIGN KEY ("shopId", "parentId") REFERENCES "categories"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shopId_categoryId_fkey" FOREIGN KEY ("shopId", "categoryId") REFERENCES "categories"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_shopId_branchId_fkey" FOREIGN KEY ("shopId", "branchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_branchId_fkey" FOREIGN KEY ("shopId", "branchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_saleItemId_fkey" FOREIGN KEY ("shopId", "saleItemId") REFERENCES "sale_items"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_orderItemId_fkey" FOREIGN KEY ("shopId", "orderItemId") REFERENCES "online_order_items"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_reservationId_fkey" FOREIGN KEY ("shopId", "reservationId") REFERENCES "inventory_reservations"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shopId_purchaseItemId_fkey" FOREIGN KEY ("shopId", "purchaseItemId") REFERENCES "purchase_items"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transferItemId_fkey" FOREIGN KEY ("transferItemId") REFERENCES "stock_transfer_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "return_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversesMovementId_fkey" FOREIGN KEY ("reversesMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_shopId_branchId_fkey" FOREIGN KEY ("shopId", "branchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_shopId_orderItemId_fkey" FOREIGN KEY ("shopId", "orderItemId") REFERENCES "online_order_items"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_shopId_fromBranchId_fkey" FOREIGN KEY ("shopId", "fromBranchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_shopId_toBranchId_fkey" FOREIGN KEY ("shopId", "toBranchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_shopId_transferId_fkey" FOREIGN KEY ("shopId", "transferId") REFERENCES "stock_transfers"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_identities" ADD CONSTRAINT "guest_identities_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shopId_branchId_fkey" FOREIGN KEY ("shopId", "branchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shopId_customerId_fkey" FOREIGN KEY ("shopId", "customerId") REFERENCES "customers"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashierUserId_fkey" FOREIGN KEY ("cashierUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shopId_saleId_fkey" FOREIGN KEY ("shopId", "saleId") REFERENCES "sales"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shopId_saleId_fkey" FOREIGN KEY ("shopId", "saleId") REFERENCES "sales"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shopId_returnId_fkey" FOREIGN KEY ("shopId", "returnId") REFERENCES "returns"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shopId_customerId_fkey" FOREIGN KEY ("shopId", "customerId") REFERENCES "customers"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shopId_paymentMethodId_fkey" FOREIGN KEY ("shopId", "paymentMethodId") REFERENCES "shop_payment_methods"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentTxnId_fkey" FOREIGN KEY ("paymentTxnId") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_shopId_saleId_fkey" FOREIGN KEY ("shopId", "saleId") REFERENCES "sales"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_shopId_returnId_fkey" FOREIGN KEY ("shopId", "returnId") REFERENCES "returns"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_shopId_saleItemId_fkey" FOREIGN KEY ("shopId", "saleItemId") REFERENCES "sale_items"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_shopId_orderItemId_fkey" FOREIGN KEY ("shopId", "orderItemId") REFERENCES "online_order_items"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shopId_branchId_fkey" FOREIGN KEY ("shopId", "branchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shopId_supplierId_fkey" FOREIGN KEY ("shopId", "supplierId") REFERENCES "suppliers"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_shopId_purchaseId_fkey" FOREIGN KEY ("shopId", "purchaseId") REFERENCES "purchases"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shopId_supplierId_fkey" FOREIGN KEY ("shopId", "supplierId") REFERENCES "suppliers"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shopId_purchaseId_fkey" FOREIGN KEY ("shopId", "purchaseId") REFERENCES "purchases"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shopId_paymentMethodId_fkey" FOREIGN KEY ("shopId", "paymentMethodId") REFERENCES "shop_payment_methods"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_branchId_fkey" FOREIGN KEY ("shopId", "branchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_categoryId_fkey" FOREIGN KEY ("shopId", "categoryId") REFERENCES "expense_categories"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_paymentMethodId_fkey" FOREIGN KEY ("shopId", "paymentMethodId") REFERENCES "shop_payment_methods"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reversesExpenseId_fkey" FOREIGN KEY ("reversesExpenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storefronts" ADD CONSTRAINT "storefronts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storefronts" ADD CONSTRAINT "storefronts_shopId_fulfilmentBranchId_fkey" FOREIGN KEY ("shopId", "fulfilmentBranchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_options" ADD CONSTRAINT "delivery_options_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_shopId_deliveryOptionId_fkey" FOREIGN KEY ("shopId", "deliveryOptionId") REFERENCES "delivery_options"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_carts" ADD CONSTRAINT "online_carts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_carts" ADD CONSTRAINT "online_carts_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_carts" ADD CONSTRAINT "online_carts_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_shopId_cartId_fkey" FOREIGN KEY ("shopId", "cartId") REFERENCES "online_carts"("shopId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_shopId_storefrontId_fkey" FOREIGN KEY ("shopId", "storefrontId") REFERENCES "storefronts"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_shopId_fulfilmentBranchId_fkey" FOREIGN KEY ("shopId", "fulfilmentBranchId") REFERENCES "branches"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_shopId_customerId_fkey" FOREIGN KEY ("shopId", "customerId") REFERENCES "customers"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_shopId_deliveryOptionId_fkey" FOREIGN KEY ("shopId", "deliveryOptionId") REFERENCES "delivery_options"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_shopId_productId_fkey" FOREIGN KEY ("shopId", "productId") REFERENCES "products"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_paymentTxnId_fkey" FOREIGN KEY ("paymentTxnId") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_sessions" ADD CONSTRAINT "support_access_sessions_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "content_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_shopId_orderId_fkey" FOREIGN KEY ("shopId", "orderId") REFERENCES "online_orders"("shopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== FABNIX hand-written constraints (prisma/sql/constraints.sql) =====
-- =============================================================================
-- FABNIX — database-level guarantees Prisma cannot express.
-- Appended to the initial migration (prisma migrate dev --create-only, then
-- paste below the generated DDL). Column names are camelCase (Prisma default),
-- hence the quoting.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. Identity
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_contact_required CHECK (num_nonnulls(email, phone) >= 1),
  ADD CONSTRAINT users_email_lower CHECK (email IS NULL OR email = lower(email)),
  ADD CONSTRAINT users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');

-- Only SHOPKEEPER users may hold shop memberships (§A1.2).
CREATE OR REPLACE FUNCTION fabnix_member_must_be_shopkeeper() RETURNS trigger AS $$
BEGIN
  IF (SELECT type FROM users WHERE id = NEW."userId") <> 'SHOPKEEPER' THEN
    RAISE EXCEPTION 'shop_members.userId must reference a SHOPKEEPER user' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER shop_members_type_guard
  BEFORE INSERT OR UPDATE OF "userId" ON shop_members
  FOR EACH ROW EXECUTE FUNCTION fabnix_member_must_be_shopkeeper();

-- One owner membership per shop.
CREATE UNIQUE INDEX shop_members_one_owner ON shop_members ("shopId") WHERE "isOwner";

-- ---------------------------------------------------------------------------
-- 2. Shop configuration
-- ---------------------------------------------------------------------------
ALTER TABLE shops
  ADD CONSTRAINT shops_code_format CHECK (code ~ '^[A-Z0-9]{2,12}$');

ALTER TABLE shop_settings
  ADD CONSTRAINT shop_settings_currency_precision CHECK ("currencyPrecision" BETWEEN 0 AND 4),
  ADD CONSTRAINT shop_settings_length_precision CHECK ("lengthDisplayPrecision" BETWEEN 0 AND 4),
  ADD CONSTRAINT shop_settings_tax_rate CHECK ("defaultTaxRate" >= 0 AND "defaultTaxRate" <= 100),
  ADD CONSTRAINT shop_settings_reservation_ttl CHECK ("reservationTtlMinutes" BETWEEN 15 AND 4320);

CREATE UNIQUE INDEX branches_one_default ON branches ("shopId") WHERE "isDefault";

-- One ACTIVE version per unit code per shop (BR-004).
CREATE UNIQUE INDEX measurement_units_one_active ON measurement_units ("shopId", code) WHERE "isActive";
ALTER TABLE measurement_units
  ADD CONSTRAINT measurement_units_factor_positive CHECK ("inchesPerUnit" > 0),
  ADD CONSTRAINT measurement_units_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]{0,19}$');

-- Factors of an already-created version are immutable; edits create a new version.
CREATE OR REPLACE FUNCTION fabnix_unit_factor_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."inchesPerUnit" <> OLD."inchesPerUnit" OR NEW.code <> OLD.code OR NEW.version <> OLD.version THEN
    RAISE EXCEPTION 'measurement unit versions are immutable; insert a new version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER measurement_units_immutable
  BEFORE UPDATE ON measurement_units
  FOR EACH ROW EXECUTE FUNCTION fabnix_unit_factor_immutable();

-- ---------------------------------------------------------------------------
-- 3. Catalogue
-- ---------------------------------------------------------------------------
ALTER TABLE products
  ADD CONSTRAINT products_rates_nonneg CHECK ("sellingRate" >= 0 AND ("purchaseRate" IS NULL OR "purchaseRate" >= 0)),
  ADD CONSTRAINT products_tax_rate CHECK ("taxRate" IS NULL OR ("taxRate" >= 0 AND "taxRate" <= 100)),
  ADD CONSTRAINT products_order_rules CHECK (
    ("minOrderInches" IS NULL OR "minOrderInches" > 0) AND ("orderStepInches" IS NULL OR "orderStepInches" > 0)),
  ADD CONSTRAINT products_color_hex CHECK ("colorHex" IS NULL OR "colorHex" ~ '^#[0-9A-Fa-f]{6}$');

-- Fuzzy search (FR-022, FR-096)
CREATE INDEX products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX products_sku_trgm  ON products USING gin (sku gin_trgm_ops);
CREATE INDEX customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX customers_phone_trgm ON customers USING gin (phone gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 4. Inventory & ledger
-- ---------------------------------------------------------------------------
-- onHand may go negative ONLY when the shop enables negative stock; that is a
-- per-shop rule enforced in the locked transaction. Reserved can never be < 0.
ALTER TABLE inventory
  ADD CONSTRAINT inventory_reserved_nonneg CHECK ("reservedInches" >= 0);

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_nonzero CHECK ("deltaOnHandInches" <> 0 OR "deltaReservedInches" <> 0),
  ADD CONSTRAINT stock_movements_reserved_after CHECK ("reservedAfterInches" >= 0);

ALTER TABLE inventory_reservations
  ADD CONSTRAINT reservations_positive CHECK ("reservedInches" > 0);

-- ---------------------------------------------------------------------------
-- 5. Sales, payments, returns
-- ---------------------------------------------------------------------------
ALTER TABLE sales
  ADD CONSTRAINT sales_invoice_when_completed CHECK (status = 'DRAFT' OR "invoiceNumber" IS NOT NULL),
  ADD CONSTRAINT sales_amounts_nonneg CHECK (
    subtotal >= 0 AND "grandTotal" >= 0 AND "paidAmount" >= 0 AND "dueAmount" >= 0 AND "refundedAmount" >= 0);

ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_length_positive CHECK ("lengthInches" > 0 AND pieces >= 1 AND "totalLengthInches" > 0),
  ADD CONSTRAINT sale_items_amounts_nonneg CHECK ("unitRate" >= 0 AND "grossAmount" >= 0 AND "lineTotal" >= 0),
  ADD CONSTRAINT sale_items_returned_bounds CHECK ("returnedInches" >= 0 AND "returnedInches" <= "totalLengthInches"),
  ADD CONSTRAINT sale_items_override_reason CHECK (NOT "rateOverridden" OR ("overrideReason" IS NOT NULL AND "overrideById" IS NOT NULL));

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT payments_allocation CHECK (
    num_nonnulls("saleId", "orderId") <= 1 AND num_nonnulls("saleId", "orderId", "returnId") >= 1);

ALTER TABLE returns
  ADD CONSTRAINT returns_single_source CHECK (
    (channel = 'POS' AND "saleId" IS NOT NULL AND "orderId" IS NULL) OR
    (channel = 'ONLINE' AND "orderId" IS NOT NULL AND "saleId" IS NULL));

ALTER TABLE return_items
  ADD CONSTRAINT return_items_single_source CHECK (num_nonnulls("saleItemId", "orderItemId") = 1),
  ADD CONSTRAINT return_items_positive CHECK ("returnedInches" > 0 AND "refundAmount" >= 0);

ALTER TABLE purchase_items
  ADD CONSTRAINT purchase_items_positive CHECK ("receivedInches" > 0 AND "unitCost" >= 0);

ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_positive CHECK (amount > 0);
ALTER TABLE expenses          ADD CONSTRAINT expenses_positive CHECK (amount > 0);

-- ---------------------------------------------------------------------------
-- 6. Online store
-- ---------------------------------------------------------------------------
ALTER TABLE storefronts
  ADD CONSTRAINT storefronts_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$' AND slug !~ '--');

ALTER TABLE online_carts
  ADD CONSTRAINT online_carts_owner CHECK (num_nonnulls("customerUserId", "guestId") = 1);
CREATE UNIQUE INDEX online_carts_one_active_user  ON online_carts ("shopId", "customerUserId") WHERE status = 'ACTIVE' AND "customerUserId" IS NOT NULL;
CREATE UNIQUE INDEX online_carts_one_active_guest ON online_carts ("shopId", "guestId")        WHERE status = 'ACTIVE' AND "guestId" IS NOT NULL;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_positive CHECK ("lengthInches" > 0 AND pieces >= 1);

ALTER TABLE online_orders
  ADD CONSTRAINT online_orders_owner CHECK (num_nonnulls("customerUserId", "guestId") = 1),
  ADD CONSTRAINT online_orders_invoice_after_confirm CHECK (
    status IN ('PENDING_CONFIRMATION', 'REJECTED') OR "invoiceNumber" IS NOT NULL OR status = 'CANCELLED'),
  ADD CONSTRAINT online_orders_reject_reason CHECK (status <> 'REJECTED' OR "rejectionReason" IS NOT NULL),
  ADD CONSTRAINT online_orders_amounts_nonneg CHECK (subtotal >= 0 AND total >= 0 AND "deliveryFee" >= 0 AND "paidAmount" >= 0);

ALTER TABLE online_order_items
  ADD CONSTRAINT online_order_items_positive CHECK ("lengthInches" > 0 AND pieces >= 1 AND "quantityInches" > 0),
  ADD CONSTRAINT online_order_items_returned_bounds CHECK ("returnedInches" >= 0 AND "returnedInches" <= "quantityInches");

-- ---------------------------------------------------------------------------
-- 7. Append-only / no-hard-delete protection (BR-009, BR-015)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fabnix_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not permitted (append-only ledger)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$ LANGUAGE plpgsql;

-- Fully immutable ledgers: no UPDATE, no DELETE.
CREATE TRIGGER stock_movements_append_only      BEFORE UPDATE OR DELETE ON stock_movements      FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER order_status_history_append_only BEFORE UPDATE OR DELETE ON order_status_history FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER audit_logs_append_only           BEFORE UPDATE OR DELETE ON audit_logs           FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER admin_audit_logs_append_only     BEFORE UPDATE OR DELETE ON admin_audit_logs     FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER moderation_actions_append_only   BEFORE UPDATE OR DELETE ON moderation_actions   FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();

-- Transaction headers/lines: status may change, rows may never be deleted.
CREATE TRIGGER sales_no_delete              BEFORE DELETE ON sales              FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER sale_items_no_delete         BEFORE DELETE ON sale_items         FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER online_orders_no_delete      BEFORE DELETE ON online_orders      FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER online_order_items_no_delete BEFORE DELETE ON online_order_items FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER purchases_no_delete          BEFORE DELETE ON purchases          FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER purchase_items_no_delete     BEFORE DELETE ON purchase_items     FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER expenses_no_delete           BEFORE DELETE ON expenses           FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER returns_no_delete            BEFORE DELETE ON returns            FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();
CREATE TRIGGER inventory_reservations_no_delete BEFORE DELETE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION fabnix_forbid_mutation();

-- Payments: only POSTED → REVERSED is allowed; amounts/allocation are frozen.
CREATE OR REPLACE FUNCTION fabnix_payment_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on % is not permitted', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF NOT (OLD.status = 'POSTED' AND NEW.status = 'REVERSED')
     OR NEW.amount <> OLD.amount
     OR NEW."shopId" <> OLD."shopId" THEN
    RAISE EXCEPTION 'payments are append-only; only POSTED→REVERSED is allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER payments_guard          BEFORE UPDATE OR DELETE ON payments          FOR EACH ROW EXECUTE FUNCTION fabnix_payment_guard();
CREATE TRIGGER supplier_payments_guard BEFORE UPDATE OR DELETE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION fabnix_payment_guard();

-- Super Admin audit rows must carry a reason (§A1.1).
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_reason CHECK (length(trim(reason)) >= 5);
ALTER TABLE support_access_sessions
  ADD CONSTRAINT support_sessions_bounded CHECK ("expiresAt" > "startedAt" AND "expiresAt" <= "startedAt" + interval '4 hours');
