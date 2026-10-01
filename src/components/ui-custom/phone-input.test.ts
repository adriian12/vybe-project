import { describe, expect, it } from 'vitest';
import { splitPhone, COUNTRIES, DEFAULT_COUNTRY } from './phone-input';

describe('splitPhone', () => {
  it('separa el prefijo español del número', () => {
    expect(splitPhone('+34600111222')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'ES'),
      number: '600111222',
    });
  });

  it('prueba primero los prefijos largos', () => {
    // Portugal es +351. Si se probara «+3» antes, se lo comería España.
    expect(splitPhone('+351912345678').country.code).toBe('PT');
    // Y al revés: +1 no debe quedarse con un número que empieza por otro país.
    expect(splitPhone('+15551234567').country.code).toBe('US');
  });

  it('descarta espacios, guiones y paréntesis', () => {
    expect(splitPhone('+34 (600) 11-12-22').number).toBe('600111222');
  });

  it('cae a España cuando no hay prefijo reconocible', () => {
    // Un número escrito sin prefijo: se asume el país por defecto y se conserva
    // lo tecleado, en lugar de descartarlo.
    const resultado = splitPhone('600111222');
    expect(resultado.country).toBe(DEFAULT_COUNTRY);
    expect(resultado.number).toBe('600111222');
  });

  it('no se rompe con la cadena vacía', () => {
    expect(splitPhone('')).toEqual({ country: DEFAULT_COUNTRY, number: '' });
  });

  it('trata «+34» a secas como prefijo sin número', () => {
    // Es el valor por defecto del formulario: tiene que dar número vacío para
    // que la validación lo rechace en lugar de darlo por bueno.
    expect(splitPhone('+34')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'ES'),
      number: '',
    });
  });
});

describe('COUNTRIES', () => {
  it('no repite prefijos con el mismo código de país', () => {
    const codigos = COUNTRIES.map((c) => c.code);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('todos los prefijos empiezan por + y siguen con dígitos', () => {
    for (const pais of COUNTRIES) {
      expect(pais.dial).toMatch(/^\+\d{1,4}$/);
    }
  });
});
