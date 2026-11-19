import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

export type Tx = Prisma.TransactionClient;
/** Either the root client or an interactive transaction client. */
export type Db = PrismaService | Tx;

/**
 * Every connection runs with TimeZone=UTC (BR-014). Without this, the pg driver
 * adapter's offset-less timestamp parameters are interpreted in the server's
 * session timezone and stored shifted (caught by tests on an Asia/Dhaka cluster).
 */
export function pgPoolConfig(connectionString: string, max?: number) {
  return { connectionString, max, options: '-c TimeZone=UTC' };
}

const RETRYABLE_PG_CODES = new Set(['40001', '40P01']);

export function isRetryableTxError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { code?: string; meta?: Record<string, unknown>; message?: string; cause?: unknown };
  if (err.code === 'P2034') return true;
  const metaCode = (err.meta?.code ?? (err.meta?.driverAdapterError as { cause?: { originalCode?: string } })?.cause?.originalCode) as
    | string
    | undefined;
  if (metaCode && RETRYABLE_PG_CODES.has(metaCode)) return true;
  if (typeof err.message === 'string' && /deadlock detected|could not serialize access/i.test(err.message)) return true;
  return err.cause ? isRetryableTxError(err.cause) : false;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg(pgPoolConfig(config.databaseUrl, config.dbPoolMax)) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Interactive READ COMMITTED transaction. Row locks (SELECT … FOR UPDATE)
   * provide serialization for stock; deadlock/serialization failures are
   * retried with jitter (they roll back fully, so retrying is safe).
   */
  async tx<T>(fn: (tx: Tx) => Promise<T>, opts: { retries?: number; timeoutMs?: number } = {}): Promise<T> {
    const retries = opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 15_000,
          timeout: opts.timeoutMs ?? 30_000,
        });
      } catch (e) {
        if (attempt < retries && isRetryableTxError(e)) {
          this.logger.warn(`Retrying transaction after ${(e as Error).message?.slice(0, 80)} (attempt ${attempt + 1})`);
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
  }
}
