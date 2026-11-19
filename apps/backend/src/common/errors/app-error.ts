import { DomainError, ErrorCode, ErrorParams } from '@fabnix/shared';

/** HTTP status for each stable error code. Unlisted business codes → 422. */
export const ERROR_STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  REFRESH_TOKEN_INVALID: 401,
  REFRESH_TOKEN_REUSED: 401,
  FORBIDDEN: 403,
  PERMISSION_DENIED: 403,
  SHOP_ACCESS_DENIED: 403,
  BRANCH_ACCESS_DENIED: 403,
  SHOP_SUSPENDED: 403,
  SHOP_NOT_ACTIVE: 403,
  PLAN_LIMIT_REACHED: 403,
  PLAN_FEATURE_UNAVAILABLE: 403,
  PRIVILEGE_ESCALATION: 403,
  OWNER_IMMUTABLE: 403,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_NOT_VERIFIED: 403,
  WRONG_PORTAL: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ACCOUNT_EXISTS: 409,
  STOCK_INSUFFICIENT: 409,
  CART_CHANGED: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  SLUG_TAKEN: 409,
  ORDER_TRANSITION_INVALID: 409,
  SALE_NOT_CANCELLABLE: 409,
  STOREFRONT_NOT_AVAILABLE: 409,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function statusFor(code: string): number {
  return ERROR_STATUS[code as ErrorCode] ?? 422;
}

export class AppError extends DomainError {}

export const notFound = (entity: string, params: ErrorParams = {}) => new AppError(ErrorCode.NOT_FOUND, { entity, ...params });
export const forbidden = (code: ErrorCode = ErrorCode.FORBIDDEN, params: ErrorParams = {}) => new AppError(code, params);
export const conflict = (params: ErrorParams = {}) => new AppError(ErrorCode.CONFLICT, params);
