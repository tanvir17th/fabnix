import { Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  D,
  ShopPermission as P,
  calculateLine,
  decompose,
  equivalents,
  formatMeasurement,
  schemas,
} from '@fabnix/shared';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notFound } from '../../common/errors/app-error';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { ZBody } from '../../common/validation/zod';
import { pricingPolicy } from '../sales/pricing-policy';
import { UnitsService } from './units.service';

@ApiTags('measurement')
@ApiBearerAuth()
@Controller('shops/:shopId')
export class MeasurementController {
  constructor(
    private readonly units: UnitsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('units')
  @ShopRoute()
  list(@Shop() ctx: ShopContext, @Query('includeInactive') includeInactive?: string) {
    return this.units.list(ctx.shopId, includeInactive === 'true');
  }

  @Post('units')
  @ShopRoute(P.UNITS_MANAGE)
  create(@Shop() ctx: ShopContext, @ZBody(schemas.createUnitSchema) dto: z.infer<typeof schemas.createUnitSchema>) {
    return this.units.create(ctx, dto);
  }

  @Put('units/:code/factor')
  @ShopRoute(P.UNITS_MANAGE)
  changeFactor(@Shop() ctx: ShopContext, @Param('code') code: string, @ZBody(schemas.updateUnitFactorSchema) dto: z.infer<typeof schemas.updateUnitFactorSchema>) {
    return this.units.changeFactor(ctx, code, dto);
  }

  @Patch('units/:code')
  @ShopRoute(P.UNITS_MANAGE)
  updateFlags(@Shop() ctx: ShopContext, @Param('code') code: string, @ZBody(schemas.updateUnitFlagsSchema) dto: z.infer<typeof schemas.updateUnitFlagsSchema>) {
    return this.units.updateFlags(ctx, code, dto);
  }

  /**
   * Fabric calculator (FR-014…FR-018): normalized inches, equivalents in every
   * configured unit, yard+gira breakdown and — given a product or rate — the
   * full price preview using the same engine the sale will use.
   */
  @Post('calculations')
  @ShopRoute()
  async calculate(@Shop() ctx: ShopContext, @ZBody(schemas.calculationSchema) dto: z.infer<typeof schemas.calculationSchema>) {
    const table = await this.units.table(ctx.shopId, 'POS');
    const settings = await this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId: ctx.shopId } });
    const measured = table.resolve(dto.measurement, settings.defaultDisplayUnitCode);
    const totalInches = measured.inches.times(dto.pieces);
    const dp = settings.lengthDisplayPrecision;

    const yard = table.byCode('YARD');
    const gira = table.byCode('GIRA');
    const breakdown = yard && gira ? decompose(totalInches, [yard, gira], dp) : null;

    let price = null;
    let rate: string | undefined = dto.unitRate;
    let priceUnitCode = dto.priceUnitCode ?? 'YARD';
    let taxRate: string | undefined;
    if (dto.productId) {
      const product = await this.prisma.product.findFirst({ where: { id: dto.productId, shopId: ctx.shopId } });
      if (!product) throw notFound('product');
      rate = rate ?? product.sellingRate.toString();
      priceUnitCode = product.priceUnitCode;
      taxRate = (product.taxRate ?? settings.defaultTaxRate).toString();
    }
    if (rate !== undefined) {
      const unit = table.priceUnit(priceUnitCode);
      price = {
        priceUnitCode: unit.code,
        ...calculateLine(
          { lengthInches: measured.inches, pieces: dto.pieces, priceUnitInches: unit.inchesPerUnit, unitRate: rate, discount: dto.discount, taxRate: taxRate ?? settings.defaultTaxRate.toString() },
          pricingPolicy(settings),
        ),
      };
    }

    return {
      entered: measured.components,
      enteredDisplay: formatMeasurement(measured.components, table.forChannel),
      pieces: dto.pieces,
      lengthInches: measured.inches.toFixed(4),
      totalInches: D(totalInches).toFixed(4),
      equivalents: equivalents(totalInches, table.forChannel, dp),
      breakdown,
      conversionSnapshot: measured.snapshot,
      price,
    };
  }
}
