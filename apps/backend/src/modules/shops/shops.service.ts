import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ALL_SHOP_PERMISSIONS, ROLE_PRESETS, STANDARD_UNITS, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AuditService } from '../../common/audit/audit.service';
import { notFound, AppError } from '../../common/errors/app-error';
import { PlanLimitService } from '../../common/plan/plan-limit.service';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import type { AuthUser } from '../../common/auth/auth.decorators';
import { ErrorCode } from '@fabnix/shared';

type CreateShop = z.infer<typeof schemas.createShopSchema>;

@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Shop onboarding: one transaction creates the tenant, settings, default
   * branch, permission-preset roles, owner membership, standard length units
   * (NO Gira — the owner must configure it, FR-013), default payment methods
   * and a trial subscription.
   */
  async create(user: AuthUser, dto: CreateShop) {
    const shop = await this.prisma.tx(async (tx) => {
      const code = dto.code ?? (await this.generateCode(tx, dto.name));
      const created = await tx.shop.create({
        data: {
          ownerUserId: user.id,
          name: dto.name,
          legalName: dto.legalName,
          code,
          phone: dto.phone,
          email: dto.email,
          addressLine: dto.addressLine,
          city: dto.city,
          district: dto.district,
          postalCode: dto.postalCode,
          country: dto.country,
          timezone: dto.timezone,
          currency: dto.currency,
          defaultLanguage: dto.defaultLanguage,
          businessCategory: dto.businessCategory,
          status: this.config.shopAutoApprove ? 'ACTIVE' : 'PENDING_APPROVAL',
        },
      });
      await tx.shopSettings.create({
        data: {
          shopId: created.id,
          defaultInvoiceLanguage: dto.defaultLanguage,
          numberLocale: dto.defaultLanguage === 'bn' ? 'bn-BD' : 'en-IN',
          currencyPrecision: dto.currency === 'BDT' ? 2 : 2,
        },
      });
      // Default records are shop content, created in the shop's chosen language.
      const bn = dto.defaultLanguage === 'bn';
      await tx.branch.create({ data: { shopId: created.id, name: bn ? 'প্রধান শাখা' : 'Main Branch', code: 'MAIN', isDefault: true } });

      let ownerRoleId = '';
      for (const preset of ROLE_PRESETS) {
        const role = await tx.shopRole.create({
          data: { shopId: created.id, name: preset.name, presetKey: preset.key, isOwnerRole: preset.isOwnerRole, isSystem: true },
        });
        await tx.shopRolePermission.createMany({
          data: preset.permissions.map((permissionCode) => ({ shopId: created.id, roleId: role.id, permissionCode })),
        });
        if (preset.isOwnerRole) ownerRoleId = role.id;
      }
      await tx.shopMember.create({ data: { shopId: created.id, userId: user.id, roleId: ownerRoleId, isOwner: true, allBranches: true } });

      await tx.measurementUnit.createMany({
        data: STANDARD_UNITS.map((u) => ({
          shopId: created.id,
          code: u.code,
          kind: u.kind,
          name: u.name,
          nameKey: u.nameKey,
          symbol: u.symbol,
          inchesPerUnit: u.inchesPerUnit,
          isStandard: true,
          sortOrder: u.sortOrder,
          createdById: user.id,
        })),
      });

      await tx.shopPaymentMethod.createMany({
        data: [
          { shopId: created.id, type: 'CASH', label: bn ? 'নগদ' : 'Cash', availableInPos: true, availableOnline: false, sortOrder: 0 },
          { shopId: created.id, type: 'CASH_ON_DELIVERY', label: bn ? 'ক্যাশ অন ডেলিভারি' : 'Cash on Delivery', availableInPos: false, availableOnline: true, sortOrder: 1 },
        ],
      });

      const trial = await tx.plan.findUnique({ where: { code: 'TRIAL' } });
      if (trial) {
        const now = new Date();
        const end = new Date(now.getTime() + trial.trialDays * 86_400_000);
        await tx.subscription.create({
          data: { shopId: created.id, planId: trial.id, status: 'TRIALING', trialEndsAt: end, currentPeriodStart: now, currentPeriodEnd: end },
        });
      }

      await this.audit.log(
        { shopId: created.id, actorUserId: user.id, actorType: 'SHOPKEEPER', action: 'shop.create', targetType: 'shop', targetId: created.id, after: { name: created.name, code } },
        tx,
      );
      return created;
    });
    return this.get(shop.id);
  }

  async get(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { settings: true, branches: { where: { status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'asc' } }, subscription: { include: { plan: true } } },
    });
    if (!shop) throw notFound('shop');
    return shop;
  }

  async myAccess(ctx: ShopContext) {
    const [shop, s, member] = await Promise.all([
      this.prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId }, select: { id: true, name: true, code: true, status: true, currency: true, timezone: true, logoKey: true } }),
      this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } }),
      this.prisma.shopMember.findUniqueOrThrow({ where: { id: ctx.memberId }, include: { role: { select: { name: true, presetKey: true } } } }),
    ]);
    return {
      shop,
      role: member.role,
      isOwner: ctx.isOwner,
      permissions: ctx.isOwner ? ALL_SHOP_PERMISSIONS : [...ctx.permissions],
      allBranches: ctx.allBranches,
      branchIds: [...ctx.branchIds],
      pos: {
        currencyPrecision: s.currencyPrecision,
        roundingMode: s.roundingMode,
        taxMode: s.taxMode,
        defaultTaxRate: s.defaultTaxRate.toString(),
        cashRounding: s.cashRounding,
        defaultDisplayUnitCode: s.defaultDisplayUnitCode,
        lengthDisplayPrecision: s.lengthDisplayPrecision,
        numberLocale: s.numberLocale,
        defaultInvoiceLanguage: s.defaultInvoiceLanguage,
        allowPartialPayment: s.allowPartialPayment,
        allowDueSales: s.allowDueSales,
      },
    };
  }

  async update(ctx: ShopContext, dto: z.infer<typeof schemas.updateShopSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.shop.findUniqueOrThrow({ where: { id: ctx.shopId } });
      const after = await tx.shop.update({ where: { id: ctx.shopId }, data: dto });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'shop.update', targetType: 'shop', targetId: ctx.shopId, before, after }, tx);
      return after;
    });
  }

  async getSettings(shopId: string) {
    return this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId } });
  }

  async updateSettings(ctx: ShopContext, dto: z.infer<typeof schemas.updateShopSettingsSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } });
      if (dto.defaultDisplayUnitCode) {
        const unit = await tx.measurementUnit.findFirst({ where: { shopId: ctx.shopId, code: dto.defaultDisplayUnitCode, isActive: true } });
        if (!unit) throw new AppError(ErrorCode.UNIT_NOT_AVAILABLE, { unit: dto.defaultDisplayUnitCode });
      }
      const { businessHours, ...rest } = dto;
      const after = await tx.shopSettings.update({
        where: { shopId: ctx.shopId },
        data: { ...rest, ...(businessHours !== undefined ? { businessHours: businessHours ?? undefined } : {}) },
      });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'shop.settings.update', targetType: 'shop_settings', targetId: ctx.shopId, before, after }, tx);
      return after;
    });
  }

  // --- branches (FR-010) ---

  listBranches(ctx: ShopContext) {
    return this.prisma.branch.findMany({
      where: { shopId: ctx.shopId, ...(ctx.allBranches ? {} : { id: { in: [...ctx.branchIds] } }) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBranch(ctx: ShopContext, dto: z.infer<typeof schemas.branchSchema>) {
    return this.prisma.tx(async (tx) => {
      await this.plans.assertWithin(ctx.shopId, 'maxBranches', tx);
      if (dto.isDefault) await tx.branch.updateMany({ where: { shopId: ctx.shopId, isDefault: true }, data: { isDefault: false } });
      const branch = await tx.branch.create({ data: { shopId: ctx.shopId, ...dto, isDefault: dto.isDefault ?? false } });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'branch.create', targetType: 'branch', targetId: branch.id, after: branch }, tx);
      return branch;
    });
  }

  async updateBranch(ctx: ShopContext, branchId: string, dto: z.infer<typeof schemas.updateBranchSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.branch.findFirst({ where: { id: branchId, shopId: ctx.shopId } });
      if (!before) throw notFound('branch');
      if (dto.isDefault) await tx.branch.updateMany({ where: { shopId: ctx.shopId, isDefault: true, id: { not: branchId } }, data: { isDefault: false } });
      if (before.isDefault && dto.status && dto.status !== 'ACTIVE') throw new AppError(ErrorCode.VALIDATION_FAILED, { reason: 'default_branch_must_stay_active' });
      const after = await tx.branch.update({ where: { id: branchId }, data: dto });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'branch.update', targetType: 'branch', targetId: branchId, before, after }, tx);
      return after;
    });
  }

  // --- payment methods (FR-039) ---

  listPaymentMethods(shopId: string) {
    return this.prisma.shopPaymentMethod.findMany({ where: { shopId }, orderBy: { sortOrder: 'asc' } });
  }

  async createPaymentMethod(ctx: ShopContext, dto: z.infer<typeof schemas.paymentMethodSchema>) {
    const m = await this.prisma.shopPaymentMethod.create({ data: { shopId: ctx.shopId, ...dto } });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'payment_method.create', targetType: 'payment_method', targetId: m.id, after: m });
    return m;
  }

  async updatePaymentMethod(ctx: ShopContext, id: string, dto: z.infer<typeof schemas.updatePaymentMethodSchema>) {
    const before = await this.prisma.shopPaymentMethod.findFirst({ where: { id, shopId: ctx.shopId } });
    if (!before) throw notFound('payment_method');
    const after = await this.prisma.shopPaymentMethod.update({ where: { id }, data: dto });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'payment_method.update', targetType: 'payment_method', targetId: id, before, after });
    return after;
  }

  private async generateCode(tx: Tx, name: string): Promise<string> {
    const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'SHOP';
    for (let i = 0; i < 10; i++) {
      const code = `${letters}${randomInt(10, 99)}`.slice(0, 12);
      if (!(await tx.shop.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
    return `S${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
  }
}
