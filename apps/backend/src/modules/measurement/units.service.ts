import { Injectable } from '@nestjs/common';
import {
  D,
  ErrorCode,
  MeasurementComponent,
  ToInchesResult,
  UnitDefinition,
  parseMeasurementText,
  schemas,
  toInches,
} from '@fabnix/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { AppError, notFound } from '../../common/errors/app-error';
import { Db, PrismaService } from '../../common/prisma/prisma.service';
import { ShopContext } from '../../common/tenancy/shop-context';
import type { MeasurementUnit } from '../../generated/prisma/client';

export type Channel = 'POS' | 'ONLINE' | 'ANY';

export function toUnitDefinition(u: MeasurementUnit): UnitDefinition {
  return { id: u.id, code: u.code, kind: u.kind, symbol: u.symbol, name: u.name, inchesPerUnit: u.inchesPerUnit.toString(), version: u.version };
}

/** Active unit table for a shop, as used by the shared engine. */
export class UnitTable {
  constructor(
    readonly all: UnitDefinition[],
    readonly forChannel: UnitDefinition[],
  ) {}

  byCode(code: string): UnitDefinition | undefined {
    return this.all.find((u) => u.code === code.toUpperCase());
  }

  /** Inches per price unit for a product's rate basis (FR-024). */
  priceUnit(code: string): UnitDefinition {
    const u = this.byCode(code);
    if (!u) throw new AppError(code === 'GIRA' ? ErrorCode.GIRA_NOT_CONFIGURED : ErrorCode.UNIT_NOT_AVAILABLE, { unit: code });
    return u;
  }

  /** Measurement input (components or quick-entry text) → canonical inches. */
  resolve(input: z.infer<typeof schemas.measurementInput>, defaultUnit = 'YARD'): ToInchesResult {
    const components: MeasurementComponent[] = typeof input === 'string' ? parseMeasurementText(input, this.forChannel, defaultUnit) : input;
    return toInches(components, this.forChannel);
  }
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async table(shopId: string, channel: Channel, db: Db = this.prisma): Promise<UnitTable> {
    const rows = await db.measurementUnit.findMany({ where: { shopId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    const all = rows.map(toUnitDefinition);
    const filtered = rows
      .filter((u) => channel === 'ANY' || (channel === 'POS' ? u.enabledForPos : u.enabledOnline))
      .map(toUnitDefinition);
    return new UnitTable(all, filtered);
  }

  list(shopId: string, includeInactive = false) {
    return this.prisma.measurementUnit.findMany({
      where: { shopId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }, { version: 'desc' }],
    });
  }

  /** Configure Gira or a custom unit (FR-012, FR-013). */
  async create(ctx: ShopContext, dto: z.infer<typeof schemas.createUnitSchema>) {
    const code = dto.kind === 'GIRA' ? 'GIRA' : dto.code;
    if (['YARD', 'INCH', 'METRE', 'CM'].includes(code)) throw new AppError(ErrorCode.UNIT_STANDARD_IMMUTABLE, { unit: code });
    return this.prisma.tx(async (tx) => {
      const existing = await tx.measurementUnit.findFirst({ where: { shopId: ctx.shopId, code, isActive: true } });
      if (existing) throw new AppError(ErrorCode.CONFLICT, { unit: code });
      const last = await tx.measurementUnit.findFirst({ where: { shopId: ctx.shopId, code }, orderBy: { version: 'desc' } });
      const unit = await tx.measurementUnit.create({
        data: {
          shopId: ctx.shopId,
          code,
          kind: dto.kind,
          name: dto.name,
          nameKey: dto.kind === 'GIRA' ? 'units.gira' : null,
          symbol: dto.symbol,
          inchesPerUnit: dto.inchesPerUnit,
          version: (last?.version ?? 0) + 1,
          enabledForPos: dto.enabledForPos,
          enabledOnline: dto.enabledOnline,
          sortOrder: dto.kind === 'GIRA' ? 2 : 10,
          createdById: ctx.userId,
        },
      });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'unit.create', targetType: 'measurement_unit', targetId: unit.id, after: unit }, tx);
      return unit;
    });
  }

  /**
   * Changing a conversion factor never edits history: the current version is
   * deactivated and a new version inserted (BR-004). Past sale/order lines keep
   * the snapshot of the version they used (FR-019, AC-005).
   */
  async changeFactor(ctx: ShopContext, code: string, dto: z.infer<typeof schemas.updateUnitFactorSchema>) {
    return this.prisma.tx(async (tx) => {
      const current = await this.lockActive(tx, ctx.shopId, code);
      if (current.isStandard) throw new AppError(ErrorCode.UNIT_STANDARD_IMMUTABLE, { unit: code });
      if (D(current.inchesPerUnit.toString()).equals(D(dto.inchesPerUnit))) return current;
      await tx.measurementUnit.update({ where: { id: current.id }, data: { isActive: false, deactivatedAt: new Date() } });
      const next = await tx.measurementUnit.create({
        data: {
          shopId: ctx.shopId,
          code: current.code,
          kind: current.kind,
          name: current.name,
          nameKey: current.nameKey,
          symbol: current.symbol,
          inchesPerUnit: dto.inchesPerUnit,
          version: current.version + 1,
          enabledForPos: current.enabledForPos,
          enabledOnline: current.enabledOnline,
          sortOrder: current.sortOrder,
          createdById: ctx.userId,
        },
      });
      await tx.measurementUnit.update({ where: { id: current.id }, data: { supersededById: next.id } });
      await this.audit.log(
        {
          shopId: ctx.shopId,
          actorUserId: ctx.userId,
          actorType: 'SHOPKEEPER',
          action: 'unit.factor_change',
          targetType: 'measurement_unit',
          targetId: next.id,
          before: { version: current.version, inchesPerUnit: current.inchesPerUnit.toString() },
          after: { version: next.version, inchesPerUnit: next.inchesPerUnit.toString() },
        },
        tx,
      );
      return next;
    });
  }

  async updateFlags(ctx: ShopContext, code: string, dto: z.infer<typeof schemas.updateUnitFlagsSchema>) {
    return this.prisma.tx(async (tx) => {
      const current = await this.lockActive(tx, ctx.shopId, code);
      if (current.isStandard && (dto.isActive === false || dto.name || dto.symbol)) {
        // Standard units may be hidden from a channel but not renamed/removed.
        throw new AppError(ErrorCode.UNIT_STANDARD_IMMUTABLE, { unit: code });
      }
      const updated = await tx.measurementUnit.update({
        where: { id: current.id },
        data: { ...dto, ...(dto.isActive === false ? { deactivatedAt: new Date() } : {}) },
      });
      await this.audit.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'unit.update', targetType: 'measurement_unit', targetId: current.id, before: current, after: updated }, tx);
      return updated;
    });
  }

  private async lockActive(tx: Db, shopId: string, code: string): Promise<MeasurementUnit> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM measurement_units WHERE "shopId" = ${shopId}::uuid AND code = ${code.toUpperCase()} AND "isActive" FOR UPDATE`;
    if (!rows.length) throw notFound('measurement_unit', { unit: code });
    return tx.measurementUnit.findUniqueOrThrow({ where: { id: rows[0]!.id } });
  }
}
