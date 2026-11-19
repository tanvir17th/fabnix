import { Injectable } from '@nestjs/common';
import {
  AvailabilityStatus,
  D,
  Decimal,
  ErrorCode,
  calculateLine,
  equivalents,
  formatMeasurement,
  schemas,
} from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import type { Product, StockVisibility } from '../../generated/prisma/client';
import { AppError, notFound } from '../../common/errors/app-error';
import { Db, PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { UnitsService, UnitTable } from '../measurement/units.service';
import { pricingPolicy } from '../sales/pricing-policy';
import { StorefrontService, StoreState } from './storefront.service';

/** Only ACTIVE, published, non-moderated products are public (FR-094, FR-098, AC-017). */
export const publicProductWhere = (shopId: string): Prisma.ProductWhereInput => ({
  shopId,
  status: 'ACTIVE',
  isPublishedOnline: true,
  moderationStatus: 'VISIBLE',
});

export function availabilityOf(availableInches: Decimal, threshold: Decimal): AvailabilityStatus {
  if (availableInches.lessThanOrEqualTo(0)) return 'OUT_OF_STOCK';
  if (availableInches.lessThan(threshold)) return 'LOW_STOCK';
  return 'IN_STOCK';
}

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storefronts: StorefrontService,
    private readonly units: UnitsService,
    private readonly storage: StorageService,
  ) {}

  async visibleStore(slug: string, db: Db = this.prisma): Promise<StoreState> {
    const s = await this.storefronts.state(slug, db);
    if (!s || !s.visible) throw notFound('storefront');
    return s;
  }

  async store(slug: string) {
    const s = await this.visibleStore(slug);
    const sf = s.storefront;
    const [categories, delivery, methods, table] = await Promise.all([
      this.prisma.category.findMany({
        where: { shopId: s.shop.id, status: 'ACTIVE', products: { some: publicProductWhere(s.shop.id) } },
        select: { id: true, name: true, slug: true, parentId: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.deliveryOption.findMany({
        where: { shopId: s.shop.id, isActive: true },
        select: { id: true, method: true, name: true, chargeType: true, flatFee: true, freeOverAmount: true, estimatedDaysMin: true, estimatedDaysMax: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.shopPaymentMethod.findMany({
        where: { shopId: s.shop.id, isActive: true, availableOnline: true },
        select: { id: true, type: true, label: true, instructions: true, accountRef: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.units.table(s.shop.id, 'ONLINE'),
    ]);
    return {
      slug: sf.slug,
      displayName: sf.displayName,
      tagline: sf.tagline,
      description: sf.description,
      logoUrl: this.storage.publicUrl(sf.logoKey),
      bannerUrl: this.storage.publicUrl(sf.bannerKey),
      contact: { phone: sf.contactPhone, whatsapp: sf.whatsappPhone, email: sf.contactEmail, address: sf.addressLine },
      deliveryCoverage: sf.deliveryCoverage,
      deliveryInfo: sf.deliveryInfo,
      openingStatusNote: sf.openingStatusNote,
      status: sf.status,
      orderable: s.orderable,
      currency: s.shop.currency,
      minOrderAmount: sf.minOrderAmount,
      policies: { returnPolicy: sf.returnPolicy, terms: sf.termsText },
      categories,
      deliveryOptions: delivery,
      paymentMethods: methods,
      units: table.forChannel.map((u) => ({ code: u.code, symbol: u.symbol, name: u.name, inchesPerUnit: D(u.inchesPerUnit).toString() })),
    };
  }

  private async availableByProduct(shopId: string, branchId: string, productIds?: string[]): Promise<Map<string, Decimal>> {
    const rows = await this.prisma.inventory.findMany({
      where: { shopId, branchId, ...(productIds ? { productId: { in: productIds } } : {}) },
      select: { productId: true, onHandInches: true, reservedInches: true },
    });
    return new Map(rows.map((r) => [r.productId, D(r.onHandInches.toString()).minus(r.reservedInches.toString())]));
  }

  private availabilityView(visibility: StockVisibility, avail: Decimal, threshold: Decimal) {
    if (visibility === 'HIDE') return { status: null, availableInches: null };
    return { status: availabilityOf(avail, threshold), availableInches: visibility === 'EXACT' ? Decimal.max(avail, 0).toFixed(4) : null };
  }

  /** FR-096 search & filters. Offset cursor because sorts are not id-ordered. */
  async products(slug: string, q: z.infer<typeof schemas.publicProductQuery>) {
    const s = await this.visibleStore(slug);
    const shopId = s.shop.id;
    const fb = s.storefront.fulfilmentBranchId;
    const settings = await this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId } });

    let inStockIds: string[] | undefined;
    if (q.inStock) {
      const rows = await this.prisma.$queryRaw<Array<{ productId: string }>>`
        SELECT "productId" FROM inventory WHERE "shopId" = ${shopId}::uuid AND "branchId" = ${fb}::uuid AND "onHandInches" - "reservedInches" > 0`;
      inStockIds = rows.map((r) => r.productId);
    }
    const where: Prisma.ProductWhereInput = {
      ...publicProductWhere(shopId),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { fabricType: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.category ? { category: { slug: q.category, status: 'ACTIVE' } } : {}),
      ...(q.color ? { color: { contains: q.color, mode: 'insensitive' } } : {}),
      ...(q.fabricType ? { fabricType: { equals: q.fabricType, mode: 'insensitive' } } : {}),
      ...(q.minPrice || q.maxPrice ? { sellingRate: { ...(q.minPrice ? { gte: q.minPrice } : {}), ...(q.maxPrice ? { lte: q.maxPrice } : {}) } } : {}),
      ...(inStockIds ? { id: { in: inStockIds } } : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'price_asc' ? [{ sellingRate: 'asc' }, { id: 'asc' }]
        : q.sort === 'price_desc' ? [{ sellingRate: 'desc' }, { id: 'asc' }]
          : q.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }]
            : [{ publishedAt: 'desc' }, { id: 'desc' }];
    const offset = q.cursor ? Math.max(0, Number.parseInt(Buffer.from(q.cursor, 'base64url').toString(), 10) || 0) : 0;
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: offset,
        take: q.limit,
        include: { images: { where: { deletedAt: null, moderationStatus: 'VISIBLE' }, orderBy: { sortOrder: 'asc' }, take: 1 }, category: { select: { slug: true, name: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    const avail = await this.availableByProduct(shopId, fb, rows.map((r) => r.id));
    const next = offset + rows.length;
    return {
      items: rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        color: p.color,
        colorHex: p.colorHex,
        fabricType: p.fabricType,
        category: p.category,
        priceUnitCode: p.priceUnitCode,
        price: p.sellingRate,
        thumbnailUrl: this.storage.publicUrl(p.images[0]?.thumbnailKey),
        availability: this.availabilityView(s.storefront.stockVisibility, avail.get(p.id) ?? D(0), D((p.lowStockThresholdInches ?? settings.defaultLowStockInches).toString())),
      })),
      total,
      nextCursor: next < total ? Buffer.from(String(next)).toString('base64url') : null,
    };
  }

  private async publicProduct(shopId: string, productSlug: string): Promise<Product & { images: Prisma.ProductImageGetPayload<object>[]; category: { name: string; slug: string } | null }> {
    const p = await this.prisma.product.findFirst({
      where: { ...publicProductWhere(shopId), slug: productSlug },
      include: { images: { where: { deletedAt: null, moderationStatus: 'VISIBLE' }, orderBy: { sortOrder: 'asc' } }, category: { select: { name: true, slug: true } } },
    });
    if (!p) throw notFound('product');
    return p;
  }

  /** FR-097 product detail page. */
  async product(slug: string, productSlug: string) {
    const s = await this.visibleStore(slug);
    const p = await this.publicProduct(s.shop.id, productSlug);
    const [settings, table, avail, delivery] = await Promise.all([
      this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId: s.shop.id } }),
      this.units.table(s.shop.id, 'ONLINE'),
      this.availableByProduct(s.shop.id, s.storefront.fulfilmentBranchId, [p.id]),
      this.prisma.deliveryOption.findMany({ where: { shopId: s.shop.id, isActive: true }, select: { id: true, method: true, name: true, flatFee: true, chargeType: true, freeOverAmount: true, estimatedDaysMin: true, estimatedDaysMax: true } }),
    ]);
    const threshold = D((p.lowStockThresholdInches ?? settings.defaultLowStockInches).toString());
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      fabricType: p.fabricType,
      color: p.color,
      colorHex: p.colorHex,
      pattern: p.pattern,
      material: p.material,
      widthInches: p.widthInches,
      priceUnitCode: p.priceUnitCode,
      price: p.sellingRate,
      currency: s.shop.currency,
      images: p.images.map((i) => ({ id: i.id, url: this.storage.publicUrl(i.storageKey), mediumUrl: this.storage.publicUrl(i.mediumKey), thumbnailUrl: this.storage.publicUrl(i.thumbnailKey), altText: i.altText, width: i.width, height: i.height })),
      availability: this.availabilityView(s.storefront.stockVisibility, avail.get(p.id) ?? D(0), threshold),
      measurement: {
        units: table.forChannel.map((u) => ({ code: u.code, symbol: u.symbol, name: u.name, inchesPerUnit: D(u.inchesPerUnit).toString() })),
        minOrderInches: p.minOrderInches,
        orderStepInches: p.orderStepInches,
      },
      delivery,
      deliveryInfo: s.storefront.deliveryInfo,
      orderable: s.orderable,
      shop: { name: s.storefront.displayName, slug: s.storefront.slug },
    };
  }

  /** FR-101 live price quote using the shop's online units & current price. */
  async quote(slug: string, productSlug: string, dto: z.infer<typeof schemas.quoteSchema>) {
    const s = await this.visibleStore(slug);
    const p = await this.publicProduct(s.shop.id, productSlug);
    const [settings, table] = await Promise.all([this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId: s.shop.id } }), this.units.table(s.shop.id, 'ONLINE')]);
    const line = this.priceOnlineLine(table, p, dto.measurement, dto.pieces, settings);
    return {
      ...line,
      equivalents: equivalents(D(line.totalLengthInches), table.forChannel, settings.lengthDisplayPrecision),
    };
  }

  /** Shared by quote, cart and checkout so all three compute identically. */
  priceOnlineLine(
    table: UnitTable,
    p: Pick<Product, 'id' | 'priceUnitCode' | 'sellingRate' | 'taxRate' | 'minOrderInches' | 'orderStepInches'>,
    measurement: z.infer<typeof schemas.measurementInput>,
    pieces: number,
    settings: Parameters<typeof pricingPolicy>[0] & { defaultTaxRate: { toString(): string }; defaultDisplayUnitCode: string },
  ) {
    const measured = table.resolve(measurement, settings.defaultDisplayUnitCode);
    if (p.minOrderInches && measured.inches.times(pieces).lessThan(p.minOrderInches.toString())) {
      throw new AppError(ErrorCode.MIN_ORDER_NOT_MET, { minOrderInches: p.minOrderInches.toString() });
    }
    if (p.orderStepInches && !measured.inches.mod(p.orderStepInches.toString()).isZero()) {
      throw new AppError(ErrorCode.MEASUREMENT_INVALID_VALUE, { orderStepInches: p.orderStepInches.toString() });
    }
    const unit = table.priceUnit(p.priceUnitCode);
    const r = calculateLine(
      { lengthInches: measured.inches, pieces, priceUnitInches: unit.inchesPerUnit, unitRate: p.sellingRate.toString(), taxRate: (p.taxRate ?? settings.defaultTaxRate).toString() },
      pricingPolicy(settings),
    );
    return {
      productId: p.id,
      entered: measured.components,
      enteredDisplay: formatMeasurement(measured.components, table.forChannel),
      lengthInches: measured.inches.toFixed(4),
      pieces,
      conversionSnapshot: measured.snapshot,
      priceUnitCode: unit.code,
      priceUnitInches: D(unit.inchesPerUnit).toString(),
      ...r,
    };
  }
}
