import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, PlatformPermission } from '@fabnix/shared';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthedRequest } from '../auth/auth.decorators';

const ADMIN_PERMISSIONS = 'fabnix:adminPermissions';

export interface AdminContext {
  adminUserId: string;
  permissions: ReadonlySet<string>;
}

type AdminRequest = AuthedRequest & { adminCtx?: AdminContext };

/** SUPER_ADMIN only, with explicit platform permission per route (§A1.1). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    if (!req.user) throw new AppError(ErrorCode.UNAUTHENTICATED);
    if (req.user.type !== 'SUPER_ADMIN') throw new AppError(ErrorCode.WRONG_PORTAL);
    const grants = await this.prisma.adminRolePermission.findMany({
      where: { role: { users: { some: { userId: req.user.id } } } },
      select: { permissionCode: true },
    });
    const perms = new Set(grants.map((g) => g.permissionCode));
    const required = this.reflector.get<PlatformPermission[] | undefined>(ADMIN_PERMISSIONS, context.getHandler()) ?? [];
    for (const p of required) if (!perms.has(p)) throw new AppError(ErrorCode.PERMISSION_DENIED, { permission: p });
    req.adminCtx = { adminUserId: req.user.id, permissions: perms };
    return true;
  }
}

export const AdminRoute = (...permissions: PlatformPermission[]) =>
  applyDecorators(SetMetadata(ADMIN_PERMISSIONS, permissions), UseGuards(AdminGuard));

export const Admin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminContext => {
  const a = ctx.switchToHttp().getRequest<AdminRequest>().adminCtx;
  if (!a) throw new Error('AdminRoute guard missing');
  return a;
});
