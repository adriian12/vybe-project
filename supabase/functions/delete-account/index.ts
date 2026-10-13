import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, getProfileId } from '../_shared/supabase.ts';
import { stripeSecretKey } from '../_shared/stripe-env.ts';
import { cancelGoogleSubscription } from '../_shared/google-play.ts';

/**
 * Borrado duro de la cuenta (art. 17 RGPD).
 *
 * `request_account_deletion()` oculta el perfil de inmediato; aquí se completa
 * lo que necesita service role: los ficheros de Storage y el usuario de auth.
 * Al eliminar auth.users, las tablas con ON DELETE CASCADE se limpian solas.
 */

// Los de una persona, que van todos en `<uid>/`. `venue-logos` NO entra: va
// por carpeta del negocio (`<venue_id>/`) y el logo es del local, que puede
// tener más gente, no de la cuenta que se borra.
const BUCKETS = ['avatars', 'event-photos', 'documents'] as const;

const PAGINA = 100;

/** Un borrado que no se completa no puede darse por bueno. */
class PurgeError extends Error {}

/**
 * Borra TODO lo que hay bajo `<uid>/` en un bucket, paginando hasta agotarlo.
 * Antes pedía una sola página de 1000 objetos y se tragaba cualquier fallo
 * devolviendo 0: quien tuviera más de 1000 ficheros conservaba el resto en un
 * bucket público, sin ninguna fila que permitiera encontrarlo, y la respuesta
 * decía que el borrado había ido bien.
 */
const purgeBucket = async (
  supabase: ReturnType<typeof adminClient>,
  bucket: string,
  userId: string,
): Promise<number> => {
  let borrados = 0;

  for (;;) {
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(userId, { limit: PAGINA, offset: 0 });
    if (error) throw new PurgeError(`listando ${bucket}: ${error.message}`);
    if (!files || files.length === 0) return borrados;

    const paths = files.map((file) => `${userId}/${file.name}`);
    const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
    if (removeError) throw new PurgeError(`borrando ${bucket}: ${removeError.message}`);

    borrados += paths.length;
    // Se vuelve a pedir desde el principio porque lo anterior ya no está; si
    // la página no se llenó, no queda nada más.
    if (files.length < PAGINA) return borrados;
  }
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);
    if (await overLimit(supabase, req, 'delete-account', 5, { userId: user.id })) return tooManyRequests();

    const profileId = await getProfileId(supabase, user.id);

    // Premium mensual: ninguna suscripción puede seguir cobrando cuando la
    // cuenta ya no existe. Stripe y Google Play se cancelan desde aquí; Apple no
    // deja cancelar desde el servidor, así que se le pide a la persona antes.
    if (profileId) {
      let body: { appleConfirmed?: boolean } = {};
      try {
        body = await req.json();
      } catch {
        // Sin cuerpo.
      }
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
      if (!body.appleConfirmed && (subs ?? []).some((s) => s.apple_original_transaction_id && renueva(s))) {
        return json({ error: 'APPLE_SUBSCRIPTION_ACTIVE' }, 409);
      }

      // Google Play: se cancela la renovación con la Play Developer API.
      for (const sub of subs ?? []) {
        if (!sub.google_purchase_token || !renueva(sub)) continue;
        try {
          await cancelGoogleSubscription(sub.google_purchase_token);
        } catch (error) {
          console.error('Google Play cancel on delete:', error);
          return json({ error: 'CANCEL_FAILED' }, 502);
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
          return json({ error: 'CANCEL_FAILED' }, 502);
        }
      }
    }

    // Los mensajes no se borran en cascada al desaparecer la conexión, así que
    // los eliminamos explícitamente antes de tocar el perfil.
    if (profileId) {
      await supabase
        .from('messages')
        .delete()
        .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`);

      await supabase
        .from('connections')
        .delete()
        .or(`user_id_1.eq.${profileId},user_id_2.eq.${profileId}`);

      // Estas dos se quedarían anónimas (ON DELETE SET NULL); «todos mis
      // datos» es todos, así que también se van.
      await supabase.from('analytics_events').delete().eq('profile_id', profileId);
      await supabase.from('booking_clicks').delete().eq('profile_id', profileId);
    }

    // Si los ficheros no se pueden borrar, NO se borra la cuenta: con el
    // usuario de auth fuera ya no habría forma de encontrarlos ni de
    // reintentarlo, y el RGPD no se cumple a medias.
    let deletedFiles = 0;
    try {
      for (const bucket of BUCKETS) {
        deletedFiles += await purgeBucket(supabase, bucket, user.id);
      }
    } catch (purgeError) {
      console.error('Account deletion purge:', purgeError);
      return json({ error: 'PURGE_FAILED' }, 500);
    }

    // Elimina al usuario de auth: el resto cae por ON DELETE CASCADE.
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error('Error deleting auth user:', error);
      return json({ error: 'DELETE_FAILED' }, 500);
    }

    return json({ deleted: true, files: deletedFiles });
  } catch (error) {
    console.error('Account deletion error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
