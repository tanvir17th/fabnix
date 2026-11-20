import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { schemas } from '@fabnix/shared';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { requestContextMiddleware } from './common/request-context';
import { StorageService } from './common/storage/storage.service';

/** Shared by main.ts and the integration test harness so both run the same stack. */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  const expressApp = app as NestExpressApplication;
  if (config.trustProxy) expressApp.set('trust proxy', config.trustProxy);
  expressApp.disable('x-powered-by');

  app.use(requestContextMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: config.corsOrigins, credentials: true, exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'] });
  app.setGlobalPrefix('api/v1', { exclude: ['media/{*path}'] });
  app.useGlobalFilters(new ProblemDetailsFilter());

  if (config.storage.driver === 'local') {
    const storage = app.get(StorageService);
    expressApp.use('/media', express.static(storage.localRoot, { fallthrough: false, maxAge: '365d', immutable: true }));
  }

  if (config.swaggerEnabled) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('FABNIX API')
        .setDescription('Multi-tenant fabric shop management & online storefront. Errors are RFC 9457 problem+json with stable `code` values.')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    // Publish the shared Zod request schemas as components (single source of truth).
    doc.components ??= {};
    doc.components.schemas ??= {};
    for (const [name, schema] of Object.entries(schemas)) {
      if (schema instanceof z.ZodType && /Schema$/.test(name)) {
        try {
          doc.components.schemas[name.replace(/Schema$/, '')] = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as never;
        } catch {
          /* non-representable schema — skip */
        }
      }
    }
    SwaggerModule.setup('api/docs', app, doc);
  }
  app.enableShutdownHooks();
}
