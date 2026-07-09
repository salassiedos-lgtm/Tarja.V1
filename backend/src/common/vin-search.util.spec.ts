import { parseVinQuery } from './vin-search.util';

describe('parseVinQuery', () => {
  it('normaliza a mayusculas y descarta separadores', () => {
    expect(parseVinQuery(' ab-12 3d ')).toEqual({ mode: 'suffix', vin: 'AB123D' });
  });

  it('descarta I, O y Q, que el charset VIN prohibe', () => {
    // 'OQ' se cae entero; queda '00123' (5 caracteres, sigue siendo sufijo valido)
    expect(parseVinQuery('OQ00123')).toEqual({ mode: 'suffix', vin: '00123' });
  });

  it.each(['', '   ', '1', '12', '123', '--12--'])(
    'menos de 4 caracteres utiles (%j) no dispara busqueda',
    (q) => {
      expect(parseVinQuery(q)).toEqual({ mode: 'none' });
    },
  );

  it('4 caracteres es el minimo que dispara el sufijo', () => {
    expect(parseVinQuery('0123')).toEqual({ mode: 'suffix', vin: '0123' });
  });

  it('16 caracteres sigue siendo sufijo', () => {
    const q = 'A'.repeat(16);
    expect(parseVinQuery(q)).toEqual({ mode: 'suffix', vin: q });
  });

  it('17 caracteres es match exacto: es lo que entregara el escaner', () => {
    const vin = 'LSGKB54E9DL000123';
    expect(parseVinQuery(vin)).toEqual({ mode: 'exact', vin });
  });

  it('mas de 17 caracteres no puede ser ningun VIN', () => {
    expect(parseVinQuery('A'.repeat(18))).toEqual({ mode: 'none' });
  });
});
