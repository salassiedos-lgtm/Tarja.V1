import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessoryDto, UpdateAccessoryDto } from './dto/accessory.dto';

@Injectable()
export class AccessoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(onlyActive = false) {
    return this.prisma.accessory.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(dto: CreateAccessoryDto) {
    const max = await this.prisma.accessory.aggregate({ _max: { sortOrder: true } });
    return this.prisma.accessory.create({
      data: {
        name: dto.name,
        sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(id: number, dto: UpdateAccessoryDto) {
    await this.ensureExists(id);
    return this.prisma.accessory.update({ where: { id }, data: dto });
  }

  private async ensureExists(id: number) {
    const found = await this.prisma.accessory.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Accesorio no encontrado');
  }
}
