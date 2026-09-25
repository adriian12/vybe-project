import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, getProfileId } from '../_shared/supabase.ts';

/**
 * Borrado duro de la cuenta (art. 17 RGPD).
 *
 * `request_account_deletion()` oculta el perfil de inmediato; aquí se completa
 * lo que necesita service role: los ficheros de Storage y el usuario de auth.
 * Al eliminar auth.users, las tablas con ON DELETE CASCADE se limpian solas.
 */

const BUCKETS = ['avatars', 'event-photos', 'documents'] as const;

/** Borra recursivamente todo lo que hay bajo `<uid>/` en un bucket. */
const purgeBucket = async (
  supabase: ReturnType<typeof adminClient>,
  bucket: string,
  userId: string,
): Promise<number> => {
  const { data: files, error } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });

  if (error || !files || files.length === 0) return 0;

  const paths = files.map((file) => `${userId}/${file.name}`);
  const { error: removeError } = await supabase.storage.from(bucket).remove(paths);

  if (removeError) {
    console.error(`Error borrando ${bucket}:`, removeError);
    return 0;
  }

  return paths.length;
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);

    const profileId = await getProfileId(supabase, user.id);

    // Premium mensual: se cancela ya en Stripe. Si no, al desaparecer la
    // cuenta Stripe seguiría cobrando cada mes a alguien que ya no existe.
    if (profileId) {
      const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
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

    let deletedFiles = 0;
    for (const bucket of BUCKETS) {
      deletedFiles += await purgeBucket(supabase, bucket, user.id);
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
