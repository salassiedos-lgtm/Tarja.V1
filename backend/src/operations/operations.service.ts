import { Injectable, NotFoundException } from '@nestjs/common';
import { OperationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto';
import { AuditService } from '../audit/audit.service';
import { ShipsService } from '../ships/ships.service';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ships: ShipsService,
  ) {}

  /** Mantiene el contrato `shipName` de la API pese a la normalizacion en `ships`. */
  private withShipName<T extends { ship: { name: string } }>(op: T) {
    const { ship, ...rest } = op;
    return { ...rest, shipName: ship.name };
  }

  async findAll() {
    const ops = await this.prisma.operation.findMany({
      orderBy: { id: 'desc' },
      include: { ship: true, _count: { select: { vehicles: true, bills: true } } },
    });
    return ops.map((op) => this.withShipName(op));
  }

  async findOne(id: number) {
    const op = await this.prisma.operation.findUnique({
      where: { id },
      include: { ship: true, _count: { select: { vehicles: true, bills: true } } },
    });
    if (!op) throw new NotFoundException('Operacion no encontrada');
    return this.withShipName(op);
  }

  async create(dto: CreateOperationDto, userId: number) {
    // La nave y la operacion se escriben juntas: si el insert de la operacion
    // falla, la nave recien creada no debe quedar huerfana en `ships`.
    const op = await this.prisma.$transaction(async (tx) => {
      const ship = await this.ships.findOrCreate(dto.shipName, tx);
      return tx.operation.create({
        data: {
          code: dto.code,
          shipId: ship.id,
          operationType: dto.operationType,
          operationDate: dto.operationDate ? new Date(dto.operationDate) : null,
          portDischarge: dto.portDischarge ?? 'Chancay',
          createdById: userId,
        },
        include: { ship: true },
      });
    });
    this.audit.record({
      userId,
      module: 'operations',
      action: 'CREATE',
      description: `Operacion ${op.code}`,
      newValue: op.code,
    });
    return this.withShipName(op);
  }

  async update(id: number, dto: UpdateOperationDto) {
    await this.findOne(id);
    const op = await this.prisma.$transaction(async (tx) => {
      const shipId = dto.shipName
        ? (await this.ships.findOrCreate(dto.shipName, tx)).id
        : undefined;
      return tx.operation.update({
        where: { id },
        data: {
          shipId,
          operationType: dto.operationType,
          operationDate: dto.operationDate ? new Date(dto.operationDate) : undefined,
          portDischarge: dto.portDischarge,
        },
        include: { ship: true },
      });
    });
    return this.withShipName(op);
  }

  async setStatus(id: number, status: OperationStatus) {
    await this.findOne(id);
    const op = await this.prisma.operation.update({
      where: { id },
      data: { status },
      include: { ship: true },
    });
    return this.withShipName(op);
  }

  /**
   * Elimina un lote (operación) completo con su trabajo asociado, como en USR:
   * reportes (+accesorios/daños en cascada), anulaciones, vehículos, B/L e imports.
   * Acción destructiva y exclusiva de ADMIN. El orden respeta las llaves foráneas:
   * primero se rompen los punteros vehículo→reporte y la auto-relación de reemplazo.
   */
  async remove(id: number, userId: number) {
    const op = await this.prisma.operation.findUnique({
      where: { id },
      include: { _count: { select: { vehicles: true, reports: true } } },
    });
    if (!op) throw new NotFoundException('Operacion no encontrada');

    await this.prisma.$transaction(async (tx) => {
      // 1) Suelta el puntero currentReportId (unique FK vehículo→reporte) y locks.
      await tx.vehicle.updateMany({
        where: { operationId: id },
        data: { currentReportId: null, lockedById: null, lockedAt: null },
      });
      // 2) Anulaciones (FK a reporte/vehículo/usuarios, sin cascada).
      await tx.tarjaReportAnnulment.deleteMany({ where: { report: { operationId: id } } });
      // 3) Rompe la auto-relación de reemplazo para que el orden de borrado no importe.
      await tx.tarjaReport.updateMany({
        where: { operationId: id },
        data: { replacedById: null },
      });
      // 4) Reportes (accesorios y daños se borran en cascada por onDelete: Cascade).
      await tx.tarjaReport.deleteMany({ where: { operationId: id } });
      // 5) Resto de dependientes del lote.
      await tx.operationImport.deleteMany({ where: { operationId: id } });
      await tx.vehicle.deleteMany({ where: { operationId: id } });
      await tx.billOfLading.deleteMany({ where: { operationId: id } });
      await tx.operation.delete({ where: { id } });
    });

    this.audit.record({
      userId,
      module: 'operations',
      action: 'DELETE',
      description: `Lote ${op.code} eliminado (${op._count.vehicles} vehículos, ${op._count.reports} reportes)`,
      oldValue: op.code,
    });

    return { deleted: true, code: op.code };
  }
}
