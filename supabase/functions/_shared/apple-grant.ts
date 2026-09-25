import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { APPLE_BUNDLE_IDS, AppleTransaction, productKind } from './apple-jws.ts';

/**
 * Activa lo comprado en una transacción de Apple ya verificada, con las mismas
 * tablas que los pagos de Stripe:
 *
 *   · Premium mensual → `premium_subscriptions` (hasta `expiresDate`).
 *   · Premium de una fiesta → `premium_subscriptions` con su evento, hasta una
 *     hora después del final.
 *   · Supercrush → `credit_supercrush_purchase`, una vez por transacción.
 *
 * `apple_transactions` guarda cada transacción una vez: repetirla no suma nada.
 */

export type GrantResult =
  | { ok: true; kind: 'monthly' | 'event' | 'supercrush'; duplicate: boolean }
  | { ok: false; error: string };

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

export const grantAppleTransaction = async (
  supabase: SupabaseClient,
  tx: AppleTransaction,
  opts: { profileId: string | null; eventId?: string | null },
): Promise<GrantResult> => {
  if (!APPLE_BUNDLE_IDS.includes(tx.bundleId)) return { ok: false, error: 'WRONG_APP' };
  const kind = productKind(tx.bundleId, tx.productId);
  if (!kind) return { ok: false, error: 'UNKNOWN_PRODUCT' };

  // La compra va atada a la cuenta con `appAccountToken` (el id del perfil).
  const profileId = tx.appAccountToken ?? opts.profileId;
  if (!profileId || (opts.profileId && tx.appAccountToken && tx.appAccountToken !== opts.profileId)) {
    return { ok: false, error: 'WRONG_ACCOUNT' };
  }
  if (tx.revocationDate) return { ok: false, error: 'REVOKED' };

  // Fiesta: la que dice la app al comprar o, si se reenvía más tarde, la que
  // quedó guardada o en la que está ahora.
  let eventId = opts.eventId ?? null;
  const { data: previa } = await supabase
    .from('apple_transactions')
    .select('transaction_id, event_id')
    .eq('transaction_id', tx.transactionId)
    .maybeSingle();
  if (kind === 'event' && !eventId) {
    eventId = previa?.event_id ?? null;
    if (!eventId) {
      const { data: activo } = await supabase.rpc('active_event_of', { p_profile_id: profileId });
      eventId = (activo as string | null) ?? null;
    }
    if (!eventId) return { ok: false, error: 'EVENT_REQUIRED' };
  }

  if (!previa) {
    const { error } = await supabase.from('apple_transactions').insert({
      transaction_id: tx.transactionId,
      original_transaction_id: tx.originalTransactionId,
      profile_id: profileId,
      product_id: tx.productId,
      event_id: kind === 'event' ? eventId : null,
      quantity: Math.max(1, tx.quantity ?? 1),
      price_cents: typeof tx.price === 'number' ? Math.round(tx.price / 10) : null,
      currency: tx.currency ?? null,
      environment: tx.environment,
      purchase_date: iso(tx.purchaseDate),
      expires_date: iso(tx.expiresDate),
    });
    // Otra petición la ha insertado a la vez: ya está apuntada.
    if (error && error.code !== '23505') throw error;
    if (error) return { ok: true, kind, duplicate: true };
  }

  if (kind === 'supercrush') {
    const { error } = await supabase.rpc('credit_supercrush_purchase', {
      p_profile_id: profileId,
      p_quantity: Math.max(1, tx.quantity ?? 1),
      p_session_id: `apple:${tx.transactionId}`,
      p_amount_cents: typeof tx.price === 'number' ? Math.round(tx.price / 10) : 0,
    });
    if (error) throw error;
    return { ok: true, kind, duplicate: Boolean(previa) };
  }

  if (kind === 'monthly') {
    if (!tx.expiresDate || tx.expiresDate <= Date.now()) return { ok: false, error: 'EXPIRED' };
    const { error } = await supabase.from('premium_subscriptions').upsert(
      {
        user_id: profileId,
        subscription_type: 'monthly',
        event_id: null,
        status: 'active',
        started_at: iso(tx.purchaseDate),
        expires_at: iso(tx.expiresDate),
        cancel_at_period_end: false,
        apple_original_transaction_id: tx.originalTransactionId,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      { onConflict: 'user_id,event_id,subscription_type' },
    );
    if (error) throw error;
    return { ok: true, kind, duplicate: Boolean(previa) };
  }

  // Premium de una fiesta: hasta una hora después de su final.
  const { data: evento } = await supabase.from('events').select('end_date').eq('id', eventId).maybeSingle();
  if (!evento) return { ok: false, error: 'EVENT_NOT_FOUND' };
  const { error } = await supabase.from('premium_subscriptions').upsert(
    {
      user_id: profileId,
      subscription_type: 'event',
      event_id: eventId,
      status: 'active',
      started_at: iso(tx.purchaseDate),
      expires_at: new Date(new Date(evento.end_date).getTime() + 3_600_000).toISOString(),
      cancel_at_period_end: false,
      apple_original_transaction_id: tx.originalTransactionId,
    },
    { onConflict: 'user_id,event_id,subscription_type' },
  );
  if (error) throw error;
  return { ok: true, kind, duplicate: Boolean(previa) };
};
