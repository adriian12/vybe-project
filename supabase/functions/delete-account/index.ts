import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, getProfileId } from '../_shared/supabase.ts';
import { stripeSecretKey } from '../_shared/stripe-env.ts';

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

    // Premium mensual: se cancela ya en Stripe. Si no, al desaparecer la
    // cuenta Stripe seguiría cobrando cada mes a alguien que ya no existe.
    if (profileId) {
      const secretKey = stripeSecretKey();
      const { data: subs } = await supabase
        .from('premium_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', profileId)
        .not('stripe_subscription_id', 'is', null);
      for (const sub of subs ?? []) {
        if (!secretKey) break;
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
