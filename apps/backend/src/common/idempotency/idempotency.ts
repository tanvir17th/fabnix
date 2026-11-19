import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { ErrorCode } from '@fabnix/shared';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { sha256, stableStringify } from '../crypto';
import type { AuthedRequest } from '../auth/auth.decorators';

const SCOPE = 'fabnix:idempotencyScope';
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,80}$/;
const LOCK_MS = 60_000;
const TTL_MS = 24 * 60 * 60_000;

/**
 * Request-level idempotency (FR-042, AC-013, AC-020). The client sends
 * `Idempotency-Key`; a replay with the same body returns the stored response,
 * a replay with a different body is rejected, a concurrent duplicate gets 409.
 * Domain tables keep UNIQUE(shopId, idempotencyKey) as a second safeguard.
 */
export const Idempotent = (scope: string) => applyDecorators(SetMetadata(SCOPE, scope), UseInterceptors(IdempotencyInterceptor));

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = this.reflector.get<string>(SCOPE, context.getHandler());
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header('idempotency-key');
    if (!key || !KEY_FORMAT.test(key)) return throwError(() => new AppError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED));
    if (!req.user) return throwError(() => new AppError(ErrorCode.UNAUTHENTICATED));

    const actorId = req.user.id;
    const requestHash = sha256(stableStringify({ path: req.originalUrl.split('?')[0], body: req.body ?? null }));
    req.idempotencyKey = key;

    return from(this.begin(scope, actorId, key, requestHash)).pipe(
      mergeMap((replay) => {
        if (replay) {
          res.status(replay.status);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(replay.body);
        }
        return next.handle().pipe(
          mergeMap((body) => from(this.complete(scope, actorId, key, res.statusCode, body)).pipe(mergeMap(() => of(body)))),
          catchError((err) => from(this.release(scope, actorId, key)).pipe(mergeMap(() => throwError(() => err)))),
        );
      }),
    );
  }

  private async begin(scope: string, actorId: string, key: string, requestHash: string): Promise<{ status: number; body: unknown } | null> {
    const now = new Date();
    try {
      await this.prisma.idempotencyRecord.create({
        data: { scope, actorId, key, requestHash, lockedUntil: new Date(now.getTime() + LOCK_MS), expiresAt: new Date(now.getTime() + TTL_MS) },
      });
      return null;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
    }
    const existing = await this.prisma.idempotencyRecord.findUnique({ where: { scope_actorId_key: { scope, actorId, key } } });
    if (!existing) return this.begin(scope, actorId, key, requestHash);
    if (existing.requestHash !== requestHash) throw new AppError(ErrorCode.IDEMPOTENCY_KEY_REUSED);
    if (existing.status === 'COMPLETED') return { status: existing.responseStatus ?? 200, body: existing.responseBody };
    if (existing.lockedUntil > now) throw new AppError(ErrorCode.IDEMPOTENCY_IN_PROGRESS);
    // Stale lock (crashed request): take over atomically.
    const taken = await this.prisma.idempotencyRecord.updateMany({
      where: { id: existing.id, status: 'IN_PROGRESS', lockedUntil: existing.lockedUntil },
      data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
    });
    if (taken.count !== 1) throw new AppError(ErrorCode.IDEMPOTENCY_IN_PROGRESS);
    return null;
  }

  private async complete(scope: string, actorId: string, key: string, status: number, body: unknown): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { scope_actorId_key: { scope, actorId, key } },
      data: {
        status: 'COMPLETED',
        responseStatus: status,
        responseBody: body === undefined ? Prisma.DbNull : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue),
        resourceId: typeof (body as { id?: unknown })?.id === 'string' ? (body as { id: string }).id : null,
      },
    });
  }

  /** Failed requests free the key so the client may retry (possibly corrected). */
  private async release(scope: string, actorId: string, key: string): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({ where: { scope, actorId, key, status: 'IN_PROGRESS' } });
  }
}
