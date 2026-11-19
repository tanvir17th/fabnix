import { Injectable } from '@nestjs/common';
import { ErrorCode, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { PlanLimitService } from '../../common/plan/plan-limit.service';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import { slugify } from '../../common/crypto';
import { UnitsService } from '../measurement/units.service';

type CreateProduct = z.infer<typeof schemas.createProductSchema>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly plans: PlanLimitService,
    private readonly units: UnitsService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- categories

  listCategories(shopId: string, includeArchived = false) {
    return this.prisma.category.findMany({
      where: { shopId, ...(includeArchived ? {} : { status: 'ACTIVE' }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(ctx: ShopContext, dto: z.infer<typeof schemas.categorySchema>) {
    if (dto.parentId) await this.assertCategory(ctx.shopId, dto.parentId);
    const category = await this.prisma.category.create({
      data: { shopId: ctx.shopId, name: dto.name, slug: dto.slug ?? slugify(dto.name, 'cat'), parentId: dto.parentId ?? null, sortOrder: dto.sortOrder ?? 0 },
    });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'category.create', targetType: 'category', targetId: category.id, after: category });
    return category;
  }

  async updateCategory(ctx: ShopContext, id: string, dto: z.infer<typeof schemas.updateCategorySchema>) {
    const before = await this.assertCategory(ctx.shopId, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new AppError(ErrorCode.VALIDATION_FAILED, { field: 'parentId' });
      await this.assertCategory(ctx.shopId, dto.parentId);
    }
    const after = await this.prisma.category.update({ where: { id }, data: dto });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'category.update', targetType: 'category', targetId: id, before, after });
    return after;
  }

  private async assertCategory(shopId: string, id: string) {
    const c = await this.prisma.category.findFirst({ where: { id, shopId } });
    if (!c) throw notFound('category');
    return c;
  }

  // ---------------------------------------------------------------- products

  async createProduct(ctx: ShopContext, dto: CreateProduct) {
    return this.prisma.tx(async (tx) => {
      await this.plans.assertWithin(ctx.shopId, 'maxProducts', tx);
      if (dto.categoryId) {
        const c = await tx.category.findFirst({ where: { id: dto.categoryId, shopId: ctx.shopId } });
        if (!c) throw notFound('category');
      }
      (await this.units.table(ctx.shopId, 'ANY', tx)).priceUnit(dto.priceUnitCode);
      const product = await tx.product.create({
        data: { ...this.productData(dto), shopId: ctx.shopId, slug: dto.slug ?? slugify(dto.name, 'fabric'), createdById: ctx.userId },
      });
      // Eager zero-balance inventory rows per branch keep the stock lock path insert-free.
      const branches = await tx.branch.findMany({ where: { shopId: ctx.shopId }, select: { id: true } });
      await tx.inventory.createMany({ data: branches.map((b) => ({ shopId: ctx.shopId, branchId: b.id, productId: product.id })), skipDuplicates: true });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'product.create', targetType: 'product', targetId: product.id, after: product }, tx);
      return product;
    });
  }

  async updateProduct(ctx: ShopContext, id: string, dto: z.infer<typeof schemas.updateProductSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.product.findFirst({ where: { id, shopId: ctx.shopId } });
      if (!before) throw notFound('product');
      if (dto.categoryId) {
        const c = await tx.category.findFirst({ where: { id: dto.categoryId, shopId: ctx.shopId } });
        if (!c) throw notFound('category');
      }
      if (dto.priceUnitCode) (await this.units.table(ctx.shopId, 'ANY', tx)).priceUnit(dto.priceUnitCode);
      const archiving = dto.status === 'ARCHIVED' && before.status !== 'ARCHIVED';
      const after = await tx.product.update({
        where: { id },
        data: {
          ...this.productData(dto),
          ...(dto.slug ? { slug: dto.slug } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(archiving ? { archivedAt: new Date(), isPublishedOnline: false } : {}),
        },
      });
      // Rate/name changes never touch sale_items/online_order_items snapshots (FR-021, FR-049).
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'product.update', targetType: 'product', targetId: id, before, after }, tx);
      return after;
    });
  }

  async setPublished(ctx: ShopContext, id: string, published: boolean) {
    const product = await this.prisma.product.findFirst({ where: { id, shopId: ctx.shopId } });
    if (!product) throw notFound('product');
    if (published && product.status !== 'ACTIVE') throw new AppError(ErrorCode.PRODUCT_NOT_SELLABLE, { status: product.status });
    if (published && product.moderationStatus !== 'VISIBLE') throw new AppError(ErrorCode.PRODUCT_NOT_SELLABLE, { moderation: product.moderationStatus });
    const after = await this.prisma.product.update({
      where: { id },
      data: { isPublishedOnline: published, publishedAt: published ? (product.publishedAt ?? new Date()) : product.publishedAt },
    });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: published ? 'product.publish' : 'product.unpublish', targetType: 'product', targetId: id });
    return after;
  }

  async getProduct(shopId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, shopId },
      include: { category: true, images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, inventory: { include: { branch: { select: { id: true, name: true } } } } },
    });
    if (!product) throw notFound('product');
    return {
      ...product,
      images: product.images.map((i) => this.imageView(i)),
      inventory: product.inventory.map((r) => ({
        branch: r.branch,
        onHandInches: r.onHandInches,
        reservedInches: r.reservedInches,
        availableInches: r.onHandInches.minus(r.reservedInches).toFixed(4),
      })),
    };
  }

  /** FR-022: search by name/SKU/barcode with category, fabric type, status filters. */
  async listProducts(shopId: string, q: z.infer<typeof schemas.productListQuery>) {
    const where: Prisma.ProductWhereInput = {
      shopId,
      ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.fabricType ? { fabricType: { equals: q.fabricType, mode: 'insensitive' } } : {}),
      ...(q.barcode ? { barcode: q.barcode } : {}),
      ...(q.published !== undefined ? { isPublishedOnline: q.published } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }, { barcode: q.q }] }
        : {}),
    };
    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    const items = rows.slice(0, q.limit).map(({ images, ...p }) => ({ ...p, thumbnailUrl: this.storage.publicUrl(images[0]?.thumbnailKey) }));
    return { items, nextCursor: rows.length > q.limit ? items[items.length - 1]!.id : null };
  }

  imageView(i: { id: string; storageKey: string; thumbnailKey: string | null; mediumKey: string | null; altText: string | null; sortOrder: number; width: number; height: number; moderationStatus?: string }) {
    return {
      id: i.id,
      url: this.storage.publicUrl(i.storageKey),
      mediumUrl: this.storage.publicUrl(i.mediumKey),
      thumbnailUrl: this.storage.publicUrl(i.thumbnailKey),
      altText: i.altText,
      sortOrder: i.sortOrder,
      width: i.width,
      height: i.height,
      ...(i.moderationStatus ? { moderationStatus: i.moderationStatus } : {}),
    };
  }

  private productData(dto: Partial<CreateProduct>) {
    const { slug: _slug, ...rest } = dto;
    return rest as Omit<CreateProduct, 'slug'>;
  }
}

export type { Tx };
