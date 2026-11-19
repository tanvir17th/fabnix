import { Controller, Get, Patch, Put, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../../common/auth/auth.decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdParam, ZBody, ZQuery } from '../../common/validation/zod';
import { notFound } from '../../common/errors/app-error';
import { toPublicUser } from '../auth/auth.service';

const prefSchema = z.object({
  items: z
    .array(z.object({ type: z.string().min(1).max(60), channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH']), enabled: z.boolean() }))
    .max(100),
});

@ApiTags('me')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users/me')
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return toPublicUser(u);
  }

  @Patch('users/me')
  async updateMe(@CurrentUser() user: AuthUser, @ZBody(schemas.updateProfileSchema) dto: z.infer<typeof schemas.updateProfileSchema>) {
    return toPublicUser(await this.prisma.user.update({ where: { id: user.id }, data: { fullName: dto.fullName } }));
  }

  @Get('users/me/preferences')
  async preferences(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { preferredLanguage: true, timezone: true } });
    return u;
  }

  /**
   * Per-user language (NFR-L10N-001/002, BR-013). Affects only this user — never
   * the shop, other staff, stored data or invoice history (NFR-L10N-005).
   */
  @Patch('users/me/preferences')
  async updatePreferences(@CurrentUser() user: AuthUser, @ZBody(schemas.updatePreferencesSchema) dto: z.infer<typeof schemas.updatePreferencesSchema>) {
    return this.prisma.user.update({ where: { id: user.id }, data: dto, select: { preferredLanguage: true, timezone: true } });
  }

  /** Shops the user belongs to (FR-006). */
  @Get('users/me/shops')
  async myShops(@CurrentUser() user: AuthUser) {
    const memberships = await this.prisma.shopMember.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { shop: { select: { id: true, name: true, code: true, status: true, logoKey: true } }, role: { select: { name: true, presetKey: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => ({ shop: m.shop, role: m.role, isOwner: m.isOwner, memberId: m.id }));
  }

  // --- notifications (FR-071, FR-072) ---

  @Get('me/notifications')
  async notifications(@CurrentUser() user: AuthUser, @ZQuery(schemas.paginationQuery.extend({ unreadOnly: z.enum(['true', 'false']).optional() })) q: { cursor?: string; limit: number; unreadOnly?: string }) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: user.id, channel: 'IN_APP', ...(q.unreadOnly === 'true' ? { readAt: null } : {}) },
      orderBy: { id: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  @Post('me/notifications/:id/read')
  async markRead(@CurrentUser() user: AuthUser, @IdParam('id') id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date(), status: 'READ' } });
    if (!r.count && !(await this.prisma.notification.count({ where: { id, userId: user.id } }))) throw notFound('notification');
    return { read: true };
  }

  @Post('me/notifications/read-all')
  async markAllRead(@CurrentUser() user: AuthUser) {
    const r = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date(), status: 'READ' } });
    return { updated: r.count };
  }

  @Get('me/notification-preferences')
  async notificationPrefs(@CurrentUser() user: AuthUser) {
    return this.prisma.notificationPreference.findMany({ where: { userId: user.id }, select: { type: true, channel: true, enabled: true } });
  }

  @Put('me/notification-preferences')
  async setNotificationPrefs(@CurrentUser() user: AuthUser, @ZBody(prefSchema) dto: z.infer<typeof prefSchema>) {
    await this.prisma.$transaction(
      dto.items.map((i) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type_channel: { userId: user.id, type: i.type, channel: i.channel } },
          create: { userId: user.id, ...i },
          update: { enabled: i.enabled },
        }),
      ),
    );
    return this.notificationPrefs(user);
  }
}
