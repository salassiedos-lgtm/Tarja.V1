import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ImportsService } from './imports.service';
import { ImportedRow } from './importers/types';

function row(rowNumber: number, vin: string, bl = 'COSU6502185840'): ImportedRow {
  return {
    rowNumber,
    vin,
    bl,
    containerNumber: 'FCIU9513895',
    brand: 'JMC',
    model: 'Grand Vigus',
    weight: 1920,
    quantity: 1,
    errors: [],
    warnings: [],
  };
}

function build(rows: ImportedRow[], overrides: Record<string, unknown> = {}) {
  const tx = {
    billOfLading: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 10, operationId: 7 }),
    },
    vehicle: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    operationImport: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    ...overrides,
  };
  const prisma = {
    operation: {
      findUnique: jest.fn().mockResolvedValue({ id: 7, operationType: 'DESCONSOLIDADO' }),
    },
    vehicle: { findMany: jest.fn().mockResolvedValue([]) },
    billOfLading: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)) as jest.Mock,
  };
  const audit = { record: jest.fn() };
  const registry = { get: jest.fn().mockReturnValue({ parse: jest.fn().mockResolvedValue(rows) }) };
  const service = new ImportsService(
    prisma as never,
    audit as never,
    registry as never,
  );
  return { service, prisma, tx, audit };
}

describe('ImportsService', () => {
  it('deduplica un VIN repetido dentro del mismo archivo', async () => {
    const { service } = build([row(2, 'LEFEDDE15VTP04723'), row(3, 'LEFEDDE15VTP04723')]);
    const summary = await service.preview(7, Buffer.from(''));
    expect(summary.validRows).toBe(2);
    expect(summary.newVehicles).toBe(1);
    expect(summary.existingVehicles).toBe(1);
    expect(summary.conflictingVehicles).toBe(0);
  });

  it('confirm inserta un solo vehiculo cuando el VIN esta repetido en el archivo', async () => {
    const { service, tx } = build([row(2, 'LEFEDDE15VTP04723'), row(3, 'LEFEDDE15VTP04723')]);
    await service.confirm(7, Buffer.from(''), 1);
    const data = tx.vehicle.createMany.mock.calls[0][0].data as Array<{ vin: string }>;
    expect(data).toHaveLength(1);
    expect(data[0].vin).toBe('LEFEDDE15VTP04723');
  });

  it('rechaza adoptar un BL creado por otra operacion dentro de la transaccion', async () => {
    const { service } = build([row(2, 'LEFEDDE15VTP04723')], {
      billOfLading: {
        // El BL apareció entre classify() y la transaccion: pertenece a la operacion 5.
        findUnique: jest.fn().mockResolvedValue({ id: 99, operationId: 5 }),
        create: jest.fn(),
      },
    });
    await expect(service.confirm(7, Buffer.from(''), 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('traduce P2002 a 400 en vez de propagar un 500', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`vin`)',
      { code: 'P2002', clientVersion: '6.0.0' },
    );
    const { service, prisma } = build([row(2, 'LEFEDDE15VTP04723')]);
    prisma.$transaction.mockRejectedValue(p2002);
    await expect(service.confirm(7, Buffer.from(''), 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
