import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { schemas } from '@fabnix/shared';
import { z } from 'zod';
import { Public } from '../../common/auth/auth.decorators';
import { ZBody, ZQuery } from '../../common/validation/zod';
import { PublicCatalogService } from './public-catalog.service';

/** Shop discovery across published storefronts (§A7 "Discover Shops"). */
@ApiTags('public storefront')
@Public()
@Controller('public/shops')
export class PublicShopsController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get()
  list(@ZQuery(schemas.publicShopListQuery) q: z.infer<typeof schemas.publicShopListQuery>) {
    return this.catalog.discover(q);
  }
}

/** Unauthenticated storefront API: fabnix.com/shop/<slug> (FR-088, FR-096, FR-097). */
@ApiTags('public storefront')
@Public()
@Controller('public/shops/:slug')
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get()
  store(@Param('slug') slug: string) {
    return this.catalog.store(slug);
  }

  @Get('products')
  products(@Param('slug') slug: string, @ZQuery(schemas.publicProductQuery) q: z.infer<typeof schemas.publicProductQuery>) {
    return this.catalog.products(slug, q);
  }

  @Get('products/:productSlug')
  product(@Param('slug') slug: string, @Param('productSlug') productSlug: string) {
    return this.catalog.product(slug, productSlug);
  }

  @Post('products/:productSlug/quote')
  @HttpCode(200)
  quote(@Param('slug') slug: string, @Param('productSlug') productSlug: string, @ZBody(schemas.quoteSchema) dto: z.infer<typeof schemas.quoteSchema>) {
    return this.catalog.quote(slug, productSlug, dto);
  }
}
