import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';

/**
 * Sincronizador de Funout (migración 082), con su permiso.
 *
 * Lee su API y guarda en `funout_events` sólo los datos que Fiestea enseña a su
 * manera: nombre, sala, dirección, ubicación, día y hora, estilo, dress code,
 * cartel (el enlace, no el fichero), enlace de entradas y line-up. Sus textos no
 * se copian. La clave es el id de Funout: nada se duplica. Después pone al día
 * las fiestas ya añadidas a Fiestea (`funout_refresh_imported`).
 *
 * La llaman pg_cron cada hora (`x-cron-secret` = `CRON_SECRET`) y el panel de
 * administración (sesión de un admin). Sin JWT en la pasarela: la protección
 * va dentro.
 *
 * El CDN de Funout bloquea las IP de servidores (403), pero su API admite CORS
 * desde `app.fiestea.es`: el panel la lee desde el navegador y manda aquí la
 * lista (`events`). El cron sólo funcionará cuando Funout deje pasar a
 * Supabase; hasta entonces devuelve `FUNOUT_UNAVAILABLE` sin tocar nada.
 */

const FUNOUT_URL = 'https://funout.es/wp-json/mallorca-events/v1/events?per_page=500';
// Su cortafuegos rechaza los agentes genéricos.
const NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
// Buscador de mapas sobre OpenStreetMap que no bloquea a Supabase (Nominatim sí).
const PHOTON = 'https://photon.komoot.io/api/';

interface FunoutCategory {
  id: number;
  name: string;
  slug: string;
}

interface FunoutClub {
  id: number;
  name: string;
  address?: string;
  map_url?: string;
  map_embed_url?: string;
  opening_hours?: string;
  link?: string;
}

interface FunoutPromoter {
  id: number;
  name: string;
  link?: string;
}

interface FunoutEventRaw {
  id: number;
  title: string;
  excerpt: string;
  description: string;
  content: string;
  active_until?: string;
  active_until_unix?: number;
  categories: FunoutCategory[];
  club: FunoutClub;
  date: string;
  time?: string;
  datetime: string;
  dress_code?: string;
  end_raw?: string;
  end_unix?: number;
  event_type?: string;
  event_type_label?: string;
  featured: boolean;
  featured_raw?: string;
  formatted_date?: string;
  free_guestlist_enabled?: boolean;
  free_ticket_label?: string;
  image: string;
  is_free_event: boolean;
  lineup: string[];
  link: string;
  linked_djs: { name?: string }[];
  promoter: FunoutPromoter;
  published_at?: string;
  published_unix?: number;
  purchase_url?: string;
  recinto?: string;
  start_raw?: string;
  start_unix?: number;
  status: string;
  tags: string[];
  ticket_url?: string;
  venue?: string;
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&#8217;': '’',
  '&#8211;': '–',
  '&#8212;': '—',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};
