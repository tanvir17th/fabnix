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
export const USER_TYPES = 'fabnix:userTypes';

/** Route needs no authentication (a valid token, if sent, is still parsed). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a route to specific top-level user types (§A1). */
export const UserTypes = (...types: UserType[]) => SetMetadata(USER_TYPES, types);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});
