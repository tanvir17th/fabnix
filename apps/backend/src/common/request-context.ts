import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequest(): RequestContext | undefined {
  return storage.getStore();
}

/** Express middleware: assigns X-Request-Id and exposes ip/ua to audit logging. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  storage.run(
    { requestId, ip: req.ip, userAgent: req.header('user-agent')?.slice(0, 512) },
    () => next(),
  );
}
