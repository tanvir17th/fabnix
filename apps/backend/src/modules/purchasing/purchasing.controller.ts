import { Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import type { AuthedRequest } from '../../common/auth/auth.decorators';
import { Idempotent } from '../../common/idempotency/idempotency';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';
import { PurchasingService } from './purchasing.service';

const supplierQuery = schemas.paginationQuery.extend({ q: z.string().trim().max(100).optional() });

@ApiTags('purchases & expenses')
@ApiBearerAuth()
@Controller('shops/:shopId')
export class PurchasingController {
  constructor(private readonly svc: PurchasingService) {}

  @Get('suppliers')
  @ShopRoute(P.SUPPLIERS_MANAGE)
  suppliers(@Shop() ctx: ShopContext, @ZQuery(supplierQuery) q: z.infer<typeof supplierQuery>) {
    return this.svc.listSuppliers(ctx.shopId, q);
  }

  @Post('suppliers')
  @ShopRoute(P.SUPPLIERS_MANAGE)
  createSupplier(@Shop() ctx: ShopContext, @ZBody(schemas.supplierSchema) dto: z.infer<typeof schemas.supplierSchema>) {
    return this.svc.createSupplier(ctx, dto);
  }

  @Get('suppliers/:supplierId')
  @ShopRoute(P.SUPPLIERS_MANAGE)
  supplier(@Shop() ctx: ShopContext, @IdParam('supplierId') id: string) {
    return this.svc.getSupplier(ctx.shopId, id);
  }

  @Patch('suppliers/:supplierId')
  @ShopRoute(P.SUPPLIERS_MANAGE)
  updateSupplier(@Shop() ctx: ShopContext, @IdParam('supplierId') id: string, @ZBody(schemas.updateSupplierSchema) dto: z.infer<typeof schemas.updateSupplierSchema>) {
    return this.svc.updateSupplier(ctx, id, dto);
  }

  @Get('purchases')
  @ShopRoute(P.PURCHASES_MANAGE)
  purchases(@Shop() ctx: ShopContext, @ZQuery(schemas.purchaseListQuery) q: z.infer<typeof schemas.purchaseListQuery>) {
    return this.svc.list(ctx, q);
  }

  @Post('purchases')
  @ShopRoute(P.PURCHASES_MANAGE)
  @Idempotent('purchase.post')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createPurchase(@Shop() ctx: ShopContext, @ZBody(schemas.createPurchaseSchema) dto: z.infer<typeof schemas.createPurchaseSchema>, @Req() req: AuthedRequest) {
    return this.svc.create(ctx, dto, req.idempotencyKey!);
  }

  @Get('purchases/:purchaseId')
  @ShopRoute(P.PURCHASES_MANAGE)
  purchase(@Shop() ctx: ShopContext, @IdParam('purchaseId') id: string) {
    return this.svc.get(ctx.shopId, id);
  }

  @Post('purchases/:purchaseId/payments')
  @ShopRoute(P.PURCHASES_MANAGE)
  pay(@Shop() ctx: ShopContext, @IdParam('purchaseId') id: string, @ZBody(schemas.supplierPaymentSchema) dto: z.infer<typeof schemas.supplierPaymentSchema>) {
    return this.svc.pay(ctx, id, dto);
  }

  @Post('purchases/:purchaseId/cancel')
  @ShopRoute(P.PURCHASES_MANAGE)
  cancel(@Shop() ctx: ShopContext, @IdParam('purchaseId') id: string, @ZBody(schemas.cancelSchema) dto: z.infer<typeof schemas.cancelSchema>) {
    return this.svc.cancel(ctx, id, dto.reason);
  }

  @Get('expense-categories')
  @ShopRoute(P.EXPENSES_MANAGE)
  categories(@Shop() ctx: ShopContext) {
    return this.svc.listExpenseCategories(ctx.shopId);
  }

  @Post('expense-categories')
  @ShopRoute(P.EXPENSES_MANAGE)
  createCategory(@Shop() ctx: ShopContext, @ZBody(schemas.expenseCategorySchema) dto: z.infer<typeof schemas.expenseCategorySchema>) {
    return this.svc.createExpenseCategory(ctx, dto.name);
  }

  @Get('expenses')
  @ShopRoute(P.EXPENSES_MANAGE)
  expenses(@Shop() ctx: ShopContext, @ZQuery(schemas.expenseListQuery) q: z.infer<typeof schemas.expenseListQuery>) {
    return this.svc.listExpenses(ctx.shopId, q);
  }

  @Post('expenses')
  @ShopRoute(P.EXPENSES_MANAGE)
  createExpense(@Shop() ctx: ShopContext, @ZBody(schemas.expenseSchema) dto: z.infer<typeof schemas.expenseSchema>) {
    return this.svc.createExpense(ctx, dto);
  }

  @Post('expenses/:expenseId/void')
  @ShopRoute(P.EXPENSES_MANAGE)
  voidExpense(@Shop() ctx: ShopContext, @IdParam('expenseId') id: string, @ZBody(schemas.cancelSchema) dto: z.infer<typeof schemas.cancelSchema>) {
    return this.svc.voidExpense(ctx, id, dto.reason);
  }
}
