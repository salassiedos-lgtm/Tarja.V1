import { normalizeHeader } from './header.util';

describe('normalizeHeader', () => {
  it('colapsa el salto de linea del encabezado real del Excel', () => {
    expect(normalizeHeader('Part number/\nchassis number')).toBe('part number/chassis number');
  });
  it('normaliza los espacios alrededor de la barra', () => {
    expect(normalizeHeader('B/L number')).toBe('b/l number');
    expect(normalizeHeader('B / L  number')).toBe('b/l number');
  });
  it('quita acentos y espacios sobrantes', () => {
    expect(normalizeHeader('  Número  de Piezas ')).toBe('numero de piezas');
  });
  it('tolera valores vacios', () => {
    expect(normalizeHeader('')).toBe('');
  });
});
