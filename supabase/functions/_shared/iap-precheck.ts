import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

/**
 * Antes de abrir la hoja de pago de Apple o de Google: las mismas reglas que
 * `stripe-checkout` (no pagar dos veces Premium y, el de una fiesta, sólo
 * estando dentro y sin que haya terminado). Así nadie paga algo que luego no
 * se le puede dar. Devuelve `null` si se puede comprar o el código de error.
 */
/**
 * La fiesta que manda el cliente al canjear tiene que ser una en la que está y
 * que no ha terminado. `apple-iap` y `google-play-iap` sólo llamaban a
 * `storePrecheck` antes de pagar, así que `verify` aceptaba cualquier
 * `eventId` y se podía pagar una fiesta y activar el Premium en otra.
 */
export const eventPurchaseAllowed = async (
  supabase: SupabaseClient,
  profileId: string,
  eventId: string,
): Promise<boolean> => {
  const { data } = await supabase
    .from('event_attendance')
    .select('event_id, events!inner(end_date)')
    .eq('profile_id', profileId)
    .eq('event_id', eventId)
    .is('left_at', null)
    .maybeSingle();
  const fin = (data?.events as { end_date: string } | null)?.end_date;
  return Boolean(data && fin && new Date(fin).getTime() > Date.now());
};

export const storePrecheck = async (
  supabase: SupabaseClient,
  profileId: string,
  plan: string | undefined,
  eventId: string | null | undefined,
): Promise<{ error: string; status: number } | null> => {
  if (plan === 'supercrush') return null;

  const { data: mensual } = await supabase
    .from('premium_subscriptions')
    .select('id')
    .eq('user_id', profileId)
    .eq('status', 'active')
    .is('event_id', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1)
    .maybeSingle();
  if (mensual) return { error: 'ALREADY_PREMIUM', status: 409 };
  if (plan === 'monthly') return null;

  if (plan !== 'event') return { error: 'INVALID_PLAN', status: 400 };
  if (!eventId) return { error: 'EVENT_REQUIRED', status: 400 };

  const { data: dentro } = await supabase
    .from('event_attendance')
    .select('event_id, events!inner(end_date)')
    .eq('profile_id', profileId)
    .eq('event_id', eventId)
    .is('left_at', null)
    .maybeSingle();
  const fin = (dentro?.events as { end_date: string } | null)?.end_date;
  if (!dentro || !fin || new Date(fin).getTime() <= Date.now()) return { error: 'NOT_AT_EVENT', status: 403 };

  const { data: yaPagado } = await supabase
    .from('premium_subscriptions')
    .select('id')
    .eq('user_id', profileId)
    .eq('event_id', eventId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (yaPagado) return { error: 'ALREADY_PREMIUM', status: 409 };
  return null;
};
