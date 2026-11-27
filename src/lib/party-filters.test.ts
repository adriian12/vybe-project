import { describe, expect, it } from 'vitest';
import { aplicarFiltros, franjaDe, conFlechazo, sePuedeEntrar } from './party-filters';

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
    // La música se filtra por categoría (lib/music), no por el género tal cual.
    expect(aplicarFiltros(lista, 'techno', 'nocheo')).toHaveLength(1);
    expect(aplicarFiltros(lista, null, 'nocheo')).toHaveLength(2);
    expect(aplicarFiltros(lista, 'techno', null)).toHaveLength(2);
    expect(aplicarFiltros(lista, 'reggaeton', null)).toHaveLength(1);
  });
});

describe('conFlechazo', () => {
  const ahora = new Date('2026-10-05T23:30:00Z').getTime();
  const base = {
    startDate: '2026-10-05T22:00:00Z',
    endDate: '2026-10-06T05:00:00Z',
    swipeEnabled: true,
    entryByLocation: false,
    location: undefined,
  };
  it('en directo o más tarde, con Flechazo', () => {
    expect(conFlechazo(base, ahora)).toBe(true);
    // Empieza dentro de unas horas: también sale (antes el filtro se quedaba vacío de día).
    expect(conFlechazo({ ...base, startDate: '2026-10-06T01:00:00Z' }, ahora)).toBe(true);
  });
  it('sin Flechazo, sin entrada o ya terminada, no', () => {
    expect(conFlechazo({ ...base, swipeEnabled: false }, ahora)).toBe(false);
    expect(conFlechazo({ ...base, entryEnabled: false }, ahora)).toBe(false);
    expect(conFlechazo({ ...base, endDate: '2026-10-05T23:00:00Z' }, ahora)).toBe(false);
  });
  it('las de Fiestea, sólo con ubicación', () => {
    expect(conFlechazo({ ...base, entryByLocation: true }, ahora)).toBe(false);
    expect(conFlechazo({ ...base, entryByLocation: true, location: { latitude: 39.5, longitude: 2.6 } }, ahora)).toBe(true);
  });
});

describe('sePuedeEntrar', () => {
  it('con la entrada encendida, sí; apagada, sólo «Voy a ir»', () => {
    expect(sePuedeEntrar({ entryEnabled: true, entryByLocation: false })).toBe(true);
    expect(sePuedeEntrar({ entryByLocation: false })).toBe(true);
    expect(sePuedeEntrar({ entryEnabled: false, entryByLocation: false })).toBe(false);
  });
  it('las de Fiestea, sólo con ubicación', () => {
    const location = { latitude: 39.57, longitude: 2.65 } as Parameters<typeof sePuedeEntrar>[0]['location'];
    expect(sePuedeEntrar({ entryEnabled: true, entryByLocation: true })).toBe(false);
    expect(sePuedeEntrar({ entryEnabled: true, entryByLocation: true, location })).toBe(true);
  });
});
