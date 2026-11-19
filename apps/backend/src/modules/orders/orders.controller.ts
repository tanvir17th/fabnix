import { Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuthedRequest, AuthUser, CurrentUser, UserTypes } from '../../common/auth/auth.decorators';
import { Idempotent } from '../../common/idempotency/idempotency';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';
import { CartService } from './cart.service';
import { OrdersService } from './orders.service';

/** Customer-facing cart, checkout and order tracking (FR-099…FR-131). */
@ApiTags('customer: cart & orders')
@ApiBearerAuth()
@UserTypes('CUSTOMER')
@Controller('me')
export class CustomerOrdersController {
  constructor(
    private readonly cart: CartService,
    private readonly orders: OrdersService,
  ) {}

  @Get('carts/:slug')
  getCart(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.cart.view(user.id, slug);
  }

  @Post('carts/:slug/items')
  addItem(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @ZBody(schemas.addCartItemSchema) dto: z.infer<typeof schemas.addCartItemSchema>) {
    return this.cart.add(user.id, slug, dto);
  }

  @Patch('carts/:slug/items/:itemId')
  updateItem(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @IdParam('itemId') itemId: string, @ZBody(schemas.updateCartItemSchema) dto: z.infer<typeof schemas.updateCartItemSchema>) {
    return this.cart.update(user.id, slug, itemId, dto);
  }

  @Delete('carts/:slug/items/:itemId')
  removeItem(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @IdParam('itemId') itemId: string) {
    return this.cart.remove(user.id, slug, itemId);
  }

  @Post('carts/:slug/checkout')
  @Idempotent('order.submit')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  checkout(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @ZBody(schemas.checkoutSchema) dto: z.infer<typeof schemas.checkoutSchema>, @Req() req: AuthedRequest) {
    return this.orders.checkout(user, slug, dto, req.idempotencyKey!);
  }

  @Get('orders')
  myOrders(@CurrentUser() user: AuthUser, @ZQuery(schemas.paginationQuery) q: z.infer<typeof schemas.paginationQuery>) {
    return this.orders.customerOrders(user, q);
  }

  @Get('orders/:orderId')
  myOrder(@CurrentUser() user: AuthUser, @IdParam('orderId') id: string) {
    return this.orders.customerOrder(user, id);
  }

  @Post('orders/:orderId/cancel')
  cancel(@CurrentUser() user: AuthUser, @IdParam('orderId') id: string, @ZBody(schemas.cancelSchema) dto: z.infer<typeof schemas.cancelSchema>) {
    return this.orders.cancelByCustomer(user, id, dto.reason);
  }
}

/** Shopkeeper online-order inbox and fulfilment (FR-109…FR-117). */
@ApiTags('orders (shopkeeper)')
@ApiBearerAuth()
@Controller('shops/:shopId/orders')
export class ShopOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ShopRoute(P.ORDERS_VIEW)
  list(@Shop() ctx: ShopContext, @ZQuery(schemas.orderListQuery) q: z.infer<typeof schemas.orderListQuery>) {
    return this.orders.shopOrders(ctx, q);
  }

  @Get(':orderId')
  @ShopRoute(P.ORDERS_VIEW)
  get(@Shop() ctx: ShopContext, @IdParam('orderId') id: string) {
    return this.orders.shopOrder(ctx, id);
  }

  @Post(':orderId/confirm')
  @ShopRoute(P.ORDERS_MANAGE)
  confirm(@Shop() ctx: ShopContext, @IdParam('orderId') id: string) {
    return this.orders.confirm(ctx, id);
  }

  @Post(':orderId/reject')
  @ShopRoute(P.ORDERS_MANAGE)
  reject(@Shop() ctx: ShopContext, @IdParam('orderId') id: string, @ZBody(schemas.cancelSchema) dto: z.infer<typeof schemas.cancelSchema>) {
    return this.orders.reject(ctx, id, dto.reason);
  }

  @Post(':orderId/cancel')
  @ShopRoute(P.ORDERS_MANAGE)
  cancel(@Shop() ctx: ShopContext, @IdParam('orderId') id: string, @ZBody(schemas.cancelSchema) dto: z.infer<typeof schemas.cancelSchema>) {
    return this.orders.cancelByShop(ctx, id, dto.reason);
  }

  @Post(':orderId/status')
  @ShopRoute(P.ORDERS_MANAGE)
  status(@Shop() ctx: ShopContext, @IdParam('orderId') id: string, @ZBody(schemas.orderStatusUpdateSchema) dto: z.infer<typeof schemas.orderStatusUpdateSchema>) {
    return this.orders.updateStatus(ctx, id, dto);
  }

  @Post(':orderId/notes')
  @ShopRoute(P.ORDERS_MANAGE)
  note(@Shop() ctx: ShopContext, @IdParam('orderId') id: string, @ZBody(schemas.orderNoteSchema) dto: z.infer<typeof schemas.orderNoteSchema>) {
    return this.orders.addNote(ctx, id, dto);
  }

  @Post(':orderId/payments')
  @ShopRoute(P.PAYMENTS_COLLECT)
  @Idempotent('order.payment')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  pay(@Shop() ctx: ShopContext, @IdParam('orderId') id: string, @ZBody(schemas.collectPaymentSchema) dto: z.infer<typeof schemas.collectPaymentSchema>, @Req() req: AuthedRequest) {
    return this.orders.recordPayment(ctx, id, dto, req.idempotencyKey!);
  }
}
