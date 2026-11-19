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
import { ErrorCode, ShopPermission } from '@fabnix/shared';
import { AppError, notFound } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthedRequest } from '../auth/auth.decorators';
import type { ShopStatus } from '../../generated/prisma/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REQUIRED_PERMISSIONS = 'fabnix:shopPermissions';

/**
 * Server-resolved tenant context (BR-001). Built ONLY from the caller's active
 * membership; the :shopId path param merely selects which membership to use.
 */
export class ShopContext {
  constructor(
    readonly shopId: string,
    readonly userId: string,
    readonly memberId: string,
    readonly isOwner: boolean,
    readonly permissions: ReadonlySet<string>,
    readonly allBranches: boolean,
    readonly branchIds: ReadonlySet<string>,
    readonly shopStatus: ShopStatus,
  ) {}

  can(permission: ShopPermission): boolean {
    return this.isOwner || this.permissions.has(permission);
  }

  require(permission: ShopPermission): void {
    if (!this.can(permission)) throw new AppError(ErrorCode.PERMISSION_DENIED, { permission });
  }

  canAccessBranch(branchId: string): boolean {
    return this.allBranches || this.branchIds.has(branchId);
  }

  requireBranch(branchId: string): void {
    if (!this.canAccessBranch(branchId)) throw new AppError(ErrorCode.BRANCH_ACCESS_DENIED, { branchId });
  }
}

type ShopRequest = AuthedRequest & { shopCtx?: ShopContext };

@Injectable()
export class ShopAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ShopRequest>();
    const user = req.user;
    if (!user) throw new AppError(ErrorCode.UNAUTHENTICATED);
    if (user.type !== 'SHOPKEEPER') throw new AppError(ErrorCode.WRONG_PORTAL);

    const shopId = req.params.shopId;
    if (typeof shopId !== 'string' || !UUID.test(shopId)) throw notFound('shop');

    const member = await this.prisma.shopMember.findUnique({
      where: { shopId_userId: { shopId, userId: user.id } },
      include: {
        shop: { select: { status: true } },
        role: { select: { isOwnerRole: true, permissions: { select: { permissionCode: true } } } },
        branches: { select: { branchId: true } },
      },
    });
    // Same response whether the shop doesn't exist or isn't yours (no existence oracle).
    if (!member || member.status !== 'ACTIVE') throw notFound('shop');

    const status = member.shop.status;
    if (status === 'CLOSED') throw new AppError(ErrorCode.SHOP_SUSPENDED, { status });
    if (status === 'SUSPENDED' && req.method !== 'GET') throw new AppError(ErrorCode.SHOP_SUSPENDED, { status });

    const isOwner = member.isOwner || member.role.isOwnerRole;
    const ctx = new ShopContext(
      shopId,
      user.id,
      member.id,
      isOwner,
      new Set(member.role.permissions.map((p) => p.permissionCode)),
      isOwner || member.allBranches,
      new Set(member.branches.map((b) => b.branchId)),
      status,
    );

    const required = this.reflector.get<ShopPermission[] | undefined>(REQUIRED_PERMISSIONS, context.getHandler()) ?? [];
    for (const p of required) ctx.require(p);

    req.shopCtx = ctx;
    return true;
  }
}

/** Marks a route as tenant-scoped and lists the permissions it requires (all-of). */
export const ShopRoute = (...permissions: ShopPermission[]) =>
  applyDecorators(SetMetadata(REQUIRED_PERMISSIONS, permissions), UseGuards(ShopAccessGuard));

export const Shop = createParamDecorator((_: unknown, ctx: ExecutionContext): ShopContext => {
  const shopCtx = ctx.switchToHttp().getRequest<ShopRequest>().shopCtx;
  if (!shopCtx) throw new Error('ShopRoute guard missing on handler');
  return shopCtx;
});
