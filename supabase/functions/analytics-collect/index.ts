import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

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
  'venue_event_updated',
  'supercrush_bought',
  'tickets_checkout',
  'event_rated',
  'page_view',
  // Migración 152: salir de la app, «Ver fiestas sin cuenta» y el aviso de crear cuenta.
  'app_background',
  'explore_started',
  'account_prompt',
  'account_prompt_cta',
]);

const PLATFORMS = new Set(['ios', 'android', 'web']);
const SOURCES = new Set(['store', 'test', 'testflight', 'sideload']);
const corto = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

type Supa = ReturnType<typeof adminClient>;

/**
 * Quién manda el lote (migración 152): fiester@, invitado, alta sin terminar,
 * sin cuenta (sesión anónima), negocio, admin o visitante sin sesión.
 */
const quienEs = async (
  req: Request,
  supabase: Supa,
): Promise<{ userId: string | null; profileId: string | null; segment: string }> => {
  const header = req.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { userId: null, profileId: null, segment: 'visitor' };
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return { userId: null, profileId: null, segment: 'visitor' };
  if (user.is_anonymous) return { userId: user.id, profileId: null, segment: 'explorer' };

  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, role, account_type, profile_completed_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (perfil) {
    const segment =
      perfil.role === 'admin'
        ? 'admin'
        : perfil.account_type === 'guest'
          ? 'guest'
          : perfil.profile_completed_at
            ? 'fiester'
            : 'incomplete';
    return { userId: user.id, profileId: perfil.id, segment };
  }

  const [{ data: local }, { data: equipo }] = await Promise.all([
    supabase.from('venues').select('venue_id').eq('venue_id', user.id).limit(1).maybeSingle(),
    supabase.from('venue_members').select('user_id').eq('user_id', user.id).limit(1).maybeSingle(),
  ]);
  return { userId: user.id, profileId: null, segment: local || equipo ? 'venue' : 'visitor' };
};

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
  // La analítica se manda en lotes: 60 lotes por minuto e IP es de sobra.
  if (await overLimit(supabase, req, 'analytics-collect', 60)) return tooManyRequests();

  try {
    const { events } = (await req.json()) as { events?: IncomingEvent[] };
    if (!Array.isArray(events) || events.length === 0) return json({ stored: 0 });

    // La analítica es opcional: si no hay sesión, se registra sin perfil.
    const { userId, profileId, segment } = await quienEs(req, supabase);

    const rows = events
      .filter((event) => ALLOWED.has(event.name))
      .slice(0, MAX_BATCH)
      .map((event) => {
        // El contexto de la sesión va en columnas propias, no en `props`.
        const { sid, plat, v, src, ...props } = event.props ?? {};
        const platform = corto(plat, 10);
        const source = corto(src, 12);
        return {
          profile_id: profileId,
          user_id: userId,
          segment,
          session_id: corto(sid, 64),
          platform: platform && PLATFORMS.has(platform) ? platform : null,
          app_version: corto(v, 32),
          install_source: source && SOURCES.has(source) ? source : null,
          name: event.name,
          props,
          created_at: event.at ?? new Date().toISOString(),
        };
      });

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
