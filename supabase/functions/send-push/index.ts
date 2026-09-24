import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import webpush from 'https://esm.sh/web-push@3.6.7';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { sendFcm, FcmNotConfiguredError, isFcmConfigured } from '../_shared/fcm.ts';
import { pushTexts } from '../_shared/push-texts.ts';

/**
 * Envía notificaciones push.
 *
 * La llaman los disparadores `push_on_message` y `push_on_connection` (migración
 * 039) al insertar en `messages` y `connections`, de modo que el aviso salga
 * aunque quien lo recibe tenga la app cerrada. Ese es justo el caso que rompía
 * el producto: un match del que te enteras al día siguiente no sirve de nada.
 * También `notify-events`, con los avisos de evento ya redactados.
 *
 * Variables: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_HOOK_SECRET
 */

interface PushRequest {
  /** Perfil destinatario. */
  profileId: string;
  kind: 'match' | 'message' | 'event' | 'admin';
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'RAFFLE_CREATED' | 'RAFFLE_DRAWN' | 'EVENT_PUBLISHED' | 'PHOTOS_PENDING' | 'SOS';
  table: 'connections' | 'messages' | 'raffles' | 'venue_events' | 'moderation_queue' | 'sos_alerts';
  record: Record<string, unknown>;
}

/** «02:30» en hora de Mallorca, que es donde están las fiestas. */
const horaLocal = (iso: string, locale: string | null): string =>
  new Date(iso).toLocaleTimeString(locale ?? 'es', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });

/** «sáb 20, 23:30» en hora de Mallorca. */
const cuandoLocal = (iso: string, locale: string | null): string =>
  new Date(iso).toLocaleString(locale ?? 'es', {
    weekday: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });

/**
 * Nueva fiesta de un local: aviso a quien le sigue (y tiene activados los avisos
 * de eventos, que `deliver` ya comprueba).
 */
const fromVenueEvent = async (
  supabase: ReturnType<typeof adminClient>,
  payload: WebhookPayload,
): Promise<PushRequest[]> => {
  const eventId = (payload.record as { id?: string }).id;
  if (!eventId) return [];

  const { data: evento } = await supabase
    .from('events')
    .select('id, name, start_date, venue_id, venues(name)')
    .eq('id', eventId)
    .maybeSingle();
  if (!evento) return [];

  const venueName = (evento.venues as { name?: string } | null)?.name ?? 'Vybes';
  const { data: seguidores } = await supabase
    .from('venue_followers')
    .select('profile_id, profiles(locale)')
    .eq('venue_id', evento.venue_id)
    .limit(5000);

  return (seguidores ?? []).map((row) => {
    const locale = (row.profiles as { locale?: string | null } | null)?.locale ?? null;
    return {
      profileId: row.profile_id as string,
      kind: 'event' as const,
      ...pushTexts(locale).newEvent(venueName, evento.name, cuandoLocal(evento.start_date, locale)),
      url: `/event/${evento.id}`,
      tag: `venue-event-${evento.id}`,
    };
  });
};

/**
 * Fotos que la revisión automática no ha podido mirar: aviso a los admins
 * («Tienes imágenes por revisar»). El disparador ya limita a uno cada 10 min.
 */
const fromPendingPhotos = async (supabase: ReturnType<typeof adminClient>): Promise<PushRequest[]> => {
  const { data: count } = await supabase.rpc('count_pending_moderation');
  const pendientes = Number(count ?? 0);
  if (pendientes === 0) return [];

  const { data: admins } = await supabase.from('profiles').select('id, locale').eq('role', 'admin').limit(50);

  return (admins ?? []).map((admin) => ({
    profileId: admin.id as string,
    kind: 'admin' as const,
    ...pushTexts(admin.locale).photosPending(pendientes),
    url: '/admin/dashboard?seccion=photos',
    tag: 'photos-pending',
  }));
};

/**
 * Alguien pide ayuda dentro de una fiesta (disparador `push_on_sos`, migración
 * 066): al propietario y al personal del local que tienen la app, y a
 * administración. Es de tipo `admin`, así que no se puede desactivar.
 *
 * La cuenta del local no tiene perfil y no recibe push: en el panel web lo ve
 * al momento por Realtime, con sonido.
 */
