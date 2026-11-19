import { Injectable } from '@nestjs/common';
import type { DocumentType } from '../../generated/prisma/client';
import { Tx } from '../prisma/prisma.service';

export interface SequenceOptions {
  prefix: string;
  yearlyReset: boolean;
  timezone: string;
  padding?: number;
}

/**
 * Gap-free per-shop numbering (FR-045, BR-002). The upsert row lock serializes
 * concurrent allocators within the caller's transaction; a rollback releases
 * the number, so committed documents never skip.
 */
@Injectable()
export class DocumentSequenceService {
  async next(tx: Tx, shopId: string, docType: DocumentType, opts: SequenceOptions): Promise<string> {
    const year = new Intl.DateTimeFormat('en-CA', { timeZone: opts.timezone, year: 'numeric' }).format(new Date());
    const periodKey = opts.yearlyReset ? year : 'ALL';
    const padding = opts.padding ?? 6;
    const rows = await tx.$queryRaw<Array<{ value: number }>>`
      INSERT INTO document_sequences ("shopId", "docType", "periodKey", prefix, "nextValue", padding, "updatedAt")
      VALUES (${shopId}::uuid, ${docType}::"DocumentType", ${periodKey}, ${opts.prefix}, 2, ${padding}, now())
      ON CONFLICT ("shopId", "docType", "periodKey")
      DO UPDATE SET "nextValue" = document_sequences."nextValue" + 1, "updatedAt" = now()
      RETURNING ("nextValue" - 1)::int AS value`;
    const value = String(rows[0]!.value).padStart(padding, '0');
    return opts.yearlyReset ? `${opts.prefix}-${year}-${value}` : `${opts.prefix}-${value}`;
  }
}
