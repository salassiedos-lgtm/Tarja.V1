import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService, type AuditQuery } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Roles('ADMIN')
  @Get()
  query(
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.query(this.parse({ module, action, userId, from, to, q, limit, offset }));
  }

  @Roles('ADMIN')
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    const csv = await this.service.exportCsv(this.parse({ module, action, userId, from, to, q }));
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="auditoria-${stamp}.csv"`,
    });
    res.send(csv);
  }

  private parse(raw: {
    module?: string;
    action?: string;
    userId?: string;
    from?: string;
    to?: string;
    q?: string;
    limit?: string;
    offset?: string;
  }): AuditQuery {
    return {
      module: raw.module || undefined,
      action: raw.action || undefined,
      userId: raw.userId ? Number(raw.userId) : undefined,
      from: raw.from || undefined,
      to: raw.to || undefined,
      q: raw.q || undefined,
      limit: raw.limit ? Number(raw.limit) : undefined,
      offset: raw.offset ? Number(raw.offset) : undefined,
    };
  }
}
