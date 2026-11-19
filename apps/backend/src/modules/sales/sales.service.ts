import { Injectable } from '@nestjs/common';
import {
  D,
  Decimal,
  ErrorCode,
  LineInput,
  ShopPermission as P,
  ZERO,
  assertPaymentWithinDue,
  calculateInvoice,
  formatMeasurement,
  schemas,
  sum,
  summarizePayment,
} from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import type { Shop as ShopRow, ShopSettings } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { DocumentSequenceService } from '../../common/sequences/document-sequence.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import { StockService } from '../inventory/stock.service';
import { UnitsService } from '../measurement/units.service';
import { policySnapshot, pricingPolicy } from './pricing-policy';

type CreateSale = z.infer<typeof schemas.createSaleSchema>;

export const saleInclude = {
  items: { orderBy: { lineNo: 'asc' } },
  payments: { orderBy: { receivedAt: 'asc' } },
  customer: { select: { id: true, name: true, phone: true } },
  branch: { select: { id: true, name: true, code: true } },
  cashier: { select: { id: true, fullName: true } },
} satisfies Prisma.SaleInclude;

export function shopSnapshot(shop: ShopRow, settings: ShopSettings) {
  return {
    name: shop.name,
    legalName: shop.legalName,
    phone: shop.phone,
    email: shop.email,
    addressLine: shop.addressLine,
    city: shop.city,
    district: shop.district,
    logoKey: shop.logoKey,
    currency: shop.currency,
    taxRegistrationNo: settings.taxRegistrationNo,
    invoiceFooterNote: settings.invoiceFooterNote,
    businessHours: settings.businessHours,
  };
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly units: UnitsService,
    private readonly sequences: DocumentSequenceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * POS sale (FR-035…FR-043). Sale header, immutable line snapshots, payments
   * and SALE_OUT stock movements commit atomically or not at all (BR-007).
   */
  async create(ctx: ShopContext, dto: CreateSale, idempotencyKey: string) {
    ctx.requireBranch(dto.branchId);
    const existing = await this.prisma.sale.findUnique({ where: { shopId_idempotencyKey: { shopId: ctx.shopId, idempotencyKey } }, include: saleInclude });
    if (existing) return existing;

    try {
      const saleId = await this.prisma.tx((tx) => this.createInTx(tx, ctx, dto, idempotencyKey));
      return this.get(ctx, saleId);
    } catch (e) {
      // Concurrent duplicate that slipped past the interceptor: return the winner.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.prisma.sale.findUnique({ where: { shopId_idempotencyKey: { shopId: ctx.shopId, idempotencyKey } }, include: saleInclude });
        if (winner) return winner;
      }
      throw e;
    }
  }

  private async createInTx(tx: Tx, ctx: ShopContext, dto: CreateSale, idempotencyKey: string): Promise<string> {
    const [shop, settings, branch] = await Promise.all([
      tx.shop.findUniqueOrThrow({ where: { id: ctx.shopId } }),
      tx.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } }),
      tx.branch.findFirst({ where: { id: dto.branchId, shopId: ctx.shopId, status: 'ACTIVE' } }),
    ]);
    if (!branch) throw notFound('branch');
    const customer = dto.customerId ? await tx.customer.findFirst({ where: { id: dto.customerId, shopId: ctx.shopId } }) : null;
    if (dto.customerId && !customer) throw notFound('customer');

    const table = await this.units.table(ctx.shopId, 'POS', tx);
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await tx.product.findMany({ where: { shopId: ctx.shopId, id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    if (dto.invoiceDiscount && dto.invoiceDiscount.type !== 'NONE') ctx.require(P.POS_DISCOUNT_APPLY);

    const lines = dto.items.map((item, idx) => {
      const product = byId.get(item.productId);
      if (!product) throw notFound('product', { productId: item.productId });
      if (product.status !== 'ACTIVE' || !product.availableInPos) throw new AppError(ErrorCode.PRODUCT_NOT_SELLABLE, { productId: product.id });
      if (item.discount && item.discount.type !== 'NONE') ctx.require(P.POS_DISCOUNT_APPLY);
      if (item.rateOverride) ctx.require(P.POS_PRICE_OVERRIDE); // FR-037
      const measured = table.resolve(item.measurement, settings.defaultDisplayUnitCode);
      const priceUnit = table.priceUnit(product.priceUnitCode);
      const listRate = product.sellingRate.toString();
      const unitRate = item.rateOverride?.unitRate ?? listRate;
      const input: LineInput = {
        lengthInches: measured.inches,
        pieces: item.pieces,
        priceUnitInches: priceUnit.inchesPerUnit,
        unitRate,
        discount: item.discount,
        taxRate: (product.taxRate ?? settings.defaultTaxRate).toString(),
      };
      return { idx, item, product, measured, priceUnit, listRate, unitRate, input };
    });

    const calc = calculateInvoice({ lines: lines.map((l) => l.input), invoiceDiscount: dto.invoiceDiscount, policy: pricingPolicy(settings) });

    // --- stock: lock once per product, validate aggregate demand (FR-028, FR-029)
    const demand = new Map<string, Decimal>();
    calc.lines.forEach((r, i) => {
      const pid = lines[i]!.product.id;
      demand.set(pid, (demand.get(pid) ?? ZERO).plus(r.totalLengthInches));
    });
    const stocks = await this.stock.lock(tx, ctx.shopId, dto.branchId, productIds);
    const allowNegative = settings.allowNegativeStock && ctx.can(P.INVENTORY_OVERSELL);
    for (const [pid, need] of demand) this.stock.assertAvailable(stocks.get(pid), need, { allowNegative });

    // --- payments (FR-039, FR-040, BR-008)
    const methods = dto.payments.length
      ? await tx.shopPaymentMethod.findMany({ where: { shopId: ctx.shopId, id: { in: dto.payments.map((p) => p.paymentMethodId) }, isActive: true, availableInPos: true } })
      : [];
    for (const p of dto.payments) if (!methods.find((m) => m.id === p.paymentMethodId)) throw new AppError(ErrorCode.PAYMENT_METHOD_UNAVAILABLE, { paymentMethodId: p.paymentMethodId });
    const paid = sum(dto.payments.map((p) => p.amount));
    const grand = D(calc.grandTotal);
    if (paid.greaterThan(grand)) throw new AppError(ErrorCode.OVERPAYMENT_NOT_ALLOWED, { grandTotal: calc.grandTotal, paid: paid.toFixed(2) });
    const due = grand.minus(paid);
    if (due.greaterThan(0)) {
      if (paid.greaterThan(0) && !settings.allowPartialPayment) throw new AppError(ErrorCode.PARTIAL_PAYMENT_NOT_ALLOWED);
      if (!settings.allowDueSales && paid.isZero()) throw new AppError(ErrorCode.PARTIAL_PAYMENT_NOT_ALLOWED);
      if (!customer) throw new AppError(ErrorCode.DUE_REQUIRES_CUSTOMER);
    }
    const payment = summarizePayment(grand, paid, 0, settings.currencyPrecision);

    const invoiceNumber = await this.sequences.next(tx, ctx.shopId, 'INVOICE', { prefix: settings.invoicePrefix, yearlyReset: settings.invoiceYearlyReset, timezone: shop.timezone });
    const now = new Date();
    const sale = await tx.sale.create({
      data: {
        shopId: ctx.shopId,
        branchId: dto.branchId,
        channel: 'POS',
        invoiceNumber,
        customerId: customer?.id ?? null,
        cashierUserId: ctx.userId,
        status: 'COMPLETED',
        paymentStatus: payment.status,
        currency: shop.currency,
        invoiceLanguage: dto.invoiceLanguage ?? settings.defaultInvoiceLanguage,
        taxMode: settings.taxMode,
        subtotal: calc.subtotal,
        lineDiscountTotal: calc.lineDiscountTotal,
        invoiceDiscountType: dto.invoiceDiscount?.type ?? 'NONE',
        invoiceDiscountValue: dto.invoiceDiscount?.value ?? '0',
        invoiceDiscountAmount: calc.invoiceDiscountAmount,
        taxTotal: calc.taxTotal,
        roundingAdjustment: calc.roundingAdjustment,
        grandTotal: calc.grandTotal,
        paidAmount: paid.toFixed(2),
        dueAmount: payment.due,
        shopSnapshot: shopSnapshot(shop, settings) as Prisma.InputJsonValue,
        customerSnapshot: customer ? ({ name: customer.name, phone: customer.phone, addressLine: customer.addressLine } as Prisma.InputJsonValue) : Prisma.DbNull,
        calcPolicySnapshot: policySnapshot(settings) as Prisma.InputJsonValue,
        notes: dto.notes,
        idempotencyKey,
        soldAt: now,
        completedAt: now,
      },
    });

    const items = await tx.saleItem.createManyAndReturn({
      data: lines.map((l, i) => {
        const r = calc.lines[i]!;
        const p = l.product;
        return {
          shopId: ctx.shopId,
          saleId: sale.id,
          productId: p.id,
          lineNo: i + 1,
          productName: p.name,
          sku: p.sku,
          productSnapshot: { name: p.name, sku: p.sku, barcode: p.barcode, fabricType: p.fabricType, color: p.color, pattern: p.pattern, material: p.material, widthInches: p.widthInches?.toString() ?? null, priceUnitCode: p.priceUnitCode },
          enteredMeasurement: l.measured.components as unknown as Prisma.InputJsonValue,
          enteredDisplay: formatMeasurement(l.measured.components, table.forChannel),
          lengthInches: l.measured.inches.toFixed(4),
          pieces: l.item.pieces,
          totalLengthInches: r.totalLengthInches,
          conversionSnapshot: l.measured.snapshot as unknown as Prisma.InputJsonValue,
          priceUnitCode: l.priceUnit.code,
          priceUnitInches: D(l.priceUnit.inchesPerUnit).toString(),
          listUnitRate: l.listRate,
          unitRate: l.unitRate,
          rateOverridden: !!l.item.rateOverride,
          overrideReason: l.item.rateOverride?.reason ?? null,
          overrideById: l.item.rateOverride ? ctx.userId : null,
          grossAmount: r.grossAmount,
          discountType: l.item.discount?.type ?? 'NONE',
          discountValue: l.item.discount?.value ?? '0',
          discountAmount: r.discountAmount,
          allocatedInvoiceDiscount: r.allocatedInvoiceDiscount,
          taxRate: r.taxRate,
          taxAmount: r.taxAmount,
          lineTotal: r.lineTotal,
          costPerInch: stocks.get(p.id)!.avgCostPerInch.toFixed(6),
        };
      }),
    });

    for (const item of items) {
      await this.stock.apply(tx, stocks.get(item.productId)!, {
        type: 'SALE_OUT',
        deltaOnHand: D(item.totalLengthInches.toString()).negated(),
        saleItemId: item.id,
        actorUserId: ctx.userId,
      });
    }

    const methodById = new Map(methods.map((m) => [m.id, m]));
    for (const [i, p] of dto.payments.entries()) {
      await tx.payment.create({
        data: {
          shopId: ctx.shopId,
          saleId: sale.id,
          customerId: customer?.id ?? null,
          paymentMethodId: p.paymentMethodId,
          methodType: methodById.get(p.paymentMethodId)!.type,
          amount: p.amount,
          currency: shop.currency,
          reference: p.reference,
          receivedById: ctx.userId,
          receivedAt: now,
          idempotencyKey: `${idempotencyKey}:${i}`,
        },
      });
    }
    if (customer && due.greaterThan(0)) {
      await tx.customer.update({ where: { id: customer.id }, data: { balanceDue: { increment: due.toFixed(2) } } });
    }

    await this.audit.log(
      { shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'sale.create', targetType: 'sale', targetId: sale.id, after: { invoiceNumber, grandTotal: calc.grandTotal, paid: paid.toFixed(2) } },
      tx,
    );
    for (const l of lines.filter((x) => x.item.rateOverride)) {
      await this.audit.log(
        {
          shopId: ctx.shopId,
          actorUserId: ctx.userId,
          actorType: 'SHOPKEEPER',
          action: 'price.override',
          targetType: 'sale',
          targetId: sale.id,
          reason: l.item.rateOverride!.reason,
          before: { productId: l.product.id, unitRate: l.listRate },
          after: { productId: l.product.id, unitRate: l.unitRate },
        },
        tx,
      );
    }
    await this.stock.alertLowStock(tx, stocks.values(), settings.defaultLowStockInches.toString());
    return sale.id;
  }

  /** Cashiers with only sales.view_own see their own sales (FR-067, Appendix B). */
  private visibility(ctx: ShopContext): Prisma.SaleWhereInput {
    const branchScope = ctx.allBranches ? {} : { branchId: { in: [...ctx.branchIds] } };
    if (ctx.can(P.SALES_VIEW_ALL)) return branchScope;
    if (ctx.can(P.SALES_VIEW_OWN)) return { ...branchScope, cashierUserId: ctx.userId };
    throw new AppError(ErrorCode.PERMISSION_DENIED, { permission: P.SALES_VIEW_OWN });
  }

  async get(ctx: ShopContext, saleId: string) {
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, shopId: ctx.shopId, ...this.visibility(ctx) }, include: saleInclude });
    if (!sale) throw notFound('sale');
    return sale;
  }

  async list(ctx: ShopContext, q: z.infer<typeof schemas.saleListQuery>) {
    const where: Prisma.SaleWhereInput = {
      shopId: ctx.shopId,
      ...this.visibility(ctx),
      ...(q.status ? { status: q.status } : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.invoiceNumber ? { invoiceNumber: q.invoiceNumber } : {}),
      ...(q.cashierUserId && ctx.can(P.SALES_VIEW_ALL) ? { cashierUserId: q.cashierUserId } : {}),
      ...(q.from || q.to ? { soldAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    const rows = await this.prisma.sale.findMany({
      where,
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { customer: { select: { id: true, name: true } }, cashier: { select: { id: true, fullName: true } }, _count: { select: { items: true } } },
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  private async lockSale(tx: Tx, shopId: string, saleId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM sales WHERE id = ${saleId}::uuid AND "shopId" = ${shopId}::uuid FOR UPDATE`;
    if (!rows.length) throw notFound('sale');
    return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { items: true, payments: true } });
  }

  /** Due collection against an invoice (FR-052, AC-010). */
  async collectPayment(ctx: ShopContext, saleId: string, dto: z.infer<typeof schemas.collectPaymentSchema>, idempotencyKey: string) {
    await this.get(ctx, saleId); // visibility check
    await this.prisma.tx(async (tx) => {
      const sale = await this.lockSale(tx, ctx.shopId, saleId);
      if (sale.status !== 'COMPLETED' && sale.status !== 'PARTIALLY_RETURNED') throw new AppError(ErrorCode.SALE_NOT_CANCELLABLE, { status: sale.status });
      const method = await tx.shopPaymentMethod.findFirst({ where: { id: dto.paymentMethodId, shopId: ctx.shopId, isActive: true, availableInPos: true } });
      if (!method) throw new AppError(ErrorCode.PAYMENT_METHOD_UNAVAILABLE);
      const netPaid = D(sale.paidAmount.toString()).minus(sale.refundedAmount.toString());
      assertPaymentWithinDue(sale.grandTotal.toString(), netPaid, dto.amount);
      const settings = await tx.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } });
      const newPaid = D(sale.paidAmount.toString()).plus(dto.amount);
      const s = summarizePayment(sale.grandTotal.toString(), newPaid, sale.refundedAmount.toString(), settings.currencyPrecision);
      await tx.payment.create({
        data: {
          shopId: ctx.shopId,
          saleId,
          customerId: sale.customerId,
          paymentMethodId: method.id,
          methodType: method.type,
          amount: dto.amount,
          currency: sale.currency,
          reference: dto.reference,
          note: dto.note,
          receivedById: ctx.userId,
          idempotencyKey,
        },
      });
      await tx.sale.update({ where: { id: saleId }, data: { paidAmount: newPaid.toFixed(2), dueAmount: s.due, paymentStatus: s.status } });
      if (sale.customerId) await tx.customer.update({ where: { id: sale.customerId }, data: { balanceDue: { decrement: D(dto.amount).toFixed(2) } } });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'payment.collect', targetType: 'sale', targetId: saleId, after: { amount: dto.amount, methodType: method.type } }, tx);
    });
    return this.get(ctx, saleId);
  }

  /**
   * Cancellation never erases history (BR-009, FR-030, AC-009): status flips to
   * CANCELLED, each SALE_OUT gets a compensating SALE_CANCEL_IN, and each
   * payment gets a reversing OUT entry.
   */
  async cancel(ctx: ShopContext, saleId: string, reason: string) {
    await this.get(ctx, saleId);
    await this.prisma.tx(async (tx) => {
      const sale = await this.lockSale(tx, ctx.shopId, saleId);
      if (sale.status !== 'COMPLETED') throw new AppError(ErrorCode.SALE_NOT_CANCELLABLE, { status: sale.status });
      const outs = await tx.stockMovement.findMany({ where: { shopId: ctx.shopId, saleItemId: { in: sale.items.map((i) => i.id) }, type: 'SALE_OUT' } });
      const stocks = await this.stock.lock(tx, ctx.shopId, sale.branchId, sale.items.map((i) => i.productId));
      for (const mv of outs) {
        await this.stock.apply(tx, stocks.get(mv.productId)!, {
          type: 'SALE_CANCEL_IN',
          deltaOnHand: D(mv.deltaOnHandInches.toString()).negated(),
          saleItemId: mv.saleItemId!,
          reversesMovementId: mv.id,
          reason,
          actorUserId: ctx.userId,
        });
      }
      let refunded = ZERO;
      for (const p of sale.payments.filter((x) => x.status === 'POSTED' && x.direction === 'IN')) {
        await tx.payment.create({
          data: {
            shopId: ctx.shopId,
            saleId,
            customerId: p.customerId,
            paymentMethodId: p.paymentMethodId,
            methodType: p.methodType,
            direction: 'OUT',
            amount: p.amount,
            currency: p.currency,
            reversesPaymentId: p.id,
            note: reason.slice(0, 300),
            receivedById: ctx.userId,
          },
        });
        await tx.payment.update({ where: { id: p.id }, data: { status: 'REVERSED' } });
        refunded = refunded.plus(p.amount.toString());
      }
      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: ctx.userId,
          cancelReason: reason,
          refundedAmount: refunded.toFixed(2),
          dueAmount: '0',
          paymentStatus: refunded.greaterThan(0) ? 'REFUNDED' : 'UNPAID',
        },
      });
      if (sale.customerId && D(sale.dueAmount.toString()).greaterThan(0)) {
        await tx.customer.update({ where: { id: sale.customerId }, data: { balanceDue: { decrement: sale.dueAmount } } });
      }
      await this.audit.log(
        { shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'sale.cancel', targetType: 'sale', targetId: saleId, reason, before: { status: sale.status }, after: { status: 'CANCELLED', refunded: refunded.toFixed(2) } },
        tx,
      );
    });
    return this.get(ctx, saleId);
  }

  /** Invoice view-model built ONLY from snapshots (FR-046, FR-048, FR-049). */
  async invoice(ctx: ShopContext, saleId: string, language?: 'bn' | 'en') {
    const sale = await this.get(ctx, saleId);
    return {
      invoiceNumber: sale.invoiceNumber,
      language: language ?? sale.invoiceLanguage,
      issuedAt: sale.completedAt ?? sale.soldAt,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      currency: sale.currency,
      shop: sale.shopSnapshot,
      customer: sale.customerSnapshot,
      branch: sale.branch,
      cashier: sale.cashier.fullName,
      lines: sale.items.map((i) => ({
        lineNo: i.lineNo,
        productName: i.productName,
        sku: i.sku,
        measurement: i.enteredMeasurement,
        measurementDisplay: i.enteredDisplay,
        pieces: i.pieces,
        totalLengthInches: i.totalLengthInches,
        priceUnitCode: i.priceUnitCode,
        quantity: D(i.totalLengthInches.toString()).div(i.priceUnitInches.toString()).toFixed(4),
        unitRate: i.unitRate,
        grossAmount: i.grossAmount,
        discountAmount: i.discountAmount,
        taxRate: i.taxRate,
        taxAmount: i.taxAmount,
        lineTotal: i.lineTotal,
        conversion: i.conversionSnapshot,
      })),
      totals: {
        subtotal: sale.subtotal,
        lineDiscountTotal: sale.lineDiscountTotal,
        invoiceDiscountAmount: sale.invoiceDiscountAmount,
        taxTotal: sale.taxTotal,
        roundingAdjustment: sale.roundingAdjustment,
        grandTotal: sale.grandTotal,
        paidAmount: sale.paidAmount,
        refundedAmount: sale.refundedAmount,
        dueAmount: sale.dueAmount,
      },
      payments: sale.payments.map((p) => ({ methodType: p.methodType, direction: p.direction, amount: p.amount, reference: p.reference, receivedAt: p.receivedAt, status: p.status })),
    };
  }
}
