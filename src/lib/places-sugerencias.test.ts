import { describe, expect, it } from 'vitest';
import { ISLAS, sinContenidas, zonaConFiestas, Zona } from './places';

// Fiestas de ejemplo: Amok (Palma) y una en el centro de Madrid.
const FIESTAS = [
  { latitude: 39.5755, longitude: 2.6505 },
  { latitude: 40.4196, longitude: -3.7079 },
];

const zona = (nombre: string, latitude: number, longitude: number, limites: Zona['limites'] = null): Zona => ({
  nombre,
  detalle: null,
  latitude,
  longitude,
  limites,
});

describe('zonaConFiestas', () => {
  it('sugiere una ciudad con término si tiene alguna fiesta dentro', () => {
    expect(zonaConFiestas(zona('Palma', 39.57, 2.65, [39.45, 2.55, 39.66, 2.8]), FIESTAS)).toBe(true);
  });

  it('no sugiere un pueblo sin fiestas (Biosca)', () => {
    expect(zonaConFiestas(zona('Biosca', 41.85, 1.35, [41.8, 1.3, 41.9, 1.4]), FIESTAS)).toBe(false);
  });

  it('un sitio sin término necesita la fiesta al lado, no a 15 km', () => {
    expect(zonaConFiestas(zona('Al lado', 39.58, 2.655), FIESTAS)).toBe(true);
    expect(zonaConFiestas(zona('A 10 km', 39.66, 2.7), FIESTAS)).toBe(false);
  });

  it('Mallorca está entre las islas y coge las fiestas de Palma', () => {
    const mallorca = ISLAS.find((i) => i.nombre === 'Mallorca')!;
    expect(zonaConFiestas(mallorca, FIESTAS)).toBe(true);
    expect(zonaConFiestas(ISLAS.find((i) => i.nombre === 'Tenerife')!, FIESTAS)).toBe(false);
  });
});

describe('sinContenidas', () => {
  it('deja la ciudad y quita lo que cae dentro (Alicante y Bahía Alicante)', () => {
    const alicante = zona('Alicante', 38.35, -0.48, [38.25, -0.6, 38.5, -0.38]);
    const bahia = zona('Bahía Alicante II', 38.37, -0.43, [38.368, -0.432, 38.372, -0.428]);
    expect(sinContenidas([alicante, bahia]).map((z) => z.nombre)).toEqual(['Alicante']);
  });

  it('no quita un sitio que está fuera (Palma y Palmanova)', () => {
    const palma = zona('Palma', 39.57, 2.65, [39.45, 2.55, 39.66, 2.8]);
    const palmanova = zona('Palmanova', 39.52, 2.53);
    expect(sinContenidas([palma, palmanova]).map((z) => z.nombre)).toEqual(['Palma', 'Palmanova']);
  });
});
