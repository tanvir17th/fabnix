import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { ErrorCode } from '@fabnix/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { PlanLimitService } from '../../common/plan/plan-limit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import { CatalogService } from './catalog.service';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_SHORT_SIDE = 600;
const MAX_PIXELS = 40_000_000;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const VARIANTS = [
  { name: 'full', size: 1920, quality: 82 },
  { name: 'medium', size: 960, quality: 80 },
  { name: 'thumb', size: 320, quality: 75 },
] as const;

export interface UploadedFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

/**
 * Fabric photo pipeline (FR-091, FR-092). Format is detected from the bytes
 * (never the client MIME type); images are auto-rotated, stripped of EXIF/GPS
 * metadata, re-encoded to WebP and resized into three variants.
 */
@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly plans: PlanLimitService,
    private readonly catalog: CatalogService,
  ) {}

  async upload(ctx: ShopContext, productId: string, file: UploadedFile | undefined, replaceImageId?: string) {
    if (!file?.buffer?.length) throw new AppError(ErrorCode.IMAGE_INVALID, { reason: 'missing_file' });
    if (file.size > MAX_IMAGE_BYTES) throw new AppError(ErrorCode.IMAGE_INVALID, { reason: 'too_large', maxBytes: MAX_IMAGE_BYTES });
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId: ctx.shopId }, select: { id: true } });
    if (!product) throw notFound('product');

    let replaced: { id: string; sortOrder: number } | null = null;
    if (replaceImageId) {
      replaced = await this.prisma.productImage.findFirst({ where: { id: replaceImageId, productId, shopId: ctx.shopId, deletedAt: null }, select: { id: true, sortOrder: true } });
      if (!replaced) throw notFound('image');
    } else {
      const count = await this.prisma.productImage.count({ where: { productId, shopId: ctx.shopId, deletedAt: null } });
      const max = await this.plans.maxImagesPerProduct(ctx.shopId);
      if (count >= max) throw new AppError(ErrorCode.IMAGE_LIMIT_REACHED, { max });
    }

    let meta: Metadata;
    try {
      meta = await sharp(file.buffer, { limitInputPixels: MAX_PIXELS }).metadata();
    } catch {
      throw new AppError(ErrorCode.IMAGE_INVALID, { reason: 'unreadable' });
    }
    if (!meta.format || !ALLOWED.has(meta.format)) throw new AppError(ErrorCode.IMAGE_INVALID, { reason: 'format', allowed: [...ALLOWED] });
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (Math.min(w, h) < MIN_SHORT_SIDE) throw new AppError(ErrorCode.IMAGE_INVALID, { reason: 'too_small', minShortSide: MIN_SHORT_SIDE });

    const imageId = randomUUID();
    const base = `shops/${ctx.shopId}/products/${productId}/${imageId}`;
    const keys: Record<string, string> = {};
    let fullInfo: OutputInfo | undefined;
    for (const v of VARIANTS) {
      const { data, info } = await sharp(file.buffer, { limitInputPixels: MAX_PIXELS })
        .rotate()
        .resize({ width: v.size, height: v.size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: v.quality })
        .toBuffer({ resolveWithObject: true });
      const key = `${base}/${v.name}.webp`;
      await this.storage.put(key, data, 'image/webp');
      keys[v.name] = key;
      if (v.name === 'full') fullInfo = info;
    }

    const image = await this.prisma.tx(async (tx) => {
      let sortOrder = replaced?.sortOrder;
      if (replaced) {
        await tx.productImage.update({ where: { id: replaced.id }, data: { deletedAt: new Date() } });
      } else {
        const last = await tx.productImage.aggregate({ where: { productId, deletedAt: null }, _max: { sortOrder: true } });
        sortOrder = (last._max.sortOrder ?? -1) + 1;
      }
      const created = await tx.productImage.create({
        data: {
          id: imageId,
          shopId: ctx.shopId,
          productId,
          storageKey: keys.full!,
          mediumKey: keys.medium,
          thumbnailKey: keys.thumb,
          mimeType: 'image/webp',
          sizeBytes: fullInfo?.size ?? file.size,
          width: fullInfo?.width ?? w,
          height: fullInfo?.height ?? h,
          sortOrder: sortOrder ?? 0,
          uploadedById: ctx.userId,
        },
      });
      await this.audit.log(
        { shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: replaced ? 'product.image_replace' : 'product.image_upload', targetType: 'product_image', targetId: created.id, before: replaced, after: { productId } },
        tx,
      );
      return created;
    });
    return this.catalog.imageView(image);
  }

  async reorder(ctx: ShopContext, productId: string, imageIds: string[]) {
    const images = await this.prisma.productImage.findMany({ where: { productId, shopId: ctx.shopId, deletedAt: null }, select: { id: true } });
    const current = new Set(images.map((i) => i.id));
    if (imageIds.length !== current.size || !imageIds.every((id) => current.has(id))) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, { reason: 'image_set_mismatch' });
    }
    await this.prisma.$transaction(imageIds.map((id, idx) => this.prisma.productImage.update({ where: { id }, data: { sortOrder: idx } })));
    return this.list(ctx.shopId, productId);
  }

  async setAlt(ctx: ShopContext, productId: string, imageId: string, altText: string | null) {
    const r = await this.prisma.productImage.updateMany({ where: { id: imageId, productId, shopId: ctx.shopId, deletedAt: null }, data: { altText } });
    if (!r.count) throw notFound('image');
    return this.list(ctx.shopId, productId);
  }

  async remove(ctx: ShopContext, productId: string, imageId: string) {
    const r = await this.prisma.productImage.updateMany({ where: { id: imageId, productId, shopId: ctx.shopId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!r.count) throw notFound('image');
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'product.image_remove', targetType: 'product_image', targetId: imageId });
  }

  async list(shopId: string, productId: string) {
    const images = await this.prisma.productImage.findMany({ where: { productId, shopId, deletedAt: null }, orderBy: { sortOrder: 'asc' } });
    return images.map((i) => this.catalog.imageView(i));
  }
}
