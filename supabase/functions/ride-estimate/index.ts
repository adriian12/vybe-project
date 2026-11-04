import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';

/**
 * «Volver a casa»: kilómetros y minutos del trayecto, con Mapbox.
 *
 *   POST { action: 'search', q, near?: { lat, lng } } → { results: [{ label, detail }] }
 *   POST { action: 'route', from: { lat, lng }, to: 'texto de casa' }
 *        → { km, minutes, to: { lat, lng, label } }
 *
 * La app sólo guarda en el móvil el TEXTO de la dirección de casa: Mapbox no
 * permite guardar los resultados del buscador gratuito. Por eso cada `route`
 * vuelve a buscar ese texto. Las coordenadas de destino que devuelve son para
 * abrir Uber o Cabify en ese momento, no para guardarlas.
 *
 * El origen llega redondeado a unos 100 m (3 decimales) y aquí se vuelve a
 * redondear. No se guarda nada.
 *
 * Topes, con el contador de siempre (`consume_anon_rate_limit`):
 *   · por persona: 40 búsquedas y 20 rutas por hora;
 *   · en total: 3000 al día de cada una (unas 90 000 al mes, por debajo de las
 *     100 000 gratuitas de cada API de Mapbox).
 * Al pasarse, 429: la app enseña los botones sin precio.
 *
 * Variables: MAPBOX_TOKEN
 */

interface Punto {
  lat: number;
  lng: number;
}

interface MapboxFeature {
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: { latitude?: number; longitude?: number };
  };
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

const punto = (value: unknown): Punto | null => {
  const p = value as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: redondear(lat), lng: redondear(lng) };
};

const geocode = async (token: string, q: string, near: Punto | null, limit: number): Promise<MapboxFeature[]> => {
  const params = new URLSearchParams({
    q,
    country: 'es',
    autocomplete: limit > 1 ? 'true' : 'false',
    limit: String(limit),
    language: 'es',
    types: 'address,street,place,locality,neighborhood,postcode',
    access_token: token,
  });
  if (near) params.set('proximity', `${near.lng},${near.lat}`);
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`);
  if (!response.ok) throw new Error(`geocode ${response.status}`);
  const data = (await response.json()) as { features?: MapboxFeature[] };
  return data.features ?? [];
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const token = Deno.env.get('MAPBOX_TOKEN');
  if (!token) return json({ error: 'NOT_CONFIGURED' }, 503);

  let body: { action?: unknown; q?: unknown; near?: unknown; from?: unknown; to?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  const supabase = adminClient();
  const user = await getUser(req, supabase);
  if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  try {
    if (body.action === 'search') {
      const q = typeof body.q === 'string' ? body.q.trim().slice(0, 120) : '';
      if (q.length < 3) return json({ results: [] });
      if (await overLimit(supabase, req, 'ride-search', 40, { userId: user.id, windowSeconds: 3600 })) {
        return tooManyRequests();
      }
      if (await overLimit(supabase, req, 'ride-search-day', 3000, { userId: 'all', windowSeconds: 86400 })) {
        return tooManyRequests();
      }

      const features = await geocode(token, q, punto(body.near), 5);
      const results = features
        .map((f) => ({
          label: f.properties?.name ?? '',
          detail: f.properties?.place_formatted ?? '',
          full: f.properties?.full_address ?? f.properties?.name ?? '',
        }))
        .filter((r) => r.full);
      return json({ results });
    }

    if (body.action === 'route') {
      const from = punto(body.from);
      const to = typeof body.to === 'string' ? body.to.trim().slice(0, 200) : '';
      if (!from || to.length < 3) return json({ error: 'INVALID_BODY' }, 400);
      if (await overLimit(supabase, req, 'ride-route', 20, { userId: user.id, windowSeconds: 3600 })) {
        return tooManyRequests();
      }
      if (await overLimit(supabase, req, 'ride-route-day', 3000, { userId: 'all', windowSeconds: 86400 })) {
        return tooManyRequests();
      }

      const [destino] = await geocode(token, to, from, 1);
      const lat = destino?.properties?.coordinates?.latitude;
      const lng = destino?.properties?.coordinates?.longitude;
      if (lat == null || lng == null) return json({ error: 'ADDRESS_NOT_FOUND' }, 404);

      const params = new URLSearchParams({ overview: 'false', access_token: token });
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.lng},${from.lat};${lng},${lat}?${params.toString()}`,
      );
      if (!response.ok) throw new Error(`directions ${response.status}`);
      const data = (await response.json()) as { routes?: { distance: number; duration: number }[] };
      const ruta = data.routes?.[0];
      if (!ruta) return json({ error: 'NO_ROUTE' }, 404);

      return json({
        km: Math.round(ruta.distance / 100) / 10,
        minutes: Math.max(1, Math.round(ruta.duration / 60)),
        to: { lat, lng, label: destino.properties?.name ?? to },
      });
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (error) {
    console.error('ride-estimate:', error instanceof Error ? error.message : error);
    return json({ error: 'UPSTREAM_ERROR' }, 502);
  }
});
