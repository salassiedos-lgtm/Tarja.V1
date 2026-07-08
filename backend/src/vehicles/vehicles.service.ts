import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  findByOperation(operationId: number, search?: string) {
    const where: Prisma.VehicleWhereInput = { operationId };
    if (search) {
      where.vin = { contains: search, mode: 'insensitive' };
    }
    return this.prisma.vehicle.findMany({
      where,
      orderBy: { id: 'asc' },
      include: { billOfLading: { select: { blNumber: true } } },
    });
  }

  async findOne(id: number) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { billOfLading: true, operation: true },
    });
    if (!vehicle) throw new NotFoundException('Vehiculo no encontrado');
    return vehicle;
  }
}
