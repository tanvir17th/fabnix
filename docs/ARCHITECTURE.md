# FABNIX — Architecture Plan

Baseline: *FABNIX SRS v1.1* (v1.1 amendment overrides v1.0 wherever they conflict).
Status: Milestone 1 approved; **Milestone 2 (shared domain engine + backend core) implemented.**

## 0. Implementation notes (Milestone 2) — where the code differs from this plan

| Planned | Implemented | Why |
|---|---|---|
| pnpm + Turborepo | **npm workspaces** | pnpm isn't installed on the dev machine; npm 11 workspaces cover this two-package graph. Turborepo can be added when `apps/web` arrives. |
| Next.js 15 / NestJS (latest) | **NestJS 11.2** (CommonJS), **TypeScript 5.9.3** | NestJS 12 is ESM-only, which makes Jest/ts-jest awkward. TypeScript 7 (the native Go compiler) isn't supported by ts-jest yet. |
| `AsyncLocalStorage` tenant context + Prisma extension that throws on unscoped queries | An explicit **`ShopContext`** object, resolved by `ShopAccessGuard` and passed into every service call. Composite FKs back it up. | Explicit is easier to follow and test. `AsyncLocalStorage` is used only for request metadata (request id, ip, user agent) in audit logs. The throwing extension is still a good idea for later. |
| BullMQ jobs | An **in-process `ReservationSweeper`** (interval + `FOR UPDATE SKIP LOCKED`) | It's safe to run on every replica. BullMQ comes with the email/SMS/push fan-out. |
| Sale statuses incl. "partially paid / paid" | **`SaleStatus` (lifecycle) and `PaymentStatus` are separate fields** | This lets the system represent combinations such as "partially returned + partially paid" (FR-043). |
| POS draft sales | POS creates **COMPLETED** sales in one call; the cart lives on the client | `DRAFT` is still in the enum for saved carts later. |

Deferred out of Milestone 2 (the schema for each is ready):
- FR-113 order revisions
- Gateway payment adapters and webhooks (FR-126; the tables exist)
- Delivery-zone pricing (`ZONE` options are rejected at checkout)
- Returns workflow
- Purchases, suppliers and expenses APIs
- Invoice **PDF** rendering. The invoice view-model endpoint exists; PDF needs the web/Chromium renderer.
- Guest checkout
- 2FA

---

## 1. Resolved open decisions (SRS §15) — engineering defaults

These values let the MVP be built now. Each one is a shop setting or platform config, so changing it later is a config change, not a code change.

