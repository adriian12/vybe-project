import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, getProfileId } from '../_shared/supabase.ts';

/**
 * Recoge los lotes de eventos de producto que envía el cliente.
 *
 * Guardarlos en `analytics_events` evita depender de un proveedor externo para
 * tener el embudo de activación, que hasta ahora no existía en absoluto.
 */

const MAX_BATCH = 50;
const ALLOWED = new Set([
  'signup_started',
  'signup_completed',
  'email_verified',
  'event_viewed',
  'location_verified',
  'code_redeemed',
  'code_rejected',
  'photos_uploaded',
  'swipe',
  'match',
  'message_sent',
  'premium_dialog_opened',
  'premium_subscribed',
  'report_submitted',
  'sos_triggered',
  'venue_event_created',
  'venue_code_generated',
  'account_deleted',
]);

interface IncomingEvent {
  name: string;
  props?: Record<string, unknown>;
  at?: string;
}

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const { events } = (await req.json()) as { events?: IncomingEvent[] };
    if (!Array.isArray(events) || events.length === 0) return json({ stored: 0 });

    // La analítica es opcional: si no hay sesión, se registra sin perfil.
    const user = await getUser(req, supabase);
    const profileId = user ? await getProfileId(supabase, user.id) : null;

    const rows = events
      .filter((event) => ALLOWED.has(event.name))
      .slice(0, MAX_BATCH)
      .map((event) => ({
        profile_id: profileId,
        name: event.name,
        props: event.props ?? {},
        created_at: event.at ?? new Date().toISOString(),
      }));

    if (rows.length === 0) return json({ stored: 0 });

    const { error } = await supabase.from('analytics_events').insert(rows);
    if (error) {
      console.error('Analytics insert error:', error);
      return json({ stored: 0 }, 200);
    }

    return json({ stored: rows.length });
  } catch (error) {
    console.error('Analytics error:', error);
    // Nunca devolvemos error al cliente: la analítica no debe romper nada.
    return json({ stored: 0 }, 200);
  }
});
