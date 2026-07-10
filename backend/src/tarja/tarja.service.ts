import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, ReportStatus, VehicleStatus, WorkShift } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { ReportCodeService } from './report-code.service';
import { validateVin } from '../common/vin.util';
import { getVehicleBlock } from '../common/vehicle-block';
import { limaShift } from '../common/shift.util';
import {
  FinishTarjaDto,
  SetAccessoriesDto,
  SetDamagesDto,
  StartTarjaDto,
} from './dto/tarja.dto';
import {
  REOPEN_WINDOW_MIN,
  reopenSecondsLeft,
  canEnterEdit,
  snapshotOf,
  computeEditDiff,
} from './edit.util';

const AUTO_RELEASE_MIN = 15;

@Injectable()
export class TarjaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly reportCode: ReportCodeService,
  ) {}

  async start(dto: StartTarjaDto, tarjadorId: number) {
    const { vin } = validateVin(dto.vin);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { vin },
      include: { operation: { select: { status: true, code: true } } },
    });

    // VIN desconocido: el tarjador no puede continuar. Queda en bitacora
    // para que el supervisor lo regularice dando de alta el vehiculo.
    if (!vehicle) {
      this.audit.record({
        userId: tarjadorId,
        module: 'tarja',
        action: 'VIN_NO_ENCONTRADO',
        description: `VIN ${vin} no existe en ninguna operacion`,
        newValue: vin,
      });
      this.realtime.emit('vin.unknown', { vin, tarjadorId });
      throw new NotFoundException(
        `VIN ${vin} no encontrado. Se notifico al supervisor para su regularizacion.`,
      );
    }

    // Gate de lote: el tarjador solo trabaja tareas de un lote (operación) ABIERTO.
    // GET /vehicles/search ya oculta los cerrados; esto lo refuerza para VIN directo/escáner.
    if (vehicle.operation.status !== 'ACTIVA') {
      throw new ConflictException(
        `El lote ${vehicle.operation.code} está cerrado. Pídele al administrador que lo abra para poder tarjar.`,
      );
    }

    // La misma regla que usa GET /vehicles/search para pintar la fila en gris.
    const block = getVehicleBlock(vehicle.status);
    if (block) throw new ConflictException(block.message);

    const operationId = vehicle.operationId;

    try {
      const report = await this.prisma.$transaction(async (tx) => {
        // Compare-and-swap atomico: el where con status evita la carrera TOCTOU entre el
        // findUnique de arriba (fuera de la transaccion) y este update. Si otro tarjador
        // gano la carrera, count sera 0 y abortamos antes de crear el reporte.
        const locked = await tx.vehicle.updateMany({
          where: { id: vehicle.id, status: vehicle.status },
          data: {
            status: 'EN_PROCESO',
            lockedById: tarjadorId,
            lockedAt: new Date(),
          },
        });
        if (locked.count === 0) {
          throw new ConflictException('Otro tarjador tomo este vehiculo primero');
        }

        const reportCode = await this.reportCode.next(tx);
        const created = await tx.tarjaReport.create({
          data: {
            reportCode,
            operationId,
            vehicleId: vehicle.id,
            billOfLadingId: vehicle.billOfLadingId,
            tarjadorId,
            startedAt: new Date(),
            status: 'BORRADOR',
          },
        });

        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { currentReportId: created.id },
        });

        return created;
      });

      this.realtime.emit('report.started', {
        reportId: report.id,
        operationId,
        vehicleId: report.vehicleId,
      });
      this.audit.record({
        userId: tarjadorId,
        module: 'tarja',
        action: 'START',
        description: `VIN ${vin}`,
      });
      return report;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // vehicles_current_report_id_key: el vehiculo ya tiene un borrador enganchado.
        throw new ConflictException('Este vehiculo ya tiene un reporte activo');
      }
      throw e;
    }
  }

  private async getDraft(reportId: number) {
    const report = await this.prisma.tarjaReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.status !== 'BORRADOR') {
      throw new BadRequestException('El reporte ya no es un borrador');
    }
    return report;
  }

  async setAccessories(reportId: number, dto: SetAccessoriesDto) {
    await this.getDraft(reportId);
    await this.prisma.$transaction(
      dto.items.map((it) =>
        this.prisma.tarjaReportAccessory.upsert({
          where: { reportId_accessoryId: { reportId, accessoryId: it.accessoryId } },
          update: { hasAccessory: it.hasAccessory, quantity: it.quantity ?? 0 },
          create: {
            reportId,
            accessoryId: it.accessoryId,
            hasAccessory: it.hasAccessory,
            quantity: it.quantity ?? 0,
          },
        }),
      ),
    );
    return this.findOne(reportId);
  }

  async setDamages(reportId: number, dto: SetDamagesDto) {
    await this.getDraft(reportId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tarjaReport.update({
        where: { id: reportId },
        data: {
          hasDamage: dto.hasDamage,
          damageSource: dto.hasDamage ? (dto.damageSource ?? null) : null,
          damageOperation: dto.hasDamage ? (dto.damageOperation ?? null) : null,
          damageAffects: dto.hasDamage ? (dto.damageAffects ?? null) : null,
          damageMoment: dto.hasDamage ? (dto.damageMoment ?? null) : null,
          damageMomentOther: dto.hasDamage ? (dto.damageMomentOther ?? null) : null,
        },
      });
      await tx.tarjaReportDamage.deleteMany({ where: { reportId } });
      const descriptions = (dto.descriptions ?? []).map((d) => d.trim()).filter(Boolean);
      if (dto.hasDamage && descriptions.length) {
        await tx.tarjaReportDamage.createMany({
          data: descriptions.map((description) => ({ reportId, description })),
        });
      }
    });
    return this.findOne(reportId);
  }

  async finish(reportId: number, dto: FinishTarjaDto) {
    const report = await this.getDraft(reportId);
    const now = new Date();
    const durationSeconds =
      report.finishedAt != null
        ? report.durationSeconds
        : report.startedAt
          ? Math.max(0, Math.round((now.getTime() - report.startedAt.getTime()) / 1000))
          : null;
    const status: ReportStatus = report.hasDamage ? 'CON_DANO' : 'FINALIZADO';
    const vehicleStatus: VehicleStatus = report.hasDamage ? 'OBSERVADO' : 'TARJADO';
    const { reportDate, workShift } = limaShift(now);

    // ¿Es el cierre de una edición? Entonces computamos el diff contra el snapshot.
    const isEdit = report.editSnapshot != null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: {
          finishedAt: now,
          durationSeconds,
          status,
          reportDate,
          workShift,
          details: dto.details ?? null,
          tarjadorInitials: dto.initials ?? null,
          editSnapshot: Prisma.DbNull,
        },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: { status: vehicleStatus, lockedById: null, lockedAt: null },
      });
      // Cerrar una solicitud aprobada asociada, si la hubiera.
      if (isEdit) {
        await tx.tarjaEditRequest.updateMany({
          where: { reportId, status: 'APROBADA' },
          data: { status: 'COMPLETADA' },
        });
      }
      return r;
    });

    if (isEdit) {
      const after = await this.prisma.tarjaReport.findUnique({
        where: { id: reportId },
        include: {
          accessories: { include: { accessory: { select: { name: true } } } },
          damages: { select: { description: true } },
        },
      });
      const before = report.editSnapshot as unknown as ReturnType<typeof snapshotOf>;
      const diff = computeEditDiff(before, snapshotOf(after!));
      this.audit.record({
        userId: report.tarjadorId,
        module: 'tarja',
        action: 'EDITADA',
        description: diff.changed
          ? `Editó ${report.reportCode} · ${diff.summary}`
          : `Editó ${report.reportCode} · sin cambios`,
        oldValue: diff.oldJson,
        newValue: diff.newJson,
      });
    } else {
      this.audit.record({
        userId: report.tarjadorId,
        module: 'tarja',
        action: 'FINISH',
        description: `Reporte ${reportId} -> ${status}`,
      });
    }

    this.realtime.emit('report.finished', {
      reportId,
      operationId: report.operationId,
      vehicleId: report.vehicleId,
      status,
    });
    return updated;
  }

  async findOne(reportId: number) {
    const report = await this.prisma.tarjaReport.findUnique({
      where: { id: reportId },
      include: {
        accessories: { include: { accessory: true } },
        damages: true,
        vehicle: true,
        operation: true,
      },
    });
    if (!report) return null;
    return { ...report, reopenSecondsLeft: reopenSecondsLeft(report) };
  }

  /**
   * Entra a editar una tarja finalizada. Dos caminos:
   *  - Dueño dentro de la ventana de 10 min (edición libre).
   *  - Dueño con una solicitud de edición APROBADA (post-10min, sin cronómetro).
   * Captura un snapshot del estado actual para el diff posterior, pasa el reporte
   * a BORRADOR y bloquea el vehículo. Conserva finishedAt/duración.
   */
  async reopen(reportId: number, userId: number) {
    const report = await this.prisma.tarjaReport.findUnique({
      where: { id: reportId },
      include: {
        accessories: { include: { accessory: { select: { name: true } } } },
        damages: { select: { description: true } },
        operation: { select: { status: true, code: true } },
      },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');

    const approved = await this.prisma.tarjaEditRequest.count({
      where: { reportId, status: 'APROBADA' },
    });
    const gate = canEnterEdit(report, userId, approved > 0, new Date());
    if (!gate.allowed) {
      if (gate.code === 'NOT_OWNER') {
        throw new ForbiddenException('Solo el tarjador que la realizó puede editar esta tarja');
      }
      if (gate.code === 'NOT_FINALIZED') {
        throw new BadRequestException('La tarja no está finalizada');
      }
      throw new BadRequestException(
        'REQUIERE_AUTORIZACION: la ventana de edición de 10 minutos expiró. Solicita autorización al supervisor.',
      );
    }
    if (report.operation.status !== 'ACTIVA') {
      throw new ConflictException(
        `El lote ${report.operation.code} está cerrado. Pídele al administrador que lo abra para editar.`,
      );
    }

    const snapshot = snapshotOf(report);

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: { status: 'BORRADOR', editSnapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: {
          status: 'EN_PROCESO',
          lockedById: userId,
          lockedAt: new Date(),
          currentReportId: reportId,
        },
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
      module: 'tarja',
      action: 'EDIT_START',
      description: `Tarja ${report.reportCode} abierta para edición (ventana ${REOPEN_WINDOW_MIN} min o autorizada)`,
    });
    return updated;
  }

  async release(vehicleId: number) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Vehiculo no encontrado');
    await this.discardDraftAndUnlock(vehicleId, vehicle.currentReportId);
    this.realtime.emit('vehicle.released', { vehicleId, operationId: vehicle.operationId });
    return { released: true };
  }

  private async discardDraftAndUnlock(vehicleId: number, currentReportId: number | null) {
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'PENDIENTE', lockedById: null, lockedAt: null, currentReportId: null },
      });
      if (currentReportId) {
        const rep = await tx.tarjaReport.findUnique({ where: { id: currentReportId } });
        if (rep?.status === 'BORRADOR') {
          await tx.tarjaReport.delete({ where: { id: currentReportId } });
        }
      }
    });
  }

  /** Revierte una reapertura al estado finalizado que tenía antes (no destruye la tarja). */
  private async revertReopen(reportId: number, vehicleId: number, hasDamage: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await tx.tarjaReport.update({
        where: { id: reportId },
        data: { status: hasDamage ? 'CON_DANO' : 'FINALIZADO' },
      });
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          status: hasDamage ? 'OBSERVADO' : 'TARJADO',
          lockedById: null,
          lockedAt: null,
          currentReportId: reportId,
        },
      });
    });
  }

  // Auto-liberacion cada minuto. Dos casos distintos, por el marcador finishedAt:
  //  1) Borrador nuevo (finishedAt = null) abandonado > 15 min  -> se descarta (borra).
  //  2) Reapertura (finishedAt puesto) abandonada > 10 min       -> se revierte al finalizado.
  @Cron('0 * * * * *')
  async autoRelease(): Promise<number> {
    const freshThreshold = new Date(Date.now() - AUTO_RELEASE_MIN * 60_000);
    const stale = await this.prisma.tarjaReport.findMany({
      where: { status: 'BORRADOR', finishedAt: null, startedAt: { lt: freshThreshold } },
      select: { id: true, vehicleId: true, operationId: true },
    });
    for (const r of stale) {
      await this.discardDraftAndUnlock(r.vehicleId, r.id);
      this.realtime.emit('vehicle.auto_released', {
        vehicleId: r.vehicleId,
        operationId: r.operationId,
        reportId: r.id,
      });
      this.audit.record({
        module: 'tarja',
        action: 'AUTO_RELEASE',
        description: `Vehiculo ${r.vehicleId} auto-liberado (borrador ${r.id})`,
      });
    }

    const reopenThreshold = new Date(Date.now() - REOPEN_WINDOW_MIN * 60_000);
    const abandoned = await this.prisma.tarjaReport.findMany({
      where: { status: 'BORRADOR', finishedAt: { lt: reopenThreshold } },
      select: { id: true, vehicleId: true, operationId: true, hasDamage: true },
    });
    for (const r of abandoned) {
      await this.revertReopen(r.id, r.vehicleId, r.hasDamage);
      this.realtime.emit('report.reopen_expired', {
        vehicleId: r.vehicleId,
        operationId: r.operationId,
        reportId: r.id,
      });
      this.audit.record({
        module: 'tarja',
        action: 'REOPEN_EXPIRED',
        description: `Reporte ${r.id} revertido al vencer la ventana de edición`,
      });
    }

    return stale.length + abandoned.length;
  }
}