| # | Open item | Default for MVP | Where it lives |
|---|-----------|-----------------|----------------|
| 1 | **Gira default** | **No silent default.** Onboarding step 3 *requires* the owner to confirm a Gira factor. We show common presets as one-tap suggestions (2.25 in = 1/16 yd, 2.5 in, 3 in) and a live preview ("5 yd 4 gira = ? yd"). The GIRA unit stays disabled in POS and the storefront until it is confirmed. | `measurement_units` (versioned) |
| 2 | **Measurement precision** | Storage: `NUMERIC(14,4)` inches (0.0001″). Conversion factors: `NUMERIC(18,8)`. Input: up to 2 dp per unit component. Display: 2 dp (configurable 0–4). Engine: `decimal.js` with precision 34. | `shop_settings.lengthDisplayPrecision` |
| 3 | **Rounding policy** | Full precision through each line → **round each line's amounts to currency precision (2 dp, HALF_UP)** → invoice totals = sum of rounded lines (so lines always add up to the total exactly). The invoice-level discount is spread across lines pro-rata, and the remainder goes to the largest line. Optional cash rounding (nearest ৳1/৳5) is shown as a separate `roundingAdjustment` line; off by default. | `shop_settings.roundingMode/cashRounding` |
| 4 | **Returns** | POS and online both: full or partial return by length. Each returned line is either **RESTOCK**, **DAMAGED** or **DISCARD**. Refund = an `OUT` payment row (cash or original method). Exchange = return + new sale (no special type). Store credit = Phase 2 (enum is already there). Returns are only accepted within the shop's return-policy window. | `returns`, `return_items`, `payments` |
| 5 | **Tax** | Shop-level mode `NONE` (default) / `EXCLUSIVE` / `INCLUSIVE`, with a default rate that each product can override. No BD-VAT-specific logic until an advisor confirms it. Tax is calculated per line after line discount. | `shop_settings.taxMode`, `products.taxRate` |
| 6 | **Payment gateways** | MVP: Cash, Card (manual slip ref), Bank transfer, **bKash/Nagad/Rocket manual** (customer enters TrxID; shop verifies), **Cash on Delivery**. The `PaymentProvider` adapter interface and webhook inbox are built now; SSLCommerz/bKash PGW go in Phase 2. | `shop_payment_methods`, `payment_transactions` |
| 7 | **Subscription pricing** | Placeholder plans, seeded: `TRIAL` (14 days, everything on), `STARTER`, `GROWTH`, `BUSINESS` with user/branch/product/storage limits. **7-day grace** after `PAST_DUE`, then `SUSPENDED` (read-only; storefront stops taking orders). Billing is manual and confirmed by an admin. | `plans`, `subscriptions` |
| 8 | **Offline POS** | Phase 3. MVP POS uses client-generated idempotency keys, so unreliable connections can retry safely. | — |
| 9 | **Customer portal** | Covered by the v1.1 **Customer User**. MVP: online orders, invoices, payments, profile. Linking walk-in POS history to a Customer User (verified-phone claim) is Phase 2. | `customers.userId` |
| 10 | **Data retention** | Managed PG with PITR (7 days) + daily snapshots kept 35 days; **RPO ≤ 15 min, RTO ≤ 4 h**; quarterly restore drill. Financial and ledger records kept ≥ 7 years. Account deletion **anonymizes** PII (`users.anonymizedAt`) and never removes financial rows. | ops runbook |
| 11 | **Reservation TTL** *(FR-118)* | Reserve on submit; hold while `PENDING_CONFIRMATION` for **24 h** (shop range 15 min – 72 h). A sweeper job releases expired holds every minute. | `shop_settings.reservationTtlMinutes` |
| 12 | **Stock-deduction milestone** *(FR-121)* | Default **ON_CONFIRMATION**: the reservation is consumed into an `ORDER_DEDUCT_OUT` movement. Option **ON_DISPATCH**: the reservation stays (no expiry) until dispatch. The order snapshots the milestone it was placed under. | `shop_settings.stockDeductionMilestone` |
| 13 | **Negative stock** | Disabled by default. When a shop enables it, it applies to POS only and needs the `inventory.oversell` permission. Online orders never oversell. | `shop_settings.allowNegativeStock` |
| 14 | **Document numbering** | `{PREFIX}-{YYYY}-{000001}` per shop, yearly reset. One shared **INVOICE** sequence for POS sales and online-order invoices, so numbers are unique across both channels. Orders use their own `ORD` sequence. | `document_sequences` |
| 15 | **Identity uniqueness** | Email and phone are unique **per user type**. Customer, business and admin logins are separate portals, and a shopkeeper can also hold a separate customer account. | `@@unique([type, email])` |
| 16 | **Auth tokens** | Access JWT 15 min (memory only, never localStorage). Opaque refresh token 30 days in an httpOnly `SameSite=Lax` cookie, **rotated on every use, with family reuse detection**. Argon2id (m=19 MiB, t=2, p=1). Login lockout after 5 failures for 15 min. OTP: 6 digits, 5 min, 5 attempts. | `refresh_tokens` |
| 17 | **Images** | JPEG/PNG/WebP, ≤ 8 MB, ≥ 600 px on the short side, ≤ 8 images per product (plan-limited). The server re-encodes to WebP (thumb 320, medium 960, full 1920), strips EXIF and stores in S3-compatible storage. | `product_images` |

---

## 2. Monorepo layout

npm workspaces (see §0). Node 22 LTS for runtime images (local Node 26 is fine for development).

