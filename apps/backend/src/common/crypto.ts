import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** URL-safe opaque token (refresh tokens, invitations). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** 6-digit numeric OTP. */
export const randomOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Deterministic JSON (sorted keys) for idempotency request hashing. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** ASCII slug; falls back to a random suffix for non-Latin (e.g. Bangla) names. */
export function slugify(input: string, fallbackPrefix = 'item'): string {
  const base = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 50)
    .replace(/-+$/g, '');
  const suffix = randomBytes(3).toString('hex');
  return base.length >= 3 ? base : `${fallbackPrefix}-${suffix}`;
}