const texto = (s?: string | null): string =>
  (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[#a-z0-9]+;/gi, (m) => ENTIDADES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();

const url = (s?: string | null): string | null => (s && /^https?:\/\//i.test(s.trim()) ? s.trim() : null);

/** Las coordenadas vienen, cuando vienen, dentro del enlace de Google Maps. */
const coordenadasDe = (mapUrl?: string): { lat: number; lng: number } | null => {
  const m = decodeURIComponent(mapUrl ?? '').match(/query=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

/** «Camí Can Capó, 4, 07199 Palma (Islas Baleares), España» → «Palma». */
const ciudadDe = (direccion?: string): string | null => {
  const m = (direccion ?? '').match(/\b\d{5}\s+([^,(]+)/);
  return m ? m[1].trim() : null;
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Punto = { lat: number; lng: number; city: string | null };

/** Funout es de Mallorca: la búsqueda se limita a la isla (minLon, minLat, maxLon, maxLat). */
const MALLORCA = '2.25,39.25,3.5,40.0';

/** Resultados demasiado gruesos para poner una sala en el mapa. */
const GRUESOS = new Set(['city', 'county', 'state', 'district', 'locality', 'country', 'region']);

/** Busca un sitio concreto de Mallorca en OpenStreetMap (Photon). */
/**
 * Busca un sitio concreto de Mallorca en OpenStreetMap (Photon). Con `cp`
 * (código postal de la dirección de Funout), el resultado tiene que ser de ese
 * código postal: así no se cuela una calle con el mismo nombre en otro pueblo.
 */
const buscarSitio = async (q: string, cp: string | null): Promise<Punto | null> => {
  const r = await fetch(`${PHOTON}?limit=5&bbox=${MALLORCA}&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'Fiestea/1.0 (hola@fiestea.es)', Accept: 'application/json' },
  });
  if (!r.ok) return null;
  const datos = (await r.json()) as {
    features?: {
      geometry?: { coordinates?: [number, number] };
      properties?: { city?: string; county?: string; type?: string; postcode?: string };
    }[];
  };
  for (const f of datos.features ?? []) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (GRUESOS.has(f.properties?.type ?? '')) continue;
    // Cuatro cifras: los códigos vecinos del mismo barrio pasan (07010/07011),
    // otro pueblo no (07610 frente a 07181).
    if (cp && f.properties?.postcode && f.properties.postcode.slice(0, 4) !== cp.slice(0, 4)) continue;
    return { lat, lng, city: f.properties?.city ?? f.properties?.county ?? null };
  }
  return null;
};

/** Las búsquedas de una sala, de la más precisa a la más vaga. */
const busquedas = (nombre: string, direccion: string, ciudad: string | null): { q: string; cp: string | null }[] => {
  const cp = direccion.match(/\b07\d{3}\b/)?.[0] ?? null;
  const trozos = direccion.split(',').map((t) => t.trim()).filter(Boolean);
  const corta = trozos.length >= 2 ? `${trozos[0]}, ${trozos[1]}${cp ? `, ${cp}` : ''}` : '';
  return [
    direccion ? { q: direccion, cp } : null,
    corta && corta !== direccion ? { q: corta, cp } : null,
    nombre ? { q: `${nombre} ${ciudad ?? ''}`.trim(), cp } : null,
    nombre ? { q: nombre, cp } : null,
  ].filter((b): b is { q: string; cp: string | null } => b !== null);
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  // ------------------------------------------------------------ quién llama
  const secreto = Deno.env.get('CRON_SECRET');
  const porCron = Boolean(secreto) && req.headers.get('x-cron-secret') === secreto;
  let enviados: unknown = null;
  if (!porCron) {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
    const { data: perfil } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (perfil?.role !== 'admin') return json({ error: 'NOT_AUTHORIZED' }, 403);
  }
  try {
    enviados = ((await req.json()) as { events?: unknown }).events ?? null;
  } catch {
    enviados = null;
  }

  // ----------------------------------------------------------------- leer
  let crudos: FunoutEventRaw[];
  if (Array.isArray(enviados)) {
    // Leída desde el navegador del admin.
    crudos = enviados.slice(0, 1000) as FunoutEventRaw[];
  } else try {
    const respuesta = await fetch(FUNOUT_URL, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        Referer: 'https://funout.es/',
        'User-Agent': NAVEGADOR,
      },
    });
    if (!respuesta.ok) return json({ error: 'FUNOUT_UNAVAILABLE', status: respuesta.status }, 502);
    const datos = await respuesta.json();
    if (!Array.isArray(datos)) return json({ error: 'FUNOUT_BAD_FORMAT' }, 502);
    crudos = datos as FunoutEventRaw[];
  } catch (error) {
    console.error('funout fetch:', error);
    return json({ error: 'FUNOUT_UNAVAILABLE' }, 502);
  }

  // ------------------------------------------- coordenadas de cada sala
  const { data: guardadas } = await supabase.from('funout_places').select('place_key, latitude, longitude, city');
  const lugares = new Map<string, { lat: number | null; lng: number | null; city: string | null }>(
    (guardadas ?? []).map((p) => [p.place_key as string, { lat: p.latitude, lng: p.longitude, city: p.city }]),
  );
  let geocodificadas = 0;

  const claveDe = (e: FunoutEventRaw) => {
    const nombre = texto(e.club?.name || e.venue || e.recinto).toLowerCase();
    return e.club?.id ? `club:${e.club.id}` : nombre ? `name:${nombre}` : null;
  };

  // Salas nuevas: primero las coordenadas de Funout y, si no, el buscador de
  // mapas, por nombre y después por dirección. Sólo se guardan las
  // encontradas: las demás se reintentan en la siguiente pasada.
  const intentadas = new Set<string>();
  for (const e of crudos) {
    const clave = claveDe(e);
    if (!clave || lugares.has(clave) || intentadas.has(clave)) continue;
    intentadas.add(clave);
    const nombre = texto(e.club?.name || e.venue || e.recinto);
    const direccion = texto(e.club?.address);
    const ciudad = ciudadDe(direccion);
    const deFunout = coordenadasDe(e.club?.map_url);
    let punto: Punto | null = deFunout ? { ...deFunout, city: ciudad } : null;
    if (!punto) {
      try {
        // La dirección es más precisa que el nombre (hay salas con el mismo
        // nombre en otros sitios); el nombre, para cuando no hay dirección útil.
        for (const { q, cp } of busquedas(nombre, direccion, ciudad)) {
          punto = await buscarSitio(q, cp);
          if (punto) break;
          await espera(250);
        }
        if (punto) geocodificadas += 1;
      } catch (error) {
        console.error('geocoder:', error);
      }
      await espera(300);
    }
    if (!punto) continue;
    lugares.set(clave, punto);
    await supabase.from('funout_places').upsert({
      place_key: clave,
      name: nombre || null,
      address: direccion || null,
      latitude: punto.lat,
      longitude: punto.lng,
      city: punto.city ?? ciudad,
      geocoded_at: new Date().toISOString(),
    });
  }

  // ----------------------------------------------------------- mapear
  const ahora = new Date().toISOString();
  const filas = crudos
    .filter((e) => Number.isFinite(e.id) && (e.start_unix || e.datetime))
    .map((e) => {
      const inicio = e.start_unix ? new Date(e.start_unix * 1000) : new Date(e.datetime);
      let fin = e.end_unix ? new Date(e.end_unix * 1000) : new Date(inicio.getTime() + 6 * 3_600_000);
      if (!(fin > inicio)) fin = new Date(inicio.getTime() + 6 * 3_600_000);
      const clave = claveDe(e);
      const punto = (clave && lugares.get(clave)) || { lat: null, lng: null, city: null };
      const direccion = texto(e.club?.address) || null;
      const estilos = (e.categories ?? []).map((c) => texto(c.name)).filter(Boolean);
      const lineup = [
        ...new Set([...(e.linked_djs ?? []).map((d) => texto(d?.name)), ...(e.lineup ?? []).map((l) => texto(l))].filter(Boolean)),
      ].slice(0, 20);
      return {
        funout_id: e.id,
        title: texto(e.title).slice(0, 120) || 'Fiesta',
        start_at: inicio.toISOString(),
        end_at: fin.toISOString(),
        place_name: texto(e.club?.name || e.venue || e.recinto) || null,
        address: direccion,
        city: ciudadDe(direccion ?? undefined) ?? punto.city ?? null,
        latitude: punto.lat,
        longitude: punto.lng,
        image_url: url(e.image),
        ticket_url: url(e.purchase_url) ?? url(e.ticket_url),
        source_url: url(e.link),
        theme: estilos[0] ?? null,
        genres: estilos,
        dress_code: texto(e.dress_code) || null,
        is_free: Boolean(e.is_free_event),
        lineup,
        event_type: texto(e.event_type) || null,
        synced_at: ahora,
      };
    });

  const { error: errorGuardar } = await supabase.from('funout_events').upsert(filas, { onConflict: 'funout_id' });
  if (errorGuardar) {
    console.error('funout upsert:', errorGuardar);
    return json({ error: 'SAVE_FAILED' }, 500);
  }

  // Lo que ya pasó hace una semana y nadie añadió, fuera.
  await supabase
    .from('funout_events')
    .delete()
    .lt('end_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .is('imported_event_id', null);

  const { data: actualizadas } = await supabase.rpc('funout_refresh_imported');

  return json({ fetched: crudos.length, saved: filas.length, geocoded: geocodificadas, refreshed: actualizadas ?? 0 });
});
