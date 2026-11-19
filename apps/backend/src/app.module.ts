import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './common/auth/auth.guard';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { UsersController } from './modules/users/users.controller';
import { ShopsController } from './modules/shops/shops.controller';
import { ShopsService } from './modules/shops/shops.service';
import { StaffController } from './modules/staff/staff.controller';
import { StaffService } from './modules/staff/staff.service';
import { MeasurementController } from './modules/measurement/measurement.controller';
import { UnitsService } from './modules/measurement/units.service';
import { CatalogController } from './modules/catalog/catalog.controller';
import { CatalogService } from './modules/catalog/catalog.service';
import { ImagesService } from './modules/catalog/images.service';
import { InventoryController } from './modules/inventory/inventory.controller';
import { InventoryService } from './modules/inventory/inventory.service';
import { StockService } from './modules/inventory/stock.service';
import { CustomersController } from './modules/customers/customers.controller';
import { SalesController } from './modules/sales/sales.controller';
import { SalesService } from './modules/sales/sales.service';
import { StorefrontController } from './modules/storefront/storefront.controller';
import { StorefrontService } from './modules/storefront/storefront.service';
import { PublicCatalogController } from './modules/storefront/public-catalog.controller';
import { PublicCatalogService } from './modules/storefront/public-catalog.service';
import { CartService } from './modules/orders/cart.service';
import { CustomerOrdersController, ShopOrdersController } from './modules/orders/orders.controller';
import { OrdersService } from './modules/orders/orders.service';
import { ReservationSweeper } from './modules/orders/reservation-sweeper';
import { AdminController } from './modules/admin/admin.controller';
import { HealthController } from './health.controller';

/**
 * Modular monolith (SRS §2.1). Domain boundaries are folders under modules/;
 * cross-cutting infrastructure lives in CommonModule.
 */
@Module({
  imports: [
    ConfigModule,
    CommonModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: config.throttle.defaultLimit }],
        skipIf: () => config.nodeEnv === 'test',
      }),
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    ShopsController,
    StaffController,
    MeasurementController,
    CatalogController,
    InventoryController,
    CustomersController,
    SalesController,
    StorefrontController,
    PublicCatalogController,
    CustomerOrdersController,
    ShopOrdersController,
    AdminController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    ShopsService,
    StaffService,
    UnitsService,
    CatalogService,
    ImagesService,
    StockService,
    InventoryService,
    SalesService,
    StorefrontService,
    PublicCatalogService,
    CartService,
    OrdersService,
    ReservationSweeper,
  ],
})
export class AppModule {}
