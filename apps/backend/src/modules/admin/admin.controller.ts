import { Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ErrorCode, PlatformPermission as PP, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { StorageService } from '../../common/storage/storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Admin, AdminContext, AdminRoute } from '../../common/tenancy/admin-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';

const s = (v: unknown) => (v === null || v === undefined ? '0' : String(v));

const shopsQuery = schemas.paginationQuery.extend({ status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'CLOSED']).optional(), q: z.string().max(100).optional() });

/**
 * Super Admin platform controls needed by the MVP (FR-073, FR-132, AC-028, AC-029).
 * Every privileged write requires a reason and lands in admin_audit_logs.
 * The full console (moderation queue, support sessions, plans) follows in Milestone 4.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  @Get('shops')
  @AdminRoute(PP.SHOPS_VIEW)
  async shops(@ZQuery(shopsQuery) q: z.infer<typeof shopsQuery>) {
    const rows = await this.prisma.shop.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q.toUpperCase() } }] } : {}) },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true, name: true, code: true, status: true, createdAt: true, country: true,
        subscription: { select: { status: true, plan: { select: { code: true } } } },
        storefront: { select: { id: true, slug: true, status: true, isEnabled: true, adminSuspended: true } },
        _count: { select: { products: true, members: true, orders: true } },
      },
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  @Patch('shops/:shopId/status')
  @AdminRoute(PP.SHOPS_MANAGE)
  async setShopStatus(@Admin() admin: AdminContext, @IdParam('shopId') shopId: string, @ZBody(schemas.adminShopStatusSchema) dto: z.infer<typeof schemas.adminShopStatusSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.shop.findUnique({ where: { id: shopId }, select: { status: true, statusReason: true } });
      if (!before) throw notFound('shop');
      const after = await tx.shop.update({ where: { id: shopId }, data: { status: dto.status, statusReason: dto.reason }, select: { id: true, status: true, statusReason: true } });
      await this.audit.logAdmin({ adminUserId: admin.adminUserId, permissionCode: PP.SHOPS_MANAGE, action: 'shop.status', targetType: 'shop', targetId: shopId, targetShopId: shopId, reason: dto.reason, before, after }, tx);
      return after;
    });
  }

  @Patch('storefronts/:storefrontId/suspension')
  @AdminRoute(PP.STOREFRONTS_MODERATE)
  async suspendStorefront(@Admin() admin: AdminContext, @IdParam('storefrontId') id: string, @ZBody(schemas.adminStorefrontSuspendSchema) dto: z.infer<typeof schemas.adminStorefrontSuspendSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.storefront.findUnique({ where: { id }, select: { shopId: true, adminSuspended: true, adminSuspendReason: true } });
      if (!before) throw notFound('storefront');
      const after = await tx.storefront.update({
        where: { id },
        data: { adminSuspended: dto.suspended, adminSuspendReason: dto.suspended ? dto.reason : null, adminSuspendedAt: dto.suspended ? new Date() : null },
        select: { id: true, slug: true, adminSuspended: true, adminSuspendReason: true },
      });
      await this.audit.logAdmin(
        { adminUserId: admin.adminUserId, permissionCode: PP.STOREFRONTS_MODERATE, action: dto.suspended ? 'storefront.suspend' : 'storefront.reinstate', targetType: 'storefront', targetId: id, targetShopId: before.shopId, reason: dto.reason, before, after },
        tx,
      );
      await tx.moderationAction.create({ data: { adminUserId: admin.adminUserId, targetType: 'STOREFRONT', targetId: id, action: dto.suspended ? 'SUSPEND_STOREFRONT' : 'REINSTATE_STOREFRONT', reason: dto.reason } });
      return after;
    });
  }

  // ----------------------------------------------------------- platform metrics (FR-136)

  @Get('stats')
  @AdminRoute(PP.SHOPS_VIEW)
  async stats() {
    const [shops, users, storefronts, listings] = await Promise.all([
      this.prisma.shop.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['type'], _count: { _all: true } }),
      this.prisma.storefront.count({ where: { isEnabled: true, status: 'PUBLISHED', adminSuspended: false } }),
      this.prisma.product.count({ where: { isPublishedOnline: true, status: 'ACTIVE', moderationStatus: 'VISIBLE' } }),
    ]);
    const orders = await this.prisma.$queryRaw<Array<{ day: Date; count: bigint; gmv: unknown }>>`
      SELECT date_trunc('day', "placedAt")::date AS day, count(*) AS count, coalesce(sum(total) FILTER (WHERE status NOT IN ('CANCELLED','REJECTED')), 0) AS gmv
      FROM online_orders WHERE "placedAt" >= now() - interval '30 days' GROUP BY 1 ORDER BY 1`;
    const byStatus = await this.prisma.onlineOrder.groupBy({ by: ['status'], where: { placedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } });
    return {
      shopsByStatus: Object.fromEntries(shops.map((r) => [r.status, r._count._all])),
      usersByType: Object.fromEntries(users.map((r) => [r.type, r._count._all])),
      activeStorefronts: storefronts,
      publishedListings: listings,
      orders30d: {
        count: orders.reduce((a, r) => a + Number(r.count), 0),
        grossOrderValue: orders.reduce((a, r) => a + Number(s(r.gmv)), 0).toFixed(2),
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        daily: orders.map((r) => ({ day: r.day.toISOString().slice(0, 10), count: Number(r.count), gmv: s(r.gmv) })),
      },
    };
  }

  // ----------------------------------------------------------- users (A1.1)

  @Get('users')
  @AdminRoute(PP.USERS_MANAGE)
  async users(@ZQuery(schemas.adminUserListQuery) q: z.infer<typeof schemas.adminUserListQuery>) {
    const rows = await this.prisma.user.findMany({
      where: {
        ...(q.type ? { type: q.type } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q.toLowerCase() } }, { phone: { contains: q.q } }] } : {}),
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      // Never select passwordHash / 2FA secrets (§A1.1).
      select: { id: true, type: true, fullName: true, email: true, phone: true, status: true, suspendedReason: true, lastLoginAt: true, createdAt: true, _count: { select: { memberships: true, orders: true } } },
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  @Patch('users/:userId/status')
  @AdminRoute(PP.USERS_MANAGE)
  async setUserStatus(@Admin() admin: AdminContext, @IdParam('userId') userId: string, @ZBody(schemas.adminUserStatusSchema) dto: z.infer<typeof schemas.adminUserStatusSchema>) {
    if (userId === admin.adminUserId) throw new AppError(ErrorCode.PRIVILEGE_ESCALATION, { reason: 'self_update' });
    return this.prisma.tx(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: { status: true, type: true } });
      if (!before) throw notFound('user');
      const after = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status, suspendedReason: dto.status === 'SUSPENDED' ? dto.reason : null },
        select: { id: true, status: true, suspendedReason: true },
      });
      if (dto.status === 'SUSPENDED') {
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'admin_suspended' } });
      }
      await this.audit.logAdmin({ adminUserId: admin.adminUserId, permissionCode: PP.USERS_MANAGE, action: dto.status === 'SUSPENDED' ? 'user.suspend' : 'user.reactivate', targetType: 'user', targetId: userId, reason: dto.reason, before, after }, tx);
      return after;
    });
  }

  // ----------------------------------------------------------- plans & subscriptions (FR-074, FR-075)

  @Get('plans')
  @AdminRoute(PP.PLANS_MANAGE)
  plans() {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { subscriptions: true } } } });
  }

  @Patch('plans/:planId')
  @AdminRoute(PP.PLANS_MANAGE)
  async updatePlan(@Admin() admin: AdminContext, @IdParam('planId') planId: string, @ZBody(schemas.adminPlanUpdateSchema) dto: z.infer<typeof schemas.adminPlanUpdateSchema>) {
    const { reason, ...data } = dto;
    return this.prisma.tx(async (tx) => {
      const before = await tx.plan.findUnique({ where: { id: planId } });
      if (!before) throw notFound('plan');
      const after = await tx.plan.update({ where: { id: planId }, data });
      await this.audit.logAdmin({ adminUserId: admin.adminUserId, permissionCode: PP.PLANS_MANAGE, action: 'plan.update', targetType: 'plan', targetId: planId, reason, before, after }, tx);
      return after;
    });
  }

  @Patch('shops/:shopId/subscription')
  @AdminRoute(PP.PLANS_MANAGE)
  async updateSubscription(@Admin() admin: AdminContext, @IdParam('shopId') shopId: string, @ZBody(schemas.adminSubscriptionSchema) dto: z.infer<typeof schemas.adminSubscriptionSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.subscription.findUnique({ where: { shopId } });
      if (!before) throw notFound('subscription');
      if (dto.planId && !(await tx.plan.findUnique({ where: { id: dto.planId } }))) throw notFound('plan');
      const after = await tx.subscription.update({
        where: { shopId },
        data: {
          ...(dto.planId ? { planId: dto.planId } : {}),
          ...(dto.status ? { status: dto.status, ...(dto.status === 'CANCELLED' ? { cancelledAt: new Date() } : {}) } : {}),
          ...(dto.currentPeriodEnd ? { currentPeriodEnd: new Date(dto.currentPeriodEnd) } : {}),
        },
        include: { plan: { select: { code: true } } },
      });
      await this.audit.logAdmin({ adminUserId: admin.adminUserId, permissionCode: PP.PLANS_MANAGE, action: 'subscription.update', targetType: 'subscription', targetId: after.id, targetShopId: shopId, reason: dto.reason, before, after }, tx);
      return after;
    });
  }

  // ----------------------------------------------------------- listing moderation (FR-098, FR-133)

  @Get('products')
  @AdminRoute(PP.STOREFRONTS_MODERATE)
  async products(@ZQuery(schemas.adminProductListQuery) q: z.infer<typeof schemas.adminProductListQuery>) {
    const rows = await this.prisma.product.findMany({
      where: {
        isPublishedOnline: true,
        ...(q.moderationStatus ? { moderationStatus: q.moderationStatus } : {}),
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true, name: true, slug: true, sellingRate: true, priceUnitCode: true, moderationStatus: true, moderationReason: true, publishedAt: true,
        shop: { select: { id: true, name: true, storefront: { select: { slug: true } } } },
        images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1, select: { thumbnailKey: true } },
      },
    });
    const items = rows.slice(0, q.limit).map(({ images, ...p }) => ({ ...p, thumbnailUrl: this.storage.publicUrl(images[0]?.thumbnailKey) }));
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  @Patch('products/:productId/moderation')
  @AdminRoute(PP.STOREFRONTS_MODERATE)
  async moderateProduct(@Admin() admin: AdminContext, @IdParam('productId') id: string, @ZBody(schemas.adminModerationSchema) dto: z.infer<typeof schemas.adminModerationSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.product.findUnique({ where: { id }, select: { shopId: true, moderationStatus: true, moderationReason: true } });
      if (!before) throw notFound('product');
      const after = await tx.product.update({
        where: { id },
        data: { moderationStatus: dto.moderationStatus, moderationReason: dto.moderationStatus === 'VISIBLE' ? null : dto.reason },
        select: { id: true, moderationStatus: true, moderationReason: true },
      });
      const action = dto.moderationStatus === 'VISIBLE' ? 'RESTORE' : dto.moderationStatus === 'HIDDEN' ? 'HIDE' : 'REMOVE';
      await tx.moderationAction.create({ data: { adminUserId: admin.adminUserId, targetType: 'PRODUCT', targetId: id, action, reason: dto.reason } });
      await this.audit.logAdmin({ adminUserId: admin.adminUserId, permissionCode: PP.STOREFRONTS_MODERATE, action: `product.moderation.${action.toLowerCase()}`, targetType: 'product', targetId: id, targetShopId: before.shopId, reason: dto.reason, before, after }, tx);
      return after;
    });
  }

  // ----------------------------------------------------------- audit (FR-077, FR-084, AC-029)

  @Get('audit-logs')
  @AdminRoute(PP.AUDIT_VIEW)
  async auditLogs(@ZQuery(schemas.adminAuditQuery) q: z.infer<typeof schemas.adminAuditQuery>) {
    const range = q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {};
    const page = { orderBy: { id: 'desc' as const }, take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) };
    const rows =
      q.kind === 'admin'
        ? await this.prisma.adminAuditLog.findMany({
            where: { ...(q.actorUserId ? { adminUserId: q.actorUserId } : {}), ...(q.action ? { action: { startsWith: q.action } } : {}), ...(q.shopId ? { targetShopId: q.shopId } : {}), ...(q.targetType ? { targetType: q.targetType } : {}), ...range },
            include: { admin: { select: { id: true, fullName: true } } },
            ...page,
          })
        : await this.prisma.auditLog.findMany({
            where: { ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}), ...(q.action ? { action: { startsWith: q.action } } : {}), ...(q.shopId ? { shopId: q.shopId } : {}), ...(q.targetType ? { targetType: q.targetType } : {}), ...range },
            include: { actor: { select: { id: true, fullName: true } }, shop: { select: { id: true, name: true } } },
            ...page,
          });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }
}
