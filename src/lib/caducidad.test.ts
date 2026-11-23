import { describe, expect, it } from 'vitest';
import { diasParaCaducar } from './caducidad';

const AHORA = new Date('2026-11-22T12:00:00Z').getTime();
const dentroDe = (dias: number) => new Date(AHORA + dias * 864e5).toISOString();

describe('diasParaCaducar', () => {
  it('avisa si caduca en una semana o menos y no se renueva', () => {
    expect(diasParaCaducar(dentroDe(3.5), false, AHORA)).toBe(3);
    expect(diasParaCaducar(dentroDe(0.2), false, AHORA)).toBe(0);
    expect(diasParaCaducar(dentroDe(7), false, AHORA)).toBe(7);
  });

  it('no avisa si se renueva, si ya caducó o si falta más', () => {
    expect(diasParaCaducar(dentroDe(2), true, AHORA)).toBeNull();
    expect(diasParaCaducar(dentroDe(-1), false, AHORA)).toBeNull();
    expect(diasParaCaducar(dentroDe(12), false, AHORA)).toBeNull();
    expect(diasParaCaducar(null, false, AHORA)).toBeNull();
  });
});
