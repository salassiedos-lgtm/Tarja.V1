import { Injectable, NotFoundException } from '@nestjs/common';
import { OperationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.operation.findMany({
      orderBy: { id: 'desc' },
      include: { _count: { select: { vehicles: true, bills: true } } },
    });
  }

  async findOne(id: number) {
    const op = await this.prisma.operation.findUnique({
      where: { id },
      include: { _count: { select: { vehicles: true, bills: true } } },
    });
    if (!op) throw new NotFoundException('Operacion no encontrada');
    return op;
  }

  create(dto: CreateOperationDto, userId: number) {
    return this.prisma.operation.create({
      data: {
        code: dto.code,
        shipName: dto.shipName,
        operationType: dto.operationType,
        operationDate: dto.operationDate ? new Date(dto.operationDate) : null,
        portDischarge: dto.portDischarge ?? 'Chancay',
        createdById: userId,
      },
    });
  }

  async update(id: number, dto: UpdateOperationDto) {
    await this.findOne(id);
    return this.prisma.operation.update({
      where: { id },
      data: {
        shipName: dto.shipName,
        operationType: dto.operationType,
        operationDate: dto.operationDate ? new Date(dto.operationDate) : undefined,
        portDischarge: dto.portDischarge,
      },
    });
  }

  async setStatus(id: number, status: OperationStatus) {
    await this.findOne(id);
    return this.prisma.operation.update({ where: { id }, data: { status } });
  }
}
