import { describe, expect, it } from 'vitest';
import { horaEspana, precioTaxi, precioVtc, uberLink, zonaDe } from './ride-fares';

const PALMA = { lat: 39.5696, lng: 2.6502 };
const BCN = { lat: 41.39, lng: 2.17 };
const MADRID = { lat: 40.4168, lng: -3.7038 };
// Martes 3-11-2026: 12:00 y 03:00 en España (UTC+1 en noviembre).
const MARTES_MEDIODIA = new Date(Date.UTC(2026, 10, 3, 11));
const MARTES_MADRUGADA = new Date(Date.UTC(2026, 10, 3, 2));

describe('precio de volver a casa', () => {
  it('saca la zona por el origen', () => {
    expect(zonaDe(PALMA)).toBe('mallorca');
    expect(zonaDe(BCN)).toBe('barcelona');
    expect(zonaDe(MADRID)).toBe('general');
  });

  it('usa la hora de España', () => {
    expect(horaEspana(MARTES_MEDIODIA)).toEqual({ hora: 12, dia: 2 });
    expect(horaEspana(MARTES_MADRUGADA)).toEqual({ hora: 3, dia: 2 });
  });

  it('taxi en Palma: diurna y nocturna', () => {
    // 10 km: 2,50 + 12 = 14,50 de día; 2,85 + 13,80 = 16,65 de noche.
    expect(precioTaxi(10, PALMA, null, MARTES_MEDIODIA)).toEqual({ min: 13, max: 17 });
    expect(precioTaxi(10, PALMA, null, MARTES_MADRUGADA)).toEqual({ min: 15, max: 20 });
  });

  it('suma el suplemento del aeropuerto de Palma', () => {
    const sin = precioTaxi(10, PALMA, { lat: 39.6, lng: 2.7 }, MARTES_MEDIODIA);
    const con = precioTaxi(10, PALMA, { lat: 39.552, lng: 2.739 }, MARTES_MEDIODIA);
    expect(con.min).toBeGreaterThan(sin.min);
  });

  it('Uber y Cabify suben de madrugada y respetan el mínimo', () => {
    const dia = precioVtc('uber', 10, 20, MARTES_MEDIODIA);
    const noche = precioVtc('uber', 10, 20, MARTES_MADRUGADA);
    expect(noche.max).toBeGreaterThan(dia.max);
    expect(precioVtc('cabify', 0.5, 2, MARTES_MEDIODIA).min).toBeGreaterThanOrEqual(6);
  });

  it('el enlace de Uber lleva el destino', () => {
    const url = uberLink({ lat: 39.57, lng: 2.65, label: 'Casa' });
    expect(url).toContain('m.uber.com/ul/');
    expect(decodeURIComponent(url)).toContain('dropoff[latitude]=39.57');
    expect(decodeURIComponent(url)).toContain('dropoff[nickname]=Casa');
  });
});
