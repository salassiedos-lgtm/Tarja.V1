import { VehiclesService } from './vehicles.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const findMany = jest.fn();
const prisma = { vehicle: { findMany } } as unknown as PrismaService;
const audit = { record: jest.fn() } as unknown as AuditService;
const service = new VehiclesService(prisma, audit);

/** Fila cruda tal como la devuelve Prisma con el include del service. */
function row(vin: string, status: string) {
  return {
    id: 7,
    vin,
    brand: 'JMC',
    model: 'Grand Vigus',
    containerNumber: 'COSU1234567',
    status,
    billOfLading: { blNumber: 'COSU6502185840' },
    operation: { id: 3, code: 'OP-01', ship: { name: 'GUANG HE KOU' } },
  };
}

describe('VehiclesService.search', () => {
  beforeEach(() => findMany.mockReset());

  it('menos de 4 caracteres devuelve [] sin tocar la base', async () => {
    expect(await service.search('123')).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('4-16 caracteres busca por sufijo y solo en operaciones ACTIVA', async () => {
    findMany.mockResolvedValue([]);
    await service.search('00123');

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.vin).toEqual({ endsWith: '00123', mode: 'insensitive' });
    expect(arg.where.operation).toEqual({ status: 'ACTIVA' });
    expect(arg.take).toBe(20);
  });

  it('17 caracteres busca por VIN exacto, no por sufijo', async () => {
    findMany.mockResolvedValue([]);
    await service.search('LSGKB54E9DL000123');

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.vin).toBe('LSGKB54E9DL000123');
  });

  it('un vehiculo PENDIENTE sale tarjable y aplanado', async () => {
    findMany.mockResolvedValue([row('LSGKB54E9DL000123', 'PENDIENTE')]);
    const [r] = await service.search('00123');

    expect(r).toEqual({
      vehicleId: 7,
      vin: 'LSGKB54E9DL000123',
      blNumber: 'COSU6502185840',
      shipName: 'GUANG HE KOU',
      operationCode: 'OP-01',
      brand: 'JMC',
      model: 'Grand Vigus',
      containerNumber: 'COSU1234567',
      blocked: false,
      blockedReason: null,
    });
  });

  it.each([
    ['EN_PROCESO', 'En proceso por otro tarjador'],
    ['TARJADO', 'Ya tarjado'],
    ['OBSERVADO', 'Ya tarjado (con observaciones)'],
    ['BLOQUEADO', 'Bloqueado por revision operativa'],
  ])('un vehiculo %s sale bloqueado con su motivo', async (status, reason) => {
    findMany.mockResolvedValue([row('LSGKB54E9DL000123', status)]);
    const [r] = await service.search('00123');

    expect(r.blocked).toBe(true);
    expect(r.blockedReason).toBe(reason);
  });

  it('un vehiculo REABIERTO sale tarjable: anular es lo que habilita re-tarjar', async () => {
    findMany.mockResolvedValue([row('LSGKB54E9DL000123', 'REABIERTO')]);
    const [r] = await service.search('00123');

    expect(r.blocked).toBe(false);
    expect(r.blockedReason).toBeNull();
  });

  it('un vehiculo sin BL devuelve blNumber null, no revienta', async () => {
    const noBl = { ...row('LSGKB54E9DL000123', 'PENDIENTE'), billOfLading: null };
    findMany.mockResolvedValue([noBl]);
    const [r] = await service.search('00123');

    expect(r.blNumber).toBeNull();
  });
});
