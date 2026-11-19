import { Controller, Get, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ShopPermission as P, schemas } from '@fabnix/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { Shop, ShopContext, ShopRoute } from '../../common/tenancy/shop-context';
import { ZQuery } from '../../common/validation/zod';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('shops/:shopId')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly auditSvc: AuditService,
  ) {}

  @Get('reports/dashboard')
  @ShopRoute(P.REPORTS_VIEW)
  dashboard(@Shop() ctx: ShopContext) {
    return this.reports.dashboard(ctx);
  }

  @Get('reports/sales')
  @ShopRoute(P.REPORTS_VIEW)
  async sales(@Shop() ctx: ShopContext, @ZQuery(schemas.reportRangeQuery) q: z.infer<typeof schemas.reportRangeQuery>, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.sales(ctx, q);
    if (q.format === 'csv') {
      // Exports are audited (§10).
      await this.auditSvc.log({ shopId: ctx.shopId, actorUserId: ctx.userId, actorType: 'SHOPKEEPER', action: 'report.export', targetType: 'report', targetId: 'sales', after: { from: q.from, to: q.to } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sales-${q.from}-${q.to}.csv"`);
      return this.reports.toCsv(report);
    }
    return report;
  }

  @Get('reports/expenses')
  @ShopRoute(P.REPORTS_VIEW)
  expenses(@Shop() ctx: ShopContext, @ZQuery(schemas.reportRangeQuery) q: z.infer<typeof schemas.reportRangeQuery>) {
    return this.reports.expenses(ctx, q);
  }

  @Get('reports/profit')
  @ShopRoute(P.REPORTS_VIEW)
  profit(@Shop() ctx: ShopContext, @ZQuery(schemas.reportRangeQuery) q: z.infer<typeof schemas.reportRangeQuery>) {
    return this.reports.profit(ctx, q);
  }

  @Get('audit-logs')
  @ShopRoute(P.AUDIT_VIEW)
  audit(@Shop() ctx: ShopContext, @ZQuery(schemas.auditListQuery) q: z.infer<typeof schemas.auditListQuery>) {
    return this.reports.audit(ctx, q);
  }
}
