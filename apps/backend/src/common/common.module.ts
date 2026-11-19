import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { ConfigModule } from '../config/config.module';
import { AuditService } from './audit/audit.service';
import { CatalogBootstrapService } from './bootstrap/catalog-bootstrap.service';
import { IdempotencyInterceptor } from './idempotency/idempotency';
import { MessagingService } from './messaging/messaging.service';
import { NotificationsService } from './notifications/notifications.service';
import { PlanLimitService } from './plan/plan-limit.service';
import { PrismaService } from './prisma/prisma.service';
import { DocumentSequenceService } from './sequences/document-sequence.service';
import { StorageService } from './storage/storage.service';
import { AdminGuard } from './tenancy/admin-context';
import { ShopAccessGuard } from './tenancy/shop-context';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.accessSecret,
        signOptions: { algorithm: 'HS256', expiresIn: config.jwt.accessTtlSeconds, issuer: 'fabnix' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'fabnix' },
      }),
    }),
  ],
  providers: [
    PrismaService,
    AuditService,
    IdempotencyInterceptor,
    MessagingService,
    NotificationsService,
    PlanLimitService,
    DocumentSequenceService,
    StorageService,
    ShopAccessGuard,
    AdminGuard,
    CatalogBootstrapService,
  ],
  exports: [
    PrismaService,
    AuditService,
    IdempotencyInterceptor,
    MessagingService,
    NotificationsService,
    PlanLimitService,
    DocumentSequenceService,
    StorageService,
    ShopAccessGuard,
    AdminGuard,
  ],
})
export class CommonModule {}
