import { Injectable, Logger } from '@nestjs/common';
import type { Language } from '../../generated/prisma/client';

export interface OutboundMessage {
  channel: 'EMAIL' | 'SMS';
  to: string;
  /** i18n template key, e.g. "auth.verification_code" */
  template: string;
  params: Record<string, string>;
  language: Language;
}

/**
 * Email/SMS delivery port (§7.3 — provider chosen before production).
 * The console driver logs and keeps an in-memory outbox (dev + tests).
 * config validation refuses to boot production with this driver.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger('Messaging');
  private readonly outbox: OutboundMessage[] = [];

  async send(message: OutboundMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 500) this.outbox.shift();
    if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`[${message.channel}] → ${message.to} ${message.template} ${JSON.stringify(message.params)}`);
    }
  }

  /** Dev/test helper: most recent message to a destination. */
  lastTo(to: string, template?: string): OutboundMessage | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      const m = this.outbox[i]!;
      if (m.to === to && (!template || m.template === template)) return m;
    }
    return undefined;
  }
}
