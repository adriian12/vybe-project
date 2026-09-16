import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';

/**
 * Manda los avisos de evento y vacía la cola de avisos generales.
 *
 * La llama un programador cada pocos minutos. Dos cosas:
 *
 *   1. A quien dijo «voy a ir» y no ha entrado: que el local ha abierto, y más
 *      tarde que ya hay gente dentro. Es el momento en que se gana o se pierde
 *      una noche, y hasta ahora marcar la intención no servía de nada.
 *   2. Los avisos que hayan encolado administración o un local.
 *
 * Se autentica con `x-push-secret`, el mismo secreto que usa `send-push`: la
 * llama un programador, no una persona, así que no hay JWT que comprobar.
 *
 * Variables: PUSH_HOOK_SECRET, VAPID_*
 */

interface PendingPush {
  profile_id: string;
  event_id: string;
  kind: 'doors_open' | 'filling_up';
  event_name: string;
  venue_name: string;
  inside: number;
}

/** Textos de cada aviso. Se quedan aquí porque el envío no tiene interfaz. */
const compose = (push: PendingPush): { title: string; body: string } => {
  if (push.kind === 'doors_open') {
    return {
      title: `${push.event_name} ha abierto`,
      body: `${push.venue_name} ya está abierto. Dijiste que ibas: no te quedes en casa.`,
    };
  }

  return {
    title: `Ya hay ${push.inside} personas en ${push.event_name}`,
    body: '¿Te lo vas a perder? Acércate y escanea el código para entrar.',
  };
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const expected = Deno.env.get('PUSH_HOOK_SECRET');
  if (!expected || req.headers.get('x-push-secret') !== expected) {
    return json({ error: 'No autorizado' }, 401);
  }

  const supabase = adminClient();
  const origin = Deno.env.get('SUPABASE_URL') ?? '';

  /** Reenvía a `send-push`, que es quien sabe hablar con los navegadores. */
  const push = async (body: Record<string, unknown>): Promise<number> => {
    const response = await fetch(`${origin}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-push-secret': expected },
      body: JSON.stringify(body),
    });

    if (!response.ok) return 0;
    const result = (await response.json()) as { sent?: number };
    return result.sent ?? 0;
  };

  try {
    let eventPushes = 0;
    let broadcastPushes = 0;

    // ---------------------------------------------------------------- eventos
    const { data: pending, error } = await supabase.rpc('pending_event_pushes');

    if (error) {
      console.error('pending_event_pushes:', error);
    } else {
      for (const row of (pending ?? []) as PendingPush[]) {
        const { title, body } = compose(row);

        const sent = await push({
          profileId: row.profile_id,
          kind: 'event',
          title,
          body,
          url: `/event/${row.event_id}/access`,
          tag: `event-${row.event_id}-${row.kind}`,
        });

        eventPushes += sent;

        // Se marca aunque no haya llegado: si esa persona no tiene el aviso
        // activado o no tiene ningún dispositivo, insistir cada cinco minutos
        // no lo va a arreglar.
        await supabase.rpc('mark_event_push_sent', {
          p_event_id: row.event_id,
          p_profile_id: row.profile_id,
          p_kind: row.kind,
        });
      }
    }

    // ------------------------------------------------------------- generales
    const { data: broadcasts } = await supabase
      .from('broadcasts')
      .select('id, title, body, url')
      .eq('status', 'pending')
      .order('created_at')
      .limit(10);

    for (const broadcast of broadcasts ?? []) {
      const { data: recipients } = await supabase.rpc('broadcast_recipients', {
        p_broadcast_id: broadcast.id,
      });

      let sent = 0;
      for (const recipient of (recipients ?? []) as { profile_id: string }[]) {
        sent += await push({
          profileId: recipient.profile_id,
          kind: 'event',
          title: broadcast.title,
          body: broadcast.body,
          url: broadcast.url ?? '/home',
          tag: `broadcast-${broadcast.id}`,
        });
      }

      broadcastPushes += sent;
      await supabase.rpc('mark_broadcast_sent', {
        p_broadcast_id: broadcast.id,
        p_recipients: sent,
      });
    }

    return json({ eventPushes, broadcastPushes });
  } catch (error) {
    console.error('notify-events error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