const fromSos = async (
  supabase: ReturnType<typeof adminClient>,
  payload: WebhookPayload,
): Promise<PushRequest[]> => {
  const alertId = (payload.record as { id?: string }).id;
  if (!alertId) return [];

  const { data: alerta } = await supabase
    .from('sos_alerts')
    .select('id, status, event_id, profile_id, profiles(name), events(name, venue_id)')
    .eq('id', alertId)
    .maybeSingle();
  if (!alerta || alerta.status !== 'active') return [];

  const persona = ((alerta.profiles as { name?: string } | null)?.name ?? '').trim() || '—';
  const evento = alerta.events as { name?: string; venue_id?: string } | null;
  const eventName = evento?.name ?? '';

  // Perfil → idioma y a qué pantalla lleva el aviso.
  const destinatarios = new Map<string, { locale: string | null; url: string }>();

  if (evento?.venue_id) {
    const { data: miembros } = await supabase
      .from('venue_members')
      .select('user_id, role')
      .eq('venue_id', evento.venue_id)
      .in('role', ['owner', 'security']);
    const userIds = (miembros ?? []).map((m) => m.user_id as string);
    if (userIds.length > 0) {
      const { data: perfiles } = await supabase.from('profiles').select('id, locale').in('user_id', userIds);
      for (const perfil of perfiles ?? []) {
        destinatarios.set(perfil.id as string, { locale: perfil.locale ?? null, url: '/venue/dashboard?seccion=door' });
      }
    }
  }

  const { data: admins } = await supabase.from('profiles').select('id, locale').eq('role', 'admin').limit(50);
  for (const admin of admins ?? []) {
    destinatarios.set(admin.id as string, { locale: admin.locale ?? null, url: '/admin/dashboard?seccion=sos' });
  }

  // Quien pide ayuda no recibe su propio aviso aunque sea del equipo.
  destinatarios.delete(alerta.profile_id as string);

  if (destinatarios.size > 0) {
    await supabase.from('sos_alerts').update({ venue_notified_at: new Date().toISOString() }).eq('id', alertId);
  }

  return [...destinatarios].map(([profileId, { locale, url }]) => ({
    profileId,
    kind: 'admin' as const,
    ...pushTexts(locale).sosHelp(persona, eventName),
    url,
    tag: `sos-${alertId}`,
  }));
};

/**
 * Avisos de un sorteo: al crearlo, a quien está dentro (para participar hay que
 * seguir dentro); al sortearlo, a quien ha ganado.
 */
