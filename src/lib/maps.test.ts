import { describe, expect, it } from 'vitest';
import { rutaHasta } from './maps';

const destino = (url: string | null) => (url ? decodeURIComponent(url.split('destination=')[1]) : null);

describe('rutaHasta', () => {
  it('con dirección manda sala, dirección y ciudad, no las coordenadas', () => {
    const url = rutaHasta({ name: 'Sonido Alicante', address: 'Calle Mayor 16', city: 'Alicante', latitude: 38.2844, longitude: -0.5658 });
    expect(destino(url)).toBe('Sonido Alicante, Calle Mayor 16, Alicante');
  });

  it('no repite la ciudad ni la sala si ya van en la dirección', () => {
    const url = rutaHasta({ name: 'Bikini', address: 'Bikini, Avinguda Diagonal 547, Barcelona', city: 'Barcelona' });
    expect(destino(url)).toBe('Bikini, Avinguda Diagonal 547, Barcelona');
  });

  it('sin dirección usa las coordenadas', () => {
    expect(destino(rutaHasta({ latitude: 39.57, longitude: 2.65 }))).toBe('39.57,2.65');
  });

  it('sin nada no hay ruta', () => {
    expect(rutaHasta({ name: 'Sala' })).toBeNull();
  });
});
