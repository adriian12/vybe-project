import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateDistance, formatDistance, getCurrentPosition, GeolocationError } from './geo';

describe('calculateDistance', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(calculateDistance(39.5696, 2.6502, 39.5696, 2.6502)).toBe(0);
  });

  it('calcula la distancia entre dos puntos de Palma con precisión de metros', () => {
    // Dos puntos separados por unos 1,2 km en el centro de Palma.
    const distance = calculateDistance(39.5696, 2.6502, 39.5612, 2.6411);
    expect(distance).toBeGreaterThan(1100);
    expect(distance).toBeLessThan(1400);
  });

  it('es simétrica', () => {
    const ab = calculateDistance(39.57, 2.65, 39.53, 2.73);
    const ba = calculateDistance(39.53, 2.73, 39.57, 2.65);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('coincide con la distancia conocida entre Palma y Alcúdia', () => {
    // ~51 km en línea recta según coordenadas reales de ambos municipios.
    const distance = calculateDistance(39.5696, 2.6502, 39.8522, 3.1214);
    expect(distance / 1000).toBeGreaterThan(49);
    expect(distance / 1000).toBeLessThan(53);
  });
});

describe('formatDistance', () => {
  it('usa metros por debajo de 1 km', () => {
    expect(formatDistance(0)).toBe('0m');
    expect(formatDistance(45.6)).toBe('46m');
    expect(formatDistance(999)).toBe('999m');
  });

  it('cambia a kilómetros a partir de 1000 m', () => {
    expect(formatDistance(1000)).toBe('1.0km');
    expect(formatDistance(2540)).toBe('2.5km');
  });
});

describe('getCurrentPosition', () => {
  afterEach(() => {
    // @ts-expect-error limpiamos el mock entre pruebas
    delete navigator.geolocation;
  });

  it('rechaza con código "unsupported" si el navegador no lo soporta', async () => {
    await expect(getCurrentPosition()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('resuelve con las coordenadas del dispositivo', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 39.57, longitude: 2.65, accuracy: 12 },
          } as GeolocationPosition),
      },
    });

    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: 39.57,
      longitude: 2.65,
      accuracy: 12,
    });
  });

  it('traduce el permiso denegado a un GeolocationError', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_s: PositionCallback, error: PositionErrorCallback) =>
          error({
            code: 1,
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
            message: 'denied',
          } as GeolocationPositionError),
      },
    });

    const promise = getCurrentPosition();
    await expect(promise).rejects.toBeInstanceOf(GeolocationError);
    await expect(promise).rejects.toMatchObject({ code: 'denied' });
  });
});
