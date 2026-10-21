import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';

/**
 * Escáner de fiestas de Barcelona, Madrid y Alicante (migración 114).
 *
 * Lee dos webs y guarda cada fiesta en `scanned_events`, sin duplicar, por
 * su web y su id en ella:
 *
 *   · **Xceed**: la página pública de eventos de la ciudad trae los datos en
 *     el estado de Next (nombre, fechas, cartel, sala, line-up y géneros). Su
 *     API pide clave, así que no se usa. No trae dirección ni coordenadas: se
 *     buscan por el nombre de la sala en Photon (OpenStreetMap).
 *   · **Resident Advisor**: su GraphQL público, con la zona de cada ciudad
 *     (Barcelona 20, Madrid 41, Alicante 613), con line-up, géneros, precio,
 *     edad mínima, dirección y coordenadas.
 *
 * Fourvenues no se lee: su web y su API están protegidas contra robots
 * (Cloudflare, límite de peticiones y API con clave).
 *
 * La llama el panel de administración (sólo admin) o un programador con
 * `x-cron-secret` = `CRON_SECRET`. Cuerpo opcional: `{ cities: ['madrid'] }`.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PHOTON = 'https://photon.komoot.io/api/';

const CIUDADES: Record<string, { nombre: string; ra: number; bbox: string }> = {
  barcelona: { nombre: 'Barcelona', ra: 20, bbox: '1.90,41.25,2.35,41.55' },
  madrid: { nombre: 'Madrid', ra: 41, bbox: '-3.90,40.25,-3.50,40.60' },
  alicante: { nombre: 'Alicante', ra: 613, bbox: '-0.75,38.20,-0.30,38.60' },
};

interface Fila {
  source: 'xceed' | 'ra';
  source_id: string;
  city: string;
  title: string;
  start_at: string;
  end_at: string | null;
  place_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  ticket_url: string;
  genres: string[];
  lineup: string[];
  price: number | null;
  min_age: number | null;
  synced_at: string;
}

const ahora = () => new Date().toISOString();
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const nombres = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => texto((x as { name?: unknown })?.name)).filter((x): x is string => Boolean(x)) : [];

/** «2026-10-21T23:59:00.000» (hora de Madrid, sin zona) → ISO con zona. */
const deMadrid = (local: string | null): string | null => {
  if (!local) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(local)) return new Date(local).toISOString();
  const base = new Date(`${local.slice(0, 19)}Z`);
  if (Number.isNaN(base.getTime())) return null;
  // La diferencia de Madrid con UTC ese día (1 h en invierno, 2 h en verano).
  const enMadrid = new Date(base.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const enUtc = new Date(base.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(base.getTime() - (enMadrid.getTime() - enUtc.getTime())).toISOString();
};

/** El menor precio de «0€, 15€» o «5». */
const precio = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const nums = [...v.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(',', '.'))).filter((n) => n >= 0 && n < 1000);
  return nums.length ? Math.min(...nums) : null;
};

// ------------------------------------------------------------------- Xceed
/** Los objetos JSON completos que empiezan en `inicio` (equilibrando llaves). */
const objetoEn = (s: string, inicio: number): string | null => {
  let nivel = 0;
  let enTexto = false;
  for (let i = inicio; i < s.length; i++) {
    const c = s[i];
    if (enTexto) {
      if (c === '\\') i++;
      else if (c === '"') enTexto = false;
      continue;
    }
    if (c === '"') enTexto = true;
    else if (c === '{') nivel++;
    else if (c === '}') {
      nivel--;
      if (nivel === 0) return s.slice(inicio, i + 1);
    }
  }
  return null;
};

