import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Db, PrismaService } from '../prisma/prisma.service';

export interface NotificationPayload {
  type: string;
  params?: Record<string, unknown>;
  link?: string;
  shopId?: string | null;
  dedupeKey?: string;
}

/**
 * In-app notifications stored as i18n keys + params and rendered in each
 * recipient's own language (FR-071, AC-002). Email/SMS/push fan-out reads
 * the same rows in a later milestone.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUsers(userIds: string[], payload: NotificationPayload, db: Db = this.prisma): Promise<void> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await db.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        shopId: payload.shopId ?? null,
        type: payload.type,
        titleKey: `notifications.${payload.type}.title`,
        bodyKey: `notifications.${payload.type}.body`,
        params: payload.params ? (JSON.parse(JSON.stringify(payload.params)) as Prisma.InputJsonValue) : Prisma.DbNull,
        link: payload.link ?? null,
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
        dedupeKey: payload.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });
  }

  /** Notify every active member of a shop holding `permission` (owners always). */
  async notifyShop(shopId: string, permission: string, payload: NotificationPayload, db: Db = this.prisma): Promise<void> {
    const members = await db.shopMember.findMany({
      where: {
        shopId,
        status: 'ACTIVE',
        OR: [{ isOwner: true }, { role: { permissions: { some: { permissionCode: permission } } } }],
      },
      select: { userId: true },
    });
    await this.notifyUsers(
      members.map((m) => m.userId),
      { ...payload, shopId },
      db,
    );
  }
}
