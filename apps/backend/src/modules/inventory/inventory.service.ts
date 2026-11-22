import { Injectable } from '@nestjs/common';
import { D, DecimalInput, ErrorCode, ShopPermission, round, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import { UnitsService } from '../measurement/units.service';
import { COST_DP, StockService, available } from './stock.service';

/**
 * Length × per-unit price, e.g. 10 yd on hand × ৳10/yd = ৳100.00. Computed from
 * the per-unit price with exact decimals and rounded ONCE (never via a rounded
 * per-inch rate, which drifted to 419,999.90 instead of 420,000.00).
 */
export function stockValue(inches: string, ratePerUnit: string | null, priceUnitInches: DecimalInput | undefined): string | null {
  if (ratePerUnit === null || ratePerUnit === undefined || !priceUnitInches) return null;
  return round(D(inches).div(D(priceUnitInches)).times(ratePerUnit), 2).toFixed(2);
}

/** Ledger movement types that ADD fabric to the shop (Total Fabric); PURCHASE_CANCEL_OUT undoes a purchase. */
const RECEIVED_IN = ['OPENING', 'PURCHASE_IN', 'ADJUSTMENT_IN', 'TRANSFER_IN'] as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly units: UnitsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Stock table (FR-032, FR-068) per product × branch:
   *  • Total fabric — everything ever added (opening + purchases + adjust-in + transfers in − reversed purchases)
   *  • On hand      — live ledger balance (= total fabric − sold − write-offs/adjust-out − transfers out)
   *  • Stock value  — on hand × current SELLING price
 *  • Total purchase value — total fabric × current PURCHASE price
   *  • Total profit — Σ sold lines (actual sold amount excl. tax − purchase cost); cost = recorded at sale,
   *                   else the fabric's current purchase price (same rule as the profit report)
   */
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
      include: {
        product: { select: { id: true, name: true, sku: true, priceUnitCode: true, purchaseRate: true, sellingRate: true, lowStockThresholdInches: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const productIds = [...new Set(page.map((r) => r.productId))];
    const table = await this.units.table(ctx.shopId, 'ANY');
    const [received, sold] = productIds.length ? await Promise.all([this.receivedTotals(ctx.shopId, productIds), this.soldTotals(ctx.shopId, productIds)]) : [new Map(), new Map()];

    const mapped = page.map((r) => {
      const key = `${r.branchId}:${r.productId}`;
      const unitInches = table.byCode(r.product.priceUnitCode)?.inchesPerUnit;
      const onHand = D(r.onHandInches.toString());
      const avail = onHand.minus(r.reservedInches.toString());
      const threshold = D((r.product.lowStockThresholdInches ?? settings.defaultLowStockInches).toString());
      const s = sold.get(key);
      return {
        id: r.id,
        branch: r.branch,
        product: { id: r.product.id, name: r.product.name, sku: r.product.sku },
        priceUnitCode: r.product.priceUnitCode,
        /** Total fabric ever added to this branch (inches). */
        totalReceivedInches: D(received.get(key) ?? '0').toFixed(4),
        /** Net sold length (POS + confirmed online orders, excl. cancelled) (inches). */
        soldInches: D(s?.inches ?? '0').toFixed(4),
        onHandInches: onHand.toFixed(4),
        /** Held for pending online orders; shown as a note, not a column. */
        reservedInches: r.reservedInches.toFixed(4),
        availableInches: avail.toFixed(4),
        lowStockThresholdInches: threshold.toFixed(4),
        lowStock: avail.lessThan(threshold),
        /** Per the product's price unit (e.g. per yard). */
        purchasePrice: r.product.purchaseRate ? D(r.product.purchaseRate.toString()).toFixed(2) : null,
        sellingPrice: D(r.product.sellingRate.toString()).toFixed(2),
        /** On hand × current selling price. */
        valuation: stockValue(onHand.toString(), r.product.sellingRate.toString(), unitInches),
        /** Total fabric × current purchase price (total cost of stock); null when no purchase price. */
        totalPurchaseValue: r.product.purchaseRate
          ? stockValue(D(received.get(key) ?? '0').toString(), r.product.purchaseRate.toString(), unitInches)
          : null,
        /** Realized profit from sold lines; null when some sold line has no cost basis at all. */
        totalProfit: s && s.uncosted > 0 ? null : round(D(s?.profit ?? '0'), 2).toFixed(2),
        uncostedSoldLines: s?.uncosted ?? 0,
      };
    });
    const items = q.lowStockOnly ? mapped.filter((m) => m.lowStock) : mapped;
    return { items, nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null };
  }

  /** Σ fabric added per branch × product from the append-only ledger. */
  private async receivedTotals(shopId: string, productIds: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<Array<{ branchId: string; productId: string; inches: string }>>`
      SELECT "branchId", "productId",
             coalesce(sum(CASE WHEN type::text = ANY(${[...RECEIVED_IN]}::text[]) THEN "deltaOnHandInches"
                               WHEN type = 'PURCHASE_CANCEL_OUT' THEN "deltaOnHandInches" ELSE 0 END), 0)::text AS inches
      FROM stock_movements
      WHERE "shopId" = ${shopId}::uuid AND "productId" = ANY(${productIds}::uuid[])
      GROUP BY "branchId", "productId"`;
    return new Map(rows.map((r) => [`${r.branchId}:${r.productId}`, r.inches]));
  }

  /**
   * Sold length and realized profit per branch × product.
   * Sold amount = line total − line tax (discounts already applied; invoice discount allocated per line),
   * pro-rated for returned length.
   * Cost = sold inches × (recorded cost per inch, else current purchase price ÷ inches per price unit).
   */
  private async soldTotals(shopId: string, productIds: string[]): Promise<Map<string, { inches: string; profit: string; uncosted: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ branchId: string; productId: string; inches: string; profit: string; uncosted: bigint }>>`
      WITH lines AS (
        SELECT sa."branchId", si."productId", si."totalLengthInches" - si."returnedInches" AS inches,
               (si."lineTotal" - si."taxAmount") * (si."totalLengthInches" - si."returnedInches") / nullif(si."totalLengthInches", 0) AS amount,
               si."costPerInch" AS recorded
        FROM sale_items si JOIN sales sa ON sa.id = si."saleId"
        WHERE sa."shopId" = ${shopId}::uuid AND si."productId" = ANY(${productIds}::uuid[])
          AND sa.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
        UNION ALL
        SELECT o."fulfilmentBranchId", oi."productId", oi."quantityInches" - oi."returnedInches",
               (oi."lineTotal" - oi."taxAmount") * (oi."quantityInches" - oi."returnedInches") / nullif(oi."quantityInches", 0), oi."costPerInch"
        FROM online_order_items oi JOIN online_orders o ON o.id = oi."orderId"
        WHERE o."shopId" = ${shopId}::uuid AND oi."productId" = ANY(${productIds}::uuid[])
          AND o."confirmedAt" IS NOT NULL AND o.status NOT IN ('CANCELLED','REJECTED')
      ), priced AS (
        SELECT l.*, coalesce(nullif(l.recorded, 0),
                 CASE WHEN p."purchaseRate" > 0 AND mu."inchesPerUnit" > 0 THEN p."purchaseRate" / mu."inchesPerUnit" END) AS cost
        FROM lines l
        JOIN products p ON p.id = l."productId"
        LEFT JOIN measurement_units mu ON mu."shopId" = p."shopId" AND mu.code = p."priceUnitCode" AND mu."isActive"
      )
      -- ::text keeps plain notation: a tiny residual would otherwise reach JS as "3.2e-8", which D() rejects.
      SELECT "branchId", "productId", coalesce(sum(inches), 0)::text AS inches,
             coalesce(sum(coalesce(amount, 0) - inches * coalesce(cost, 0)), 0)::text AS profit,
             count(*) FILTER (WHERE cost IS NULL) AS uncosted
      FROM priced GROUP BY "branchId", "productId"`;
    return new Map(rows.map((r) => [`${r.branchId}:${r.productId}`, { inches: r.inches, profit: r.profit, uncosted: Number(r.uncosted) }]));
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
        unitCostPerInch: costPerInch?.toDecimalPlaces(COST_DP),
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
