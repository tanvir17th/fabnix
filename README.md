# FABNIX

*Smart fabric. Smarter business.* FABNIX is a multi-tenant SaaS for fabric shops. It covers measurement-based POS selling (including shop-configured Gira), inventory, customers, and a per-shop online storefront with ordering. The UI will be in Bangla and English.

The design and its trade-offs are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Requirements come from *FABNIX SRS v1.1*.

## Repository

```
packages/shared   Decimal-safe measurement & pricing engine, Zod schemas, permissions, order state machine
apps/backend      NestJS 11 API (/api/v1) + Prisma 7 / PostgreSQL
docker/           Dockerfile + local compose stack (Postgres, Redis, MinIO, API)
```

## Prerequisites

- Node ≥ 22 and npm ≥ 10
- PostgreSQL 15–17, either installed locally (for example `brew install postgresql@16`) or running in Docker

## Quick start

```bash
npm install
npm run build:shared
npm run db:generate -w @fabnix/backend          # Prisma client

cp apps/backend/.env.example apps/backend/.env  # then set DATABASE_URL and JWT_ACCESS_SECRET
npm run db:migrate                              # applies schema + constraints.sql guards
SEED_ADMIN_PASSWORD='choose-a-long-one' npm run db:seed
npm run dev:backend                             # http://localhost:4000/api/v1  · docs at /api/docs
```

With Docker: `docker compose -f docker/docker-compose.yml up --build`.

> npm 11 blocks dependency install scripts by default. If `prisma migrate` reports a missing schema engine, run:
> `npm rebuild @prisma/engines prisma sharp @node-rs/argon2 esbuild`

## Tests

```bash
npm test                    # shared unit tests + backend unit and integration tests
npm run test:shared -- --coverage
npm run test:integration    # backend integration tests only
```

Integration tests run against a **real PostgreSQL**:
- If `TEST_DATABASE_URL` is set (as in CI), that server is used.
- Otherwise the global setup starts a throwaway local cluster with `initdb` and `pg_ctl`. It finds the binaries through `PG_BIN`, `pg_config` or the Homebrew paths.

The setup migrates one template database, and each test file then clones it, so test files run in parallel and stay isolated.

## Conventions

- **Lengths** are stored in canonical inches, `NUMERIC(14,4)`. **Money** is `NUMERIC(14,2)`. All arithmetic uses `decimal.js` through `@fabnix/shared`, and values travel over the API as **strings**.
- **Errors** are RFC 9457 `application/problem+json` with a stable `code` and `params`. Clients localize the message.
- **Tenant routes** live under `/shops/:shopId/...`. Access is resolved from the caller's membership; the `shopId` in the URL is never trusted on its own.
- **Idempotency:** POS sales, payments and checkout require an `Idempotency-Key` header.
