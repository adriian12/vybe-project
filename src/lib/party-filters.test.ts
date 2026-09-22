import { describe, expect, it } from 'vitest';
import { aplicarFiltros, franjaDe } from './party-filters';

/** Un evento que empieza a esa hora local. */
const a = (hora: number, minuto = 0) => {
  const fecha = new Date(2026, 8, 20, hora, minuto);
  return { startDate: fecha.toISOString() };
};

describe('franjas de la fiesta', () => {
  it('tardeo: de 17:00 a 22:59', () => {
    expect(franjaDe(a(17))).toBe('tardeo');
    expect(franjaDe(a(22, 59))).toBe('tardeo');
  });

  it('nocheo: de 23:00 a 04:59', () => {
    expect(franjaDe(a(23))).toBe('nocheo');
    expect(franjaDe(a(0, 30))).toBe('nocheo');
    expect(franjaDe(a(4, 59))).toBe('nocheo');
  });

  it('after: de 05:00 a 13:59', () => {
    expect(franjaDe(a(6))).toBe('after');
    expect(franjaDe(a(12))).toBe('after');
  });

  it('lo de día no entra en ninguna franja', () => {
    expect(franjaDe(a(15))).toBeNull();
  });

  it('combina música y franja', () => {
    const lista = [
      { event: { ...a(18), theme: 'Techno' } },
      { event: { ...a(23, 30), theme: 'Techno' } },
      { event: { ...a(23, 30), theme: 'Reggaeton' } },
    ];
    expect(aplicarFiltros(lista, 'Techno', 'nocheo')).toHaveLength(1);
    expect(aplicarFiltros(lista, null, 'nocheo')).toHaveLength(2);
    expect(aplicarFiltros(lista, 'Techno', null)).toHaveLength(2);
  });
});
