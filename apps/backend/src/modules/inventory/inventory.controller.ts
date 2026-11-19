import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';
import { InventoryService } from './inventory.service';

const ledgerQuery = schemas.paginationQuery.extend({ branchId: schemas.uuid.optional() });

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('shops/:shopId/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ShopRoute(P.INVENTORY_VIEW)
  list(@Shop() ctx: ShopContext, @ZQuery(schemas.inventoryListQuery) q: z.infer<typeof schemas.inventoryListQuery>) {
    return this.inventory.list(ctx, q);
  }

  @Get('products/:productId/ledger')
  @ShopRoute(P.INVENTORY_VIEW)
  ledger(@Shop() ctx: ShopContext, @IdParam('productId') productId: string, @ZQuery(ledgerQuery) q: z.infer<typeof ledgerQuery>) {
    return this.inventory.ledger(ctx, productId, q);
  }

  @Post('opening')
  @ShopRoute(P.INVENTORY_OPENING)
  opening(@Shop() ctx: ShopContext, @ZBody(schemas.openingStockSchema) dto: z.infer<typeof schemas.openingStockSchema>) {
    return this.inventory.opening(ctx, dto);
  }

  @Post('adjustments')
  @ShopRoute(P.INVENTORY_ADJUST)
  adjust(@Shop() ctx: ShopContext, @ZBody(schemas.stockAdjustmentSchema) dto: z.infer<typeof schemas.stockAdjustmentSchema>) {
    return this.inventory.adjust(ctx, dto);
  }
}
