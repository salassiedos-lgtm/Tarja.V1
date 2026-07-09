/**
 * Normalizacion laxa para busqueda parcial de VIN.
 *
 * No usa validateVin() de vin.util.ts: esa exige 17 caracteres y digito
 * verificador, y un fragmento no tiene ninguno de los dos.
 */
const MIN_QUERY = 4;
const VIN_LENGTH = 17;

/** Charset ISO 3779: sin I, O ni Q. */
const NON_VIN_CHARS = /[^A-HJ-NPR-Z0-9]/g;

export type VinQuery =
  | { mode: 'none' }
  | { mode: 'suffix'; vin: string }
  | { mode: 'exact'; vin: string };

export function parseVinQuery(raw: string): VinQuery {
  const vin = (raw ?? '').toUpperCase().replace(NON_VIN_CHARS, '');
  if (vin.length < MIN_QUERY || vin.length > VIN_LENGTH) return { mode: 'none' };
  if (vin.length === VIN_LENGTH) return { mode: 'exact', vin };
  return { mode: 'suffix', vin };
}
