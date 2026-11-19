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
