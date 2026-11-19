import { Controller, Delete, Get, HttpCode, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';
import { CatalogService } from './catalog.service';
import { ImagesService, MAX_IMAGE_BYTES, UploadedFile as File } from './images.service';

const upload = () => FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('shops/:shopId')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly images: ImagesService,
  ) {}

  @Get('categories')
  @ShopRoute(P.CATALOG_VIEW)
  categories(@Shop() ctx: ShopContext, @Query('includeArchived') inc?: string) {
    return this.catalog.listCategories(ctx.shopId, inc === 'true');
  }

  @Post('categories')
  @ShopRoute(P.CATALOG_MANAGE)
  createCategory(@Shop() ctx: ShopContext, @ZBody(schemas.categorySchema) dto: z.infer<typeof schemas.categorySchema>) {
    return this.catalog.createCategory(ctx, dto);
  }

  @Patch('categories/:categoryId')
  @ShopRoute(P.CATALOG_MANAGE)
  updateCategory(@Shop() ctx: ShopContext, @IdParam('categoryId') id: string, @ZBody(schemas.updateCategorySchema) dto: z.infer<typeof schemas.updateCategorySchema>) {
    return this.catalog.updateCategory(ctx, id, dto);
  }

  @Get('products')
  @ShopRoute(P.CATALOG_VIEW)
  products(@Shop() ctx: ShopContext, @ZQuery(schemas.productListQuery) q: z.infer<typeof schemas.productListQuery>) {
    return this.catalog.listProducts(ctx.shopId, q);
  }

  @Post('products')
  @ShopRoute(P.CATALOG_MANAGE)
  createProduct(@Shop() ctx: ShopContext, @ZBody(schemas.createProductSchema) dto: z.infer<typeof schemas.createProductSchema>) {
    return this.catalog.createProduct(ctx, dto);
  }

  @Get('products/:productId')
  @ShopRoute(P.CATALOG_VIEW)
  product(@Shop() ctx: ShopContext, @IdParam('productId') id: string) {
    return this.catalog.getProduct(ctx.shopId, id);
  }

  @Patch('products/:productId')
  @ShopRoute(P.CATALOG_MANAGE)
  updateProduct(@Shop() ctx: ShopContext, @IdParam('productId') id: string, @ZBody(schemas.updateProductSchema) dto: z.infer<typeof schemas.updateProductSchema>) {
    return this.catalog.updateProduct(ctx, id, dto);
  }

  /** FR-094: online visibility is independent of POS availability. */
  @Put('products/:productId/publication')
  @ShopRoute(P.CATALOG_PUBLISH)
  publish(@Shop() ctx: ShopContext, @IdParam('productId') id: string, @ZBody(schemas.publishProductSchema) dto: z.infer<typeof schemas.publishProductSchema>) {
    return this.catalog.setPublished(ctx, id, dto.published);
  }

  @Get('products/:productId/images')
  @ShopRoute(P.CATALOG_VIEW)
  listImages(@Shop() ctx: ShopContext, @IdParam('productId') id: string) {
    return this.images.list(ctx.shopId, id);
  }

  @Post('products/:productId/images')
  @ShopRoute(P.CATALOG_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload())
  uploadImage(@Shop() ctx: ShopContext, @IdParam('productId') id: string, @UploadedFile() file: File) {
    return this.images.upload(ctx, id, file);
  }

  @Put('products/:productId/images/:imageId')
  @ShopRoute(P.CATALOG_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(upload())
  replaceImage(@Shop() ctx: ShopContext, @IdParam('productId') id: string, @IdParam('imageId') imageId: string, @UploadedFile() file: File) {
    return this.images.upload(ctx, id, file, imageId);
  }

  @Put('products/:productId/images-order')
  @ShopRoute(P.CATALOG_MANAGE)
  reorder(@Shop() ctx: ShopContext, @IdParam('productId') id: string, @ZBody(schemas.reorderImagesSchema) dto: z.infer<typeof schemas.reorderImagesSchema>) {
    return this.images.reorder(ctx, id, dto.imageIds);
  }

  @Patch('products/:productId/images/:imageId')
  @ShopRoute(P.CATALOG_MANAGE)
  setAlt(@Shop() ctx: ShopContext, @IdParam('productId') id: string, @IdParam('imageId') imageId: string, @ZBody(schemas.imageAltSchema) dto: z.infer<typeof schemas.imageAltSchema>) {
    return this.images.setAlt(ctx, id, imageId, dto.altText);
  }

  @Delete('products/:productId/images/:imageId')
  @ShopRoute(P.CATALOG_MANAGE)
  @HttpCode(204)
  removeImage(@Shop() ctx: ShopContext, @IdParam('productId') id: string, @IdParam('imageId') imageId: string) {
    return this.images.remove(ctx, id, imageId);
  }
}