const fromRaffle = async (
  supabase: ReturnType<typeof adminClient>,
  payload: WebhookPayload,
): Promise<PushRequest[]> => {
  const raffleId = (payload.record as { id?: string }).id;
  if (!raffleId) return [];

  const { data: raffle } = await supabase
    .from('event_raffles')
    .select('id, prize, draw_at, event_id, winner_profile_id, events(name)')
    .eq('id', raffleId)
    .maybeSingle();

  if (!raffle) return [];
  const eventName = (raffle.events as { name?: string } | null)?.name ?? 'Vybes';

  if (payload.type === 'RAFFLE_DRAWN') {
    if (!raffle.winner_profile_id) return [];
    const { data: winner } = await supabase
      .from('profiles')
      .select('locale, name')
      .eq('id', raffle.winner_profile_id)
      .maybeSingle();
    const winnerName = (winner?.name ?? '').trim() || 'Vybes';

    // A quien ha ganado, «¡Has ganado el sorteo!»; a todos los demás que
    // siguen dentro (vyber o invitado), quién ha sido.
    const desdeSorteo = new Date(Date.now() - 90 * 60_000).toISOString();
    const { data: dentroSorteo } = await supabase
      .from('event_attendance')
      .select('profile_id, profiles(locale)')
      .eq('event_id', raffle.event_id)
      .is('left_at', null)
      .gt('last_seen_at', desdeSorteo)
      .neq('profile_id', raffle.winner_profile_id)
      .limit(2000);

    return [
      {
        profileId: raffle.winner_profile_id,
        kind: 'event' as const,
        ...pushTexts(winner?.locale).raffleWon(eventName, raffle.prize),
        url: `/event/${raffle.event_id}/live`,
        tag: `raffle-${raffle.id}`,
      },
      ...(dentroSorteo ?? []).map((row) => {
        const locale = (row.profiles as { locale?: string | null } | null)?.locale ?? null;
        return {
          profileId: row.profile_id as string,
          kind: 'event' as const,
          ...pushTexts(locale).raffleWinner(eventName, raffle.prize, winnerName),
          url: `/event/${raffle.event_id}/live`,
          tag: `raffle-${raffle.id}`,
        };
      }),
    ];
  }

  // Quien sigue dentro: señales en la última hora y media.
  const desde = new Date(Date.now() - 90 * 60_000).toISOString();
  const { data: dentro } = await supabase
    .from('event_attendance')
    .select('profile_id, profiles(locale)')
    .eq('event_id', raffle.event_id)
    .gt('last_seen_at', desde)
    .limit(2000);

  return (dentro ?? []).map((row) => {
    const locale = (row.profiles as { locale?: string | null } | null)?.locale ?? null;
    return {
      profileId: row.profile_id as string,
      kind: 'event' as const,
      ...pushTexts(locale).raffleCreated(
        eventName,
        raffle.prize,
        raffle.draw_at ? horaLocal(raffle.draw_at, locale) : null,
      ),
      url: `/event/${raffle.event_id}/live`,
      tag: `raffle-${raffle.id}`,
    };
  });
};

const configureVapid = (): boolean => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@fiestea.es';

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
  // Los avisos de administración no se pueden apagar.
  const column =
    payload.kind === 'match'
      ? 'notify_matches'
      : payload.kind === 'event'
        ? 'notify_events'
        : payload.kind === 'admin'
          ? 'status'
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
        title: sender?.name ?? 'Vybes',
        body: (record.content ?? '').slice(0, 120),
        url: `/chat/${record.sender_id}`,
        // Mismo `tag` por conversación: el aviso nuevo sustituye al anterior
        // en vez de apilar diez avisos de la misma persona.
        tag: `chat-${record.sender_id}`,
      },
    ];
  }

  const record = payload.record as {
    user_id_1: string;
    user_id_2: string;
    connection_type?: string;
  };

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, locale')
    .in('id', [record.user_id_1, record.user_id_2]);

  const profileOf = (id: string) => profiles?.find((p) => p.id === id);

  return [record.user_id_1, record.user_id_2].map((id) => {
    const otherId = id === record.user_id_1 ? record.user_id_2 : record.user_id_1;
    const texts = pushTexts(profileOf(id)?.locale);
    const name = profileOf(otherId)?.name ?? 'Vybes';
    const { title, body } =
      record.connection_type === 'vybe_check' ? texts.vybeCheck(name) : texts.match(name);

    return {
      profileId: id,
      kind: 'match' as const,
      title,
      body,
      // Directo a la conversación: lo siguiente que hay que hacer es escribir.
      url: `/chat/${otherId}`,
      tag: `match-${otherId}`,
    };
  });
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
      'table' in body
        ? body.table === 'raffles'
          ? await fromRaffle(supabase, body)
          : body.table === 'venue_events'
            ? await fromVenueEvent(supabase, body)
            : body.table === 'moderation_queue'
              ? await fromPendingPhotos(supabase)
              : body.table === 'sos_alerts'
                ? await fromSos(supabase, body)
                : await fromWebhook(supabase, body)
        : [body as PushRequest];

    // De veinte en veinte: un sorteo avisa a toda la sala y, uno a uno, se
    // comería el tiempo de la función.
    let sent = 0;
    for (let i = 0; i < requests.length; i += 20) {
      const lote = await Promise.all(requests.slice(i, i + 20).map((request) => deliver(supabase, request)));
      sent += lote.reduce((total, n) => total + n, 0);
    }

    return json({ sent });
  } catch (error) {
    console.error('send-push error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
