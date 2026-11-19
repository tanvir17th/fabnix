import { Injectable } from '@nestjs/common';
import { D, ErrorCode, ShopPermission, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import { UnitsService } from '../measurement/units.service';
import { StockService, available } from './stock.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly units: UnitsService,
    private readonly audit: AuditService,
  ) {}

  /** Stock on hand per branch with low-stock flags (FR-032, FR-068). */
  async list(ctx: ShopContext, q: z.infer<typeof schemas.inventoryListQuery>) {
    if (q.branchId) ctx.requireBranch(q.branchId);
    const settings = await this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } });
    const where: Prisma.InventoryWhereInput = {
      shopId: ctx.shopId,
      ...(q.branchId ? { branchId: q.branchId } : ctx.allBranches ? {} : { branchId: { in: [...ctx.branchIds] } }),
      product: {
        status: { not: 'ARCHIVED' },
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
    };
    const rows = await this.prisma.inventory.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true, priceUnitCode: true, lowStockThresholdInches: true } }, branch: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const mapped = rows.slice(0, q.limit).map((r) => {
      const avail = D(r.onHandInches.toString()).minus(r.reservedInches.toString());
      const threshold = D((r.product.lowStockThresholdInches ?? settings.defaultLowStockInches).toString());
      return {
        id: r.id,
        branch: r.branch,
        product: { id: r.product.id, name: r.product.name, sku: r.product.sku },
        onHandInches: r.onHandInches.toFixed(4),
        reservedInches: r.reservedInches.toFixed(4),
        availableInches: avail.toFixed(4),
        availableYards: avail.div(36).toFixed(settings.lengthDisplayPrecision),
        lowStockThresholdInches: threshold.toFixed(4),
        lowStock: avail.lessThan(threshold),
        valuation: D(r.onHandInches.toString()).times(r.avgCostPerInch.toString()).toFixed(2),
      };
    });
    const items = q.lowStockOnly ? mapped.filter((m) => m.lowStock) : mapped;
    return { items, nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null };
  }

  async ledger(ctx: ShopContext, productId: string, q: { branchId?: string; cursor?: string; limit: number }) {
    if (q.branchId) ctx.requireBranch(q.branchId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId: ctx.shopId }, select: { id: true } });
    if (!product) throw notFound('product');
    const rows = await this.prisma.stockMovement.findMany({
      where: { shopId: ctx.shopId, productId, ...(q.branchId ? { branchId: q.branchId } : ctx.allBranches ? {} : { branchId: { in: [...ctx.branchIds] } }) },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  /** FR-026 — once per (branch, product); later corrections are adjustments. */
  async opening(ctx: ShopContext, dto: z.infer<typeof schemas.openingStockSchema>) {
    ctx.requireBranch(dto.branchId);
    return this.prisma.tx(async (tx) => {
      const [branch, product] = await Promise.all([
        tx.branch.findFirst({ where: { id: dto.branchId, shopId: ctx.shopId } }),
        tx.product.findFirst({ where: { id: dto.productId, shopId: ctx.shopId } }),
      ]);
      if (!branch) throw notFound('branch');
      if (!product) throw notFound('product');
      const table = await this.units.table(ctx.shopId, 'ANY', tx);
      const measured = table.resolve(dto.measurement);
      const stocks = await this.stock.lock(tx, ctx.shopId, dto.branchId, [dto.productId]);
      const s = stocks.get(dto.productId)!;
      const prior = await tx.stockMovement.count({ where: { shopId: ctx.shopId, branchId: dto.branchId, productId: dto.productId } });
      if (prior > 0) throw new AppError(ErrorCode.CONFLICT, { reason: 'opening_already_recorded' });
      const costPerInch = dto.unitCostPerPriceUnit
        ? D(dto.unitCostPerPriceUnit).div(D(table.priceUnit(product.priceUnitCode).inchesPerUnit))
        : product.purchaseRate
          ? D(product.purchaseRate.toString()).div(D(table.priceUnit(product.priceUnitCode).inchesPerUnit))
          : undefined;
      const mv = await this.stock.apply(tx, s, {
        type: 'OPENING',
        deltaOnHand: measured.inches,
        unitCostPerInch: costPerInch?.toDecimalPlaces(6),
        actorUserId: ctx.userId,
        reason: 'opening_stock',
      });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'stock.opening', targetType: 'stock_movement', targetId: mv.id, after: { productId: dto.productId, branchId: dto.branchId, inches: measured.inches.toFixed(4) } }, tx);
      return { movementId: mv.id, onHandInches: s.onHand.toFixed(4), availableInches: available(s).toFixed(4) };
    });
  }

  /** FR-027 adjustments/damage with mandatory reason, audited (§10). */
  async adjust(ctx: ShopContext, dto: z.infer<typeof schemas.stockAdjustmentSchema>) {
    ctx.requireBranch(dto.branchId);
    return this.prisma.tx(async (tx) => {
      const [branch, product, settings] = await Promise.all([
        tx.branch.findFirst({ where: { id: dto.branchId, shopId: ctx.shopId } }),
        tx.product.findFirst({ where: { id: dto.productId, shopId: ctx.shopId } }),
        tx.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } }),
      ]);
      if (!branch) throw notFound('branch');
      if (!product) throw notFound('product');
      const measured = (await this.units.table(ctx.shopId, 'ANY', tx)).resolve(dto.measurement);
      const s = (await this.stock.lock(tx, ctx.shopId, dto.branchId, [dto.productId])).get(dto.productId)!;
      const outbound = dto.type !== 'ADJUSTMENT_IN';
      if (outbound) {
        this.stock.assertAvailable(s, measured.inches, { allowNegative: settings.allowNegativeStock && ctx.can(ShopPermission.INVENTORY_OVERSELL) });
      }
      const before = { onHand: s.onHand.toFixed(4), reserved: s.reserved.toFixed(4) };
      const mv = await this.stock.apply(tx, s, {
        type: dto.type,
        deltaOnHand: outbound ? measured.inches.negated() : measured.inches,
        reason: dto.reason,
        actorUserId: ctx.userId,
      });
      await this.audit.log(
        { shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'stock.adjust', targetType: 'stock_movement', targetId: mv.id, reason: dto.reason, before, after: { onHand: s.onHand.toFixed(4), type: dto.type } },
        tx,
      );
      await this.stock.alertLowStock(tx, [s], settings.defaultLowStockInches.toString());
      return { movementId: mv.id, onHandInches: s.onHand.toFixed(4), availableInches: available(s).toFixed(4) };
    });
  }
}
