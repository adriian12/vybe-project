import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { buildIcs, icsFileName } from '../_shared/ics.ts';

/**
 * «Añadir al calendario» (129): el `.ics` de una fiesta.
 *
 *   GET ?event=<uuid>
 *
 * Sin JWT: lo usa cualquiera, también sin cuenta, y se abre en el navegador del
 * sistema (en un iPhone, Safari enseña «Añadir al calendario»; en Android se
 * descarga y se abre con el calendario). Sólo da lo que ya enseña la ficha
 * pública (`get_public_event`): fiestas que no han terminado de locales
 * verificados.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_URL = 'https://app.fiestea.es';

interface PublicEvent {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  place_name: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  venue_name: string | null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Método no permitido' }, 405);

  const id = new URL(req.url).searchParams.get('event') ?? '';
  if (!UUID.test(id)) return json({ error: 'EVENT_REQUIRED' }, 400);

  const supabase = adminClient();
  if (await overLimit(supabase, req, 'event-calendar', 30)) return tooManyRequests();

  const { data, error } = await supabase.rpc('get_public_event', { p_event_id: id });
  if (error) {
    console.error('get_public_event:', error.message);
    return json({ error: 'Error interno del servidor' }, 500);
  }
  const event = ((data ?? []) as PublicEvent[])[0];
  if (!event) return json({ error: 'NOT_FOUND' }, 404);

  const sitio = event.place_name || event.venue_name;
  const link = `${APP_URL}/event/${event.id}`;
  const ics = buildIcs({
    id: event.id,
    name: event.name,
    start: new Date(event.start_date),
    end: new Date(event.end_date),
    location: [sitio, event.address, event.city].filter(Boolean).join(', '),
    description: [event.venue_name, link].filter(Boolean).join('\n'),
    url: link,
    latitude: event.latitude,
    longitude: event.longitude,
    // El del calendario, por si los avisos de la app están apagados.
    alarmMinutes: 120,
  });

  return new Response(ics, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsFileName(event.name)}"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
});
