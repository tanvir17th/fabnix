import { Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody } from '../../common/validation/zod';
import { StorefrontService } from './storefront.service';

@ApiTags('storefront (shopkeeper)')
@ApiBearerAuth()
@Controller('shops/:shopId/storefront')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  @ShopRoute(P.STOREFRONT_MANAGE)
  get(@Shop() ctx: ShopContext) {
    return this.storefront.get(ctx.shopId);
  }

  @Put()
  @ShopRoute(P.STOREFRONT_MANAGE)
  upsert(@Shop() ctx: ShopContext, @ZBody(schemas.updateStorefrontSchema) dto: z.infer<typeof schemas.updateStorefrontSchema>) {
    return this.storefront.upsert(ctx, dto);
  }

  @Post('visibility')
  @ShopRoute(P.STOREFRONT_MANAGE)
  visibility(@Shop() ctx: ShopContext, @ZBody(schemas.storefrontVisibilitySchema) dto: z.infer<typeof schemas.storefrontVisibilitySchema>) {
    return this.storefront.setVisibility(ctx, dto.action);
  }

  @Get('delivery-options')
  @ShopRoute(P.STOREFRONT_MANAGE)
  delivery(@Shop() ctx: ShopContext) {
    return this.storefront.listDelivery(ctx.shopId);
  }

  @Post('delivery-options')
  @ShopRoute(P.STOREFRONT_MANAGE)
  createDelivery(@Shop() ctx: ShopContext, @ZBody(schemas.deliveryOptionSchema) dto: z.infer<typeof schemas.deliveryOptionSchema>) {
    return this.storefront.createDelivery(ctx, dto);
  }

  @Patch('delivery-options/:optionId')
  @ShopRoute(P.STOREFRONT_MANAGE)
  updateDelivery(@Shop() ctx: ShopContext, @IdParam('optionId') id: string, @ZBody(schemas.updateDeliveryOptionSchema) dto: z.infer<typeof schemas.updateDeliveryOptionSchema>) {
    return this.storefront.updateDelivery(ctx, id, dto);
  }
}
