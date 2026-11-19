import { Injectable } from '@nestjs/common';
import { D, Decimal, ErrorCode, ZERO, allocate, round, schemas, sum, summarizePayment } from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { DocumentSequenceService } from '../../common/sequences/document-sequence.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import { StockService } from '../inventory/stock.service';
import { UnitsService } from '../measurement/units.service';

type CreatePurchase = z.infer<typeof schemas.createPurchaseSchema>;

const purchaseInclude = {
  items: { orderBy: { lineNo: 'asc' } },
  payments: { orderBy: { paidAt: 'asc' } },
  supplier: { select: { id: true, name: true, phone: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseInclude;

/**
 * Supplier purchases (FR-054…FR-057). Posting a purchase increases stock
 * through PURCHASE_IN ledger movements (FR-056) and updates the moving-average
 * cost with LANDED cost: header discount and other charges are allocated to
 * lines pro-rata by value before computing cost per inch.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly units: UnitsService,
    private readonly sequences: DocumentSequenceService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- suppliers

  async listSuppliers(shopId: string, q: { q?: string; cursor?: string; limit: number }) {
    const rows = await this.prisma.supplier.findMany({
      where: { shopId, status: 'ACTIVE', ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}) },
      orderBy: { name: 'asc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  async createSupplier(ctx: ShopContext, dto: z.infer<typeof schemas.supplierSchema>) {
    const s = await this.prisma.supplier.create({ data: { shopId: ctx.shopId, ...dto } });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'supplier.create', targetType: 'supplier', targetId: s.id });
    return s;
  }

  async updateSupplier(ctx: ShopContext, id: string, dto: z.infer<typeof schemas.updateSupplierSchema>) {
    const before = await this.prisma.supplier.findFirst({ where: { id, shopId: ctx.shopId } });
    if (!before) throw notFound('supplier');
    const after = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'supplier.update', targetType: 'supplier', targetId: id, before, after });
    return after;
  }

  async getSupplier(shopId: string, id: string) {
    const s = await this.prisma.supplier.findFirst({
      where: { id, shopId },
      include: {
        purchases: { orderBy: { purchaseDate: 'desc' }, take: 20, select: { id: true, purchaseNumber: true, purchaseDate: true, total: true, dueAmount: true, status: true, paymentStatus: true } },
        payments: { orderBy: { paidAt: 'desc' }, take: 20 },
      },
    });
    if (!s) throw notFound('supplier');
    return s;
  }

  // ---------------------------------------------------------------- purchases

  async create(ctx: ShopContext, dto: CreatePurchase, idempotencyKey: string) {
    ctx.requireBranch(dto.branchId);
    const prior = await this.prisma.purchase.findUnique({ where: { shopId_idempotencyKey: { shopId: ctx.shopId, idempotencyKey } }, include: purchaseInclude });
    if (prior) return prior;
    const id = await this.prisma.tx((tx) => this.createInTx(tx, ctx, dto, idempotencyKey));
    return this.get(ctx.shopId, id);
  }

  private async createInTx(tx: Tx, ctx: ShopContext, dto: CreatePurchase, idempotencyKey: string): Promise<string> {
    const [shop, settings, branch, supplier] = await Promise.all([
      tx.shop.findUniqueOrThrow({ where: { id: ctx.shopId } }),
      tx.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } }),
      tx.branch.findFirst({ where: { id: dto.branchId, shopId: ctx.shopId } }),
      tx.supplier.findFirst({ where: { id: dto.supplierId, shopId: ctx.shopId, status: 'ACTIVE' } }),
    ]);
    if (!branch) throw notFound('branch');
    if (!supplier) throw notFound('supplier');
    const dp = settings.currencyPrecision;
    const table = await this.units.table(ctx.shopId, 'ANY', tx);
    const products = await tx.product.findMany({ where: { shopId: ctx.shopId, id: { in: dto.items.map((i) => i.productId) } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines = dto.items.map((item) => {
      const p = byId.get(item.productId);
      if (!p) throw notFound('product', { productId: item.productId });
      const measured = table.resolve(item.measurement);
      const unit = table.priceUnit(p.priceUnitCode);
      const lineTotal = round(measured.inches.times(item.unitCost).div(D(unit.inchesPerUnit)), dp);
      return { item, product: p, measured, unit, lineTotal };
    });
    const subtotal = sum(lines.map((l) => l.lineTotal));
    const discount = D(dto.discountAmount);
    if (discount.greaterThan(subtotal)) throw new AppError(ErrorCode.DISCOUNT_EXCEEDS_AMOUNT);
    const other = D(dto.otherCharges);
    const discAlloc = allocate(discount, lines.map((l) => l.lineTotal), dp);
    const chargeAlloc = allocate(other, lines.map((l) => l.lineTotal), dp);
    const total = subtotal.minus(discount).plus(other);

    const paid = sum(dto.payments.map((p) => p.amount));
    if (paid.greaterThan(total)) throw new AppError(ErrorCode.OVERPAYMENT_NOT_ALLOWED, { total: total.toFixed(dp) });
    const methods = await tx.shopPaymentMethod.findMany({ where: { shopId: ctx.shopId, id: { in: dto.payments.map((p) => p.paymentMethodId) }, isActive: true } });
    for (const p of dto.payments) if (!methods.find((m) => m.id === p.paymentMethodId)) throw new AppError(ErrorCode.PAYMENT_METHOD_UNAVAILABLE);
    const pay = summarizePayment(total, paid, 0, dp);

    const purchaseNumber = await this.sequences.next(tx, ctx.shopId, 'PURCHASE', { prefix: 'PUR', yearlyReset: settings.invoiceYearlyReset, timezone: shop.timezone });
    const now = new Date();
    const purchase = await tx.purchase.create({
      data: {
        shopId: ctx.shopId,
        branchId: dto.branchId,
        supplierId: supplier.id,
        purchaseNumber,
        supplierInvoiceRef: dto.supplierInvoiceRef,
        status: 'POSTED',
        paymentStatus: pay.status,
        purchaseDate: new Date(`${dto.purchaseDate}T00:00:00Z`),
        currency: shop.currency,
        subtotal: subtotal.toFixed(dp),
        discountAmount: discount.toFixed(dp),
        otherCharges: other.toFixed(dp),
        total: total.toFixed(dp),
        paidAmount: paid.toFixed(dp),
        dueAmount: pay.due,
        notes: dto.notes,
        idempotencyKey,
        createdById: ctx.userId,
        postedById: ctx.userId,
        postedAt: now,
      },
    });
    const items = await tx.purchaseItem.createManyAndReturn({
      data: lines.map((l, i) => {
        const landed = l.lineTotal.minus(discAlloc[i]!).plus(chargeAlloc[i]!);
        return {
          shopId: ctx.shopId,
          purchaseId: purchase.id,
          productId: l.product.id,
          lineNo: i + 1,
          productName: l.product.name,
          enteredMeasurement: l.measured.components as unknown as Prisma.InputJsonValue,
          receivedInches: l.measured.inches.toFixed(4),
          conversionSnapshot: l.measured.snapshot as unknown as Prisma.InputJsonValue,
          costUnitCode: l.unit.code,
          costUnitInches: D(l.unit.inchesPerUnit).toString(),
          unitCost: l.item.unitCost,
          discountAmount: discAlloc[i]!.toFixed(dp),
          lineTotal: l.lineTotal.toFixed(dp),
          costPerInch: landed.div(l.measured.inches).toDecimalPlaces(6).toFixed(6),
        };
      }),
    });
    const stocks = await this.stock.lock(tx, ctx.shopId, dto.branchId, items.map((i) => i.productId));
    for (const it of items) {
      await this.stock.apply(tx, stocks.get(it.productId)!, {
        type: 'PURCHASE_IN',
        deltaOnHand: it.receivedInches.toString(),
        unitCostPerInch: it.costPerInch.toString(),
        purchaseItemId: it.id,
        actorUserId: ctx.userId,
      });
    }
    for (const p of dto.payments) {
      await tx.supplierPayment.create({ data: { shopId: ctx.shopId, supplierId: supplier.id, purchaseId: purchase.id, paymentMethodId: p.paymentMethodId, amount: p.amount, reference: p.reference, createdById: ctx.userId } });
    }
    const due = D(pay.due);
    if (due.greaterThan(0)) await tx.supplier.update({ where: { id: supplier.id }, data: { balancePayable: { increment: due.toFixed(dp) } } });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'purchase.post', targetType: 'purchase', targetId: purchase.id, after: { purchaseNumber, total: total.toFixed(dp) } }, tx);
    return purchase.id;
  }

  async get(shopId: string, id: string) {
    const p = await this.prisma.purchase.findFirst({ where: { id, shopId }, include: purchaseInclude });
    if (!p) throw notFound('purchase');
    return p;
  }

  async list(ctx: ShopContext, q: z.infer<typeof schemas.purchaseListQuery>) {
    const rows = await this.prisma.purchase.findMany({
      where: {
        shopId: ctx.shopId,
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.from || q.to ? { purchaseDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } },
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  /** FR-057: payment against a purchase (or on account). */
  async pay(ctx: ShopContext, purchaseId: string, dto: z.infer<typeof schemas.supplierPaymentSchema>) {
    await this.prisma.tx(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM purchases WHERE id = ${purchaseId}::uuid AND "shopId" = ${ctx.shopId}::uuid FOR UPDATE`;
      if (!rows.length) throw notFound('purchase');
      const p = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
      if (p.status !== 'POSTED') throw new AppError(ErrorCode.CONFLICT, { status: p.status });
      if (D(dto.amount).greaterThan(p.dueAmount.toString())) throw new AppError(ErrorCode.OVERPAYMENT_NOT_ALLOWED, { remaining: p.dueAmount.toString() });
      const method = await tx.shopPaymentMethod.findFirst({ where: { id: dto.paymentMethodId, shopId: ctx.shopId, isActive: true } });
      if (!method) throw new AppError(ErrorCode.PAYMENT_METHOD_UNAVAILABLE);
      await tx.supplierPayment.create({ data: { shopId: ctx.shopId, supplierId: p.supplierId, purchaseId, paymentMethodId: method.id, amount: dto.amount, reference: dto.reference, note: dto.note, createdById: ctx.userId } });
      const newPaid = D(p.paidAmount.toString()).plus(dto.amount);
      const s = summarizePayment(p.total.toString(), newPaid);
      await tx.purchase.update({ where: { id: purchaseId }, data: { paidAmount: newPaid.toFixed(2), dueAmount: s.due, paymentStatus: s.status } });
      await tx.supplier.update({ where: { id: p.supplierId }, data: { balancePayable: { decrement: D(dto.amount).toFixed(2) } } });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'supplier.payment', targetType: 'purchase', targetId: purchaseId, after: { amount: dto.amount } }, tx);
    });
    return this.get(ctx.shopId, purchaseId);
  }

  /** Reverse a posted purchase with compensating PURCHASE_CANCEL_OUT movements (BR-009). */
  async cancel(ctx: ShopContext, purchaseId: string, reason: string) {
    await this.prisma.tx(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM purchases WHERE id = ${purchaseId}::uuid AND "shopId" = ${ctx.shopId}::uuid FOR UPDATE`;
      if (!rows.length) throw notFound('purchase');
      const p = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { items: true, payments: true } });
      if (p.status !== 'POSTED') throw new AppError(ErrorCode.CONFLICT, { status: p.status });
      const ins = await tx.stockMovement.findMany({ where: { purchaseItemId: { in: p.items.map((i) => i.id) }, type: 'PURCHASE_IN' } });
      const stocks = await this.stock.lock(tx, ctx.shopId, p.branchId, p.items.map((i) => i.productId));
      for (const mv of ins) {
        const s = stocks.get(mv.productId)!;
        this.stock.assertAvailable(s, mv.deltaOnHandInches.toString());
        await this.stock.apply(tx, s, { type: 'PURCHASE_CANCEL_OUT', deltaOnHand: D(mv.deltaOnHandInches.toString()).negated(), removeCostPerInch: mv.unitCostPerInch?.toString(), purchaseItemId: mv.purchaseItemId!, reversesMovementId: mv.id, reason, actorUserId: ctx.userId });
      }
      let reversed: Decimal = ZERO;
      for (const pay of p.payments.filter((x) => x.status === 'POSTED')) {
        await tx.supplierPayment.update({ where: { id: pay.id }, data: { status: 'REVERSED' } });
        reversed = reversed.plus(pay.amount.toString());
      }
      await tx.purchase.update({ where: { id: purchaseId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: ctx.userId, cancelReason: reason, dueAmount: '0' } });
      if (D(p.dueAmount.toString()).greaterThan(0)) await tx.supplier.update({ where: { id: p.supplierId }, data: { balancePayable: { decrement: p.dueAmount } } });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'purchase.cancel', targetType: 'purchase', targetId: purchaseId, reason, after: { paymentsReversed: reversed.toFixed(2) } }, tx);
    });
    return this.get(ctx.shopId, purchaseId);
  }

  // ---------------------------------------------------------------- expenses (FR-058…FR-062)

  async ensureExpenseCategories(shopId: string) {
    const count = await this.prisma.expenseCategory.count({ where: { shopId } });
    if (count) return;
    const defaults = [
      ['Rent', 'expenses.rent'], ['Salary', 'expenses.salary'], ['Utilities', 'expenses.utilities'], ['Transport', 'expenses.transport'],
      ['Tailoring', 'expenses.tailoring'], ['Marketing', 'expenses.marketing'], ['Other', 'expenses.other'],
    ];
    await this.prisma.expenseCategory.createMany({ data: defaults.map(([name, nameKey]) => ({ shopId, name: name!, nameKey })), skipDuplicates: true });
  }

  async listExpenseCategories(shopId: string) {
    await this.ensureExpenseCategories(shopId);
    return this.prisma.expenseCategory.findMany({ where: { shopId, status: 'ACTIVE' }, orderBy: { name: 'asc' } });
  }

  createExpenseCategory(ctx: ShopContext, name: string) {
    return this.prisma.expenseCategory.create({ data: { shopId: ctx.shopId, name } });
  }

  async createExpense(ctx: ShopContext, dto: z.infer<typeof schemas.expenseSchema>) {
    const cat = await this.prisma.expenseCategory.findFirst({ where: { id: dto.categoryId, shopId: ctx.shopId } });
    if (!cat) throw notFound('expense_category');
    if (dto.branchId) {
      ctx.requireBranch(dto.branchId);
      if (!(await this.prisma.branch.findFirst({ where: { id: dto.branchId, shopId: ctx.shopId } }))) throw notFound('branch');
    }
    if (dto.paymentMethodId && !(await this.prisma.shopPaymentMethod.findFirst({ where: { id: dto.paymentMethodId, shopId: ctx.shopId } }))) throw notFound('payment_method');
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId }, select: { currency: true } });
    const e = await this.prisma.expense.create({
      data: { shopId: ctx.shopId, categoryId: cat.id, branchId: dto.branchId, paymentMethodId: dto.paymentMethodId, amount: dto.amount, currency: shop.currency, expenseDate: new Date(`${dto.expenseDate}T00:00:00Z`), note: dto.note, createdById: ctx.userId },
    });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'expense.create', targetType: 'expense', targetId: e.id, after: { amount: dto.amount, category: cat.name } });
    return e;
  }

  async listExpenses(shopId: string, q: z.infer<typeof schemas.expenseListQuery>) {
    const where: Prisma.ExpenseWhereInput = {
      shopId,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.from || q.to ? { expenseDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    const [rows, totals] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { id: 'desc' },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: { category: { select: { id: true, name: true, nameKey: true } }, createdBy: { select: { fullName: true } } },
      }),
      this.prisma.expense.aggregate({ where: { ...where, status: 'POSTED' }, _sum: { amount: true } }),
    ]);
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null, total: totals._sum.amount ?? '0' };
  }

  /** Posted expenses are never deleted; voiding is a status change with an audit entry (FR-062). */
  async voidExpense(ctx: ShopContext, id: string, reason: string) {
    const e = await this.prisma.expense.findFirst({ where: { id, shopId: ctx.shopId } });
    if (!e) throw notFound('expense');
    if (e.status !== 'POSTED') throw new AppError(ErrorCode.CONFLICT, { status: e.status });
    const after = await this.prisma.expense.update({ where: { id }, data: { status: 'REVERSED' } });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'expense.void', targetType: 'expense', targetId: id, reason, before: { status: e.status }, after: { status: after.status } });
    return after;
  }
}
