import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '@fabnix/shared';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedRequest, AuthUser, IS_PUBLIC, USER_TYPES } from './auth.decorators';
import type { UserType } from '../../generated/prisma/client';

export interface AccessTokenPayload {
  sub: string;
  typ: UserType;
  sid: string;
}

/**
 * Global guard. Verifies the short-lived access JWT, then re-checks the user
 * row so suspensions take effect immediately (not only at token expiry).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic) return true;
      throw new AppError(ErrorCode.UNAUTHENTICATED);
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
    } catch {
      if (isPublic) return true;
      throw new AppError(ErrorCode.UNAUTHENTICATED);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, type: true, status: true, fullName: true, preferredLanguage: true },
    });
    if (!user || user.type !== payload.typ) throw new AppError(ErrorCode.UNAUTHENTICATED);
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') throw new AppError(ErrorCode.ACCOUNT_SUSPENDED);

    const authUser: AuthUser = { ...user, sessionFamilyId: payload.sid };
    req.user = authUser;

    const allowed = this.reflector.getAllAndOverride<UserType[] | undefined>(USER_TYPES, [context.getHandler(), context.getClass()]);
    if (allowed?.length && !allowed.includes(user.type)) throw new AppError(ErrorCode.WRONG_PORTAL);
    return true;
  }
}
