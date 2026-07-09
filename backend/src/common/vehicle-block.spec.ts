import { VehicleStatus } from '@prisma/client';
import { getVehicleBlock } from './vehicle-block';

describe('getVehicleBlock', () => {
  // REABIERTO lo deja un reporte anulado: anular es lo que habilita re-tarjar.
  // NO_PLANIFICADO esta en el schema pero ningun servicio lo asigna.
  it.each(['PENDIENTE', 'REABIERTO', 'NO_PLANIFICADO'] as const)(
    '%s es tarjable',
    (status) => {
      expect(getVehicleBlock(status)).toBeNull();
    },
  );

  it.each([
    ['EN_PROCESO', 'En proceso por otro tarjador'],
    ['TARJADO', 'Ya tarjado'],
    ['OBSERVADO', 'Ya tarjado (con observaciones)'],
    ['BLOQUEADO', 'Bloqueado por revision operativa'],
  ] as const)('%s esta bloqueado con label %j', (status, label) => {
    const block = getVehicleBlock(status);
    expect(block).not.toBeNull();
    expect(block!.label).toBe(label);
    expect(block!.message.length).toBeGreaterThan(0);
  });

  // Este es el test que protege el refactor: si alguien agrega un VehicleStatus
  // al schema de Prisma y no lo contempla aqui, esto falla. Sin el, la lista de
  // busqueda y start() pueden divergir en silencio.
  it('cubre todos los VehicleStatus del enum de Prisma', () => {
    for (const status of Object.values(VehicleStatus)) {
      expect(getVehicleBlock(status)).not.toBeUndefined();
    }
  });
});
