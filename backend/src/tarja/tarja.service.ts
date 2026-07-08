import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, ReportStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { ReportCodeService } from './report-code.service';
import { normalizeVin } from '../common/vin.util';
import {
  FinishTarjaDto,
  SetAccessoriesDto,
  SetDamagesDto,
  StartTarjaDto,
} from './dto/tarja.dto';

const AUTO_RELEASE_MIN = 15;

/** true si el P2002 viene del indice unico global de `vehicles.vin`. */
function conflictsOnVin(e: Prisma.PrismaClientKnownRequestError): boolean {
  const target = e.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((f) => f.toLowerCase().includes('vin'));
}

@Injectable()
export class TarjaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly reportCode: ReportCodeService,
  ) {}

  async start(dto: StartTarjaDto, tarjadorId: number) {
    const op = await this.prisma.operation.findUnique({ where: { id: dto.operationId } });
    if (!op) throw new NotFoundException('Operacion no encontrada');

    // El importador guarda los VIN normalizados (vin.util). Normalizamos aqui con la misma
    // funcion, si no un VIN escrito con guiones o en minusculas no encontraria su fila.
    const vin = normalizeVin(dto.vin);
    if (!vin) throw new BadRequestException('VIN invalido');

    // vin es unico global: la busqueda NO puede acotarse a la operacion, si no un VIN de otra
    // operacion pareceria inexistente y el create posterior chocaria contra vehicles_vin_key.
    const existing = await this.prisma.vehicle.findUnique({
      where: { vin },
      include: { operation: { select: { code: true } } },
    });
    if (existing && existing.operationId !== dto.operationId) {
      throw new ConflictException(
        `Este VIN pertenece a la operacion ${existing.operation.code}, no a la actual`,
      );
    }
    if (existing?.status === 'EN_PROCESO') {
      throw new ConflictException('Este vehiculo esta siendo procesado por otro usuario');
    }
    if (existing?.status === 'TARJADO' || existing?.status === 'OBSERVADO') {
      throw new ConflictException(
        'Este vehiculo ya tiene una tarja valida. Anule antes de re-tarjar.',
      );
    }

    try {
      const report = await this.prisma.$transaction(async (tx) => {
        const vehicle =
          existing ??
          (await tx.vehicle.create({
            data: {
              operationId: dto.operationId,
              vin,
              chassisNumber: vin,
              isUnplanned: true,
              status: 'NO_PLANIFICADO',
            },
          }));

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
            operationId: dto.operationId,
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
        operationId: dto.operationId,
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
        // vehicles_vin_key: otra transaccion creo el vehiculo entre el findUnique y el create.
        if (conflictsOnVin(e)) {
          throw new ConflictException(
            'Otro usuario acaba de registrar este VIN. Vuelva a intentarlo.',
          );
        }
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
    const durationSeconds = report.startedAt
      ? Math.max(0, Math.round((now.getTime() - report.startedAt.getTime()) / 1000))
      : null;
    const status: ReportStatus = report.hasDamage ? 'CON_DANO' : 'FINALIZADO';
    const vehicleStatus: VehicleStatus = report.hasDamage ? 'OBSERVADO' : 'TARJADO';

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: {
          finishedAt: now,
          durationSeconds,
          status,
          details: dto.details ?? null,
          tarjadorInitials: dto.initials ?? null,
        },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: { status: vehicleStatus, lockedById: null, lockedAt: null },
      });
      return r;
    });

    this.realtime.emit('report.finished', {
      reportId,
      operationId: report.operationId,
      vehicleId: report.vehicleId,
      status,
    });
    this.audit.record({
      userId: report.tarjadorId,
      module: 'tarja',
      action: 'FINISH',
      description: `Reporte ${reportId} -> ${status}`,
    });
    return updated;
  }

  findOne(reportId: number) {
    return this.prisma.tarjaReport.findUnique({
      where: { id: reportId },
      include: {
        accessories: { include: { accessory: true } },
        damages: true,
        vehicle: true,
        operation: true,
      },
    });
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

  // Auto-liberacion: descarta borradores de mas de 15 min y libera el vehiculo.
  @Cron('0 * * * * *')
  async autoRelease(): Promise<number> {
    const threshold = new Date(Date.now() - AUTO_RELEASE_MIN * 60_000);
    const stale = await this.prisma.tarjaReport.findMany({
      where: { status: 'BORRADOR', startedAt: { lt: threshold } },
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
    return stale.length;
  }
}
