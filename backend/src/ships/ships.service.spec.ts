import { BadRequestException } from '@nestjs/common';
import { ShipsService } from './ships.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ShipsService.findOrCreate', () => {
  const upsert = jest.fn();
  const prisma = { ship: { upsert } } as unknown as PrismaService;
  const service = new ShipsService(prisma);

  beforeEach(() => upsert.mockReset());

  it('normaliza a MAYUSCULAS y colapsa espacios', async () => {
    upsert.mockResolvedValue({ id: 1, name: 'GUANG HE KOU' });
    await service.findOrCreate('  guang   he kou ');
    expect(upsert).toHaveBeenCalledWith({
      where: { name: 'GUANG HE KOU' },
      update: {},
      create: { name: 'GUANG HE KOU' },
    });
  });

  it.each(['', '   ', '\t\n'])(
    'rechaza el nombre en blanco %j sin crear la nave',
    async (blank) => {
      await expect(service.findOrCreate(blank)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(upsert).not.toHaveBeenCalled();
    },
  );
});