```
fabnix/
├─ apps/
│  ├─ backend/                      NestJS modular monolith  → /api/v1
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ sql/constraints.sql     CHECKs, partial uniques, trigram, append-only triggers
│  │  │  ├─ migrations/
│  │  │  └─ seed/                   permissions catalog, plans, role presets, demo shops
│  │  ├─ prisma.config.ts
│  │  ├─ src/
│  │  │  ├─ main.ts                 helmet, CORS, cookie, versioning, Swagger
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/                 cross-cutting
│  │  │  │  ├─ auth/                JwtGuard, UserTypeGuard, @CurrentUser
│  │  │  │  ├─ tenancy/             TenantContext (AsyncLocalStorage), ShopMemberGuard, @Shop()
│  │  │  │  ├─ rbac/                @RequirePermission(), PermissionGuard
│  │  │  │  ├─ idempotency/         IdempotencyInterceptor (Idempotency-Key header)
│  │  │  │  ├─ audit/               AuditService, @Audited() decorator
│  │  │  │  ├─ i18n/                localized error codes → message keys
│  │  │  │  ├─ errors/              ProblemDetails filter (RFC 9457)
│  │  │  │  ├─ pagination/
│  │  │  │  └─ prisma/              PrismaService, tx helper, row-lock helpers
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/                register, login, refresh, logout, OTP, reset, 2FA
│  │  │  │  ├─ users/               profile, /users/me/preferences (language)
│  │  │  │  ├─ shops/               shop profile, settings, branches
│  │  │  │  ├─ staff/               members, invitations, roles & permission presets
│  │  │  │  ├─ measurement/         units, Gira versioning, /calculations
│  │  │  │  ├─ catalog/             categories, products, images (upload pipeline)
│  │  │  │  ├─ inventory/           StockService (single writer), ledger, transfers, low-stock
│  │  │  │  ├─ customers/
│  │  │  │  ├─ suppliers/
│  │  │  │  ├─ sales/               POS sale lifecycle, cancellations
│  │  │  │  ├─ payments/            payment posting, reversal, gateway adapters, webhooks
│  │  │  │  ├─ invoices/            numbering, PDF (bn/en), share links
│  │  │  │  ├─ returns/
│  │  │  │  ├─ purchases/
│  │  │  │  ├─ expenses/
│  │  │  │  ├─ storefront/          store setup, slug, policies, delivery options
│  │  │  │  ├─ public-catalog/      unauthenticated storefront read API (cached)
│  │  │  │  ├─ cart/
│  │  │  │  ├─ orders/              checkout, order lifecycle state machine, revisions
│  │  │  │  ├─ reports/             dashboards, sales/inventory/receivables, CSV/PDF export
│  │  │  │  ├─ notifications/       in-app + email/SMS outbox, preferences
│  │  │  │  ├─ subscriptions/       plans, limits enforcement (PlanLimitGuard)
│  │  │  │  ├─ admin/               tenants, accounts, moderation, support sessions, platform reports
│  │  │  │  └─ jobs/                BullMQ: reservation sweeper, image processing, notifications
│  │  │  └─ generated/prisma/       Prisma client output (git-ignored)
│  │  └─ test/
│  │     ├─ unit/
│  │     ├─ integration/            Supertest + Testcontainers PG
│  │     │  ├─ tenancy.idor.spec.ts            AC-012, AC-026, AC-027
│  │     │  ├─ stock.concurrency.spec.ts       AC-023 (parallel POS + online)
│  │     │  ├─ idempotency.spec.ts             AC-013, AC-020
│  │     │  └─ reservation.release-once.spec.ts AC-024
│  │     └─ k6/
│  └─ web/                          Next.js 15 App Router
│     ├─ public/brand/              fabnix-logo.png, fn-mark.svg, favicons
│     ├─ messages/{en,bn}/*.json    next-intl catalogs, namespaced by feature
│     └─ src/
│        ├─ app/[locale]/
│        │  ├─ (marketing)/         landing, pricing
│        │  ├─ (customer)/          shop/[slug], product/[slug], cart, checkout, account/orders
│        │  ├─ (business)/          dashboard, pos, products, inventory, orders, …, settings
│        │  ├─ (admin)/             platform console
│        │  └─ (auth)/              login per portal, register, reset
│        ├─ components/ui/          design-system primitives (Radix + Tailwind)
│        ├─ features/               pos, calculator, catalog, orders, … (hooks + views)
│        ├─ lib/api/                typed client (generated from OpenAPI), TanStack Query
│        └─ styles/                 tokens.css (ivory/charcoal/ochre), fonts
├─ packages/
│  ├─ shared/                       ← used by backend AND web (and future mobile)
│  │  └─ src/
│  │     ├─ measurement/            parse "5 yd 4 gira", toInches, fromInches, format
│  │     ├─ pricing/                line calc, discounts, tax (incl/excl), rounding, allocation
│  │     ├─ money/                  Decimal wrapper, currency formatting (bn digits)
│  │     ├─ schemas/                Zod DTOs (single source → Nest pipes + web forms)
│  │     ├─ enums/                  mirrors of Prisma enums (no Prisma import in web)
│  │     ├─ permissions/            permission codes + role presets
│  │     └─ order-state/            allowed status transitions (state machine table)
│  ├─ config/                       eslint, tsconfig, tailwind preset
│  └─ e2e/                          Playwright (bn + en journeys)
├─ docker/
│  ├─ docker-compose.yml            postgres:17, redis:7, minio, mailpit, backend, web
│  └─ Dockerfile.{backend,web}
├─ .github/workflows/ci.yml         lint → typecheck → unit → integration → e2e → build
├─ docs/ARCHITECTURE.md
├─ package.json                  npm workspaces root
└─ turbo.json
```

---

