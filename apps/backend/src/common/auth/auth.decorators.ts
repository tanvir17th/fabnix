import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Language, UserStatus, UserType } from '../../generated/prisma/client';

export interface AuthUser {
  id: string;
  type: UserType;
  status: UserStatus;
  fullName: string;
  preferredLanguage: Language | null;
  sessionFamilyId: string;
}

export type AuthedRequest = Request & { user?: AuthUser; idempotencyKey?: string };

export const IS_PUBLIC = 'fabnix:isPublic';
export const AUTH_THROTTLE = 'fabnix:authThrottle';
export const USER_TYPES = 'fabnix:userTypes';

/** Route needs no authentication (a valid token, if sent, is still parsed). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Strict per-IP rate limit for brute-forceable endpoints (login, register,
 * OTP, password reset — §10). Refresh/logout deliberately do NOT use it: they
 * run on every page load and refresh tokens are 384-bit random values.
 */
export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE, true);

/** Restrict a route to specific top-level user types (§A1). */
export const UserTypes = (...types: UserType[]) => SetMetadata(USER_TYPES, types);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
