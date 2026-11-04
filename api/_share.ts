/**
 * Común a `share-event` y `share-image`: la vista previa de los enlaces de una
 * fiesta (WhatsApp, Telegram, iMessage…). Los robots que pintan la tarjeta no
 * ejecutan JavaScript, así que `vercel.json` les manda `/event/:id` aquí en
 * vez de a la app. Los datos salen de `get_event_share` (migración 108), que
 * puede llamar `anon`.
 */

declare const process: { env: Record<string, string | undefined> };

export const APP_URL = 'https://app.fiestea.es';
export const DEFAULT_IMAGE = 'https://fiestea.es/og-image.png';

export const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

export interface EventShare {
  name: string;
  start_date: string;
  end_date: string | null;
  poster_url: string | null;
  place: string | null;
  city: string | null;
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const eventIdOf = (request: Request): string | null => {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  return isUuid(id) ? id.toLowerCase() : null;
};

const SLUG = /^[a-z0-9-]{1,80}$/;

/**
 * El id de la URL legible `/event/<sala>/<fiesta>` (migración 133), que
 * `vercel.json` manda aquí como `?place=…&slug=…`.
 */
export const eventIdFromSlug = async (request: Request): Promise<string | null> => {
  const params = new URL(request.url).searchParams;
  const place = (params.get('place') ?? '').toLowerCase();
  const slug = (params.get('slug') ?? '').toLowerCase();
  if (!SUPABASE_URL || !ANON_KEY || !SLUG.test(place) || !SLUG.test(slug)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_event_id_by_slug`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_place_slug: place, p_slug: slug }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const id = (await res.json()) as unknown;
    return typeof id === 'string' && isUuid(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
};

export const loadEventShare = async (id: string): Promise<EventShare | null> => {
  if (!SUPABASE_URL || !ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_event_share?p_event_id=${id}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as EventShare[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
};

/** Cambia cuando cambia el cartel, para que WhatsApp no se quede con el viejo. */
export const posterVersion = (url: string): string => {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
