import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, UserTypes } from '../../common/auth/auth.decorators';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody } from '../../common/validation/zod';
import { ShopsService } from './shops.service';

@ApiTags('shops')
@ApiBearerAuth()
@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Post()
  @UserTypes('SHOPKEEPER')
  create(@CurrentUser() user: AuthUser, @ZBody(schemas.createShopSchema) dto: z.infer<typeof schemas.createShopSchema>) {
    return this.shops.create(user, dto);
  }

  @Get(':shopId')
  @ShopRoute()
  get(@Shop() ctx: ShopContext) {
    return this.shops.get(ctx.shopId);
  }

  /**
   * The caller's effective access in this shop + POS pricing policy. Used by the
   * UI to shape navigation; the server still enforces every permission (BR-012).
   */
  @Get(':shopId/me')
  @ShopRoute()
  me(@Shop() ctx: ShopContext) {
    return this.shops.myAccess(ctx);
  }

  @Patch(':shopId')
  @ShopRoute(P.SHOP_SETTINGS_MANAGE)
  update(@Shop() ctx: ShopContext, @ZBody(schemas.updateShopSchema) dto: z.infer<typeof schemas.updateShopSchema>) {
    return this.shops.update(ctx, dto);
  }

  @Get(':shopId/settings')
  @ShopRoute(P.SHOP_SETTINGS_VIEW)
  settings(@Shop() ctx: ShopContext) {
    return this.shops.getSettings(ctx.shopId);
  }

  @Patch(':shopId/settings')
  @ShopRoute(P.SHOP_SETTINGS_MANAGE)
  updateSettings(@Shop() ctx: ShopContext, @ZBody(schemas.updateShopSettingsSchema) dto: z.infer<typeof schemas.updateShopSettingsSchema>) {
    return this.shops.updateSettings(ctx, dto);
  }

  @Get(':shopId/branches')
  @ShopRoute()
  branches(@Shop() ctx: ShopContext) {
    return this.shops.listBranches(ctx);
  }

  @Post(':shopId/branches')
  @ShopRoute(P.BRANCH_MANAGE)
  createBranch(@Shop() ctx: ShopContext, @ZBody(schemas.branchSchema) dto: z.infer<typeof schemas.branchSchema>) {
    return this.shops.createBranch(ctx, dto);
  }

  @Patch(':shopId/branches/:branchId')
  @ShopRoute(P.BRANCH_MANAGE)
  updateBranch(@Shop() ctx: ShopContext, @IdParam('branchId') branchId: string, @ZBody(schemas.updateBranchSchema) dto: z.infer<typeof schemas.updateBranchSchema>) {
    return this.shops.updateBranch(ctx, branchId, dto);
  }

  @Get(':shopId/payment-methods')
  @ShopRoute()
  paymentMethods(@Shop() ctx: ShopContext) {
    return this.shops.listPaymentMethods(ctx.shopId);
  }

  @Post(':shopId/payment-methods')
  @ShopRoute(P.PAYMENT_METHODS_MANAGE)
  createPaymentMethod(@Shop() ctx: ShopContext, @ZBody(schemas.paymentMethodSchema) dto: z.infer<typeof schemas.paymentMethodSchema>) {
    return this.shops.createPaymentMethod(ctx, dto);
  }

  @Patch(':shopId/payment-methods/:methodId')
  @ShopRoute(P.PAYMENT_METHODS_MANAGE)
  updatePaymentMethod(
    @Shop() ctx: ShopContext,
    @IdParam('methodId') id: string,
    @ZBody(schemas.updatePaymentMethodSchema) dto: z.infer<typeof schemas.updatePaymentMethodSchema>,
  ) {
    return this.shops.updatePaymentMethod(ctx, id, dto);
  }
}
