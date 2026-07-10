import { WorkShift } from '@prisma/client';

/**
 * Deriva el turno de trabajo y la fecha de reporte a partir del instante de
 * finalización, en hora de Lima (UTC-5, sin horario de verano).
 *
 * Turno Día  = 07:00–18:59 · Turno Noche = 19:00–06:59.
 * La madrugada (00:00–06:59) pertenece a la noche del día ANTERIOR, de modo que
 * un turno noche (19:00→07:00) cae completo bajo una sola fecha de reporte.
 */
export function limaShift(now: Date): { reportDate: Date; workShift: WorkShift } {
  const lima = new Date(now.getTime() - 5 * 3600 * 1000);
  const h = lima.getUTCHours();

  let workShift: WorkShift;
  let dayOffset = 0;
  if (h >= 7 && h < 19) {
    workShift = WorkShift.DIA;
  } else {
    workShift = WorkShift.NOCHE;
    if (h < 7) dayOffset = -1; // madrugada → noche del día anterior
  }

  const day = new Date(lima);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  const reportDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));

  return { reportDate, workShift };
}
