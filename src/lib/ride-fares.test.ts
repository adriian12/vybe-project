import { describe, expect, it } from 'vitest';
import { horaEspana, precioVtc, uberLink } from './ride-fares';

// Martes 3-11-2026: 12:00 y 03:00 en España (UTC+1 en noviembre).
const MARTES_MEDIODIA = new Date(Date.UTC(2026, 10, 3, 11));
const MARTES_MADRUGADA = new Date(Date.UTC(2026, 10, 3, 2));

describe('precio de volver a casa', () => {
  it('usa la hora de España', () => {
    expect(horaEspana(MARTES_MEDIODIA)).toEqual({ hora: 12, dia: 2 });
    expect(horaEspana(MARTES_MADRUGADA)).toEqual({ hora: 3, dia: 2 });
  });

  it('Uber y Cabify suben de madrugada y respetan el mínimo', () => {
    const dia = precioVtc('uber', 10, 20, MARTES_MEDIODIA);
    const noche = precioVtc('uber', 10, 20, MARTES_MADRUGADA);
    expect(noche.max).toBeGreaterThan(dia.max);
    expect(dia.max).toBeGreaterThan(dia.min);
    expect(precioVtc('cabify', 0.5, 2, MARTES_MEDIODIA).min).toBeGreaterThanOrEqual(6);
  });

  it('el enlace de Uber lleva el destino', () => {
    const url = uberLink({ lat: 39.57, lng: 2.65, label: 'Casa' });
    expect(url).toContain('m.uber.com/ul/');
    expect(decodeURIComponent(url)).toContain('dropoff[latitude]=39.57');
    expect(decodeURIComponent(url)).toContain('dropoff[nickname]=Casa');
  });
});
