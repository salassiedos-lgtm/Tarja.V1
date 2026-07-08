import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShipsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.ship.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Busca la nave por nombre normalizado; la crea si no existe.
   * Se almacena en MAYUSCULAS: es como vienen los manifiestos y BLs, y hace que
   * el unique de `ships.name` garantice de verdad una sola fila por nave.
   * Un nombre en blanco se rechaza: la FK es ON DELETE RESTRICT, asi que una
   * nave vacia quedaria para siempre en el selector y en el PDF oficial.
   */
  async findOrCreate(name: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const clean = name.trim().replace(/\s+/g, ' ').toUpperCase();
    if (clean === '') {
      throw new BadRequestException('El nombre de la nave es obligatorio');
    }
    return client.ship.upsert({
      where: { name: clean },
      update: {},
      create: { name: clean },
    });
  }
}
