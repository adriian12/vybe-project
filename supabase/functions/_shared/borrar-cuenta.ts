import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { stripeSecretKey } from './stripe-env.ts';
import { cancelGoogleSubscription } from './google-play.ts';

/**
 * Borrado duro de una cuenta (art. 17 RGPD), compartido por `delete-account`
 * (la persona borra la suya) y `admin-delete` (administración borra una).
 *
 * Cancela el Premium que se siga renovando, borra mensajes, conexiones,
 * analítica, clics y los ficheros de la persona, y al final el usuario de
 * auth: el resto cae por ON DELETE CASCADE (también sus locales).
 */

// Los de una persona, que van todos en `<uid>/`. `venue-logos` NO entra: va
// por carpeta del negocio (`<venue_id>/`); lo borra `admin-delete` al borrar
// el local.
export const BUCKETS_PERSONA = ['avatars', 'event-photos', 'documents'] as const;

const PAGINA = 100;

/** Un borrado que no se completa no puede darse por bueno. */
export class PurgeError extends Error {}

/**
 * Borra TODO lo que hay bajo `<carpeta>/` en un bucket, paginando hasta
 * agotarlo. Un fallo corta el borrado: con la fila ya borrada no quedaría
 * forma de encontrar los ficheros.
 */
export const purgeBucket = async (supabase: SupabaseClient, bucket: string, carpeta: string): Promise<number> => {
  let borrados = 0;

  for (;;) {
    const { data: files, error } = await supabase.storage.from(bucket).list(carpeta, { limit: PAGINA, offset: 0 });
    if (error) throw new PurgeError(`listando ${bucket}: ${error.message}`);
    if (!files || files.length === 0) return borrados;

    const paths = files.map((file) => `${carpeta}/${file.name}`);
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
    if (removeError) throw new PurgeError(`borrando ${bucket}: ${removeError.message}`);

    borrados += paths.length;
    // Se vuelve a pedir desde el principio porque lo anterior ya no está; si
    // la página no se llenó, no queda nada más.
    if (files.length < PAGINA) return borrados;
  }
};

export type ResultadoBorrado = { ok: true; files: number } | { ok: false; error: string; status: number };

export const borrarCuenta = async (
  supabase: SupabaseClient,
  userId: string,
  opciones: { appleConfirmed?: boolean; bucketsExtra?: string[] } = {},
): Promise<ResultadoBorrado> => {
  const { data: perfil } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle();
  const profileId: string | null = perfil?.id ?? null;

  // Premium mensual: ninguna suscripción puede seguir cobrando cuando la
  // cuenta ya no existe. Stripe y Google Play se cancelan desde aquí; Apple no
  // deja cancelar desde el servidor, así que se le pide a la persona antes.
  if (profileId) {
    const { data: subs } = await supabase
      .from('premium_subscriptions')
      .select('subscription_type, expires_at, cancel_at_period_end, stripe_subscription_id, google_purchase_token, apple_original_transaction_id')
      .eq('user_id', profileId);
    const renueva = (s: { subscription_type: string; expires_at: string | null; cancel_at_period_end: boolean | null }) =>
      s.subscription_type === 'monthly' &&
      !s.cancel_at_period_end &&
      (!s.expires_at || new Date(s.expires_at).getTime() > Date.now());

    // Apple: sólo la persona puede cancelarla (Ajustes del iPhone). Mientras
    // siga renovándose no se borra nada, salvo que diga que ya la canceló
    // (el aviso de Apple puede tardar unos minutos en llegar).
    if (!opciones.appleConfirmed && (subs ?? []).some((s) => s.apple_original_transaction_id && renueva(s))) {
      return { ok: false, error: 'APPLE_SUBSCRIPTION_ACTIVE', status: 409 };
    }

    // Google Play: se cancela la renovación con la Play Developer API.
    for (const sub of subs ?? []) {
      if (!sub.google_purchase_token || !renueva(sub)) continue;
      try {
        await cancelGoogleSubscription(sub.google_purchase_token);
      } catch (error) {
        console.error('Google Play cancel on delete:', error);
        return { ok: false, error: 'CANCEL_FAILED', status: 502 };
      }
    }

    // Stripe (web): se cancela al momento.
    const secretKey = stripeSecretKey();
    for (const sub of subs ?? []) {
      if (!secretKey || !sub.stripe_subscription_id) continue;
      const r = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      // Ya cancelada o inexistente (404) no impide borrar la cuenta.
      if (!r.ok && r.status !== 404) {
        console.error('Stripe cancel on delete:', r.status, await r.text());
        return { ok: false, error: 'CANCEL_FAILED', status: 502 };
      }
    }

    // Los mensajes no se borran en cascada al desaparecer la conexión, así que
    // los eliminamos explícitamente antes de tocar el perfil.
    await supabase.from('messages').delete().or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`);
    await supabase.from('connections').delete().or(`user_id_1.eq.${profileId},user_id_2.eq.${profileId}`);

    // Estas dos se quedarían anónimas (ON DELETE SET NULL); «todos mis
    // datos» es todos, así que también se van.
    await supabase.from('analytics_events').delete().eq('profile_id', profileId);
    await supabase.from('booking_clicks').delete().eq('profile_id', profileId);
  }

  // Si los ficheros no se pueden borrar, NO se borra la cuenta: con el
  // usuario de auth fuera ya no habría forma de encontrarlos ni de
  // reintentarlo, y el RGPD no se cumple a medias.
  let files = 0;
  try {
    for (const bucket of [...BUCKETS_PERSONA, ...(opciones.bucketsExtra ?? [])]) {
      files += await purgeBucket(supabase, bucket, userId);
    }
  } catch (purgeError) {
    console.error('Account deletion purge:', purgeError);
    return { ok: false, error: 'PURGE_FAILED', status: 500 };
  }

  // Elimina al usuario de auth: el resto cae por ON DELETE CASCADE.
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('Error deleting auth user:', error);
    return { ok: false, error: 'DELETE_FAILED', status: 500 };
  }

  return { ok: true, files };
};