const xceed = async (ciudad: string): Promise<Fila[]> => {
  const r = await fetch(`https://xceed.me/es/${ciudad}/events`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' },
  });
  if (!r.ok) throw new Error(`XCEED_${r.status}`);
  const html = await r.text();
  const trozos = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => {
    try {
      return JSON.parse(m[1]) as string;
    } catch {
      return '';
    }
  });
  const datos = trozos.join('');
  const vistos = new Set<string>();
  const filas: Fila[] = [];
  for (const m of datos.matchAll(/\{"id":"[0-9a-f-]{36}","legacyId":\d+/g)) {
    const bruto = objetoEn(datos, m.index ?? 0);
    if (!bruto) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(bruto);
    } catch {
      continue;
    }
    const legacy = String(e.legacyId ?? '');
    const slug = texto(e.slug);
    const nombre = texto(e.name);
    const inicio = Number(e.startingTime);
    if (!legacy || !slug || !nombre || !inicio || vistos.has(legacy)) continue;
    vistos.add(legacy);
    const venue = (e.venue ?? {}) as { name?: string; city?: { slug?: string } };
    if (venue.city?.slug && venue.city.slug !== ciudad) continue;
    const fin = Number(e.endingTime);
    filas.push({
      source: 'xceed',
      source_id: legacy,
      city: CIUDADES[ciudad].nombre,
      title: nombre,
      start_at: new Date(inicio * 1000).toISOString(),
      end_at: fin ? new Date(fin * 1000).toISOString() : null,
      place_name: texto(venue.name),
      address: null,
      latitude: null,
      longitude: null,
      image_url: texto(e.coverUrl),
      ticket_url: `https://xceed.me/es/${ciudad}/event/${slug}/${legacy}`,
      genres: nombres(e.musicGenres),
      lineup: nombres(e.lineup),
      price: null,
      min_age: null,
      synced_at: ahora(),
    });
  }
  return filas;
};

// -------------------------------------------------------- Resident Advisor
const QUERY = `query($f: FilterInputDtoInput, $page: Int) {
  eventListings(filters: $f, pageSize: 100, page: $page) {
    totalResults
    data { event { id title startTime endTime contentUrl flyerFront cost minimumAge
      artists { name } genres { name } images { filename }
      venue { name address location { latitude longitude } } } }
  }
}`;

const residentAdvisor = async (ciudad: string): Promise<Fila[]> => {
  const filas: Fila[] = [];
  const hoy = new Date().toISOString().slice(0, 10);
  for (let page = 1; page <= 5; page++) {
    const r = await fetch('https://ra.co/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Fiestea/1.0', Referer: `https://ra.co/events/es/${ciudad}` },
      body: JSON.stringify({ query: QUERY, variables: { f: { areas: { eq: CIUDADES[ciudad].ra }, listingDate: { gte: hoy } }, page } }),
    });
    if (!r.ok) throw new Error(`RA_${r.status}`);
    const body = (await r.json()) as { data?: { eventListings?: { totalResults?: number; data?: { event?: Record<string, unknown> }[] } } };
    const lista = body.data?.eventListings?.data ?? [];
    for (const { event: e } of lista) {
      if (!e) continue;
      const inicio = deMadrid(texto(e.startTime));
      const titulo = texto(e.title);
      if (!inicio || !titulo) continue;
      const venue = (e.venue ?? {}) as { name?: string; address?: string; location?: { latitude?: number; longitude?: number } };
      // Sala sin anunciar («TBA»): RA pone 0,0.
      const lat = venue.location?.latitude;
      const lng = venue.location?.longitude;
      const conPunto = typeof lat === 'number' && typeof lng === 'number' && !(lat === 0 && lng === 0);
      const imagenes = Array.isArray(e.images) ? (e.images as { filename?: string }[]) : [];
      const url = texto(e.contentUrl);
      filas.push({
        source: 'ra',
        source_id: String(e.id),
        city: CIUDADES[ciudad].nombre,
        title: titulo,
        start_at: inicio,
        end_at: deMadrid(texto(e.endTime)),
        place_name: texto(venue.name),
        address: texto(venue.address),
        latitude: conPunto ? (lat as number) : null,
        longitude: conPunto ? (lng as number) : null,
        image_url: texto(e.flyerFront) ?? texto(imagenes[0]?.filename),
        ticket_url: url?.startsWith('/') ? `https://ra.co${url}` : (url ?? `https://ra.co/events/${e.id}`),
        genres: nombres(e.genres),
        lineup: nombres(e.artists),
        price: precio(e.cost),
        min_age: typeof e.minimumAge === 'number' ? e.minimumAge : null,
        synced_at: ahora(),
      });
    }
    const total = body.data?.eventListings?.totalResults ?? 0;
    if (lista.length < 100 || page * 100 >= total) break;
  }
  return filas;
};

