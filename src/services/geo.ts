import { getNativePosition } from '@/services/native';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export class GeolocationError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'denied' | 'unavailable' | 'timeout',
  ) {
    super(message);
    this.name = 'GeolocationError';
  }
}

/**
 * Posición simulada, sólo en desarrollo.
 *
 * Probar el acceso a un evento exige estar físicamente dentro de su radio, que
 * puede ser de cincuenta metros. Sin esto, revisar el flujo desde el escritorio
 * o desde casa es imposible.
 *
 * Se guarda en `localStorage` para que sobreviva a las recargas, y las tres
 * funciones devuelven o descartan en producción: en un build de producción esta
 * rama no hace nada aunque alguien escriba la clave a mano.
 */
const MOCK_POSITION_KEY = 'vybe:dev:mock-position';

export const getMockPosition = (): Coordinates | null => {
  if (!import.meta.env.DEV) return null;

  try {
    const raw = localStorage.getItem(MOCK_POSITION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Coordinates;
    return typeof parsed?.latitude === 'number' && typeof parsed?.longitude === 'number'
      ? parsed
      : null;
  } catch {
    return null;
  }
};

/** Fija la posición simulada, o la borra si se pasa `null`. */
export const setMockPosition = (position: Coordinates | null): void => {
  if (!import.meta.env.DEV) return;

  try {
    if (position) localStorage.setItem(MOCK_POSITION_KEY, JSON.stringify(position));
    else localStorage.removeItem(MOCK_POSITION_KEY);
  } catch {
    // Modo privado o almacenamiento lleno: no es crítico.
  }
};

/**
 * Pide la posición real del dispositivo.
 *
 * Antes la app llamaba a la API con unas coordenadas de Madrid escritas a mano,
 * de modo que la verificación de proximidad nunca comprobaba nada.
 *
 * En desarrollo, una posición simulada tiene prioridad sobre el GPS.
 */
export const getCurrentPosition = async (
  options: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
): Promise<Coordinates> => {
  const mock = getMockPosition();
  if (mock) return mock;

  // Dentro de la aplicación instalada la ubicación la da el sistema, con su
  // propio diálogo de permisos y el GPS del teléfono. El navegador es el caso
  // de respaldo, no al revés.
  try {
    const native = await getNativePosition();
    if (native) return native;
  } catch (error) {
    if (error instanceof Error && error.message === 'LOCATION_DENIED') {
      throw new GeolocationError('Has denegado el permiso de ubicación', 'denied');
    }
    // Cualquier otro fallo del plugin cae al navegador, que quizá sí pueda.
  }

  return new Promise((resolve, reject) => {

    if (!('geolocation' in navigator)) {
      reject(new GeolocationError('La geolocalización no está disponible en este navegador', 'unsupported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new GeolocationError('Has denegado el permiso de ubicación', 'denied'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new GeolocationError('No se pudo determinar tu ubicación', 'unavailable'));
            break;
          case error.TIMEOUT:
            reject(new GeolocationError('La ubicación ha tardado demasiado', 'timeout'));
            break;
          default:
            reject(new GeolocationError('Error obteniendo la ubicación', 'unavailable'));
        }
      },
      options,
    );
  });
};

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * «850 m», «1,2 km», «12 km», con el separador decimal del idioma. Por encima
 * de 10 km los decimales ya no dicen nada.
 */
export const formatDistance = (meters: number, locale?: string): string => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const decimales = meters < 10_000 ? 1 : 0;
  const km = (meters / 1000).toLocaleString(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${km} km`;
};
