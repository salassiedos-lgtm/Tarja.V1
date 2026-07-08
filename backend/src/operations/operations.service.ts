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
}
