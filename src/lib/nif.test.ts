import { describe, expect, it } from 'vitest';
import { isValidNif, normalizeNif } from './nif';

describe('normalizeNif', () => {
  it('quita separadores y pasa a mayúsculas', () => {
    expect(normalizeNif(' b-12.345 678 ')).toBe('B12345678');
  });
});

describe('isValidNif', () => {
  it('acepta un DNI con su letra correcta', () => {
    // 43188784 % 23 = 5, y la sexta letra de la serie es la M.
    expect(isValidNif('43188784M')).toBe(true);
    expect(isValidNif('43.188.784-m')).toBe(true);
  });

  it('rechaza un DNI con la letra cambiada', () => {
    expect(isValidNif('43188784A')).toBe(false);
  });

  it('acepta un NIE', () => {
    // X0000000 se calcula como 00000000: resto 0, letra T.
    expect(isValidNif('X0000000T')).toBe(true);
  });

  it('rechaza un NIE con la letra cambiada', () => {
    expect(isValidNif('X0000000A')).toBe(false);
  });

  it('acepta un CIF de sociedad anónima, con control numérico', () => {
    // A0000000: las siete cifras a cero suman cero, así que el control es 0.
    expect(isValidNif('A00000000')).toBe(true);
  });

  it('acepta un CIF de entidad con control en letra', () => {
    // P0000000: mismo cálculo, pero este tipo de entidad lleva letra: la J.
    expect(isValidNif('P0000000J')).toBe(true);
    expect(isValidNif('P00000000')).toBe(false);
  });

  it('rechaza longitudes y formas que no existen', () => {
    expect(isValidNif('')).toBe(false);
    expect(isValidNif('1234567')).toBe(false);
    expect(isValidNif('431887845')).toBe(false);
    expect(isValidNif('ÑÑÑÑÑÑÑÑÑ')).toBe(false);
  });
});
