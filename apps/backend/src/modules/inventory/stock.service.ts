import { Injectable } from '@nestjs/common';
import { D, Decimal, DecimalInput, ErrorCode, ShopPermission, ZERO } from '@fabnix/shared';
import { AppError } from '../../common/errors/app-error';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { Tx } from '../../common/prisma/prisma.service';
import type { ActorType, StockMovementType } from '../../generated/prisma/client';

export interface LockedStock {
  inventoryId: string;
  shopId: string;
  branchId: string;
  productId: string;
  onHand: Decimal;
  reserved: Decimal;
  avgCostPerInch: Decimal;
  /** Available at lock time (for low-stock crossing detection). */
  readonly availableAtLock: Decimal;
}

export interface MovementInput {
  type: StockMovementType;
  deltaOnHand?: DecimalInput;
  deltaReserved?: DecimalInput;
  /** Cost per inch for inbound movements (opening/purchase) — updates moving average. */
  unitCostPerInch?: DecimalInput;
  saleItemId?: string;
  orderItemId?: string;
  reservationId?: string;
  purchaseItemId?: string;
  reversesMovementId?: string;
  reason?: string;
  actorUserId?: string | null;
  actorType?: ActorType;
}

const LEN = 4;

export const available = (s: LockedStock): Decimal => s.onHand.minus(s.reserved);

/**
 * THE single writer for `inventory` + `stock_movements` (FR-027, FR-119).
 *
 * Every caller (POS sale, order reserve/confirm/cancel, opening stock,
 * adjustments, purchases) must:
 *   1. call lock() inside its transaction — this takes SELECT … FOR UPDATE on
 *      the (branch, product) rows in a deterministic order (no deadlocks);
 *   2. validate availability on the LOCKED values;
 *   3. apply() movements, which update the row and append the ledger entry
 *      with balance-after values.
 * Because POS and online share the same rows and lock, they cannot oversell
 * each other (AC-023).
 */
@Injectable()
export class StockService {
  constructor(private readonly notifications: NotificationsService) {}

  async lock(tx: Tx, shopId: string, branchId: string, productIds: string[]): Promise<Map<string, LockedStock>> {
    const ids = [...new Set(productIds)].sort();
    if (!ids.length) return new Map();
    let rows = await this.select(tx, shopId, branchId, ids);
    if (rows.length < ids.length) {
      const have = new Set(rows.map((r) => r.productId));
      const missing = ids.filter((id) => !have.has(id));
      await tx.$executeRaw`
        INSERT INTO inventory (id, "shopId", "branchId", "productId", "updatedAt")
        SELECT gen_random_uuid(), ${shopId}::uuid, ${branchId}::uuid, p.id, now()
        FROM products p WHERE p."shopId" = ${shopId}::uuid AND p.id = ANY(${missing}::uuid[])
        ORDER BY p.id
        ON CONFLICT ("shopId", "branchId", "productId") DO NOTHING`;
      rows = await this.select(tx, shopId, branchId, ids);
    }
    const map = new Map<string, LockedStock>();
    for (const r of rows) {
      const onHand = D(String(r.onHandInches));
      const reserved = D(String(r.reservedInches));
      map.set(r.productId, {
        inventoryId: r.id,
        shopId,
        branchId,
        productId: r.productId,
        onHand,
        reserved,
        avgCostPerInch: D(String(r.avgCostPerInch)),
        availableAtLock: onHand.minus(reserved),
      });
    }
    return map;
  }

  private select(tx: Tx, shopId: string, branchId: string, ids: string[]) {
    return tx.$queryRaw<Array<{ id: string; productId: string; onHandInches: unknown; reservedInches: unknown; avgCostPerInch: unknown }>>`
      SELECT id, "productId", "onHandInches", "reservedInches", "avgCostPerInch"
      FROM inventory
      WHERE "shopId" = ${shopId}::uuid AND "branchId" = ${branchId}::uuid AND "productId" = ANY(${ids}::uuid[])
      ORDER BY "productId"
      FOR UPDATE`;
  }

