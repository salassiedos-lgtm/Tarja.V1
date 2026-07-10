import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkShift } from '@prisma/client';
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

  /** Avance por turno: tarjas completadas en una fecha + turno dados. */
  async shiftReport(dateStr: string, shift: string) {
    if (!dateStr) throw new BadRequestException('Falta la fecha (date=YYYY-MM-DD)');
    const workShift: WorkShift = shift === 'NOCHE' ? WorkShift.NOCHE : WorkShift.DIA;
    const reportDate = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(reportDate.getTime())) throw new BadRequestException('Fecha inválida');

    const rows = await this.prisma.tarjaReport.findMany({
      where: {
        reportDate,
        workShift,
        status: { in: ['FINALIZADO', 'CON_DANO'] },
      },
      orderBy: { finishedAt: 'asc' },
      include: {
        vehicle: { select: { vin: true, containerNumber: true, brand: true, model: true } },
        tarjador: { select: { name: true, lastname: true, initials: true } },
        billOfLading: { select: { blNumber: true } },
        operation: { select: { ship: { select: { name: true } } } },
      },
    });

    const total = rows.length;
    const damaged = rows.filter((r) => r.hasDamage).length;
    const durations = rows
      .map((r) => r.durationSeconds)
      .filter((n): n is number => typeof n === 'number');
    const avgSeconds = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

    return {
      date: dateStr,
      shift: workShift,
      total,
      damaged,
      undamaged: total - damaged,
      avgSeconds,
      rows: rows.map((r) => ({
        reportCode: r.reportCode,
        vin: r.vehicle?.vin ?? null,
        container: r.vehicle?.containerNumber ?? null,
        brand: r.vehicle?.brand ?? null,
        model: r.vehicle?.model ?? null,
        vessel: r.operation?.ship?.name ?? null,
        bl: r.billOfLading?.blNumber ?? null,
        tarjador: r.tarjador ? `${r.tarjador.name} ${r.tarjador.lastname}`.trim() : null,
        initials: r.tarjador?.initials ?? null,
        hasDamage: r.hasDamage,
        durationSeconds: r.durationSeconds,
      })),
    };
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

  /**
   * Reabre una tarja finalizada (acción de admin desde Reportes del lote).
   * Como en USR, la unidad vuelve al cuadro de tareas para re-tarjar: el reporte
   * queda REEMPLAZADO (queda en el historial) y el vehículo REABIERTO, liberado
   * de lock y de currentReportId. No pide motivo (a diferencia de anular).
   */
  async reopen(reportId: number, userId: number) {
    const report = await this.prisma.tarjaReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') {
      throw new BadRequestException('Solo se pueden reabrir reportes finalizados');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: { status: 'REEMPLAZADO' },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: { status: 'REABIERTO', currentReportId: null, lockedById: null, lockedAt: null },
      });
      return r;
    });

    this.realtime.emit('report.reopened', {
      reportId,
      operationId: report.operationId,
      vehicleId: report.vehicleId,
    });
    this.audit.record({
      userId,
      module: 'reports',
      action: 'REOPEN',
      description: `Reporte ${report.reportCode} reabierto para re-tarjar`,
    });
    return updated;
  }

  /** Tarjas ya registradas de un lote (operación), para la pantalla Reportes. */
  async operationReports(operationId: number) {
    const reports = await this.prisma.tarjaReport.findMany({
      where: { operationId, status: { in: ['FINALIZADO', 'CON_DANO'] } },
      orderBy: { finishedAt: 'desc' },
      include: {
        vehicle: {
          select: { vin: true, chassisNumber: true, brand: true, model: true, containerNumber: true },
        },
        tarjador: { select: { name: true, lastname: true, initials: true } },
      },
    });
    return reports.map((r) => ({
      id: r.id,
      reportCode: r.reportCode,
      status: r.status,
      hasDamage: r.hasDamage,
      durationSeconds: r.durationSeconds,
      finishedAt: r.finishedAt,
      vin: r.vehicle?.vin ?? null,
      chassisNumber: r.vehicle?.chassisNumber ?? null,
      brand: r.vehicle?.brand ?? null,
      model: r.vehicle?.model ?? null,
      containerNumber: r.vehicle?.containerNumber ?? null,
      tarjador: r.tarjador ? `${r.tarjador.name} ${r.tarjador.lastname}`.trim() : null,
      initials: r.tarjador?.initials ?? null,
    }));
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
      include: { ship: { select: { name: true } }, _count: { select: { vehicles: true } } },
    });

    const doneGrouped = operations.length
      ? await this.prisma.vehicle.groupBy({
          by: ['operationId'],
          where: {
            operationId: { in: operations.map((o) => o.id) },
            status: { in: ['TARJADO', 'OBSERVADO'] },
          },
          _count: { status: true },
        })
      : [];
    const doneByOperation: Record<number, number> = {};
    for (const g of doneGrouped) doneByOperation[g.operationId] = g._count.status;

    const recent = await this.prisma.tarjaReport.findMany({
      where: { status: { in: ['FINALIZADO', 'CON_DANO', 'ANULADO'] } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        vehicle: { select: { vin: true } },
        tarjador: { select: { initials: true } },
        operation: { select: { code: true, ship: { select: { name: true } } } },
      },
    });

    const [tarjadas, enProceso, conDano, durAgg, activeShips] = await Promise.all([
      this.prisma.tarjaReport.count({ where: { status: { in: ['FINALIZADO', 'CON_DANO'] } } }),
      this.prisma.tarjaReport.count({ where: { status: 'BORRADOR' } }),
      this.prisma.tarjaReport.count({ where: { status: 'CON_DANO' } }),
      this.prisma.tarjaReport.aggregate({
        where: { status: { in: ['FINALIZADO', 'CON_DANO'] }, durationSeconds: { not: null } },
        _avg: { durationSeconds: true },
      }),
      this.prisma.operation.count({ where: { status: 'ACTIVA' } }),
    ]);

    const trend = await this.dailyTrend(14);

    return {
      operations: operations.map(({ ship, ...o }) => ({
        ...o,
        shipName: ship.name,
        doneVehicles: doneByOperation[o.id] ?? 0,
      })),
      recent: recent.map(({ operation, ...r }) => ({
        ...r,
        operation: { code: operation.code, shipName: operation.ship.name },
      })),
      stats: {
        tarjadas,
        enProceso,
        conDano,
        avgDurationSeconds: Math.round(durAgg._avg.durationSeconds ?? 0),
        activeShips,
        trend,
      },
    };
  }

  /** Serie diaria (real, no simulada) para los sparklines del panel: tarjas
   * iniciadas/finalizadas/con-daño y duracion media, agrupadas por dia local. */
  private async dailyTrend(numDays: number) {
    const since = new Date();
    since.setDate(since.getDate() - (numDays - 1));
    since.setHours(0, 0, 0, 0);

    const reports = await this.prisma.tarjaReport.findMany({
      where: { OR: [{ finishedAt: { gte: since } }, { startedAt: { gte: since } }] },
      select: { startedAt: true, finishedAt: true, status: true, durationSeconds: true },
    });

    const days: string[] = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const byDay = new Map<
      string,
      { iniciadas: number; tarjadas: number; conDano: number; durSum: number; durCount: number }
    >();
    for (const day of days) byDay.set(day, { iniciadas: 0, tarjadas: 0, conDano: 0, durSum: 0, durCount: 0 });

    for (const r of reports) {
      if (r.startedAt) {
        const bucket = byDay.get(r.startedAt.toISOString().slice(0, 10));
        if (bucket) bucket.iniciadas++;
      }
      if (r.finishedAt && (r.status === 'FINALIZADO' || r.status === 'CON_DANO')) {
        const bucket = byDay.get(r.finishedAt.toISOString().slice(0, 10));
        if (bucket) {
          bucket.tarjadas++;
          if (r.status === 'CON_DANO') bucket.conDano++;
          if (r.durationSeconds) {
            bucket.durSum += r.durationSeconds;
            bucket.durCount++;
          }
        }
      }
    }

    return days.map((day) => {
      const b = byDay.get(day)!;
      return {
        day,
        tarjadas: b.tarjadas,
        enProceso: b.iniciadas,
        conDano: b.conDano,
        avgDurationSeconds: b.durCount ? Math.round(b.durSum / b.durCount) : 0,
      };
    });
  }
}
