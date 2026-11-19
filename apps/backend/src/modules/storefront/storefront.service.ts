import { Injectable } from '@nestjs/common';
import { ErrorCode, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { PlanLimitService } from '../../common/plan/plan-limit.service';
import { Db, PrismaService } from '../../common/prisma/prisma.service';
import { ShopContext } from '../../common/tenancy/shop-context';

/** FR-088 — slugs that would collide with platform routes or impersonate FABNIX. */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'apps', 'assets', 'auth', 'billing', 'blog', 'business', 'cart', 'checkout', 'dashboard', 'docs',
  'fabnix', 'help', 'login', 'logout', 'media', 'me', 'new', 'null', 'official', 'orders', 'pricing', 'privacy', 'register',
  'root', 'seller', 'settings', 'shop', 'shops', 'signup', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'www',
]);

export interface StoreState {
  storefront: Prisma.StorefrontGetPayload<object>;
  shop: { id: string; status: string; currency: string; timezone: string; name: string; code: string };
  /** Visible to the public (PUBLISHED or PAUSED, enabled, not suspended). */
  visible: boolean;
  /** Accepting new orders right now (FR-089, AC-028). */
  orderable: boolean;
}

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanLimitService,
  ) {}

  /** Single source of truth for public visibility & orderability. */
  async state(slug: string, db: Db = this.prisma): Promise<StoreState | null> {
    const sf = await db.storefront.findUnique({ where: { slug: slug.toLowerCase() }, include: { shop: { select: { id: true, status: true, currency: true, timezone: true, name: true, code: true } } } });
    if (!sf) return null;
    const { shop, ...storefront } = sf;
    const baseOk = sf.isEnabled && !sf.adminSuspended && shop.status === 'ACTIVE';
    const visible = baseOk && (sf.status === 'PUBLISHED' || sf.status === 'PAUSED');
    const orderable = visible && sf.status === 'PUBLISHED' && sf.acceptingOrders && (await this.plans.onlineStoreAllowed(shop.id, db));
    return { storefront, shop, visible, orderable };
  }

  get(shopId: string) {
    return this.prisma.storefront.findUnique({ where: { shopId } });
  }

  async upsert(ctx: ShopContext, dto: z.infer<typeof schemas.updateStorefrontSchema>) {
    if (dto.slug && RESERVED_SLUGS.has(dto.slug)) throw new AppError(ErrorCode.SLUG_RESERVED, { slug: dto.slug });
    if (dto.fulfilmentBranchId) {
      const b = await this.prisma.branch.findFirst({ where: { id: dto.fulfilmentBranchId, shopId: ctx.shopId, status: 'ACTIVE' } });
      if (!b) throw notFound('branch');
    }
    try {
      const before = await this.prisma.storefront.findUnique({ where: { shopId: ctx.shopId } });
      let after;
      if (!before) {
        if (!dto.slug || !dto.displayName) throw new AppError(ErrorCode.VALIDATION_FAILED, { required: ['slug', 'displayName'] });
        const branch = dto.fulfilmentBranchId ?? (await this.prisma.branch.findFirstOrThrow({ where: { shopId: ctx.shopId, isDefault: true } })).id;
        after = await this.prisma.storefront.create({ data: { ...dto, slug: dto.slug, displayName: dto.displayName, shopId: ctx.shopId, fulfilmentBranchId: branch } });
      } else {
        after = await this.prisma.storefront.update({ where: { shopId: ctx.shopId }, data: dto });
      }
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: before ? 'storefront.update' : 'storefront.create', targetType: 'storefront', targetId: after.id, before, after });
      return after;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError(ErrorCode.SLUG_TAKEN, { slug: dto.slug ?? '' });
      throw e;
    }
  }

  /** FR-086 / FR-089: enable/disable, publish/unpublish, pause. */
  async setVisibility(ctx: ShopContext, action: 'ENABLE' | 'DISABLE' | 'PUBLISH' | 'UNPUBLISH' | 'PAUSE') {
    const sf = await this.prisma.storefront.findUnique({ where: { shopId: ctx.shopId } });
    if (!sf) throw notFound('storefront');
    if (action === 'ENABLE' || action === 'PUBLISH') {
      if (ctx.shopStatus !== 'ACTIVE') throw new AppError(ErrorCode.SHOP_NOT_ACTIVE, { status: ctx.shopStatus });
      if (!(await this.plans.onlineStoreAllowed(ctx.shopId))) throw new AppError(ErrorCode.PLAN_FEATURE_UNAVAILABLE, { feature: 'online_store' });
      if (sf.adminSuspended) throw new AppError(ErrorCode.STOREFRONT_NOT_AVAILABLE, { reason: 'suspended' });
    }
    if (action === 'PUBLISH') {
      const missing: string[] = [];
      if (!sf.isEnabled) missing.push('enabled');
      if (!(await this.prisma.deliveryOption.count({ where: { shopId: ctx.shopId, isActive: true } }))) missing.push('delivery_option');
      if (!(await this.prisma.shopPaymentMethod.count({ where: { shopId: ctx.shopId, isActive: true, availableOnline: true } }))) missing.push('online_payment_method');
      if (missing.length) throw new AppError(ErrorCode.STOREFRONT_NOT_AVAILABLE, { missing });
    }
    const data: Prisma.StorefrontUpdateInput =
      action === 'ENABLE'
        ? { isEnabled: true }
        : action === 'DISABLE'
          ? { isEnabled: false, status: 'UNPUBLISHED' }
          : action === 'PUBLISH'
            ? { status: 'PUBLISHED', publishedAt: sf.publishedAt ?? new Date() }
            : action === 'UNPUBLISH'
              ? { status: 'UNPUBLISHED' }
              : { status: 'PAUSED' };
    const after = await this.prisma.storefront.update({ where: { id: sf.id }, data });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: `storefront.${action.toLowerCase()}`, targetType: 'storefront', targetId: sf.id, before: { isEnabled: sf.isEnabled, status: sf.status }, after: { isEnabled: after.isEnabled, status: after.status } });
    return after;
  }

  // --- delivery options (FR-090, FR-104, FR-127) ---

  listDelivery(shopId: string) {
    return this.prisma.deliveryOption.findMany({ where: { shopId }, orderBy: { sortOrder: 'asc' } });
  }

  async createDelivery(ctx: ShopContext, dto: z.infer<typeof schemas.deliveryOptionSchema>) {
    if (dto.chargeType === 'FREE_OVER_THRESHOLD' && !dto.freeOverAmount) throw new AppError(ErrorCode.VALIDATION_FAILED, { field: 'freeOverAmount' });
    const o = await this.prisma.deliveryOption.create({ data: { shopId: ctx.shopId, ...dto } });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'delivery_option.create', targetType: 'delivery_option', targetId: o.id, after: o });
    return o;
  }

  async updateDelivery(ctx: ShopContext, id: string, dto: z.infer<typeof schemas.updateDeliveryOptionSchema>) {
    const before = await this.prisma.deliveryOption.findFirst({ where: { id, shopId: ctx.shopId } });
    if (!before) throw notFound('delivery_option');
    const after = await this.prisma.deliveryOption.update({ where: { id }, data: dto });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'delivery_option.update', targetType: 'delivery_option', targetId: id, before, after });
    return after;
  }
}
