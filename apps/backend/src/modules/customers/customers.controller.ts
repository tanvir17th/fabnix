import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { notFound } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';

const listQuery = schemas.paginationQuery.extend({ q: z.string().trim().max(100).optional(), withDue: z.enum(['true', 'false']).optional() });

/** Shop-scoped customer records, receivables and history (FR-050…FR-052). */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('shops/:shopId/customers')
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ShopRoute(P.CUSTOMERS_VIEW)
  async list(@Shop() ctx: ShopContext, @ZQuery(listQuery) q: z.infer<typeof listQuery>) {
    const rows = await this.prisma.customer.findMany({
      where: {
        shopId: ctx.shopId,
        status: 'ACTIVE',
        ...(q.withDue === 'true' ? { balanceDue: { gt: 0 } } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
      },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  @Post()
  @ShopRoute(P.CUSTOMERS_MANAGE)
  async create(@Shop() ctx: ShopContext, @ZBody(schemas.customerSchema) dto: z.infer<typeof schemas.customerSchema>) {
    const c = await this.prisma.customer.create({ data: { shopId: ctx.shopId, ...dto } });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'customer.create', targetType: 'customer', targetId: c.id });
    return c;
  }

  @Get(':customerId')
  @ShopRoute(P.CUSTOMERS_VIEW)
  async get(@Shop() ctx: ShopContext, @IdParam('customerId') id: string) {
    const c = await this.prisma.customer.findFirst({
      where: { id, shopId: ctx.shopId },
      include: {
        sales: { orderBy: { soldAt: 'desc' }, take: 20, select: { id: true, invoiceNumber: true, soldAt: true, grandTotal: true, paidAmount: true, dueAmount: true, status: true, paymentStatus: true } },
        orders: { orderBy: { placedAt: 'desc' }, take: 20, select: { id: true, orderNumber: true, placedAt: true, total: true, status: true, paymentStatus: true } },
        payments: { orderBy: { receivedAt: 'desc' }, take: 20, select: { id: true, amount: true, direction: true, methodType: true, receivedAt: true, saleId: true, orderId: true, status: true } },
      },
    });
    if (!c) throw notFound('customer');
    return c;
  }

  @Patch(':customerId')
  @ShopRoute(P.CUSTOMERS_MANAGE)
  async update(@Shop() ctx: ShopContext, @IdParam('customerId') id: string, @ZBody(schemas.updateCustomerSchema) dto: z.infer<typeof schemas.updateCustomerSchema>) {
    const before = await this.prisma.customer.findFirst({ where: { id, shopId: ctx.shopId } });
    if (!before) throw notFound('customer');
    const after = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'customer.update', targetType: 'customer', targetId: id, before, after });
    return after;
  }
}
