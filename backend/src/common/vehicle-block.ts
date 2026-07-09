import { VehicleStatus } from '@prisma/client';

/**
 * Unica definicion de "que vehiculo se puede tarjar".
 *
 * La consultan tanto TarjaService.start() (para rechazar con ConflictException)
 * como VehiclesService.search() (para pintar la fila en gris). Si se agrega un
 * VehicleStatus al schema, agregarlo aqui: el spec de exhaustividad lo exige.
 */
export interface VehicleBlock {
  /** Texto corto para la insignia de la lista de busqueda. */
  label: string;
  /** Texto largo para la excepcion que ve el tarjador al iniciar. */
  message: string;
}

const BLOCKS: Record<VehicleStatus, VehicleBlock | null> = {
  PENDIENTE: null,
  // Un reporte anulado devuelve el vehiculo a REABIERTO (reports.service.ts:65).
  // Anular es, justamente, lo que habilita re-tarjar.
  REABIERTO: null,
  // Declarado en el schema pero ningun servicio lo asigna hoy. Tarjable por
  // defecto, que es como lo trataba start() antes de este refactor.
  NO_PLANIFICADO: null,
  EN_PROCESO: {
    label: 'En proceso por otro tarjador',
    message: 'Este vehiculo esta siendo procesado por otro usuario',
  },
  TARJADO: {
    label: 'Ya tarjado',
    message: 'Este vehiculo ya tiene una tarja valida. Anule antes de re-tarjar.',
  },
  OBSERVADO: {
    label: 'Ya tarjado (con observaciones)',
    message: 'Este vehiculo ya tiene una tarja valida. Anule antes de re-tarjar.',
  },
  BLOQUEADO: {
    label: 'Bloqueado por revision operativa',
    message: 'Este vehiculo esta bloqueado por revision operativa',
  },
};

export function getVehicleBlock(status: VehicleStatus): VehicleBlock | null {
  return BLOCKS[status];
}
