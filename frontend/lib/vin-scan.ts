import { normalizeVinQuery } from './use-vin-search';

const VIN_LENGTH = 17;

/** BarcodeDetector solo existe en Android/Chrome; en el resto, el boton de escaneo no se muestra. */
export function isScannerSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Busca, entre los campos separados por coma del payload decodificado, el
 * que tiene forma de VIN (17 caracteres tras normalizar). Cubre tanto el QR
 * (CSV con el VIN en cualquier posicion) como el codigo de barras (hoy un
 * solo campo = el VIN; manana, varios campos igual que el QR).
 */
export function extractVinFromScan(raw: string): string | null {
  for (const field of raw.split(',')) {
    const normalized = normalizeVinQuery(field);
    if (normalized.length === VIN_LENGTH) return normalized;
  }
  return null;
}
