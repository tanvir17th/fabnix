import { ZodError, z } from 'zod';
import { DomainError, ErrorCode, PaymentMethodType, SaleStatus, StockMovementType, StorefrontStatus, UserType } from '@fabnix/shared';
import * as PrismaEnums from '../generated/prisma/enums';
import { slugify, stableStringify } from './crypto';
import { ProblemDetailsFilter } from './errors/problem-details.filter';
import { isRetryableTxError } from './prisma/prisma.service';
import { loadConfig } from '../config/app-config';

describe('stableStringify', () => {
  it('is key-order independent and drops undefined', () => {
    expect(stableStringify({ b: 1, a: [{ y: 2, x: 1 }], c: undefined })).toBe(stableStringify({ a: [{ x: 1, y: 2 }], b: 1 }));
    expect(stableStringify(null)).toBe('null');
  });
});

describe('slugify', () => {
  it('produces ASCII slugs and falls back for Bangla names', () => {
    expect(slugify('Jamdani Cotton — Premium!')).toBe('jamdani-cotton-premium');
    expect(slugify('Café Silk')).toBe('cafe-silk');
    expect(slugify('জামদানি শাড়ি', 'fabric')).toMatch(/^fabric-[0-9a-f]{6}$/);
  });
});

describe('ProblemDetailsFilter', () => {
  const f = new ProblemDetailsFilter();

  it('maps domain errors to stable codes and statuses', () => {
    expect(f.toProblem(new DomainError(ErrorCode.STOCK_INSUFFICIENT, { availableInches: '1' }))).toMatchObject({ status: 409, code: 'STOCK_INSUFFICIENT', params: { availableInches: '1' } });
    expect(f.toProblem(new DomainError(ErrorCode.GIRA_NOT_CONFIGURED))).toMatchObject({ status: 422 });
    expect(f.toProblem(new DomainError(ErrorCode.PERMISSION_DENIED))).toMatchObject({ status: 403 });
  });

  it('maps Zod errors to 400 with field paths', () => {
    const r = z.object({ a: z.string() }).safeParse({});
    const p = f.toProblem(r.error as ZodError);
    expect(p).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', errors: [{ path: 'a' }] });
  });

  it('never leaks internals for unknown errors', () => {
    const p = f.toProblem(new Error('SELECT * FROM secrets'));
    expect(p).toMatchObject({ status: 500, code: 'INTERNAL' });
    expect(JSON.stringify(p)).not.toContain('secrets');
  });
});

describe('isRetryableTxError', () => {
  it('detects Prisma conflicts, deadlocks and serialization failures', () => {
    expect(isRetryableTxError({ code: 'P2034' })).toBe(true);
    expect(isRetryableTxError({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
    expect(isRetryableTxError(new Error('deadlock detected'))).toBe(true);
    expect(isRetryableTxError({ code: 'P2002' })).toBe(false);
  });
});

describe('config', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'x'.repeat(40) };
  it('rejects weak secrets', () => {
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow();
  });
  it('refuses to boot production with the console messaging driver or insecure cookies', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/MESSAGING_DRIVER/);
  });
});

describe('shared enum mirrors stay in sync with schema.prisma', () => {
  it.each([
    ['UserType', UserType, PrismaEnums.UserType],
    ['SaleStatus', SaleStatus, PrismaEnums.SaleStatus],
    ['PaymentMethodType', PaymentMethodType, PrismaEnums.PaymentMethodType],
    ['StockMovementType', StockMovementType, PrismaEnums.StockMovementType],
    ['StorefrontStatus', StorefrontStatus, PrismaEnums.StorefrontStatus],
  ])('%s', (_, shared, prisma) => {
    expect(Object.values(shared).sort()).toEqual(Object.values(prisma).sort());
  });
});
