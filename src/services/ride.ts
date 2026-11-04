import { supabase } from '@/integrations/supabase/client';
import type { Punto } from '@/lib/ride-fares';

/**
 * «Volver a casa». La dirección de casa sólo vive en este móvil y sólo como
 * texto: Mapbox no deja guardar sus resultados, así que `ride-estimate` la
 * vuelve a buscar cada vez. El último trayecto se recuerda 10 minutos para que
 * abrir y cerrar la hoja no gaste peticiones.
 */

const HOME_KEY = 'fiestea_home_address';
const CACHE_MS = 10 * 60_000;

export const getHome = (): string | null => {
  try {
    return window.localStorage.getItem(HOME_KEY) || null;
  } catch {
    return null;
  }
};

export const setHome = (address: string | null): void => {
  try {
    if (address) window.localStorage.setItem(HOME_KEY, address);
    else window.localStorage.removeItem(HOME_KEY);
  } catch {
    // Sin almacenamiento se pedirá otra vez; no es grave.
  }
};

/** Unos 100 m: lo justo para la ruta, sin mandar la posición exacta. */
export const roundPoint = (p: Punto): Punto => ({
  lat: Math.round(p.lat * 1000) / 1000,
  lng: Math.round(p.lng * 1000) / 1000,
});

export interface AddressSuggestion {
  label: string;
  detail: string;
  full: string;
}

export interface RouteHome {
  km: number;
  minutes: number;
  to: Punto & { label: string };
}

export const searchAddress = async (q: string, near: Punto | null): Promise<AddressSuggestion[]> => {
  const { data, error } = await supabase.functions.invoke('ride-estimate', {
    body: { action: 'search', q, near: near ? roundPoint(near) : null },
  });
  if (error) throw error;
  return ((data as { results?: AddressSuggestion[] } | null)?.results ?? []).slice(0, 5);
};

let ultimo: { key: string; at: number; route: RouteHome } | null = null;

/** km, minutos y destino; `null` si no se puede (tope, sin red, no encontrada). */
export const routeHome = async (from: Punto, to: string): Promise<RouteHome | null> => {
  const origen = roundPoint(from);
  const key = `${origen.lat},${origen.lng}|${to}`;
  if (ultimo && ultimo.key === key && Date.now() - ultimo.at < CACHE_MS) return ultimo.route;

  const { data, error } = await supabase.functions.invoke('ride-estimate', {
    body: { action: 'route', from: origen, to },
  });
  if (error || !data || typeof (data as RouteHome).km !== 'number') return null;
  ultimo = { key, at: Date.now(), route: data as RouteHome };
  return ultimo.route;
};
