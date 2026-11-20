import { Injectable, Logger } from '@nestjs/common';
import {
  D,
  Decimal,
  ErrorCode,
  OrderActor,
  ShopPermission as P,
  ZERO,
  assertPaymentWithinDue,
  assertTransition,
  calculateInvoice,
  isDeductionPoint,
  schemas,
  sum,
  summarizePayment,
} from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import type { ActorType, DeliveryMethod, OrderStatus } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { DocumentSequenceService } from '../../common/sequences/document-sequence.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import type { AuthUser } from '../../common/auth/auth.decorators';
import { COST_DP, StockService } from '../inventory/stock.service';
import { UnitsService } from '../measurement/units.service';
import { policySnapshot, pricingPolicy } from '../sales/pricing-policy';
import { shopSnapshot } from '../sales/sales.service';
import { PublicCatalogService, publicProductWhere } from '../storefront/public-catalog.service';
import { StorefrontService } from '../storefront/storefront.service';

type Checkout = z.infer<typeof schemas.checkoutSchema>;

const orderInclude = {
  items: { orderBy: { lineNo: 'asc' } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
  reservations: true,
  delivery: true,
  payments: { orderBy: { receivedAt: 'asc' } },
  notes: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OnlineOrderInclude;

type LockedOrder = Prisma.OnlineOrderGetPayload<{ include: { items: true; reservations: true; delivery: true; payments: true } }>;

interface CartChange {
  cartItemId: string;
  productId: string;
  reason: string;
  unitRate?: string;
  lineTotal?: string;
}

class CartChangedError extends Error {
  constructor(readonly changes: CartChange[], readonly expectedTotal?: string, readonly actualTotal?: string) {
    super('CART_CHANGED');
  }
}

const actorOf = (t: OrderActor): ActorType => (t === 'SYSTEM' ? 'SYSTEM' : t);

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly units: UnitsService,
    private readonly catalog: PublicCatalogService,
    private readonly storefronts: StorefrontService,
    private readonly sequences: DocumentSequenceService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // Checkout (FR-102…FR-108, FR-118, AC-019, AC-020)
  // ===========================================================================

  async checkout(user: AuthUser, slug: string, dto: Checkout, idempotencyKey: string) {
    const store = await this.storefronts.state(slug);
    if (!store || !store.visible) throw notFound('storefront');
    const prior = await this.prisma.onlineOrder.findUnique({ where: { shopId_idempotencyKey: { shopId: store.shop.id, idempotencyKey } } });
    if (prior) {
      if (prior.customerUserId !== user.id) throw notFound('order');
      return this.customerOrder(user, prior.id);
    }
    try {
      const orderId = await this.prisma.tx((tx) => this.checkoutInTx(tx, user, slug, dto, idempotencyKey));
      return this.customerOrder(user, orderId);
    } catch (e) {
      if (e instanceof CartChangedError) {
        // Persist the newly displayed prices so the customer reviews the truth (FR-105).
        await this.prisma.$transaction(
          e.changes
            .filter((c) => c.unitRate && c.lineTotal)
            .map((c) => this.prisma.cartItem.update({ where: { id: c.cartItemId }, data: { displayedUnitRate: c.unitRate!, displayedLineTotal: c.lineTotal! } })),
        );
        throw new AppError(ErrorCode.CART_CHANGED, { changes: e.changes as unknown as Record<string, unknown>[], ...(e.actualTotal ? { total: e.actualTotal } : {}) });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.prisma.onlineOrder.findUnique({ where: { shopId_idempotencyKey: { shopId: store.shop.id, idempotencyKey } } });
        if (winner?.customerUserId === user.id) return this.customerOrder(user, winner.id);
      }
      throw e;
    }
  }

  private async checkoutInTx(tx: Tx, user: AuthUser, slug: string, dto: Checkout, idempotencyKey: string): Promise<string> {
    // Re-evaluate the store INSIDE the transaction (suspension races, AC-028).
    const store = await this.storefronts.state(slug, tx);
    if (!store || !store.visible) throw notFound('storefront');
    if (!store.orderable) throw new AppError(ErrorCode.STOREFRONT_NOT_AVAILABLE, { status: store.storefront.status });
    const shopId = store.shop.id;
    const sf = store.storefront;

    const cart = await tx.onlineCart.findFirst({ where: { shopId, customerUserId: user.id, status: 'ACTIVE' } });
    if (!cart) throw new AppError(ErrorCode.CART_EMPTY);
    await tx.$queryRaw`SELECT id FROM online_carts WHERE id = ${cart.id}::uuid FOR UPDATE`;
    const fresh = await tx.onlineCart.findUniqueOrThrow({ where: { id: cart.id }, include: { items: { orderBy: { createdAt: 'asc' } } } });
    if (fresh.status !== 'ACTIVE' || !fresh.items.length) throw new AppError(ErrorCode.CART_EMPTY);

    const [shop, settings, delivery, method, table] = await Promise.all([
      tx.shop.findUniqueOrThrow({ where: { id: shopId } }),
      tx.shopSettings.findUniqueOrThrow({ where: { shopId } }),
      tx.deliveryOption.findFirst({ where: { id: dto.deliveryOptionId, shopId, isActive: true } }),
      tx.shopPaymentMethod.findFirst({ where: { id: dto.paymentMethodId, shopId, isActive: true, availableOnline: true } }),
      this.units.table(shopId, 'ONLINE', tx),
    ]);
    if (!delivery || delivery.chargeType === 'ZONE') throw new AppError(ErrorCode.DELIVERY_OPTION_UNAVAILABLE);
    if (!method) throw new AppError(ErrorCode.PAYMENT_METHOD_UNAVAILABLE);
    if (delivery.method === 'HOME_DELIVERY' && !dto.addressLine) throw new AppError(ErrorCode.VALIDATION_FAILED, { field: 'addressLine' });

    // --- revalidate every line against live status, units and price (FR-102)
    const products = await tx.product.findMany({ where: { ...publicProductWhere(shopId), id: { in: fresh.items.map((i) => i.productId) } } });
    const byId = new Map(products.map((p) => [p.id, p]));
    const changes: CartChange[] = [];
    const lines = fresh.items.map((item) => {
      const p = byId.get(item.productId);
      if (!p) {
        changes.push({ cartItemId: item.id, productId: item.productId, reason: ErrorCode.PRODUCT_NOT_SELLABLE });
        return null;
      }
      let live;
      try {
        live = this.catalog.priceOnlineLine(table, p, item.enteredMeasurement as never, item.pieces, settings);
      } catch (e) {
        changes.push({ cartItemId: item.id, productId: p.id, reason: (e as AppError).code ?? ErrorCode.INTERNAL });
        return null;
      }
      if (!D(live.lengthInches).equals(item.lengthInches.toString())) {
        changes.push({ cartItemId: item.id, productId: p.id, reason: 'MEASUREMENT_CONFIG_CHANGED', unitRate: live.unitRate, lineTotal: live.lineTotal });
      } else if (!D(live.unitRate).equals(item.displayedUnitRate.toString()) || !D(live.lineTotal).equals(item.displayedLineTotal.toString())) {
        changes.push({ cartItemId: item.id, productId: p.id, reason: 'PRICE_CHANGED', unitRate: live.unitRate, lineTotal: live.lineTotal });
      }
      return { item, product: p, live };
    });
    if (changes.length) throw new CartChangedError(changes);
    const valid = lines.filter((l): l is NonNullable<typeof l> => !!l);

    // --- totals with delivery fee (FR-104, FR-105, FR-127)
    const itemsTotal = sum(valid.map((l) => l.live.lineTotal));
    if (sf.minOrderAmount && itemsTotal.lessThan(sf.minOrderAmount.toString())) {
      throw new AppError(ErrorCode.MIN_ORDER_NOT_MET, { minOrderAmount: sf.minOrderAmount.toString() });
    }
    const deliveryFee =
      delivery.chargeType === 'FREE_OVER_THRESHOLD' && delivery.freeOverAmount && itemsTotal.greaterThanOrEqualTo(delivery.freeOverAmount.toString())
        ? ZERO
        : D(delivery.flatFee.toString());
    const calc = calculateInvoice({
      lines: valid.map((l) => ({
        lengthInches: l.live.lengthInches,
        pieces: l.item.pieces,
        priceUnitInches: l.live.priceUnitInches,
        unitRate: l.live.unitRate,
        taxRate: l.live.taxRate,
      })),
      deliveryFee,
      policy: pricingPolicy(settings),
    });
    if (dto.expectedTotal && !D(dto.expectedTotal).equals(calc.grandTotal)) {
      throw new CartChangedError([], dto.expectedTotal, calc.grandTotal);
    }

    // --- reserve stock on the fulfilment branch: never oversell online (FR-119)
    const demand = new Map<string, Decimal>();
    calc.lines.forEach((r, i) => demand.set(valid[i]!.product.id, (demand.get(valid[i]!.product.id) ?? ZERO).plus(r.totalLengthInches)));
    const stocks = await this.stock.lock(tx, shopId, sf.fulfilmentBranchId, [...demand.keys()]);
    for (const [pid, need] of demand) this.stock.assertAvailable(stocks.get(pid), need, { allowNegative: false });

    const customer = await this.upsertShopCustomer(tx, shopId, user, dto);
    const orderNumber = await this.sequences.next(tx, shopId, 'ONLINE_ORDER', { prefix: 'ORD', yearlyReset: settings.invoiceYearlyReset, timezone: shop.timezone });
    const expiresAt = new Date(Date.now() + settings.reservationTtlMinutes * 60_000);

    const order = await tx.onlineOrder.create({
      data: {
        shopId,
        storefrontId: sf.id,
        fulfilmentBranchId: sf.fulfilmentBranchId,
        orderNumber,
        customerUserId: user.id,
        customerId: customer.id,
        currency: shop.currency,
        invoiceLanguage: dto.invoiceLanguage ?? user.preferredLanguage ?? settings.defaultInvoiceLanguage,
        taxMode: settings.taxMode,
        subtotal: calc.subtotal,
        discountTotal: D(calc.lineDiscountTotal).plus(calc.invoiceDiscountAmount).toFixed(2),
        taxTotal: calc.taxTotal,
        deliveryFee: calc.deliveryFee,
        roundingAdjustment: calc.roundingAdjustment,
        total: calc.grandTotal,
        paymentMethodType: method.type,
        paymentStatus: 'UNPAID',
        recipientName: dto.recipientName,
        recipientPhone: dto.recipientPhone,
        recipientEmail: dto.recipientEmail,
        addressLine: dto.addressLine,
        area: dto.area,
        city: dto.city,
        district: dto.district,
        postalCode: dto.postalCode,
        deliveryInstructions: dto.deliveryInstructions,
        deliveryOptionId: delivery.id,
        deliveryOptionSnapshot: { method: delivery.method, name: delivery.name, chargeType: delivery.chargeType, flatFee: delivery.flatFee.toString(), freeOverAmount: delivery.freeOverAmount?.toString() ?? null, estimatedDaysMin: delivery.estimatedDaysMin, estimatedDaysMax: delivery.estimatedDaysMax },
        shopSnapshot: shopSnapshot(shop, settings) as Prisma.InputJsonValue,
        calcPolicySnapshot: { ...policySnapshot(settings), paymentMethod: { id: method.id, type: method.type, label: method.label } } as Prisma.InputJsonValue,
        stockDeductionMilestone: settings.stockDeductionMilestone,
        idempotencyKey,
      },
    });

    const items = await tx.onlineOrderItem.createManyAndReturn({
      data: valid.map((l, i) => {
        const r = calc.lines[i]!;
        const p = l.product;
        return {
          shopId,
          orderId: order.id,
          productId: p.id,
          lineNo: i + 1,
          productName: p.name,
          sku: p.sku,
          productSnapshot: { name: p.name, sku: p.sku, fabricType: p.fabricType, color: p.color, pattern: p.pattern, material: p.material, widthInches: p.widthInches?.toString() ?? null, priceUnitCode: p.priceUnitCode },
          enteredMeasurement: l.live.entered as unknown as Prisma.InputJsonValue,
          enteredDisplay: l.live.enteredDisplay,
          lengthInches: l.live.lengthInches,
          pieces: l.item.pieces,
          quantityInches: r.totalLengthInches,
          conversionSnapshot: l.live.conversionSnapshot as unknown as Prisma.InputJsonValue,
          priceUnitCode: l.live.priceUnitCode,
          priceUnitInches: l.live.priceUnitInches,
          unitRate: r.unitRate,
          grossAmount: r.grossAmount,
          discountAmount: r.discountAmount,
          taxRate: r.taxRate,
          taxAmount: r.taxAmount,
          lineTotal: r.lineTotal,
          costPerInch: stocks.get(p.id)!.avgCostPerInch.toFixed(COST_DP),
        };
      }),
    });

    for (const it of items) {
      const reservation = await tx.inventoryReservation.create({
        data: {
          shopId,
          branchId: sf.fulfilmentBranchId,
          productId: it.productId,
          orderId: order.id,
          orderItemId: it.id,
          reservedInches: it.quantityInches,
          expiresAt,
        },
      });
      await this.stock.apply(tx, stocks.get(it.productId)!, {
        type: 'ORDER_RESERVE',
        deltaReserved: it.quantityInches.toString(),
        orderItemId: it.id,
        reservationId: reservation.id,
        actorUserId: user.id,
        actorType: 'CUSTOMER',
      });
    }

    await tx.orderStatusHistory.create({ data: { shopId, orderId: order.id, fromStatus: null, toStatus: 'PENDING_CONFIRMATION', actorType: 'CUSTOMER', actorUserId: user.id } });
    await tx.onlineCart.update({ where: { id: cart.id }, data: { status: 'CONVERTED' } });
    await this.audit.log({ shopId, actorUserId: user.id, actorType: 'CUSTOMER', action: 'order.place', targetType: 'online_order', targetId: order.id, after: { orderNumber, total: calc.grandTotal } }, tx);
    await this.notifications.notifyShop(shopId, P.ORDERS_MANAGE, { type: 'order.placed', params: { orderId: order.id, orderNumber, total: calc.grandTotal, currency: shop.currency }, link: `/orders/${order.id}` }, tx);
    await this.notifications.notifyUsers([user.id], { type: 'order.placed_customer', shopId, params: { orderId: order.id, orderNumber, shopName: sf.displayName, total: calc.grandTotal }, link: `/account/orders/${order.id}` }, tx);
    await this.stock.alertLowStock(tx, stocks.values(), settings.defaultLowStockInches.toString());
    return order.id;
  }

  private async upsertShopCustomer(tx: Tx, shopId: string, user: AuthUser, dto: Checkout) {
    const linked = await tx.customer.findUnique({ where: { shopId_userId: { shopId, userId: user.id } } });
    if (linked) return linked;
    const byPhone = await tx.customer.findUnique({ where: { shopId_phone: { shopId, phone: dto.recipientPhone } } });
    if (byPhone && !byPhone.userId) return tx.customer.update({ where: { id: byPhone.id }, data: { userId: user.id } });
    return tx.customer.create({
      data: {
        shopId,
        userId: user.id,
        name: user.fullName,
        // Avoid stealing a phone already linked to another account.
        phone: byPhone ? null : dto.recipientPhone,
        email: dto.recipientEmail,
        addressLine: dto.addressLine,
      },
    });
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  /** Customer sees only their own orders; others are indistinguishable from missing (AC-026). */
  async customerOrder(user: AuthUser, orderId: string) {
    const order = await this.prisma.onlineOrder.findFirst({
      where: { id: orderId, customerUserId: user.id },
      include: { ...orderInclude, notes: { where: { visibility: 'CUSTOMER' }, orderBy: { createdAt: 'asc' } }, storefront: { select: { slug: true, displayName: true } } },
    });
    if (!order) throw notFound('order');
    const { reservations: _r, idempotencyKey: _k, calcPolicySnapshot: _c, statusHistory, ...rest } = order;
    return { ...rest, statusHistory: statusHistory.map(({ actorUserId: _a, ...h }) => h) };
  }

  async customerOrders(user: AuthUser, q: { cursor?: string; limit: number }) {
    const rows = await this.prisma.onlineOrder.findMany({
      where: { customerUserId: user.id },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, total: true, currency: true, placedAt: true, storefront: { select: { slug: true, displayName: true } }, _count: { select: { items: true } } },
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  async shopOrder(ctx: ShopContext, orderId: string) {
    const order = await this.prisma.onlineOrder.findFirst({
      where: { id: orderId, shopId: ctx.shopId },
      include: { ...orderInclude, customer: { select: { id: true, name: true, phone: true, balanceDue: true } } },
    });
    if (!order) throw notFound('order');
    return order;
  }

  /** FR-109, FR-117 inbox with filters. */
  async shopOrders(ctx: ShopContext, q: z.infer<typeof schemas.orderListQuery>) {
    const where: Prisma.OnlineOrderWhereInput = {
      shopId: ctx.shopId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      ...(q.q ? { OR: [{ orderNumber: { contains: q.q, mode: 'insensitive' } }, { recipientName: { contains: q.q, mode: 'insensitive' } }, { recipientPhone: { contains: q.q } }] } : {}),
      ...(q.from || q.to ? { placedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    const [rows, counts] = await Promise.all([
      this.prisma.onlineOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        select: { id: true, orderNumber: true, status: true, paymentStatus: true, total: true, currency: true, placedAt: true, recipientName: true, recipientPhone: true, paymentMethodType: true, _count: { select: { items: true } } },
      }),
      this.prisma.onlineOrder.groupBy({ by: ['status'], where: { shopId: ctx.shopId }, _count: { _all: true } }),
    ]);
    const items = rows.slice(0, q.limit);
    return {
      items,
      nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null,
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  // ===========================================================================
  // Lifecycle (FR-111…FR-116, FR-120, FR-121, §A3)
  // ===========================================================================

  private async lock(tx: Tx, orderId: string, scope: { shopId?: string; customerUserId?: string }, skipLocked = false): Promise<LockedOrder | null> {
    const rows = skipLocked
      ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM online_orders WHERE id = ${orderId}::uuid FOR UPDATE SKIP LOCKED`
      : await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM online_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!rows.length) return null;
    return tx.onlineOrder.findFirst({
      where: { id: orderId, ...(scope.shopId ? { shopId: scope.shopId } : {}), ...(scope.customerUserId ? { customerUserId: scope.customerUserId } : {}) },
      include: { items: true, reservations: true, delivery: true, payments: true },
    });
  }

  private method(order: LockedOrder): DeliveryMethod {
    return ((order.deliveryOptionSnapshot as { method?: DeliveryMethod } | null)?.method ?? 'HOME_DELIVERY') as DeliveryMethod;
  }

  /** Release ACTIVE reservations exactly once — guarded UPDATE … WHERE status='ACTIVE' (AC-024). */
  private async releaseReservations(tx: Tx, order: LockedOrder, to: 'RELEASED' | 'EXPIRED', reason: string, actor: { id: string | null; type: ActorType }) {
    const active = order.reservations.filter((r) => r.status === 'ACTIVE');
    if (!active.length) return;
    const stocks = await this.stock.lock(tx, order.shopId, order.fulfilmentBranchId, active.map((r) => r.productId));
    for (const r of active) {
      const claimed = await tx.inventoryReservation.updateMany({
        where: { id: r.id, status: 'ACTIVE' },
        data: { status: to, releasedAt: new Date(), releaseReason: reason.slice(0, 64) },
      });
      if (claimed.count !== 1) continue;
      await this.stock.apply(tx, stocks.get(r.productId)!, {
        type: 'ORDER_RESERVATION_RELEASE',
        deltaReserved: D(r.reservedInches.toString()).negated(),
        orderItemId: r.orderItemId,
        reservationId: r.id,
        reason,
        actorUserId: actor.id,
        actorType: actor.type,
      });
    }
  }

  /** Reservation → physical deduction at the configured milestone (FR-121). */
  private async consumeReservations(tx: Tx, order: LockedOrder, actor: { id: string | null; type: ActorType }) {
    const active = order.reservations.filter((r) => r.status === 'ACTIVE');
    if (active.length !== order.items.length) throw new AppError(ErrorCode.ORDER_TRANSITION_INVALID, { reason: 'reservation_missing' });
    const stocks = await this.stock.lock(tx, order.shopId, order.fulfilmentBranchId, active.map((r) => r.productId));
    for (const r of active) {
      const claimed = await tx.inventoryReservation.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { status: 'CONSUMED', consumedAt: new Date(), expiresAt: null } });
      if (claimed.count !== 1) throw new AppError(ErrorCode.ORDER_TRANSITION_INVALID, { reason: 'reservation_missing' });
      const qty = D(r.reservedInches.toString());
      await this.stock.apply(tx, stocks.get(r.productId)!, {
        type: 'ORDER_DEDUCT_OUT',
        deltaOnHand: qty.negated(),
        deltaReserved: qty.negated(),
        orderItemId: r.orderItemId,
        reservationId: r.id,
        actorUserId: actor.id,
        actorType: actor.type,
      });
    }
    await tx.onlineOrder.update({ where: { id: order.id }, data: { stockDeductedAt: new Date() } });
  }

  /** Compensating restock for an already-deducted order (BR-009). */
  private async restock(tx: Tx, order: LockedOrder, reason: string, actor: { id: string | null; type: ActorType }) {
    const outs = await tx.stockMovement.findMany({ where: { shopId: order.shopId, orderItemId: { in: order.items.map((i) => i.id) }, type: 'ORDER_DEDUCT_OUT', reversedBy: null } });
    if (!outs.length) return;
    const stocks = await this.stock.lock(tx, order.shopId, order.fulfilmentBranchId, outs.map((m) => m.productId));
    for (const mv of outs) {
      await this.stock.apply(tx, stocks.get(mv.productId)!, {
        type: 'ORDER_CANCEL_IN',
        deltaOnHand: D(mv.deltaOnHandInches.toString()).negated(),
        orderItemId: mv.orderItemId!,
        reversesMovementId: mv.id,
        reason,
        actorUserId: actor.id,
        actorType: actor.type,
      });
    }
  }

  private async reversePayments(tx: Tx, order: LockedOrder, reason: string, actorId: string | null): Promise<Decimal> {
    let refunded = ZERO;
    for (const p of order.payments.filter((x) => x.status === 'POSTED' && x.direction === 'IN')) {
      await tx.payment.create({
        data: { shopId: order.shopId, orderId: order.id, customerId: p.customerId, paymentMethodId: p.paymentMethodId, methodType: p.methodType, direction: 'OUT', amount: p.amount, currency: p.currency, reversesPaymentId: p.id, note: reason.slice(0, 300), receivedById: actorId },
      });
      await tx.payment.update({ where: { id: p.id }, data: { status: 'REVERSED' } });
      refunded = refunded.plus(p.amount.toString());
    }
    return refunded;
  }

  private async history(tx: Tx, order: LockedOrder, to: OrderStatus, actorType: ActorType, actorId: string | null, note?: string) {
    await tx.orderStatusHistory.create({ data: { shopId: order.shopId, orderId: order.id, fromStatus: order.status, toStatus: to, actorType, actorUserId: actorId, note } });
    if (order.customerUserId) {
      await this.notifications.notifyUsers(
        [order.customerUserId],
        { type: 'order.status_changed', shopId: order.shopId, params: { orderId: order.id, orderNumber: order.orderNumber, from: order.status, to }, link: `/account/orders/${order.id}`, dedupeKey: `order:${order.id}:${to}` },
        tx,
      );
    }
  }

  async confirm(ctx: ShopContext, orderId: string) {
    await this.prisma.tx(async (tx) => {
      const order = await this.lock(tx, orderId, { shopId: ctx.shopId });
      if (!order) throw notFound('order');
      assertTransition(order.status, 'CONFIRMED', 'SHOPKEEPER', { method: this.method(order) });
      const [shop, settings] = await Promise.all([tx.shop.findUniqueOrThrow({ where: { id: ctx.shopId } }), tx.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } })]);
      const actor = { id: ctx.userId, type: 'SHOPKEEPER' as const };
      if (isDeductionPoint('CONFIRMED', order.stockDeductionMilestone)) {
        await this.consumeReservations(tx, order, actor);
      } else {
        // ON_DISPATCH: keep the hold without expiry until dispatch.
        if (order.reservations.some((r) => r.status !== 'ACTIVE')) throw new AppError(ErrorCode.ORDER_TRANSITION_INVALID, { reason: 'reservation_missing' });
        await tx.inventoryReservation.updateMany({ where: { orderId: order.id, status: 'ACTIVE' }, data: { expiresAt: null } });
      }
      const invoiceNumber = await this.sequences.next(tx, ctx.shopId, 'INVOICE', { prefix: settings.invoicePrefix, yearlyReset: settings.invoiceYearlyReset, timezone: shop.timezone });
      await tx.onlineOrder.update({ where: { id: order.id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), invoiceNumber } });
      await this.history(tx, order, 'CONFIRMED', 'SHOPKEEPER', ctx.userId);
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'order.confirm', targetType: 'online_order', targetId: order.id, after: { invoiceNumber } }, tx);
    });
    return this.shopOrder(ctx, orderId);
  }

  async reject(ctx: ShopContext, orderId: string, reason: string) {
    await this.prisma.tx(async (tx) => {
      const order = await this.lock(tx, orderId, { shopId: ctx.shopId });
      if (!order) throw notFound('order');
      assertTransition(order.status, 'REJECTED', 'SHOPKEEPER', { reason });
      await this.releaseReservations(tx, order, 'RELEASED', 'order_rejected', { id: ctx.userId, type: 'SHOPKEEPER' });
      await tx.onlineOrder.update({ where: { id: order.id }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason } });
      await this.history(tx, order, 'REJECTED', 'SHOPKEEPER', ctx.userId, reason);
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'order.reject', targetType: 'online_order', targetId: order.id, reason }, tx);
    });
    return this.shopOrder(ctx, orderId);
  }

  async cancelByShop(ctx: ShopContext, orderId: string, reason: string) {
    await this.prisma.tx(async (tx) => {
      const order = await this.lock(tx, orderId, { shopId: ctx.shopId });
      if (!order) throw notFound('order');
      await this.cancelInTx(tx, order, 'SHOPKEEPER', ctx.userId, reason);
    });
    return this.shopOrder(ctx, orderId);
  }

  async cancelByCustomer(user: AuthUser, orderId: string, reason: string) {
    await this.prisma.tx(async (tx) => {
      const order = await this.lock(tx, orderId, { customerUserId: user.id });
      if (!order) throw notFound('order');
      await this.cancelInTx(tx, order, 'CUSTOMER', user.id, reason);
    });
    return this.customerOrder(user, orderId);
  }

  private async cancelInTx(tx: Tx, order: LockedOrder, actor: OrderActor, actorId: string | null, reason: string, releaseAs: 'RELEASED' | 'EXPIRED' = 'RELEASED') {
    assertTransition(order.status, 'CANCELLED', actor, { method: this.method(order), reason });
    const a = { id: actorId, type: actorOf(actor) };
    await this.releaseReservations(tx, order, releaseAs, releaseAs === 'EXPIRED' ? 'reservation_expired' : 'order_cancelled', a);
    if (order.stockDeductedAt) await this.restock(tx, order, reason, a);
    const refunded = await this.reversePayments(tx, order, reason, actorId);
    await tx.onlineOrder.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByType: a.type,
        cancelReason: reason,
        refundedAmount: refunded.toFixed(2),
        ...(refunded.greaterThan(0) ? { paymentStatus: 'REFUNDED' } : {}),
      },
    });
    await this.history(tx, order, 'CANCELLED', a.type, actorId, reason);
    await this.audit.log({ shopId: order.shopId, actorUserId: actorId, actorType: a.type, action: 'order.cancel', targetType: 'online_order', targetId: order.id, reason }, tx);
    if (actor !== 'SHOPKEEPER') {
      await this.notifications.notifyShop(order.shopId, P.ORDERS_MANAGE, { type: 'order.cancelled', params: { orderId: order.id, orderNumber: order.orderNumber, by: a.type, reason }, link: `/orders/${order.id}` }, tx);
    }
  }

  /** PROCESSING → READY_FOR_PICKUP/DISPATCHED → DELIVERED → COMPLETED (FR-112, FR-114). */
  async updateStatus(ctx: ShopContext, orderId: string, dto: z.infer<typeof schemas.orderStatusUpdateSchema>) {
    await this.prisma.tx(async (tx) => {
      const order = await this.lock(tx, orderId, { shopId: ctx.shopId });
      if (!order) throw notFound('order');
      const method = this.method(order);
      assertTransition(order.status, dto.to, 'SHOPKEEPER', { method });
      const actor = { id: ctx.userId, type: 'SHOPKEEPER' as const };
      if (!order.stockDeductedAt && isDeductionPoint(dto.to, order.stockDeductionMilestone)) await this.consumeReservations(tx, order, actor);

      const now = new Date();
      const deliveryData = {
        ...(dto.provider ? { provider: dto.provider } : {}),
        ...(dto.trackingReference ? { trackingReference: dto.trackingReference } : {}),
        ...(dto.trackingUrl ? { trackingUrl: dto.trackingUrl } : {}),
      };
      if (dto.to === 'READY_FOR_PICKUP' || dto.to === 'DISPATCHED' || dto.to === 'DELIVERED') {
        const status = dto.to === 'READY_FOR_PICKUP' ? 'PACKED' : dto.to;
        await tx.delivery.upsert({
          where: { orderId: order.id },
          create: {
            shopId: ctx.shopId,
            orderId: order.id,
            method,
            fee: order.deliveryFee,
            status,
            ...deliveryData,
            ...(dto.to === 'READY_FOR_PICKUP' ? { packedAt: now } : {}),
            ...(dto.to === 'DISPATCHED' ? { dispatchedAt: now } : {}),
            ...(dto.to === 'DELIVERED' ? { deliveredAt: now } : {}),
          },
          update: { status, ...deliveryData, ...(dto.to === 'DISPATCHED' ? { dispatchedAt: now } : {}), ...(dto.to === 'DELIVERED' ? { deliveredAt: now } : {}) },
        });
      }
      await tx.onlineOrder.update({
        where: { id: order.id },
        data: {
          status: dto.to,
          ...(dto.to === 'DISPATCHED' || dto.to === 'READY_FOR_PICKUP' ? { dispatchedAt: now } : {}),
          ...(dto.to === 'DELIVERED' ? { deliveredAt: now } : {}),
          ...(dto.to === 'COMPLETED' ? { completedAt: now } : {}),
        },
      });
      await this.history(tx, order, dto.to, 'SHOPKEEPER', ctx.userId, dto.note);
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'order.status', targetType: 'online_order', targetId: order.id, before: { status: order.status }, after: { status: dto.to } }, tx);
    });
    return this.shopOrder(ctx, orderId);
  }

  async addNote(ctx: ShopContext, orderId: string, dto: z.infer<typeof schemas.orderNoteSchema>) {
    const order = await this.prisma.onlineOrder.findFirst({ where: { id: orderId, shopId: ctx.shopId }, select: { id: true, customerUserId: true, orderNumber: true } });
    if (!order) throw notFound('order');
    const note = await this.prisma.orderNote.create({ data: { shopId: ctx.shopId, orderId, authorUserId: ctx.userId, visibility: dto.visibility, body: dto.body } });
    if (dto.visibility === 'CUSTOMER' && order.customerUserId) {
      await this.notifications.notifyUsers([order.customerUserId], { type: 'order.note', shopId: ctx.shopId, params: { orderId, orderNumber: order.orderNumber }, link: `/account/orders/${orderId}` });
    }
    return note;
  }

  /** COD / manual payment recorded by the shop (FR-124, FR-125). Gateway payments arrive via verified webhook only (FR-126). */
  async recordPayment(ctx: ShopContext, orderId: string, dto: z.infer<typeof schemas.collectPaymentSchema>, idempotencyKey: string) {
    await this.prisma.tx(async (tx) => {
      const order = await this.lock(tx, orderId, { shopId: ctx.shopId });
      if (!order) throw notFound('order');
      if (['PENDING_CONFIRMATION', 'REJECTED', 'CANCELLED'].includes(order.status)) throw new AppError(ErrorCode.ORDER_TRANSITION_INVALID, { reason: 'not_payable', status: order.status });
      const method = await tx.shopPaymentMethod.findFirst({ where: { id: dto.paymentMethodId, shopId: ctx.shopId, isActive: true } });
      if (!method) throw new AppError(ErrorCode.PAYMENT_METHOD_UNAVAILABLE);
      const netPaid = D(order.paidAmount.toString()).minus(order.refundedAmount.toString());
      assertPaymentWithinDue(order.total.toString(), netPaid, dto.amount);
      await tx.payment.create({
        data: { shopId: ctx.shopId, orderId, customerId: order.customerId, paymentMethodId: method.id, methodType: method.type, amount: dto.amount, currency: order.currency, reference: dto.reference, note: dto.note, receivedById: ctx.userId, idempotencyKey },
      });
      const newPaid = D(order.paidAmount.toString()).plus(dto.amount);
      const s = summarizePayment(order.total.toString(), newPaid, order.refundedAmount.toString());
      await tx.onlineOrder.update({ where: { id: orderId }, data: { paidAmount: newPaid.toFixed(2), paymentStatus: s.status } });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'order.payment', targetType: 'online_order', targetId: orderId, after: { amount: dto.amount, methodType: method.type } }, tx);
    });
    return this.shopOrder(ctx, orderId);
  }

  // ===========================================================================
  // Reservation expiry (FR-120)
  // ===========================================================================

  /**
   * Cancels pending orders whose reservation hold expired, releasing stock
   * exactly once. Uses SKIP LOCKED so concurrent sweepers / a shopkeeper
   * confirming the same order never block or double-process.
   */
  async sweepExpiredReservations(now = new Date(), batch = 100): Promise<number> {
    const due = await this.prisma.inventoryReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: now }, order: { status: 'PENDING_CONFIRMATION' } },
      select: { orderId: true },
      distinct: ['orderId'],
      take: batch,
    });
    let processed = 0;
    for (const { orderId } of due) {
      try {
        const done = await this.prisma.tx(async (tx) => {
          const order = await this.lock(tx, orderId, {}, true);
          if (!order || order.status !== 'PENDING_CONFIRMATION') return false;
          if (!order.reservations.some((r) => r.status === 'ACTIVE' && r.expiresAt && r.expiresAt < now)) return false;
          await this.cancelInTx(tx, order, 'SYSTEM', null, 'RESERVATION_EXPIRED', 'EXPIRED');
          return true;
        });
        if (done) processed++;
      } catch (e) {
        this.logger.error(`Reservation sweep failed for order ${orderId}: ${(e as Error).message}`);
      }
    }
    return processed;
  }
}
