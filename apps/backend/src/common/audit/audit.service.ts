import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { ActorType } from '../../generated/prisma/client';
import { Db, PrismaService } from '../prisma/prisma.service';
import { currentRequest } from '../request-context';

export interface AuditEntry {
  shopId?: string | null;
  actorUserId?: string | null;
  actorType: ActorType;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface AdminAuditEntry {
  adminUserId: string;
  permissionCode: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetShopId?: string | null;
  reason: string;
  before?: unknown;
  after?: unknown;
}

const toJson = (v: unknown) =>
  v === undefined || v === null ? Prisma.DbNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/**
 * Append-only audit trail (FR-065, FR-083, BR-015). Always write inside the
 * same transaction as the business change so the two commit together.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    const req = currentRequest();
    await db.auditLog.create({
      data: {
        shopId: entry.shopId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorType: entry.actorType,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        reason: entry.reason ?? null,
        requestId: req?.requestId,
        ipAddress: req?.ip,
        userAgent: req?.userAgent,
      },
    });
  }

  /** Super Admin privileged action log; reason mandatory (§A1.1, AC-029). */
  async logAdmin(entry: AdminAuditEntry, db: Db = this.prisma): Promise<void> {
    const req = currentRequest();
    await db.adminAuditLog.create({
      data: {
        adminUserId: entry.adminUserId,
        permissionCode: entry.permissionCode,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        targetShopId: entry.targetShopId ?? null,
        reason: entry.reason,
        before: toJson(entry.before),
        after: toJson(entry.after),
        requestId: req?.requestId,
        ipAddress: req?.ip,
        userAgent: req?.userAgent,
      },
    });
  }
}
