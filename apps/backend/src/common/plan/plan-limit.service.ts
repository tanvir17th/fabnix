import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@fabnix/shared';
import { AppError } from '../errors/app-error';
import { Db, PrismaService } from '../prisma/prisma.service';

type Limit = 'maxBranches' | 'maxProducts' | 'maxUsers';

/** Enforces subscription plan limits and feature flags (FR-074, FR-076, FR-086). */
@Injectable()
export class PlanLimitService {
  constructor(private readonly prisma: PrismaService) {}

  private async plan(shopId: string, db: Db) {
    const sub = await db.subscription.findUnique({ where: { shopId }, include: { plan: true } });
    return sub;
  }

  async assertWithin(shopId: string, limit: Limit, db: Db = this.prisma): Promise<void> {
    const sub = await this.plan(shopId, db);
    if (!sub) return;
    if (sub.status === 'SUSPENDED' || sub.status === 'EXPIRED' || sub.status === 'CANCELLED') {
      throw new AppError(ErrorCode.PLAN_FEATURE_UNAVAILABLE, { subscription: sub.status });
    }
    const max = sub.plan[limit];
    if (max === null || max === undefined) return;
    const used =
      limit === 'maxBranches'
        ? await db.branch.count({ where: { shopId, status: { not: 'ARCHIVED' } } })
        : limit === 'maxProducts'
          ? await db.product.count({ where: { shopId, status: { not: 'ARCHIVED' } } })
          : await db.shopMember.count({ where: { shopId, status: { in: ['ACTIVE', 'INVITED'] } } });
    if (used >= max) throw new AppError(ErrorCode.PLAN_LIMIT_REACHED, { limit, max });
  }

  async maxImagesPerProduct(shopId: string, db: Db = this.prisma): Promise<number> {
    return (await this.plan(shopId, db))?.plan.maxImagesPerProduct ?? 8;
  }

  /** Online store requires an active-ish subscription whose plan enables it. */
  async onlineStoreAllowed(shopId: string, db: Db = this.prisma): Promise<boolean> {
    const sub = await this.plan(shopId, db);
    if (!sub) return true;
    return sub.plan.onlineStoreEnabled && ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(sub.status);
  }
}
