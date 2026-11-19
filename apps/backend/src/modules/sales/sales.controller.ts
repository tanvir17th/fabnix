import { Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import type { AuthedRequest } from '../../common/auth/auth.decorators';
import { Idempotent } from '../../common/idempotency/idempotency';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('shops/:shopId/sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @ShopRoute(P.POS_SALE_CREATE)
  @Idempotent('pos.sale.create')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  create(@Shop() ctx: ShopContext, @ZBody(schemas.createSaleSchema) dto: z.infer<typeof schemas.createSaleSchema>, @Req() req: AuthedRequest) {
    return this.sales.create(ctx, dto, req.idempotencyKey!);
  }

  @Get()
  @ShopRoute()
  list(@Shop() ctx: ShopContext, @ZQuery(schemas.saleListQuery) q: z.infer<typeof schemas.saleListQuery>) {
    return this.sales.list(ctx, q);
  }

  @Get(':saleId')
  @ShopRoute()
  get(@Shop() ctx: ShopContext, @IdParam('saleId') id: string) {
    return this.sales.get(ctx, id);
  }

  @Get(':saleId/invoice')
  @ShopRoute()
  invoice(@Shop() ctx: ShopContext, @IdParam('saleId') id: string, @Query('lang') lang?: string) {
    return this.sales.invoice(ctx, id, lang === 'bn' || lang === 'en' ? lang : undefined);
  }

  @Post(':saleId/payments')
  @ShopRoute(P.PAYMENTS_COLLECT)
  @Idempotent('pos.payment.collect')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  collect(@Shop() ctx: ShopContext, @IdParam('saleId') id: string, @ZBody(schemas.collectPaymentSchema) dto: z.infer<typeof schemas.collectPaymentSchema>, @Req() req: AuthedRequest) {
    return this.sales.collectPayment(ctx, id, dto, req.idempotencyKey!);
  }

  @Post(':saleId/cancel')
  @ShopRoute(P.SALES_CANCEL)
  cancel(@Shop() ctx: ShopContext, @IdParam('saleId') id: string, @ZBody(schemas.cancelSchema) dto: z.infer<typeof schemas.cancelSchema>) {
    return this.sales.cancel(ctx, id, dto.reason);
  }
}
