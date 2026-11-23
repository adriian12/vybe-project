import { describe, expect, it } from 'vitest';
import { gastosGestionCents } from './booking-fee';

describe('gastosGestionCents', () => {
  it('es el 10 % del precio de la entrada', () => {
    expect(gastosGestionCents(1500)).toBe(150);
    expect(gastosGestionCents(2000)).toBe(200);
    expect(gastosGestionCents(1582)).toBe(158);
  });

  it('nunca pasa de 5 € por entrada', () => {
    expect(gastosGestionCents(5000)).toBe(500);
    expect(gastosGestionCents(8000)).toBe(500);
    expect(gastosGestionCents(30000)).toBe(500);
  });

  it('una entrada gratis no tiene gastos', () => {
    expect(gastosGestionCents(0)).toBe(0);
  });
});
