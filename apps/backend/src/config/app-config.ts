import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().min(1),
    DB_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    PUBLIC_WEB_URL: z.string().default('http://localhost:3000'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be ≥ 32 chars'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    COOKIE_SECURE: bool.default(true),
    AUTH_REQUIRE_VERIFICATION: bool.default(true),
    THROTTLE_AUTH_LIMIT: z.coerce.number().int().default(10),
    THROTTLE_DEFAULT_LIMIT: z.coerce.number().int().default(300),
    SHOP_AUTO_APPROVE: bool.default(true),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    STORAGE_PUBLIC_BASE_URL: z.string().default('http://localhost:4000/media'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('fabnix-media'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),
    JOBS_ENABLED: bool.default(true),
    RESERVATION_SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    MESSAGING_DRIVER: z.enum(['console']).default('console'),
    SWAGGER_ENABLED: bool.optional(),
    TRUST_PROXY: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.MESSAGING_DRIVER === 'console')
        ctx.addIssue({ code: 'custom', message: 'A real MESSAGING_DRIVER is required in production', path: ['MESSAGING_DRIVER'] });
      if (!env.COOKIE_SECURE) ctx.addIssue({ code: 'custom', message: 'COOKIE_SECURE must be true in production', path: ['COOKIE_SECURE'] });
    }
  });

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  corsOrigins: string[];
  publicWebUrl: string;
  jwt: { accessSecret: string; accessTtlSeconds: number };
  refreshTtlDays: number;
  cookieSecure: boolean;
  authRequireVerification: boolean;
  throttle: { authLimit: number; defaultLimit: number };
  shopAutoApprove: boolean;
  storage: {
    driver: 'local' | 's3';
    localDir: string;
    publicBaseUrl: string;
    s3: { endpoint?: string; region: string; bucket: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle: boolean };
  };
  jobs: { enabled: boolean; reservationSweepIntervalMs: number };
  messagingDriver: 'console';
  swaggerEnabled: boolean;
  trustProxy: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    publicWebUrl: e.PUBLIC_WEB_URL,
    jwt: { accessSecret: e.JWT_ACCESS_SECRET, accessTtlSeconds: e.JWT_ACCESS_TTL_SECONDS },
    refreshTtlDays: e.REFRESH_TTL_DAYS,
    cookieSecure: e.COOKIE_SECURE,
    authRequireVerification: e.AUTH_REQUIRE_VERIFICATION,
    throttle: { authLimit: e.THROTTLE_AUTH_LIMIT, defaultLimit: e.THROTTLE_DEFAULT_LIMIT },
    shopAutoApprove: e.SHOP_AUTO_APPROVE,
    storage: {
      driver: e.STORAGE_DRIVER,
      localDir: e.STORAGE_LOCAL_DIR,
      publicBaseUrl: e.STORAGE_PUBLIC_BASE_URL.replace(/\/$/, ''),
      s3: {
        endpoint: e.S3_ENDPOINT,
        region: e.S3_REGION,
        bucket: e.S3_BUCKET,
        accessKeyId: e.S3_ACCESS_KEY_ID,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
      },
    },
    jobs: { enabled: e.JOBS_ENABLED, reservationSweepIntervalMs: e.RESERVATION_SWEEP_INTERVAL_MS },
    messagingDriver: e.MESSAGING_DRIVER,
    swaggerEnabled: e.SWAGGER_ENABLED ?? e.NODE_ENV !== 'production',
    trustProxy: e.TRUST_PROXY,
  };
}
