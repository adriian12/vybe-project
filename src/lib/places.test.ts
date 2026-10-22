import { describe, expect, it } from 'vitest';
import { enZona, zonasDePhoton, Zona } from './places';

describe('zonasDePhoton', () => {
  it('saca nombre, provincia, centro y término municipal', () => {
    const [palma] = zonasDePhoton([
      {
        geometry: { coordinates: [2.65, 39.57] },
        properties: { name: 'Palma', state: 'Illes Balears', countrycode: 'ES', extent: [2.55, 39.65, 2.79, 39.45] },
      },
    ]);
    expect(palma).toEqual({
      nombre: 'Palma',
      detalle: 'Illes Balears',
      latitude: 39.57,
      longitude: 2.65,
      limites: [39.45, 2.55, 39.65, 2.79],
    });
  });

  it('quita los repetidos y lo que no es de España', () => {
    const zonas = zonasDePhoton([
      { geometry: { coordinates: [-3.7, 40.4] }, properties: { name: 'Madrid', state: 'Comunidad de Madrid', countrycode: 'ES' } },
      { geometry: { coordinates: [-3.7, 40.4] }, properties: { name: 'Madrid', state: 'Comunidad de Madrid', countrycode: 'ES' } },
      { geometry: { coordinates: [-80, 25] }, properties: { name: 'Madrid', state: 'Florida', countrycode: 'US' } },
      { properties: { name: 'Sin punto', countrycode: 'ES' } },
    ]);
    expect(zonas.map((z) => z.nombre)).toEqual(['Madrid']);
  });
});

describe('enZona', () => {
  const palma: Zona = { nombre: 'Palma', detalle: null, latitude: 39.57, longitude: 2.65, limites: [39.45, 2.55, 39.65, 2.79] };

  it('cuenta lo que cae en el término municipal o justo al lado', () => {
    expect(enZona(palma, 39.57, 2.65)).toBe(true);
    expect(enZona(palma, 39.67, 2.6)).toBe(true);
    expect(enZona(palma, 40.42, -3.71)).toBe(false);
  });

  it('sin término, 15 km alrededor del centro', () => {
    const sinLimites: Zona = { ...palma, limites: null };
    expect(enZona(sinLimites, 39.5, 2.6)).toBe(true);
    expect(enZona(sinLimites, 39.85, 3.12)).toBe(false);
  });
});
