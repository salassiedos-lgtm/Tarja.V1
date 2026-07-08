/**
 * Normaliza un encabezado de Excel para compararlo con una clave fija.
 * El Excel de desconsolidado trae saltos de linea dentro del encabezado.
 */
const COMBINING_MARKS = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
);

export function normalizeHeader(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
    .toLowerCase();
}
