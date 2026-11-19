import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { OrdersService } from './orders.service';

/**
 * In-process scheduler for reservation expiry (FR-120). Safe to run on every
 * replica: per-order work takes FOR UPDATE SKIP LOCKED. Moves to BullMQ with
 * the notification fan-out in a later milestone.
 */
@Injectable()
export class ReservationSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReservationSweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly orders: OrdersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.jobs.enabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.jobs.reservationSweepIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.orders.sweepExpiredReservations();
      if (n) this.logger.log(`Expired ${n} pending order reservation(s)`);
    } catch (e) {
      this.logger.error(`Reservation sweep failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