// ------------------------------------------------------------- ubicaciones
/** Coordenadas y dirección de una sala por su nombre, dentro de la ciudad. */
const buscarSala = async (nombre: string, ciudad: string): Promise<{ lat: number; lng: number; address: string | null } | null> => {
  try {
    const r = await fetch(`${PHOTON}?limit=1&bbox=${CIUDADES[ciudad].bbox}&q=${encodeURIComponent(`${nombre} ${CIUDADES[ciudad].nombre}`)}`, {
      headers: { 'User-Agent': 'Fiestea/1.0 (fiesttea@gmail.com)' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }[] };
    const f = j.features?.[0];
    const c = f?.geometry?.coordinates;
    if (!c) return null;
    const p = f.properties ?? {};
    const calle = [p.street, p.housenumber].filter(Boolean).join(', ');
    const address = [calle || null, [p.postcode, p.city].filter(Boolean).join(' ') || null].filter(Boolean).join(', ') || null;
    return { lat: c[1], lng: c[0], address };
  } catch {
    return null;
  }
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();
  const secreto = Deno.env.get('CRON_SECRET');
  const porCron = Boolean(secreto) && req.headers.get('x-cron-secret') === secreto;
  if (!porCron) {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
    const { data: perfil } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (perfil?.role !== 'admin') return json({ error: 'NOT_AUTHORIZED' }, 403);
  }

  const body = (await req.json().catch(() => ({}))) as { cities?: string[] };
  const ciudades = (body.cities ?? Object.keys(CIUDADES)).filter((c) => c in CIUDADES);
  const resumen: Record<string, Record<string, number | string>> = {};
  let guardadas = 0;

  for (const ciudad of ciudades) {
    resumen[ciudad] = {};
    const filas: Fila[] = [];
    for (const [fuente, leer] of [['xceed', xceed], ['ra', residentAdvisor]] as const) {
      try {
        const lista = await leer(ciudad);
        filas.push(...lista);
        resumen[ciudad][fuente] = lista.length;
      } catch (error) {
        resumen[ciudad][fuente] = String(error instanceof Error ? error.message : error);
      }
    }

    // Las salas de Xceed sin ubicación: primero, la que ya conozca RA por el
    // mismo nombre; si no, Photon (una vez por sala).
    const conocidas = new Map<string, { lat: number; lng: number; address: string | null }>();
    for (const f of filas) {
      if (f.place_name && f.latitude !== null && f.longitude !== null) {
        conocidas.set(f.place_name.toLowerCase(), { lat: f.latitude, lng: f.longitude, address: f.address });
      }
    }
    for (const f of filas) {
      if (f.latitude !== null || !f.place_name) continue;
      const clave = f.place_name.toLowerCase();
      if (!conocidas.has(clave)) {
        const sala = await buscarSala(f.place_name, ciudad);
        if (sala) conocidas.set(clave, sala);
        else conocidas.set(clave, { lat: NaN, lng: NaN, address: null });
      }
      const sala = conocidas.get(clave);
      if (sala && Number.isFinite(sala.lat)) {
        f.latitude = sala.lat;
        f.longitude = sala.lng;
        f.address = f.address ?? sala.address;
      }
    }

    // RA repite la misma fiesta en varios listados: una sola vez cada una.
    const unicas = [...new Map(filas.map((f) => [`${f.source}:${f.source_id}`, f])).values()];
    for (let i = 0; i < unicas.length; i += 200) {
      const { error } = await supabase
        .from('scanned_events')
        .upsert(unicas.slice(i, i + 200), { onConflict: 'source,source_id' });
      if (error) {
        console.error('scan-sync upsert:', error.message);
        resumen[ciudad].error = error.message;
        break;
      }
      guardadas += Math.min(200, unicas.length - i);
    }
  }

  return json({ saved: guardadas, cities: resumen });
});
