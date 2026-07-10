import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { EditRequestDto, ResolveEditRequestDto } from './dto/edit-request.dto';
import { reopenSecondsLeft } from './edit.util';

@Injectable()
export class EditRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /** El dueño solicita autorización para editar una tarja cuya ventana venció. */
  async create(reportId: number, userId: number, dto: EditRequestDto) {
    const report = await this.prisma.tarjaReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.tarjadorId !== userId) {
      throw new ForbiddenException('Solo el tarjador dueño puede solicitar la edición');
    }
    if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') {
      throw new BadRequestException('La tarja no está finalizada');
    }
    if (reopenSecondsLeft(report) > 0) {
      throw new BadRequestException('Aún estás dentro de la ventana de edición; no necesitas autorización');
    }
    const active = await this.prisma.tarjaEditRequest.findFirst({
      where: { reportId, status: { in: ['PENDIENTE', 'APROBADA'] } },
    });
    if (active) throw new BadRequestException('ya existe una solicitud de edición activa para esta tarja');

    const created = await this.prisma.tarjaEditRequest.create({
      data: { reportId, requestedById: userId, reason: dto.reason },
    });
    this.audit.record({
      userId,
      module: 'tarja',
      action: 'EDIT_REQUEST',
      description: `Solicita editar ${report.reportCode}: ${dto.reason}`,
    });
    this.realtime.emit('edit_request.created', { reportId, requestId: created.id });
    return created;
  }

  /** Bandeja para supervisor/admin. */
  list(status: string = 'PENDIENTE') {
    return this.prisma.tarjaEditRequest.findMany({
      where: { status: status as never },
      orderBy: { id: 'desc' },
      take: 200,
      include: {
        requestedBy: { select: { name: true, lastname: true, initials: true, username: true } },
        report: {
          select: {
            reportCode: true,
            vehicle: { select: { vin: true } },
            operation: { select: { code: true, ship: { select: { name: true } } } },
          },
        },
      },
    });
  }

  /** Supervisor/admin aprueba o rechaza. */
  async resolve(requestId: number, resolverId: number, dto: ResolveEditRequestDto) {
    const req = await this.prisma.tarjaEditRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Solicitud no encontrada');
    if (req.status !== 'PENDIENTE') throw new BadRequestException('La solicitud ya fue resuelta');

    const status = dto.approve ? 'APROBADA' : 'RECHAZADA';
    const updated = await this.prisma.tarjaEditRequest.update({
      where: { id: requestId },
      data: { status, resolvedById: resolverId, resolvedAt: new Date(), resolveComment: dto.comment ?? null },
    });
    this.audit.record({
      userId: resolverId,
      module: 'tarja',
      action: dto.approve ? 'EDIT_APPROVED' : 'EDIT_REJECTED',
      description: `Solicitud de edición #${requestId} ${dto.approve ? 'aprobada' : 'rechazada'}` +
        (dto.comment ? `: ${dto.comment}` : ''),
    });
    this.realtime.emit('edit_request.resolved', { requestId, reportId: req.reportId, approved: dto.approve });
    return updated;
  }

  /** Supervisor/admin cancela una edición autorizada en curso: revierte a finalizada. */
  async cancel(requestId: number, resolverId: number) {
    const req = await this.prisma.tarjaEditRequest.findUnique({
      where: { id: requestId },
      include: { report: { select: { id: true, vehicleId: true, hasDamage: true, reportCode: true } } },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada');
    if (req.status !== 'APROBADA') throw new BadRequestException('Solo se cancela una edición autorizada en curso');

    await this.prisma.$transaction(async (tx) => {
      await tx.tarjaReport.update({
        where: { id: req.reportId },
        data: {
          status: req.report.hasDamage ? 'CON_DANO' : 'FINALIZADO',
          editSnapshot: Prisma.DbNull,
        },
      });
      await tx.vehicle.update({
        where: { id: req.report.vehicleId },
        data: {
          status: req.report.hasDamage ? 'OBSERVADO' : 'TARJADO',
          lockedById: null,
          lockedAt: null,
          currentReportId: req.reportId,
        },
      });
      await tx.tarjaEditRequest.update({ where: { id: requestId }, data: { status: 'RECHAZADA' } });
    });
    this.audit.record({
      userId: resolverId,
      module: 'tarja',
      action: 'EDIT_CANCELED',
      description: `Edición autorizada de ${req.report.reportCode} cancelada por el supervisor`,
    });
    this.realtime.emit('edit_request.canceled', { requestId, reportId: req.reportId });
    return { canceled: true };
  }
}
