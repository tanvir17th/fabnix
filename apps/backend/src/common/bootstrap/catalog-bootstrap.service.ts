import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ALL_PLATFORM_PERMISSIONS, ALL_SHOP_PERMISSIONS, SENSITIVE_PERMISSIONS, permissionLabelKey } from '@fabnix/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Placeholder plans (SRS §15 decision #7 — prices must be market-validated).
 * Limits are enforced by PlanLimitService.
 */
export const DEFAULT_PLANS = [
  { code: 'TRIAL', nameKey: 'plans.trial', priceMonthly: '0', priceYearly: '0', trialDays: 14, maxUsers: 5, maxBranches: 2, maxProducts: 500, maxStorageMb: 1024, sortOrder: 0, isPublic: false },
  { code: 'STARTER', nameKey: 'plans.starter', priceMonthly: '999', priceYearly: '9990', trialDays: 14, maxUsers: 3, maxBranches: 1, maxProducts: 300, maxStorageMb: 1024, sortOrder: 1, isPublic: true },
  { code: 'GROWTH', nameKey: 'plans.growth', priceMonthly: '2499', priceYearly: '24990', trialDays: 14, maxUsers: 10, maxBranches: 3, maxProducts: 3000, maxStorageMb: 10240, sortOrder: 2, isPublic: true },
  { code: 'BUSINESS', nameKey: 'plans.business', priceMonthly: '5999', priceYearly: '59990', trialDays: 14, maxUsers: null, maxBranches: 10, maxProducts: null, maxStorageMb: 51200, sortOrder: 3, isPublic: true },
] as const;

/** Idempotently upserts the permission catalog and default plans on boot. */
@Injectable()
export class CatalogBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensure();
  }

  async ensure(): Promise<void> {
    await this.prisma.permission.createMany({
      data: [
        ...ALL_SHOP_PERMISSIONS.map((code) => ({ code, scope: 'SHOP' as const, labelKey: permissionLabelKey(code), isSensitive: SENSITIVE_PERMISSIONS.has(code) })),
        ...ALL_PLATFORM_PERMISSIONS.map((code) => ({ code, scope: 'PLATFORM' as const, labelKey: permissionLabelKey(code), isSensitive: true })),
      ],
      skipDuplicates: true,
    });
    await this.prisma.plan.createMany({ data: DEFAULT_PLANS.map((p) => ({ ...p })), skipDuplicates: true });
    this.logger.log('Permission catalog and plans ensured');
  }
}
