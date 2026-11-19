import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { DEFAULT_LANGUAGE, ErrorCode, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { MessagingService } from '../../common/messaging/messaging.service';
import { randomOtp, randomToken, sha256 } from '../../common/crypto';
import type { User, UserType, VerificationPurpose } from '../../generated/prisma/client';
import type { AccessTokenPayload } from '../../common/auth/auth.guard';

/** OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1). */
const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MINUTES = 10;

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

type Identifier = { email: string; phone?: undefined } | { phone: string; email?: undefined };

export function parseIdentifier(raw: string): Identifier {
  const v = raw.trim();
  if (v.includes('@')) return { email: v.toLowerCase() };
  const phone = schemas.phoneSchema.safeParse(v);
  if (!phone.success) throw new AppError(ErrorCode.VALIDATION_FAILED, { field: 'identifier' });
  return { phone: phone.data };
}

@Injectable()
export class AuthService {
  /** Used to equalize timing when the account does not exist. */
  private readonly dummyHash = hash('fabnix-timing-equalizer', ARGON);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Registration & verification (FR-001)
  // -------------------------------------------------------------------------

  async register(dto: z.infer<typeof schemas.registerSchema>): Promise<{ user: PublicUser; verificationRequired: boolean }> {
    const exists = await this.prisma.user.findFirst({
      where: { type: dto.type, OR: [dto.email ? { email: dto.email } : {}, dto.phone ? { phone: dto.phone } : {}].filter((c) => Object.keys(c).length) },
      select: { id: true },
    });
    if (exists) throw new AppError(ErrorCode.ACCOUNT_EXISTS);

    const verificationRequired = this.config.authRequireVerification;
    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        type: dto.type,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash: await hash(dto.password, ARGON),
        preferredLanguage: dto.preferredLanguage ?? null,
        status: verificationRequired ? 'PENDING_VERIFICATION' : 'ACTIVE',
        emailVerifiedAt: !verificationRequired && dto.email ? now : null,
        phoneVerifiedAt: !verificationRequired && dto.phone ? now : null,
      },
    });
    await this.audit.log({ actorUserId: user.id, actorType: dto.type, action: 'auth.register', targetType: 'user', targetId: user.id });
    if (verificationRequired) {
      await this.issueCode(user, dto.email ? 'EMAIL_VERIFY' : 'PHONE_VERIFY', (dto.email ?? dto.phone)!);
    }
    return { user: toPublicUser(user), verificationRequired };
  }

  async requestVerification(type: UserType, identifier: string): Promise<void> {
    const id = parseIdentifier(identifier);
    const user = await this.findByIdentifier(type, id);
    if (!user) return; // no enumeration
    const purpose: VerificationPurpose = id.email ? 'EMAIL_VERIFY' : 'PHONE_VERIFY';
    if ((purpose === 'EMAIL_VERIFY' && user.emailVerifiedAt) || (purpose === 'PHONE_VERIFY' && user.phoneVerifiedAt)) return;
    await this.issueCode(user, purpose, (id.email ?? id.phone)!);
  }

  async verifyContact(type: UserType, identifier: string, code: string): Promise<void> {
    const id = parseIdentifier(identifier);
    const user = await this.findByIdentifier(type, id);
    const purpose: VerificationPurpose = id.email ? 'EMAIL_VERIFY' : 'PHONE_VERIFY';
    if (!user) throw new AppError(ErrorCode.INVALID_OR_EXPIRED_CODE);
    await this.consumeCode(user.id, purpose, (id.email ?? id.phone)!, code);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(purpose === 'EMAIL_VERIFY' ? { emailVerifiedAt: now } : { phoneVerifiedAt: now }),
        ...(user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
      },
    });
    await this.audit.log({ actorUserId: user.id, actorType: user.type, action: 'auth.contact_verified', targetType: 'user', targetId: user.id, after: { purpose } });
  }

  // -------------------------------------------------------------------------
  // Login / sessions (FR-002, FR-004)
  // -------------------------------------------------------------------------

  async login(type: UserType, identifier: string, password: string, meta: ClientMeta): Promise<{ user: PublicUser; tokens: SessionTokens }> {
    const id = parseIdentifier(identifier);
    const user = await this.findByIdentifier(type, id);
    if (!user) {
      await verify(await this.dummyHash, password).catch(() => false);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(ErrorCode.ACCOUNT_LOCKED, { until: user.lockedUntil.toISOString() });
    }
    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      await this.audit.log({ actorUserId: user.id, actorType: user.type, action: lock ? 'auth.locked' : 'auth.login_failed', targetType: 'user', targetId: user.id });
      throw new AppError(lock ? ErrorCode.ACCOUNT_LOCKED : ErrorCode.INVALID_CREDENTIALS);
    }
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') throw new AppError(ErrorCode.ACCOUNT_SUSPENDED);
    if (user.status === 'PENDING_VERIFICATION') throw new AppError(ErrorCode.ACCOUNT_NOT_VERIFIED);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const tokens = await this.createSession(updated, randomUUID(), meta);
    await this.audit.log({ actorUserId: user.id, actorType: user.type, action: 'auth.login', targetType: 'user', targetId: user.id });
    return { user: toPublicUser(updated), tokens };
  }

  /**
   * Rotate a refresh token. Presenting an already-rotated or revoked token is
   * treated as theft: the whole token family is revoked (OWASP reuse detection).
   */
  async refresh(rawToken: string, meta: ClientMeta): Promise<{ user: PublicUser; tokens: SessionTokens }> {
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) }, include: { user: true } });
    if (!record) throw new AppError(ErrorCode.REFRESH_TOKEN_INVALID);

    if (record.rotatedAt || record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'reuse_detected' },
      });
      await this.audit.log({ actorUserId: record.userId, actorType: record.user.type, action: 'auth.refresh_reuse_detected', targetType: 'session', targetId: record.familyId });
      throw new AppError(ErrorCode.REFRESH_TOKEN_REUSED);
    }
    if (record.expiresAt <= new Date()) throw new AppError(ErrorCode.REFRESH_TOKEN_INVALID);
    if (record.user.status !== 'ACTIVE') throw new AppError(ErrorCode.ACCOUNT_SUSPENDED);

    // Guarded update: two concurrent refreshes with the same token → only one wins.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppError(ErrorCode.REFRESH_TOKEN_REUSED);

    const tokens = await this.createSession(record.user, record.familyId, meta, record.id);
    return { user: toPublicUser(record.user), tokens };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!record) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'logout' },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'logout_all' } });
  }

  // -------------------------------------------------------------------------
  // Password recovery (FR-003)
  // -------------------------------------------------------------------------

  async requestPasswordReset(type: UserType, identifier: string): Promise<void> {
    const id = parseIdentifier(identifier);
    const user = await this.findByIdentifier(type, id);
    if (!user || user.status === 'DEACTIVATED') return; // always 202
    await this.issueCode(user, 'PASSWORD_RESET', (id.email ?? id.phone)!);
  }

  async resetPassword(type: UserType, identifier: string, code: string, newPassword: string): Promise<void> {
    const id = parseIdentifier(identifier);
    const user = await this.findByIdentifier(type, id);
    if (!user) throw new AppError(ErrorCode.INVALID_OR_EXPIRED_CODE);
    await this.consumeCode(user.id, 'PASSWORD_RESET', (id.email ?? id.phone)!, code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(newPassword, ARGON), failedLoginCount: 0, lockedUntil: null },
    });
    await this.logoutAll(user.id);
    await this.audit.log({ actorUserId: user.id, actorType: user.type, action: 'auth.password_reset', targetType: 'user', targetId: user.id });
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private async createSession(user: User, familyId: string, meta: ClientMeta, previousId?: string): Promise<SessionTokens> {
    const payload: AccessTokenPayload = { sub: user.id, typ: user.type, sid: familyId };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomToken(48);
    const refreshTokenExpiresAt = new Date(Date.now() + this.config.refreshTtlDays * 86_400_000);
    const created = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        userAgent: meta.userAgent?.slice(0, 512),
        ipAddress: meta.ip,
        expiresAt: refreshTokenExpiresAt,
      },
    });
    if (previousId) await this.prisma.refreshToken.update({ where: { id: previousId }, data: { replacedById: created.id } });
    return { accessToken, accessTokenExpiresIn: this.config.jwt.accessTtlSeconds, refreshToken, refreshTokenExpiresAt };
  }

  private findByIdentifier(type: UserType, id: Identifier) {
    return this.prisma.user.findFirst({ where: { type, ...(id.email ? { email: id.email } : { phone: id.phone }) } });
  }

  private async issueCode(user: User, purpose: VerificationPurpose, destination: string): Promise<void> {
    const code = randomOtp();
    await this.prisma.verificationToken.updateMany({
      where: { userId: user.id, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose,
        destination,
        tokenHash: sha256(`${destination}:${code}`),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      },
    });
    await this.messaging.send({
      channel: destination.includes('@') ? 'EMAIL' : 'SMS',
      to: destination,
      template: `auth.${purpose.toLowerCase()}`,
      params: { code, minutes: String(OTP_TTL_MINUTES) },
      language: user.preferredLanguage ?? DEFAULT_LANGUAGE,
    });
  }

  private async consumeCode(userId: string, purpose: VerificationPurpose, destination: string, code: string): Promise<void> {
    const token = await this.prisma.verificationToken.findFirst({
      where: { userId, purpose, destination, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.attempts >= token.maxAttempts) throw new AppError(ErrorCode.INVALID_OR_EXPIRED_CODE);
    if (token.tokenHash !== sha256(`${destination}:${code}`)) {
      await this.prisma.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      throw new AppError(ErrorCode.INVALID_OR_EXPIRED_CODE);
    }
    const consumed = await this.prisma.verificationToken.updateMany({ where: { id: token.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new AppError(ErrorCode.INVALID_OR_EXPIRED_CODE);
  }
}

export interface PublicUser {
  id: string;
  type: UserType;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: User['status'];
  preferredLanguage: User['preferredLanguage'];
  timezone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    type: u.type,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    status: u.status,
    preferredLanguage: u.preferredLanguage,
    timezone: u.timezone,
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
  };
}
