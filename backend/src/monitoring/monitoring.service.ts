import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { limaShift } from '../common/shift.util';

/** Semáforo de tiempo (segundos): verde < 5 min · ámbar 5–10 min · rojo > 10 min. */
export const FAST_MAX = 300;
export const MID_MAX = 600;

export type PaceBucket = 'fast' | 'mid' | 'slow';

export function paceOf(seconds: number | null): PaceBucket | null {
  if (seconds == null) return null;
  if (seconds < FAST_MAX) return 'fast';
  if (seconds <= MID_MAX) return 'mid';
  return 'slow';
}

const REPORT_INCLUDE = {
  vehicle: { select: { vin: true, brand: true, model: true } },
  tarjador: {
    select: { id: true, name: true, lastname: true, initials: true, username: true },
  },
  operation: { select: { code: true, ship: { select: { name: true } } } },
} satisfies Prisma.TarjaReportInclude;

type ReportWithRefs = Prisma.TarjaReportGetPayload<{ include: typeof REPORT_INCLUDE }>;

function tarjadorName(t: ReportWithRefs['tarjador']): string {
  const full = `${t.name} ${t.lastname}`.trim();
  return full || t.username;
}

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado en vivo del personal: tarjas en curso + finalizadas del turno actual. */
  async live() {
    const now = new Date();
    const { reportDate, workShift } = limaShift(now);

    const [inProgressRaw, finishedRaw] = await Promise.all([
      // Tarjas en curso ahora mismo: borradores nuevos (aún sin cerrar).
      this.prisma.tarjaReport.findMany({
        where: { status: 'BORRADOR', finishedAt: null, startedAt: { not: null } },
        orderBy: { startedAt: 'asc' },
        include: REPORT_INCLUDE,
      }),
      // Finalizadas del turno vigente (día/noche de Lima).
      this.prisma.tarjaReport.findMany({
        where: { reportDate, workShift, status: { in: ['FINALIZADO', 'CON_DANO'] } },
        orderBy: { finishedAt: 'desc' },
        include: REPORT_INCLUDE,
      }),
    ]);

    const inProgress = inProgressRaw.map((r) => ({
      reportId: r.id,
      reportCode: r.reportCode,
      vin: r.vehicle?.vin ?? null,
      brand: r.vehicle?.brand ?? null,
      model: r.vehicle?.model ?? null,
      startedAt: r.startedAt?.toISOString() ?? null,
      tarjadorId: r.tarjador.id,
      tarjador: tarjadorName(r.tarjador),
      initials: r.tarjador.initials,
      operationCode: r.operation?.code ?? null,
      vessel: r.operation?.ship?.name ?? null,
    }));

    const finished = finishedRaw.map((r) => ({
      reportId: r.id,
      reportCode: r.reportCode,
      vin: r.vehicle?.vin ?? null,
      brand: r.vehicle?.brand ?? null,
      model: r.vehicle?.model ?? null,
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      durationSeconds: r.durationSeconds,
      status: r.status,
      hasDamage: r.hasDamage,
      tarjadorId: r.tarjador.id,
      tarjador: tarjadorName(r.tarjador),
      initials: r.tarjador.initials,
      operationCode: r.operation?.code ?? null,
      vessel: r.operation?.ship?.name ?? null,
    }));

    // Resumen por persona (ritmo del turno).
    type Agg = {
      tarjadorId: number;
      tarjador: string;
      initials: string | null;
      inProgress: number;
      currentStartedAt: string | null;
      done: number;
      damaged: number;
      durSum: number;
      durCount: number;
      fast: number;
      mid: number;
      slow: number;
    };
    const by = new Map<number, Agg>();
    const ensure = (id: number, name: string, initials: string | null): Agg => {
      let a = by.get(id);
      if (!a) {
        a = {
          tarjadorId: id,
          tarjador: name,
          initials,
          inProgress: 0,
          currentStartedAt: null,
          done: 0,
          damaged: 0,
          durSum: 0,
          durCount: 0,
          fast: 0,
          mid: 0,
          slow: 0,
        };
        by.set(id, a);
      }
      return a;
    };

    for (const r of inProgress) {
      const a = ensure(r.tarjadorId, r.tarjador, r.initials);
      a.inProgress += 1;
      // Conserva el inicio más antiguo en curso (el que más lleva corriendo).
      if (r.startedAt && (a.currentStartedAt == null || r.startedAt < a.currentStartedAt)) {
        a.currentStartedAt = r.startedAt;
      }
    }

    let fast = 0;
    let mid = 0;
    let slow = 0;
    let durSum = 0;
    let durCount = 0;
    for (const r of finished) {
      const a = ensure(r.tarjadorId, r.tarjador, r.initials);
      a.done += 1;
      if (r.hasDamage) a.damaged += 1;
      const pace = paceOf(r.durationSeconds);
      if (pace) a[pace] += 1;
      if (pace) (pace === 'fast' ? (fast += 1) : pace === 'mid' ? (mid += 1) : (slow += 1));
      if (typeof r.durationSeconds === 'number') {
        a.durSum += r.durationSeconds;
        a.durCount += 1;
        durSum += r.durationSeconds;
        durCount += 1;
      }
    }

    const byTarjador = Array.from(by.values())
      .map((a) => ({
        tarjadorId: a.tarjadorId,
        tarjador: a.tarjador,
        initials: a.initials,
        inProgress: a.inProgress,
        currentStartedAt: a.currentStartedAt,
        done: a.done,
        damaged: a.damaged,
        avgSeconds: a.durCount ? Math.round(a.durSum / a.durCount) : null,
        fast: a.fast,
        mid: a.mid,
        slow: a.slow,
      }))
      // Activos primero, luego por producción del turno.
      .sort((x, y) => y.inProgress - x.inProgress || y.done - x.done);

    return {
      serverTime: now.toISOString(),
      inProgress,
      finished,
      byTarjador,
      stats: {
        date: reportDate.toISOString().slice(0, 10),
        shift: workShift,
        activeTarjadores: byTarjador.filter((t) => t.inProgress > 0).length,
        inProgressCount: inProgress.length,
        finishedCount: finished.length,
        damagedCount: finished.filter((r) => r.hasDamage).length,
        avgSeconds: durCount ? Math.round(durSum / durCount) : null,
        fast,
        mid,
        slow,
      },
    };
  }
}
