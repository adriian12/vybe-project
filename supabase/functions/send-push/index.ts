import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import webpush from 'https://esm.sh/web-push@3.6.7';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendFcm, FcmNotConfiguredError, isFcmConfigured } from '../_shared/fcm.ts';

/**
 * Envía notificaciones push.
 *
 * Pensada para llamarse desde un Database Webhook de Supabase sobre INSERT en
 * `connections` y `messages`, de modo que el aviso salga aunque quien lo recibe
 * tenga la app cerrada. Ese es justo el caso que rompía el producto: un match
 * del que te enteras al día siguiente no sirve de nada.
 *
 * Variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_HOOK_SECRET
 */

interface PushRequest {
  /** Perfil destinatario. */
  profileId: string;
  kind: 'match' | 'message' | 'event';
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface WebhookPayload {
  type: 'INSERT';
  table: 'connections' | 'messages';
  record: Record<string, unknown>;
}

const configureVapid = (): boolean => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@vybe.app';

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
};

const deliver = async (
  supabase: ReturnType<typeof adminClient>,
  payload: PushRequest,
): Promise<number> => {
  // Respeta las preferencias del usuario. Cada tipo de aviso se puede apagar
  // por separado: quien no quiere que le insistan con los eventos puede seguir
  // queriendo saber que tiene un match.
  const column =
    payload.kind === 'match'
      ? 'notify_matches'
      : payload.kind === 'event'
        ? 'notify_events'
        : 'notify_messages';
  const { data: profile } = await supabase
    .from('profiles')
    .select(`${column}, status`)
    .eq('id', payload.profileId)
    .maybeSingle();

  const record = profile as Record<string, unknown> | null;
  if (!record || record.status !== 'active' || record[column] === false) return 0;

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, platform, native_token')
    .eq('profile_id', payload.profileId);

  if (!subscriptions || subscriptions.length === 0) return 0;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/matches',
    tag: payload.tag,
  });

  let sent = 0;
  const expired: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      // Un teléfono con la aplicación instalada sólo acepta avisos que vengan
      // de Firebase; un navegador, sólo Web Push. Quien usa las dos cosas
      // tiene una fila de cada y recibe el aviso en ambas.
      if (subscription.platform !== 'web') {
        if (!subscription.native_token) return;

        try {
          const result = await sendFcm(subscription.native_token, {
            title: payload.title,
            body: payload.body,
            url: payload.url ?? '/matches',
            tag: payload.tag,
          });

          if (result.ok) sent += 1;
          else if (result.expired) expired.push(subscription.id);
        } catch (error) {
          // Sin credenciales de Firebase no se puede escribir a los teléfonos,
          // pero los navegadores deben seguir recibiendo lo suyo.
          if (!(error instanceof FcmNotConfiguredError)) {
            console.error('Error enviando por Firebase:', error);
          }
        }
        return;
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          message,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: el navegador ya no acepta esa suscripción.
        if (status === 404 || status === 410) expired.push(subscription.id);
        else console.error('Push error:', error);
      }
    }),
  );

  if (expired.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expired);
  }

  return sent;
};

/** Traduce un webhook de base de datos en una notificación. */
const fromWebhook = async (
  supabase: ReturnType<typeof adminClient>,
  payload: WebhookPayload,
): Promise<PushRequest[]> => {
  if (payload.table === 'messages') {
    const record = payload.record as { sender_id: string; receiver_id: string; content: string };

    const { data: sender } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', record.sender_id)
      .maybeSingle();

    return [
      {
        profileId: record.receiver_id,
        kind: 'message',
        title: sender?.name ?? 'Vybe',
        body: record.content.slice(0, 120),
        url: `/chat/${record.sender_id}`,
        tag: `chat-${record.sender_id}`,
      },
    ];
  }

  const record = payload.record as { user_id_1: string; user_id_2: string };

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', [record.user_id_1, record.user_id_2]);

  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.name ?? 'Vybe';

  return [record.user_id_1, record.user_id_2].map((id) => ({
    profileId: id,
    kind: 'match' as const,
    title: '¡Nueva conexión!',
    body: `Has conectado con ${nameOf(id === record.user_id_1 ? record.user_id_2 : record.user_id_1)}`,
    url: '/matches',
    tag: 'match',
  }));
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  // Basta con uno de los dos canales: puede haber sólo aplicación, sólo web, o
  // las dos cosas.
  const vapidReady = configureVapid();
  if (!vapidReady && !isFcmConfigured()) {
    return json({ error: 'PUSH_NOT_CONFIGURED' }, 200);
  }

  // El hook de base de datos se autentica con un secreto compartido.
  const expected = Deno.env.get('PUSH_HOOK_SECRET');
  if (expected && req.headers.get('x-push-secret') !== expected) {
    return json({ error: 'No autorizado' }, 401);
  }

  const supabase = adminClient();

  try {
    const body = (await req.json()) as WebhookPayload | PushRequest;

    const requests =
      'table' in body ? await fromWebhook(supabase, body) : [body as PushRequest];

    let sent = 0;
    for (const request of requests) {
      sent += await deliver(supabase, request);
    }

    return json({ sent });
  } catch (error) {
    console.error('send-push error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
