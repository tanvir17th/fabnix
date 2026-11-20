import { Injectable } from '@nestjs/common';
import { D, ErrorCode, round, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShopContext } from '../../common/tenancy/shop-context';

type Range = z.infer<typeof schemas.reportRangeQuery>;
const s = (v: unknown) => (v === null || v === undefined ? '0' : String(v));
const MAX_RANGE_DAYS = 366;

/**
 * Permission-scoped reporting (FR-066…FR-070, §11). All date math happens in
 * the SHOP's timezone (BR-014): range bounds are converted to UTC instants so
 * the (shopId, soldAt) indexes are used. Branch scope of the caller is applied.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async tz(shopId: string) {
    return (await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { timezone: true, currency: true } }));
  }

  private branchFilter(ctx: ShopContext, branchId?: string, column = Prisma.sql`"branchId"`): Prisma.Sql {
    if (branchId) {
      ctx.requireBranch(branchId);
      return Prisma.sql`AND ${column} = ${branchId}::uuid`;
    }
    if (ctx.allBranches) return Prisma.empty;
    const ids = [...ctx.branchIds];
    return Prisma.sql`AND ${column} = ANY(${ids}::uuid[])`;
  }

  private bounds(q: Range, tz: string) {
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
    if (days < 0 || days > MAX_RANGE_DAYS) throw new AppError(ErrorCode.VALIDATION_FAILED, { field: 'to', maxDays: MAX_RANGE_DAYS });
    return {
      start: Prisma.sql`(${q.from}::date::timestamp AT TIME ZONE ${tz})`,
      end: Prisma.sql`((${q.to}::date + 1)::timestamp AT TIME ZONE ${tz})`,
    };
  }

  /** FR-066 dashboard KPIs for "today" in shop time + 7-day trend. */
  async dashboard(ctx: ShopContext) {
    const { timezone: tz, currency } = await this.tz(ctx.shopId);
    const bf = this.branchFilter(ctx);
    const today = Prisma.sql`(date_trunc('day', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
    const [sales] = await this.prisma.$queryRaw<Array<{ count: bigint; total: unknown; due: unknown }>>`
      SELECT count(*) AS count, coalesce(sum("grandTotal"), 0) AS total, coalesce(sum("dueAmount"), 0) AS due
      FROM sales WHERE "shopId" = ${ctx.shopId}::uuid AND status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED') AND "soldAt" >= ${today} ${bf}`;
    const [online] = await this.prisma.$queryRaw<Array<{ count: bigint; total: unknown }>>`
      SELECT count(*) AS count, coalesce(sum(total), 0) AS total FROM online_orders
      WHERE "shopId" = ${ctx.shopId}::uuid AND "confirmedAt" >= ${today} AND status NOT IN ('CANCELLED','REJECTED')`;
    const [collections] = await this.prisma.$queryRaw<Array<{ total: unknown }>>`
      SELECT coalesce(sum(CASE WHEN direction = 'IN' THEN amount ELSE -amount END), 0) AS total
      FROM payments WHERE "shopId" = ${ctx.shopId}::uuid AND "receivedAt" >= ${today}`;
    const [receivables] = await this.prisma.$queryRaw<Array<{ total: unknown; customers: bigint }>>`
      SELECT coalesce(sum("dueAmount"), 0) AS total, count(DISTINCT "customerId") AS customers
      FROM sales WHERE "shopId" = ${ctx.shopId}::uuid AND status IN ('COMPLETED','PARTIALLY_RETURNED') AND "dueAmount" > 0 ${bf}`;
    const pendingOrders = await this.prisma.onlineOrder.count({ where: { shopId: ctx.shopId, status: 'PENDING_CONFIRMATION' } });
    const lowStock = await this.prisma.$queryRaw<Array<{ productId: string; name: string; sku: string; available: unknown; threshold: unknown }>>`
      SELECT p.id AS "productId", p.name, p.sku, (i."onHandInches" - i."reservedInches") AS available,
             coalesce(p."lowStockThresholdInches", ss."defaultLowStockInches") AS threshold
      FROM inventory i JOIN products p ON p.id = i."productId" JOIN shop_settings ss ON ss."shopId" = i."shopId"
      WHERE i."shopId" = ${ctx.shopId}::uuid AND p.status = 'ACTIVE'
        AND (i."onHandInches" - i."reservedInches") < coalesce(p."lowStockThresholdInches", ss."defaultLowStockInches") ${this.branchFilter(ctx, undefined, Prisma.sql`i."branchId"`)}
      ORDER BY available ASC LIMIT 10`;
    const trend = await this.prisma.$queryRaw<Array<{ day: Date; total: unknown; count: bigint }>>`
      SELECT d::date AS day, coalesce(sum(s."grandTotal"), 0) AS total, count(s.id) AS count
      FROM generate_series((now() AT TIME ZONE ${tz})::date - 6, (now() AT TIME ZONE ${tz})::date, interval '1 day') d
      LEFT JOIN sales s ON s."shopId" = ${ctx.shopId}::uuid AND s.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
        AND (s."soldAt" AT TIME ZONE ${tz})::date = d::date
      GROUP BY d ORDER BY d`;
    const activity = await this.prisma.auditLog.findMany({
      where: { shopId: ctx.shopId },
      orderBy: { id: 'desc' },
      take: 10,
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, actor: { select: { fullName: true } } },
    });
    return {
      currency,
      timezone: tz,
      today: {
        posSalesCount: Number(sales!.count),
        posSalesTotal: s(sales!.total),
        onlineOrdersCount: Number(online!.count),
        onlineOrdersTotal: s(online!.total),
        collections: s(collections!.total),
      },
      receivables: { total: s(receivables!.total), customers: Number(receivables!.customers) },
      pendingOrders,
      lowStock: lowStock.map((r) => ({ productId: r.productId, name: r.name, sku: r.sku, availableInches: D(s(r.available)).toFixed(4), thresholdInches: D(s(r.threshold)).toFixed(4) })),
      trend: trend.map((t) => ({ day: t.day.toISOString().slice(0, 10), total: s(t.total), count: Number(t.count) })),
      activity,
    };
  }

  /** FR-067 sales report: daily series, totals, top products, payment mix, by cashier. */
  async sales(ctx: ShopContext, q: Range) {
    const { timezone: tz, currency } = await this.tz(ctx.shopId);
    const { start, end } = this.bounds(q, tz);
    const bf = this.branchFilter(ctx, q.branchId);
    const scope = Prisma.sql`"shopId" = ${ctx.shopId}::uuid AND "soldAt" >= ${start} AND "soldAt" < ${end} AND status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED') ${bf}`;

    const daily = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT ("soldAt" AT TIME ZONE ${tz})::date AS day, count(*) AS count, sum(subtotal) AS gross,
             sum("lineDiscountTotal" + "invoiceDiscountAmount") AS discounts, sum("taxTotal") AS tax,
             sum("grandTotal") AS net, sum("paidAmount" - "refundedAmount") AS paid, sum("dueAmount") AS due
      FROM sales WHERE ${scope} GROUP BY 1 ORDER BY 1`;
    const online = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT ("confirmedAt" AT TIME ZONE ${tz})::date AS day, count(*) AS count, sum(total) AS net, sum("deliveryFee") AS delivery
      FROM online_orders WHERE "shopId" = ${ctx.shopId}::uuid AND "confirmedAt" >= ${start} AND "confirmedAt" < ${end}
        AND status NOT IN ('CANCELLED','REJECTED') GROUP BY 1 ORDER BY 1`;
    const top = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT x."productId", x.name, sum(x.inches) AS inches, sum(x.revenue) AS revenue FROM (
        SELECT si."productId", si."productName" AS name, si."totalLengthInches" AS inches, si."lineTotal" AS revenue
        FROM sale_items si JOIN sales sa ON sa.id = si."saleId"
        WHERE sa."shopId" = ${ctx.shopId}::uuid AND sa."soldAt" >= ${start} AND sa."soldAt" < ${end} AND sa.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED') ${this.branchFilter(ctx, q.branchId, Prisma.sql`sa."branchId"`)}
        UNION ALL
        SELECT oi."productId", oi."productName", oi."quantityInches", oi."lineTotal"
        FROM online_order_items oi JOIN online_orders o ON o.id = oi."orderId"
        WHERE o."shopId" = ${ctx.shopId}::uuid AND o."confirmedAt" >= ${start} AND o."confirmedAt" < ${end} AND o.status NOT IN ('CANCELLED','REJECTED')
      ) x GROUP BY x."productId", x.name ORDER BY revenue DESC LIMIT 10`;
    const methods = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "methodType" AS method, sum(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) AS total
      FROM payments WHERE "shopId" = ${ctx.shopId}::uuid AND "receivedAt" >= ${start} AND "receivedAt" < ${end}
      GROUP BY 1 ORDER BY 2 DESC`;
    const cashiers = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT u.id AS "userId", u."fullName" AS name, count(sa.id) AS count, sum(sa."grandTotal") AS net
      FROM sales sa JOIN users u ON u.id = sa."cashierUserId"
      WHERE sa."shopId" = ${ctx.shopId}::uuid AND sa."soldAt" >= ${start} AND sa."soldAt" < ${end} AND sa.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED') ${this.branchFilter(ctx, q.branchId, Prisma.sql`sa."branchId"`)}
      GROUP BY u.id, u."fullName" ORDER BY net DESC`;

    const series = daily.map((d) => ({
      day: (d.day as Date).toISOString().slice(0, 10),
      count: Number(d.count),
      gross: s(d.gross),
      discounts: s(d.discounts),
      tax: s(d.tax),
      net: s(d.net),
      paid: s(d.paid),
      due: s(d.due),
    }));
    const sumOf = (k: keyof (typeof series)[number]) => series.reduce((a, r) => a.plus(String(r[k])), D(0)).toFixed(2);
    return {
      currency,
      range: { from: q.from, to: q.to, timezone: tz },
      totals: { count: series.reduce((a, r) => a + r.count, 0), gross: sumOf('gross'), discounts: sumOf('discounts'), tax: sumOf('tax'), net: sumOf('net'), paid: sumOf('paid'), due: sumOf('due') },
      pos: series,
      online: online.map((o) => ({ day: (o.day as Date).toISOString().slice(0, 10), count: Number(o.count), net: s(o.net), delivery: s(o.delivery) })),
      topProducts: top.map((t) => ({ productId: t.productId, name: t.name, inches: D(s(t.inches)).toFixed(4), revenue: D(s(t.revenue)).toFixed(2) })),
      paymentMethods: methods.map((m) => ({ method: m.method, total: D(s(m.total)).toFixed(2) })),
      cashiers: cashiers.map((c) => ({ userId: c.userId, name: c.name, count: Number(c.count), net: D(s(c.net)).toFixed(2) })),
    };
  }

  /** FR-059 expenses by category. */
  async expenses(ctx: ShopContext, q: Range) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT c.id, c.name, c."nameKey", coalesce(sum(e.amount), 0) AS total, count(e.id) AS count
      FROM expense_categories c LEFT JOIN expenses e ON e."categoryId" = c.id AND e.status = 'POSTED'
        AND e."expenseDate" BETWEEN ${q.from}::date AND ${q.to}::date
      WHERE c."shopId" = ${ctx.shopId}::uuid GROUP BY c.id ORDER BY total DESC`;
    const items = rows.map((r) => ({ categoryId: r.id, name: r.name, nameKey: r.nameKey, count: Number(r.count), total: D(s(r.total)).toFixed(2) }));
    return { range: { from: q.from, to: q.to }, items, total: items.reduce((a, r) => a.plus(r.total), D(0)).toFixed(2) };
  }

  /**
   * FR-061 profit ESTIMATE. Basis (disclosed to the user):
   *  revenue  = POS grand totals + confirmed online order totals, minus tax, minus delivery fees
   *  COGS     = sold length × moving-average cost per inch captured at sale/order time
   *  expenses = posted expenses dated in the range
   */
  async profit(ctx: ShopContext, q: Range) {
    const { timezone: tz, currency } = await this.tz(ctx.shopId);
    const { start, end } = this.bounds(q, tz);
    const [pos] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT coalesce(sum(sa."grandTotal" - sa."taxTotal"), 0) AS revenue
      FROM sales sa WHERE sa."shopId" = ${ctx.shopId}::uuid AND sa."soldAt" >= ${start} AND sa."soldAt" < ${end} AND sa.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')`;
    const [web] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT coalesce(sum(o.total - o."taxTotal" - o."deliveryFee"), 0) AS revenue
      FROM online_orders o WHERE o."shopId" = ${ctx.shopId}::uuid AND o."confirmedAt" >= ${start} AND o."confirmedAt" < ${end} AND o.status NOT IN ('CANCELLED','REJECTED')`;
    /*
     * COGS per sold line = sold length (in the fabric's price unit, e.g. yards)
     * × purchase price per that unit. The cost recorded on the line at sale time
     * wins; a line sold with NO recorded cost (0/null, e.g. purchase price was
     * not set yet) falls back to the fabric's CURRENT purchase price.
     * length_inches × (rate ÷ inches_per_unit) ≡ (length_inches ÷ inches_per_unit) × rate.
     */
    const [cost] = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      WITH lines AS (
        SELECT si."productId", si."totalLengthInches" AS inches, si."costPerInch" AS recorded
        FROM sale_items si JOIN sales s2 ON s2.id = si."saleId"
        WHERE s2."shopId" = ${ctx.shopId}::uuid AND s2."soldAt" >= ${start} AND s2."soldAt" < ${end}
          AND s2.status IN ('COMPLETED','PARTIALLY_RETURNED','RETURNED')
        UNION ALL
        SELECT oi."productId", oi."quantityInches", oi."costPerInch"
        FROM online_order_items oi JOIN online_orders o2 ON o2.id = oi."orderId"
        WHERE o2."shopId" = ${ctx.shopId}::uuid AND o2."confirmedAt" >= ${start} AND o2."confirmedAt" < ${end}
          AND o2.status NOT IN ('CANCELLED','REJECTED')
      ), priced AS (
        SELECT l.inches, nullif(l.recorded, 0) AS recorded,
               CASE WHEN p."purchaseRate" > 0 AND mu."inchesPerUnit" > 0 THEN p."purchaseRate" / mu."inchesPerUnit" END AS current_cost
        FROM lines l
        JOIN products p ON p.id = l."productId"
        LEFT JOIN measurement_units mu ON mu."shopId" = p."shopId" AND mu.code = p."priceUnitCode" AND mu."isActive"
      )
      SELECT coalesce(sum(inches * coalesce(recorded, current_cost, 0)), 0) AS cogs,
             count(*) FILTER (WHERE recorded IS NULL AND current_cost IS NOT NULL) AS estimated_lines,
             count(*) FILTER (WHERE recorded IS NULL AND current_cost IS NULL) AS uncosted_lines
      FROM priced`;
    const exp = await this.prisma.expense.aggregate({
      where: { shopId: ctx.shopId, status: 'POSTED', expenseDate: { gte: new Date(q.from), lte: new Date(q.to) } },
      _sum: { amount: true },
    });
    const revenue = D(s(pos!.revenue)).plus(s(web!.revenue));
    const cogs = round(D(s(cost!.cogs)), 2);
    const expenses = D(s(exp._sum.amount));
    const gross = revenue.minus(cogs);
    return {
      currency,
      range: { from: q.from, to: q.to, timezone: tz },
      revenue: revenue.toFixed(2),
      costOfGoodsSold: cogs.toFixed(2),
      grossProfit: gross.toFixed(2),
      expenses: expenses.toFixed(2),
      netProfit: gross.minus(expenses).toFixed(2),
      grossMarginPercent: revenue.isZero() ? '0.00' : gross.div(revenue).times(100).toFixed(2),
      /** Sold lines with no recorded cost, valued at the fabric's current purchase price. */
      estimatedCostLines: Number(cost!.estimated_lines),
      /** Sold lines with no recorded cost AND no purchase price — counted at 0; profit is overstated. */
      uncostedLines: Number(cost!.uncosted_lines),
      basisKeys: ['reports.profit.basis.revenue', 'reports.profit.basis.cogs', 'reports.profit.basis.fallback', 'reports.profit.basis.expenses'],
    };
  }

  /** FR-070 CSV export of the daily sales series. */
  toCsv(report: Awaited<ReturnType<ReportsService['sales']>>): string {
    const head = ['day', 'count', 'gross', 'discounts', 'tax', 'net', 'paid', 'due'];
    const esc = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return [head.join(','), ...report.pos.map((r) => head.map((h) => esc(r[h as keyof typeof r])).join(','))].join('\n') + '\n';
  }

  /** FR-084 audit search, shop-scoped. */
  async audit(ctx: ShopContext, q: z.infer<typeof schemas.auditListQuery>) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        shopId: ctx.shopId,
        ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
        ...(q.action ? { action: { startsWith: q.action } } : {}),
        ...(q.targetType ? { targetType: q.targetType } : {}),
        ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, fullName: true } } },
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }
}
