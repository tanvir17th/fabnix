import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { DomainError, ErrorCode } from '@fabnix/shared';
import { Prisma } from '../../generated/prisma/client';
import { currentRequest } from '../request-context';
import { statusFor } from './app-error';

interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  params?: Record<string, unknown>;
  errors?: Array<{ path: string; code: string }>;
  requestId?: string;
}

const HTTP_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.VALIDATION_FAILED,
  429: ErrorCode.RATE_LIMITED,
};

/**
 * RFC 9457 problem+json. Bodies carry stable `code` + `params` only; clients
 * localize (NFR-L10N-004). Internals (stack, SQL) are never leaked.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  toProblem(exception: unknown): Problem {
    if (exception instanceof DomainError) {
      return this.make(statusFor(exception.code), exception.code, exception.params);
    }
    if (exception instanceof ZodError) {
      return {
        ...this.make(400, ErrorCode.VALIDATION_FAILED),
        errors: exception.issues.map((i) => ({ path: i.path.join('.'), code: i.message || i.code })),
      };
    }
    if (exception instanceof ThrottlerException) return this.make(429, ErrorCode.RATE_LIMITED);
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target ?? (exception.meta as { driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } })?.driverAdapterError?.cause?.constraint?.fields) as unknown;
        return this.make(409, ErrorCode.CONFLICT, { target: Array.isArray(target) ? target.join(',') : String(target ?? '') });
      }
      if (exception.code === 'P2025') return this.make(404, ErrorCode.NOT_FOUND);
      if (exception.code === 'P2003') return this.make(422, ErrorCode.VALIDATION_FAILED, { reason: 'reference' });
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return this.make(status, HTTP_CODE[status] ?? (status >= 500 ? ErrorCode.INTERNAL : ErrorCode.VALIDATION_FAILED));
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    return this.make(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private make(status: number, code: string, params?: Record<string, unknown>): Problem {
    const p: Problem = { type: `https://fabnix.com/problems/${code.toLowerCase()}`, title: code, status, code };
    if (params && Object.keys(params).length) p.params = params;
    const rid = currentRequest()?.requestId;
    if (rid) p.requestId = rid;
    return p;
  }
}
