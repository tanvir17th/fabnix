import { Injectable } from '@nestjs/common';
import { D, DomainError, ErrorCode, schemas, sum } from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppError, notFound } from '../../common/errors/app-error';
import { Db, PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { UnitsService } from '../measurement/units.service';
import { PublicCatalogService, publicProductWhere } from '../storefront/public-catalog.service';

const CART_TTL_DAYS = 30;

/** Customer cart per shop (FR-099, FR-100, FR-101). */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: PublicCatalogService,
    private readonly units: UnitsService,
    private readonly storage: StorageService,
  ) {}

  async activeCart(userId: string, shopId: string, db: Db = this.prisma, create = true) {
    const existing = await db.onlineCart.findFirst({ where: { shopId, customerUserId: userId, status: 'ACTIVE' } });
    if (existing || !create) return existing;
    try {
      return await db.onlineCart.create({ data: { shopId, customerUserId: userId, expiresAt: new Date(Date.now() + CART_TTL_DAYS * 86_400_000) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return db.onlineCart.findFirstOrThrow({ where: { shopId, customerUserId: userId, status: 'ACTIVE' } });
      }
      throw e;
    }
  }

  async view(userId: string, slug: string) {
    const store = await this.catalog.visibleStore(slug);
    const cart = await this.activeCart(userId, store.shop.id);
    return this.render(cart!.id, store.shop.id, store.shop.currency, store.orderable);
  }

  async add(userId: string, slug: string, dto: z.infer<typeof schemas.addCartItemSchema>) {
    const store = await this.catalog.visibleStore(slug);
    const shopId = store.shop.id;
    const product = await this.prisma.product.findFirst({ where: { ...publicProductWhere(shopId), id: dto.productId } });
    if (!product) throw notFound('product');
    const [settings, table] = await Promise.all([this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId } }), this.units.table(shopId, 'ONLINE')]);
    const line = this.catalog.priceOnlineLine(table, product, dto.measurement, dto.pieces, settings);
    const cart = (await this.activeCart(userId, shopId))!;
    const count = await this.prisma.cartItem.count({ where: { cartId: cart.id } });
    if (count >= 50) throw new AppError(ErrorCode.VALIDATION_FAILED, { reason: 'cart_full' });
    await this.prisma.cartItem.create({
      data: {
        shopId,
        cartId: cart.id,
        productId: product.id,
        enteredMeasurement: line.entered as unknown as Prisma.InputJsonValue,
        lengthInches: line.lengthInches,
        pieces: dto.pieces,
        conversionSnapshot: line.conversionSnapshot as unknown as Prisma.InputJsonValue,
        displayedUnitRate: line.unitRate,
        displayedLineTotal: line.lineTotal,
      },
    });
    return this.render(cart.id, shopId, store.shop.currency, store.orderable);
  }

  async update(userId: string, slug: string, itemId: string, dto: z.infer<typeof schemas.updateCartItemSchema>) {
    const store = await this.catalog.visibleStore(slug);
    const shopId = store.shop.id;
    const cart = await this.activeCart(userId, shopId, this.prisma, false);
    const item = cart ? await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id }, include: { product: true } }) : null;
    if (!cart || !item) throw notFound('cart_item');
    const [settings, table] = await Promise.all([this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId } }), this.units.table(shopId, 'ONLINE')]);
    const measurement = dto.measurement ?? (item.enteredMeasurement as unknown as z.infer<typeof schemas.measurementInput>);
    const pieces = dto.pieces ?? item.pieces;
    const line = this.catalog.priceOnlineLine(table, item.product, measurement, pieces, settings);
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        enteredMeasurement: line.entered as unknown as Prisma.InputJsonValue,
        lengthInches: line.lengthInches,
        pieces,
        conversionSnapshot: line.conversionSnapshot as unknown as Prisma.InputJsonValue,
        displayedUnitRate: line.unitRate,
        displayedLineTotal: line.lineTotal,
      },
    });
    return this.render(cart.id, shopId, store.shop.currency, store.orderable);
  }

  async remove(userId: string, slug: string, itemId: string) {
    const store = await this.catalog.visibleStore(slug);
    const cart = await this.activeCart(userId, store.shop.id, this.prisma, false);
    const r = cart ? await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } }) : { count: 0 };
    if (!r.count) throw notFound('cart_item');
    return this.render(cart!.id, store.shop.id, store.shop.currency, store.orderable);
  }

  /** Re-prices every line live and flags changes since it was added (FR-102 preview). */
  async render(cartId: string, shopId: string, currency: string, orderable: boolean) {
    const [items, settings, table] = await Promise.all([
      this.prisma.cartItem.findMany({
        where: { cartId },
        include: { product: { include: { images: { where: { deletedAt: null, moderationStatus: 'VISIBLE' }, orderBy: { sortOrder: 'asc' }, take: 1 } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.shopSettings.findUniqueOrThrow({ where: { shopId } }),
      this.units.table(shopId, 'ONLINE'),
    ]);
    const lines = items.map((i) => {
      const p = i.product;
      const purchasable = p.status === 'ACTIVE' && p.isPublishedOnline && p.moderationStatus === 'VISIBLE';
      let live: ReturnType<PublicCatalogService['priceOnlineLine']> | null = null;
      let problem: string | null = purchasable ? null : ErrorCode.PRODUCT_NOT_SELLABLE;
      if (purchasable) {
        try {
          live = this.catalog.priceOnlineLine(table, p, i.enteredMeasurement as never, i.pieces, settings);
        } catch (e) {
          problem = e instanceof DomainError ? e.code : ErrorCode.INTERNAL;
        }
      }
      return {
        id: i.id,
        product: { id: p.id, slug: p.slug, name: p.name, thumbnailUrl: this.storage.publicUrl(p.images[0]?.thumbnailKey) },
        entered: i.enteredMeasurement,
        enteredDisplay: live?.enteredDisplay ?? null,
        pieces: i.pieces,
        lengthInches: i.lengthInches.toFixed(4),
        priceUnitCode: live?.priceUnitCode ?? p.priceUnitCode,
        unitRate: live?.unitRate ?? i.displayedUnitRate.toString(),
        lineTotal: live?.lineTotal ?? i.displayedLineTotal.toFixed(2),
        priceChanged: !!live && (!D(live.unitRate).equals(i.displayedUnitRate.toString()) || !D(live.lineTotal).equals(i.displayedLineTotal.toString())),
        problem,
      };
    });
    const valid = lines.filter((l) => !l.problem);
    return {
      id: cartId,
      currency,
      orderable,
      items: lines,
      itemsTotal: sum(valid.map((l) => l.lineTotal)).toFixed(settings.currencyPrecision),
      hasChanges: lines.some((l) => l.priceChanged || l.problem),
    };
  }
}
