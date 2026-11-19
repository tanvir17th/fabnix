import { Body, Param, ParseUUIDPipe, PipeTransform, Query } from '@nestjs/common';
import { z, ZodType } from 'zod';
import { notFound } from '../errors/app-error';

/** Parses with a shared Zod schema; ZodError → 400 problem via the global filter. */
export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.output<T> {
    return this.schema.parse(value ?? {});
  }
}

export const ZBody = <T extends ZodType>(schema: T) => Body(new ZodPipe(schema));
export const ZQuery = <T extends ZodType>(schema: T) => Query(new ZodPipe(schema));

/** UUID path param; malformed IDs are a 404 (do not reveal anything about routing/IDs). */
export const IdParam = (name: string) =>
  Param(
    name,
    new ParseUUIDPipe({
      version: undefined,
      exceptionFactory: () => notFound(name),
    }),
  );
