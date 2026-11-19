import { Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformPermission as PP, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { notFound } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Admin, AdminContext, AdminRoute } from '../../common/tenancy/admin-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';

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
}
