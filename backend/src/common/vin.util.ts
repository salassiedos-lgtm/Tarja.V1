/**
 * Utilidades de VIN segun ISO 3779.
 * El charset excluye I, O y Q para evitar confusion con 1 y 0.
 */
const VIN_LENGTH = 17;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export interface VinValidation {
  vin: string;
  formatOk: boolean;
  checkDigitOk: boolean;
}

/** Mayusculas, sin espacios ni guiones. No corrige confusiones O/0. */
export function normalizeVin(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hasValidVinFormat(vin: string): boolean {
  return VIN_PATTERN.test(vin);
}

/** Digito verificador en la posicion 9 (indice 8). */
export function hasValidCheckDigit(vin: string): boolean {
  if (!hasValidVinFormat(vin)) return false;
  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i++) {
    sum += TRANSLITERATION[vin[i]] * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected;
}

export function validateVin(raw: string): VinValidation {
  const vin = normalizeVin(raw);
  const formatOk = hasValidVinFormat(vin);
  return { vin, formatOk, checkDigitOk: formatOk && hasValidCheckDigit(vin) };
}