## 3. Cross-cutting design

### 3.1 Tenant isolation (BR-001, §10.1)
- Business routes are scoped as `/api/v1/shops/:shopId/...`. `ShopMemberGuard` resolves `:shopId` against **the caller's active `shop_members` row**. The client's `shopId` only *selects* a shop; it never *proves* access. Branch scope and permissions come from that membership row.
- The resolved context goes into `AsyncLocalStorage`. Repository helpers always add `where: { shopId: ctx.shopId }`, and a Prisma client extension **throws** if a tenant-model query runs without a `shopId` filter. This catches developer mistakes in tests.
- **Composite FKs** `(shopId, x_id) → (shopId, id)` on every child table. Cross-shop references fail inside Postgres even if a bug slips past the app (confirmed: inserting a Shop A product with a Shop B category is rejected).
- Customer endpoints (`/api/v1/me/orders/...`) filter by `customerUserId = jwt.sub`. A wrong ID returns **404, never 403**, so the caller can't tell whether the record exists.
- Super Admin uses `/api/v1/admin/...` only. Any access to a shop's context needs a `support_access_sessions` row (reason, ≤ 4 h, read-only by default), and every request is written to `admin_audit_logs`.

### 3.2 Stock concurrency (FR-119, AC-023)
A single `StockService` is the **only writer** for `inventory` and `stock_movements`. POS sales, order submits, confirms, cancels, purchases, adjustments and returns all call it inside one `prisma.$transaction`:

```
BEGIN (READ COMMITTED)
  SELECT … FROM inventory WHERE shopId=$1 AND branchId=$2 AND productId = ANY($3)
    ORDER BY productId FOR UPDATE;                  -- deterministic order → no deadlocks
  available = onHand − reserved
  if need > available AND NOT (pos && allowNegativeStock && perm) → 409 STOCK_INSUFFICIENT
  UPDATE inventory …; INSERT stock_movements (… onHandAfter, reservedAfter);
  INSERT sale/sale_items/payments  |  order/items/reservations
COMMIT
```
- Online and POS lock **the same inventory row**, so they serialize against each other.
- Release-exactly-once (AC-024): `UPDATE inventory_reservations SET status='RELEASED' WHERE id=$1 AND status='ACTIVE' RETURNING …`. Inventory is only adjusted when that returns a row. The sweeper job uses `FOR UPDATE SKIP LOCKED` batches.
- Prisma serialization or deadlock errors (`P2034`, `40001`, `40P01`) retry up to 3 times with jitter.

### 3.3 Idempotency (FR-042, AC-013, AC-020)
1. The client sends `Idempotency-Key: <uuid>` on POS sale create, order submit, payment post and purchase post.
2. The interceptor inserts `idempotency_records (scope, actorId, key, requestHash)`.
   - If the key already exists and is **COMPLETED**, it replays the stored response.
   - If it is **IN_PROGRESS**, it returns 409.
   - If the request hash differs, it returns 422.
3. Second line of defence: `sales`, `online_orders` and `payments` each have `UNIQUE(shopId, idempotencyKey)` inside the business transaction.
4. Gateway webhooks are deduplicated by `UNIQUE(provider, providerEventId)`.

### 3.4 Measurement & money engine (`packages/shared`)
```ts
toInches([{unit:'YARD',value:'5'},{unit:'GIRA',value:'4'}], units) // → Decimal('189.0000')
lineAmount = round2( totalInches × unitRate ÷ priceUnitInches )   // 189 × 200 ÷ 36 = 1050.00
```
- Uses `decimal.js` only. ESLint rule `no-restricted-syntax` bans `parseFloat`/`Number()` on money in `pricing/`.
- Values cross the API as **strings** (`"1050.00"`), never JSON numbers.
- The same functions run in the browser (live preview, FR-018/FR-101) and on the server (authoritative). The server always recomputes, and checkout rejects a stale preview with `409 PRICE_CHANGED` plus the new numbers (FR-102).
- Conversion snapshot on each line: `[{code, unitId, version, inchesPerUnit}]` + `priceUnitInches` + rates. Historical invoices are rendered **only** from snapshots (FR-049).

### 3.5 Order state machine (§A3.1)
Allowed transitions live in `packages/shared/order-state`. Each one runs in a transaction that also writes `order_status_history`, adjusts stock as needed and queues notifications (outbox):

```
PENDING_CONFIRMATION → CONFIRMED | REJECTED | CANCELLED
CONFIRMED  → PROCESSING | CANCELLED
PROCESSING → READY_FOR_PICKUP | DISPATCHED | CANCELLED (policy)
READY_FOR_PICKUP | DISPATCHED → DELIVERED → COMPLETED
```
Returns are a separate linked `returns` workflow; the order history itself is never rewritten.

