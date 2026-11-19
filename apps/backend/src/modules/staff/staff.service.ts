import { Injectable } from '@nestjs/common';
import { ALL_SHOP_PERMISSIONS, DEFAULT_LANGUAGE, ErrorCode, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { MessagingService } from '../../common/messaging/messaging.service';
import { PlanLimitService } from '../../common/plan/plan-limit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import { randomToken, sha256 } from '../../common/crypto';
import type { AuthUser } from '../../common/auth/auth.decorators';

const INVITE_TTL_DAYS = 7;

/**
 * Staff are SHOPKEEPER-type users with a per-shop permission preset (§A1.2).
 * Managers holding staff.manage may only grant permissions they hold
 * themselves (no privilege escalation); the owner membership is immutable.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
    private readonly plans: PlanLimitService,
  ) {}

  listRoles(shopId: string) {
    return this.prisma.shopRole.findMany({
      where: { shopId },
      include: { permissions: { select: { permissionCode: true } }, _count: { select: { members: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private assertGrantable(ctx: ShopContext, permissions: string[]) {
    const unknown = permissions.filter((p) => !(ALL_SHOP_PERMISSIONS as string[]).includes(p));
    if (unknown.length) throw new AppError(ErrorCode.VALIDATION_FAILED, { unknownPermissions: unknown });
    if (ctx.isOwner) return;
    const escalation = permissions.filter((p) => !ctx.permissions.has(p));
    if (escalation.length) throw new AppError(ErrorCode.PRIVILEGE_ESCALATION, { permissions: escalation });
  }

  async createRole(ctx: ShopContext, dto: z.infer<typeof schemas.createRoleSchema>) {
    const perms = [...new Set(dto.permissions)];
    this.assertGrantable(ctx, perms);
    return this.prisma.tx(async (tx) => {
      const role = await tx.shopRole.create({ data: { shopId: ctx.shopId, name: dto.name } });
      await tx.shopRolePermission.createMany({ data: perms.map((permissionCode) => ({ shopId: ctx.shopId, roleId: role.id, permissionCode })) });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'role.create', targetType: 'shop_role', targetId: role.id, after: { name: dto.name, permissions: perms } }, tx);
      return role;
    });
  }

  async updateRole(ctx: ShopContext, roleId: string, dto: z.infer<typeof schemas.updateRoleSchema>) {
    return this.prisma.tx(async (tx) => {
      const role = await tx.shopRole.findFirst({ where: { id: roleId, shopId: ctx.shopId }, include: { permissions: true } });
      if (!role) throw notFound('role');
      if (role.isOwnerRole) throw new AppError(ErrorCode.OWNER_IMMUTABLE);
      const before = { name: role.name, permissions: role.permissions.map((p) => p.permissionCode) };
      if (dto.name) await tx.shopRole.update({ where: { id: roleId }, data: { name: dto.name } });
      if (dto.permissions) {
        const perms = [...new Set(dto.permissions)];
        // Non-owners may neither add NOR remove permissions they don't hold.
        this.assertGrantable(ctx, [...new Set([...perms, ...before.permissions])]);
        await tx.shopRolePermission.deleteMany({ where: { roleId } });
        await tx.shopRolePermission.createMany({ data: perms.map((permissionCode) => ({ shopId: ctx.shopId, roleId, permissionCode })) });
      }
      const after = { name: dto.name ?? role.name, permissions: dto.permissions ?? before.permissions };
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'member.permission_change', targetType: 'shop_role', targetId: roleId, before, after }, tx);
      return tx.shopRole.findUniqueOrThrow({ where: { id: roleId }, include: { permissions: { select: { permissionCode: true } } } });
    });
  }

  listMembers(shopId: string) {
    return this.prisma.shopMember.findMany({
      where: { shopId, status: { not: 'REMOVED' } },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
        role: { select: { id: true, name: true, presetKey: true } },
        branches: { select: { branchId: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMember(ctx: ShopContext, memberId: string, dto: z.infer<typeof schemas.updateMemberSchema>) {
    return this.prisma.tx(async (tx) => {
      const member = await tx.shopMember.findFirst({ where: { id: memberId, shopId: ctx.shopId }, include: { role: { include: { permissions: true } }, branches: true } });
      if (!member) throw notFound('member');
      if (member.isOwner) throw new AppError(ErrorCode.OWNER_IMMUTABLE);
      if (member.userId === ctx.userId) throw new AppError(ErrorCode.PRIVILEGE_ESCALATION, { reason: 'self_update' });
      // Cannot manage someone more privileged than yourself.
      this.assertGrantable(ctx, member.role.permissions.map((p) => p.permissionCode));
      if (dto.roleId) {
        const role = await tx.shopRole.findFirst({ where: { id: dto.roleId, shopId: ctx.shopId }, include: { permissions: true } });
        if (!role) throw notFound('role');
        if (role.isOwnerRole) throw new AppError(ErrorCode.OWNER_IMMUTABLE);
        this.assertGrantable(ctx, role.permissions.map((p) => p.permissionCode));
      }
      if (dto.branchIds) {
        const count = await tx.branch.count({ where: { shopId: ctx.shopId, id: { in: dto.branchIds } } });
        if (count !== new Set(dto.branchIds).size) throw notFound('branch');
        await tx.shopMemberBranch.deleteMany({ where: { memberId } });
        await tx.shopMemberBranch.createMany({ data: [...new Set(dto.branchIds)].map((branchId) => ({ shopId: ctx.shopId, memberId, branchId })) });
      }
      const now = new Date();
      const updated = await tx.shopMember.update({
        where: { id: memberId },
        data: {
          roleId: dto.roleId,
          allBranches: dto.allBranches,
          status: dto.status,
          suspendedAt: dto.status === 'SUSPENDED' ? now : dto.status === 'ACTIVE' ? null : undefined,
          removedAt: dto.status === 'REMOVED' ? now : undefined,
        },
      });
      await this.audit.log(
        {
          shopId: ctx.shopId,
          actorUserId: ctx.userId,
          actorType: 'SHOPKEEPER',
          action: dto.roleId || dto.branchIds || dto.allBranches !== undefined ? 'member.permission_change' : 'member.status_change',
          targetType: 'shop_member',
          targetId: memberId,
          before: { roleId: member.roleId, status: member.status, allBranches: member.allBranches, branchIds: member.branches.map((b) => b.branchId) },
          after: { roleId: updated.roleId, status: updated.status, allBranches: updated.allBranches, branchIds: dto.branchIds },
        },
        tx,
      );
      return updated;
    });
  }

  async invite(ctx: ShopContext, dto: z.infer<typeof schemas.inviteMemberSchema>) {
    const role = await this.prisma.shopRole.findFirst({ where: { id: dto.roleId, shopId: ctx.shopId }, include: { permissions: true } });
    if (!role) throw notFound('role');
    if (role.isOwnerRole) throw new AppError(ErrorCode.OWNER_IMMUTABLE);
    this.assertGrantable(ctx, role.permissions.map((p) => p.permissionCode));
    if (dto.branchIds.length) {
      const count = await this.prisma.branch.count({ where: { shopId: ctx.shopId, id: { in: dto.branchIds } } });
      if (count !== new Set(dto.branchIds).size) throw notFound('branch');
    }
    await this.plans.assertWithin(ctx.shopId, 'maxUsers');
    const token = randomToken(32);
    const invitation = await this.prisma.shopInvitation.create({
      data: {
        shopId: ctx.shopId,
        roleId: role.id,
        email: dto.email,
        phone: dto.phone,
        branchIds: dto.branchIds,
        tokenHash: sha256(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
    });
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId }, select: { name: true, defaultLanguage: true } });
    await this.messaging.send({
      channel: dto.email ? 'EMAIL' : 'SMS',
      to: (dto.email ?? dto.phone)!,
      template: 'staff.invitation',
      params: { token, shopName: shop.name, roleName: role.name },
      language: shop.defaultLanguage ?? DEFAULT_LANGUAGE,
    });
    await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'member.invite', targetType: 'shop_invitation', targetId: invitation.id, after: { email: dto.email, phone: dto.phone, roleId: role.id } });
    return { id: invitation.id, expiresAt: invitation.expiresAt };
  }

  /** The invited person accepts with their own verified SHOPKEEPER account. */
  async accept(user: AuthUser, token: string) {
    return this.prisma.tx(async (tx) => {
      const inv = await tx.shopInvitation.findUnique({ where: { tokenHash: sha256(token) } });
      if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) throw new AppError(ErrorCode.INVALID_OR_EXPIRED_CODE);
      const u = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const matches = (inv.email && u.email === inv.email && u.emailVerifiedAt) || (inv.phone && u.phone === inv.phone && u.phoneVerifiedAt);
      if (!matches) throw new AppError(ErrorCode.FORBIDDEN, { reason: 'invitation_contact_mismatch' });
      const existing = await tx.shopMember.findUnique({ where: { shopId_userId: { shopId: inv.shopId, userId: user.id } } });
      if (existing && existing.status !== 'REMOVED') throw new AppError(ErrorCode.CONFLICT, { reason: 'already_member' });
      const member = existing
        ? await tx.shopMember.update({ where: { id: existing.id }, data: { roleId: inv.roleId, status: 'ACTIVE', removedAt: null, allBranches: inv.branchIds.length === 0 } })
        : await tx.shopMember.create({ data: { shopId: inv.shopId, userId: user.id, roleId: inv.roleId, allBranches: inv.branchIds.length === 0 } });
      if (inv.branchIds.length) {
        await tx.shopMemberBranch.deleteMany({ where: { memberId: member.id } });
        await tx.shopMemberBranch.createMany({ data: inv.branchIds.map((branchId) => ({ shopId: inv.shopId, memberId: member.id, branchId })) });
      }
      await tx.shopInvitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      await this.audit.log({ shopId: inv.shopId, actorUserId: user.id, actorType: 'SHOPKEEPER', action: 'member.join', targetType: 'shop_member', targetId: member.id }, tx);
      return { shopId: inv.shopId, memberId: member.id };
    });
  }
}
