import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { AnnulDto } from './dto/annul.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  listReports(operationId?: number) {
    return this.prisma.tarjaReport.findMany({
      where: operationId ? { operationId } : undefined,
      orderBy: { id: 'desc' },
      take: 200,
      include: {
        vehicle: { select: { vin: true } },
        tarjador: { select: { username: true, initials: true } },
        operation: { select: { code: true } },
      },
    });
  }

  listAnnulments() {
    return this.prisma.tarjaReportAnnulment.findMany({
      orderBy: { id: 'desc' },
      take: 200,
      include: {
        report: { select: { reportCode: true } },
        supervisor: { select: { username: true } },
      },
    });
  }

  async annul(reportId: number, dto: AnnulDto, supervisorId: number) {
    const report = await this.prisma.tarjaReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') {
      throw new BadRequestException('Solo se pueden anular reportes finalizados');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.tarjaReportAnnulment.create({
        data: {
          reportId,
          vehicleId: report.vehicleId,
          tarjadorId: report.tarjadorId,
          supervisorId,
          reason: dto.reason,
          comment: dto.comment ?? null,
          previousReportStatus: report.status,
          newReportStatus: 'ANULADO',
        },
      });
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: { status: 'ANULADO' },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: { status: 'REABIERTO', currentReportId: null, lockedById: null, lockedAt: null },
      });
      return r;
    });

    this.realtime.emit('report.annulled', {
      reportId,
      operationId: report.operationId,
      vehicleId: report.vehicleId,
    });
    this.audit.record({
      userId: supervisorId,
      module: 'reports',
      action: 'ANNUL',
      description: `Reporte ${reportId}: ${dto.reason}`,
    });
    return updated;
  }

  async progress(operationId: number) {
    const grouped = await this.prisma.vehicle.groupBy({
      by: ['status'],
      where: { operationId },
      _count: { status: true },
    });
    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[g.status] = g._count.status;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const durAgg = await this.prisma.tarjaReport.aggregate({
      where: { operationId, durationSeconds: { not: null } },
      _avg: { durationSeconds: true },
    });
    return {
      operationId,
      total,
      byStatus,
      avgDurationSeconds: Math.round(durAgg._avg.durationSeconds ?? 0),
    };
  }

  async dashboard() {
    const operations = await this.prisma.operation.findMany({
      where: { status: { in: ['ACTIVA', 'PAUSADA'] } },
      orderBy: { id: 'desc' },
      include: { _count: { select: { vehicles: true } } },
    });
    const recent = await this.prisma.tarjaReport.findMany({
      where: { status: { in: ['FINALIZADO', 'CON_DANO', 'ANULADO'] } },
      orderBy: { id: 'desc' },
      take: 20,
      include: {
        vehicle: { select: { vin: true } },
        tarjador: { select: { initials: true } },
        operation: { select: { code: true } },
      },
    });
    return { operations, recent };
  }
}