### 3.6 Bilingual (§5)
- `next-intl` with locale-prefixed routes (`/bn/...`, `/en/...`). The switcher updates the URL immediately and, if signed in, sends `PATCH /users/me/preferences`. No logout needed (AC-001).
- Precedence: device override cookie → `users.preferredLanguage` → shop default (staff onboarding) → `bn`.
- The API returns **error codes** (`STOCK_INSUFFICIENT`) with params; the web app localizes them. Notifications are stored as keys + params and rendered in *each recipient's* language.
- Fonts: `Hind Siliguri` (Bangla) + `Plus Jakarta Sans` (Latin), loaded with `next/font`. Bangla line-height ≥ 1.6 so conjuncts aren't clipped. Optional Bangla digits through `Intl.NumberFormat('bn-BD')`.
- Invoice PDFs are rendered server-side (Playwright/Chromium HTML→PDF) with embedded Noto Sans Bengali for correct shaping (AC-014). Invoice language is set per invoice and is independent of the UI language.
- CI check: every key in `en` exists in `bn` (and vice-versa); the build fails on a missing key.

### 3.7 Brand / design tokens
| Token | Value | Use |
|---|---|---|
| `--bg` | `#F8F7F4` ivory | page background |
| `--fg` | `#111317` obsidian | text, primary buttons |
| `--accent` | `#C89654` ochre | active tabs, highlights, focus ring, **large** CTAs |
| `--accent-ink` | `#8A6130` | ochre *text* on ivory (5.1:1, passes AA; `#C89654` on ivory is only 2.5:1) |
| `--line` | `#E4E1DA` | 1px borders |

Primary buttons use charcoal background with ivory text, so contrast is guaranteed. Ochre buttons carry charcoal text (≈ 7:1). The FN monogram (with its ochre diagonal) is the favicon, collapsed-sidebar mark and app icon.

### 3.8 API conventions
- `/api/v1`, JSON. Errors follow RFC 9457 Problem Details: `{type, code, status, params, errors[]}`.
- Cursor pagination (`?cursor=&limit=`) on all lists.
- OpenAPI is generated from Nest decorators + Zod and drives the typed web client.
- Rate limits (Redis): auth 10/min/IP, OTP 3/10 min/destination, public catalog 120/min/IP.

---

## 4. Module ↔ SRS traceability (MVP)

| Module | Key requirements |
|---|---|
| auth, users | FR-001–007, NFR-L10N-001–003, AC-001/002 |
| shops, staff | FR-008–011, FR-063–065, §A1.2 |
| measurement | FR-012–019, BR-003/004, AC-004–006 |
| catalog | FR-020–025, FR-091–095 |
| inventory | FR-026–034, FR-118–122, AC-007/008/023/024 |
| sales, payments, invoices | FR-035–049, BR-005–011, AC-009/010/013/014 |
| customers | FR-050–052 |
| storefront, public-catalog | FR-086–090, FR-096–097, AC-015–017 |
| cart, orders | FR-099–117, FR-123–131, AC-018–022, AC-025/026 |
| reports | FR-066–070, §11 |
| notifications | FR-071–072, FR-108, FR-129 |
| subscriptions, admin | FR-073–078, FR-098, FR-132–136, §A1.1, AC-028/029 |
| purchases, suppliers, expenses, returns | FR-054–062, FR-044/130 (built after MVP core; schema ready now) |

---

## 5. Schema notes
- `apps/backend/prisma/schema.prisma` has **67 models**, all with `uuid(7)` keys, `Decimal` lengths, money and factors, and `timestamptz`. It validates with Prisma 7.10.1.
- `apps/backend/prisma/sql/constraints.sql` adds what Prisma can't express:
  - CHECK constraints
  - one-active-unit-version and one-owner partial unique indexes
  - trigram search indexes
  - a SHOPKEEPER-only membership trigger
  - immutability of unit versions
  - append-only triggers on ledgers and audit logs
  - a no-delete rule on sales, orders and purchases
  - payments limited to the POSTED→REVERSED change
- Verification: the generated DDL plus `constraints.sql` applies cleanly on Postgres 17 (PGlite). Smoke tests confirmed four guards: cross-tenant FK rejection, the customer-as-staff block, the single active Gira version, and unit immutability.
- **Sales vs online orders:** these are separate tables with identical snapshot shape. They share one invoice sequence, one `payments` table and one stock ledger. Reports combine them through SQL views (`v_revenue_lines`) added in the reports milestone.