  /** Throws STOCK_INSUFFICIENT (409, localized client-side) — AC-008. */
  assertAvailable(stock: LockedStock | undefined, required: DecimalInput, opts: { allowNegative?: boolean } = {}): void {
    if (!stock) throw new AppError(ErrorCode.STOCK_INSUFFICIENT, { availableInches: '0.0000' });
    const need = D(required);
    const avail = available(stock);
    if (need.greaterThan(avail) && !opts.allowNegative) {
      throw new AppError(ErrorCode.STOCK_INSUFFICIENT, {
        productId: stock.productId,
        availableInches: Decimal.max(avail, ZERO).toFixed(LEN),
        requestedInches: need.toFixed(LEN),
      });
    }
  }

  async apply(tx: Tx, stock: LockedStock, m: MovementInput): Promise<{ id: string }> {
    const dOn = D(m.deltaOnHand ?? 0);
    const dRes = D(m.deltaReserved ?? 0);
    const newOnHand = stock.onHand.plus(dOn);
    const newReserved = stock.reserved.plus(dRes);
    if (newReserved.isNegative()) throw new Error(`Reserved stock would go negative for ${stock.productId}`);

    let avg = stock.avgCostPerInch;
    if (m.unitCostPerInch !== undefined && dOn.greaterThan(0)) {
      const cost = D(m.unitCostPerInch);
      const base = Decimal.max(stock.onHand, ZERO);
      avg = base.plus(dOn).isZero() ? cost : base.times(avg).plus(dOn.times(cost)).div(base.plus(dOn)).toDecimalPlaces(6);
    }

    await tx.$executeRaw`
      UPDATE inventory
      SET "onHandInches" = ${newOnHand.toFixed(LEN)}::numeric,
          "reservedInches" = ${newReserved.toFixed(LEN)}::numeric,
          "avgCostPerInch" = ${avg.toFixed(6)}::numeric,
          "lastMovementAt" = now(), version = version + 1, "updatedAt" = now()
      WHERE id = ${stock.inventoryId}::uuid`;

    const movement = await tx.stockMovement.create({
      data: {
        shopId: stock.shopId,
        branchId: stock.branchId,
        productId: stock.productId,
        type: m.type,
        deltaOnHandInches: dOn.toFixed(LEN),
        deltaReservedInches: dRes.toFixed(LEN),
        onHandAfterInches: newOnHand.toFixed(LEN),
        reservedAfterInches: newReserved.toFixed(LEN),
        unitCostPerInch: m.unitCostPerInch !== undefined ? D(m.unitCostPerInch).toFixed(6) : dOn.isNegative() ? stock.avgCostPerInch.toFixed(6) : undefined,
        saleItemId: m.saleItemId,
        orderItemId: m.orderItemId,
        reservationId: m.reservationId,
        purchaseItemId: m.purchaseItemId,
        reversesMovementId: m.reversesMovementId,
        reason: m.reason,
        actorUserId: m.actorUserId ?? null,
        actorType: m.actorType ?? 'SHOPKEEPER',
      },
      select: { id: true },
    });

    stock.onHand = newOnHand;
    stock.reserved = newReserved;
    stock.avgCostPerInch = avg;
    return movement;
  }

  /**
   * Low-stock alert when available length crosses below the threshold within
   * this transaction (FR-031). Deduped per product per day.
   */
  async alertLowStock(tx: Tx, stocks: Iterable<LockedStock>, defaultThreshold: DecimalInput): Promise<void> {
    const list = [...stocks];
    if (!list.length) return;
    const products = await tx.product.findMany({
      where: { id: { in: list.map((s) => s.productId) } },
      select: { id: true, name: true, sku: true, lowStockThresholdInches: true },
    });
    const day = new Date().toISOString().slice(0, 10);
    for (const s of list) {
      const p = products.find((x) => x.id === s.productId);
      if (!p) continue;
      const threshold = D(p.lowStockThresholdInches?.toString() ?? D(defaultThreshold).toString());
      const now = available(s);
      if (now.lessThan(threshold) && s.availableAtLock.greaterThanOrEqualTo(threshold)) {
        await this.notifications.notifyShop(
          s.shopId,
          ShopPermission.INVENTORY_VIEW,
          {
            type: 'stock.low',
            params: { productId: p.id, productName: p.name, sku: p.sku, availableInches: now.toFixed(LEN), thresholdInches: threshold.toFixed(LEN), branchId: s.branchId },
            link: `/inventory?productId=${p.id}`,
            dedupeKey: `stock.low:${s.branchId}:${p.id}:${day}`,
          },
          tx,
        );
      }
    }
  }
}
