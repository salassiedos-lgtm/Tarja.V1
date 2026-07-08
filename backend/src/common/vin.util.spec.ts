import { normalizeVin, hasValidVinFormat, hasValidCheckDigit, validateVin } from './vin.util';

describe('vin.util', () => {
  const REAL_VIN = 'LEFEDDE15VTP04723'; // del Excel de desconsolidado
  const PHOTO_VIN = 'LVTDB11B2VD024641'; // de la etiqueta Chery T1D

  describe('normalizeVin', () => {
    it('pasa a mayusculas y elimina separadores', () => {
      expect(normalizeVin(' lefedde15vtp04723 ')).toBe(REAL_VIN);
      expect(normalizeVin('LEFEDDE15-VTP 04723')).toBe(REAL_VIN);
    });
  });

  describe('hasValidVinFormat', () => {
    it('acepta 17 caracteres del charset ISO 3779', () => {
      expect(hasValidVinFormat(REAL_VIN)).toBe(true);
      expect(hasValidVinFormat(PHOTO_VIN)).toBe(true);
    });
    it('rechaza longitud distinta de 17', () => {
      expect(hasValidVinFormat('LEFEDDE15VTP0472')).toBe(false);
      expect(hasValidVinFormat('LEFEDDE15VTP047233')).toBe(false);
    });
    it('rechaza las letras I, O y Q', () => {
      expect(hasValidVinFormat('IEFEDDE15VTP04723')).toBe(false);
      expect(hasValidVinFormat('OEFEDDE15VTP04723')).toBe(false);
      expect(hasValidVinFormat('QEFEDDE15VTP04723')).toBe(false);
    });
  });

  describe('hasValidCheckDigit', () => {
    it('acepta VINs reales', () => {
      expect(hasValidCheckDigit(REAL_VIN)).toBe(true);
      expect(hasValidCheckDigit(PHOTO_VIN)).toBe(true);
    });
    it('rechaza un VIN con un caracter alterado', () => {
      expect(hasValidCheckDigit('LEFEDDE15VTP04724')).toBe(false);
    });
    it('no explota con formato invalido', () => {
      expect(hasValidCheckDigit('CORTO')).toBe(false);
    });
  });

  describe('validateVin', () => {
    it('devuelve el VIN normalizado y ambos flags', () => {
      expect(validateVin(' lefedde15vtp04723 ')).toEqual({
        vin: REAL_VIN,
        formatOk: true,
        checkDigitOk: true,
      });
    });
    it('marca checkDigitOk=false sin marcar formatOk=false', () => {
      expect(validateVin('LEFEDDE15VTP04724')).toEqual({
        vin: 'LEFEDDE15VTP04724',
        formatOk: true,
        checkDigitOk: false,
      });
    });
  });
});
