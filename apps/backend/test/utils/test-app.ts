import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { APP_CONFIG, AppConfig, loadConfig } from '../../src/config/app-config';
import { MessagingService } from '../../src/common/messaging/messaging.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { readPgState } from '../setup/pg-state';

export interface TestApp {
  app: INestApplication;
  http: App;
  prisma: PrismaService;
  config: AppConfig;
  messaging: MessagingService;
  api: Api;
  close(): Promise<void>;
}

async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: readPgState().adminUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Boots the real AppModule against a fresh database cloned from the migrated template. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const state = readPgState();
  const dbName = `fabnix_t_${randomBytes(6).toString('hex')}`;
  await withAdmin(async (c) => {
    for (let attempt = 0; ; attempt++) {
      try {
        await c.query(`CREATE DATABASE ${dbName} TEMPLATE ${state.templateDb}`);
        return;
      } catch (e) {
        if (attempt < 20 && /being accessed by other users/.test((e as Error).message)) {
          await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
          continue;
        }
        throw e;
      }
    }
  });
  const storageDir = mkdtempSync(join(tmpdir(), 'fabnix-media-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: state.adminUrl.replace(/\/[^/?]*(\?.*)?$/, `/${dbName}`),
    DB_POOL_MAX: '25',
    JWT_ACCESS_SECRET: 'test-only-secret-that-is-definitely-longer-than-32-chars',
    COOKIE_SECURE: 'false',
    AUTH_REQUIRE_VERIFICATION: 'false',
    SHOP_AUTO_APPROVE: 'true',
    JOBS_ENABLED: 'false',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: storageDir,
    STORAGE_PUBLIC_BASE_URL: 'http://localhost/media',
    SWAGGER_ENABLED: 'false',
    ...env,
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(APP_CONFIG).useValue(config).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  const http = app.getHttpServer() as App;

  return {
    app,
    http,
    prisma: app.get(PrismaService),
    config,
    messaging: app.get(MessagingService),
    api: new Api(http),
    async close() {
      await app.close();
      await withAdmin((c) => c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`));
      rmSync(storageDir, { recursive: true, force: true });
    },
  };
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Thin supertest wrapper: api.as(token).post('/shops', body, { idem: 'key' }) */
export class Api {
  constructor(private readonly http: App) {}

  as(token?: string) {
    const call = (method: Method, path: string, body?: unknown, opts: { idem?: string; headers?: Record<string, string> } = {}) => {
      let req = request(this.http)[method](`/api/v1${path}`);
      if (token) req = req.set('Authorization', `Bearer ${token}`);
      if (opts.idem) req = req.set('Idempotency-Key', opts.idem);
      for (const [k, v] of Object.entries(opts.headers ?? {})) req = req.set(k, v);
      return body !== undefined && method !== 'get' ? req.send(body as object) : req;
    };
    return {
      get: (path: string, opts?: { headers?: Record<string, string> }) => call('get', path, undefined, opts),
      post: (path: string, body?: unknown, opts?: { idem?: string; headers?: Record<string, string> }) => call('post', path, body ?? {}, opts),
      patch: (path: string, body?: unknown) => call('patch', path, body ?? {}),
      put: (path: string, body?: unknown) => call('put', path, body ?? {}),
      delete: (path: string) => call('delete', path),
      raw: () => request(this.http),
    };
  }

  get anon() {
    return this.as(undefined);
  }
}

export const uniq = (prefix = 'k') => `${prefix}-${randomBytes(8).toString('hex')}`;
