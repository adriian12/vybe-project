import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { googleAccessToken } from './google-auth.ts';
import { eventPurchaseAllowed } from './iap-precheck.ts';

/**
 * Compras de Google Play (migración 090): comprobar una compra con la Google
 * Play Developer API y activar lo comprado con las mismas tablas que Stripe y
 * Apple.
 *
 *   · Premium mensual (suscripción `es.fiestea.app.premium.monthly`, plan
 *     base `monthly`) → `premium_subscriptions` hasta `expiryTime`.
 *   · Premium de una fiesta (`es.fiestea.app.premium.event`) → su evento,
 *     hasta una hora después del final.
 *   · Supercrush (`es.fiestea.app.supercrush`) → `credit_supercrush_purchase`,
 *     una vez por compra.
 *
 * La cuenta de servicio necesita permiso en Play Console (Usuarios y permisos:
 * «Ver información financiera» y «Gestionar pedidos y suscripciones»).
 */

export const GOOGLE_PACKAGE = Deno.env.get('GOOGLE_PLAY_PACKAGE') ?? 'es.fiestea.app';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE}/purchases`;
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export type GoogleKind = 'monthly' | 'event' | 'supercrush';

/** Igual que en Apple: las compras de prueba no activan Premium de verdad. */
const ALLOW_TEST = (Deno.env.get('GOOGLE_ALLOW_TEST') ?? '').toLowerCase() === 'true';

export const googleProductKind = (productId: string): GoogleKind | null => {
  if (productId === `${GOOGLE_PACKAGE}.premium.monthly`) return 'monthly';
  if (productId === `${GOOGLE_PACKAGE}.premium.event`) return 'event';
  if (productId === `${GOOGLE_PACKAGE}.supercrush`) return 'supercrush';
  return null;
};

export class GooglePlayError extends Error {}

const pedir = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  const token = await googleAccessToken(SCOPE);
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!r.ok) throw new GooglePlayError(`Google Play ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : {}) as T;
};

interface SubscriptionV2 {
  subscriptionState?: string;
  startTime?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: { productId: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
}

interface ProductPurchase {
  purchaseTimeMillis?: string;
  purchaseState?: number; // 0 comprada, 1 cancelada, 2 pendiente
  orderId?: string;
  purchaseType?: number; // 0 prueba
  quantity?: number;
  obfuscatedExternalAccountId?: string;
}

/** Lo que interesa de una compra, sea suscripción o producto suelto. */
export interface GooglePurchase {
  kind: GoogleKind;
  productId: string;
  purchaseToken: string;
  orderId: string | null;
  accountId: string | null;
  quantity: number;
  test: boolean;
  purchaseTime: string | null;
  expiresAt: string | null;
  /** Suscripción: sigue dando Premium (activa, cancelada pero pagada o en gracia). */
  valid: boolean;
  autoRenew: boolean;
}

export const fetchGooglePurchase = async (productId: string, purchaseToken: string): Promise<GooglePurchase> => {
  const kind = googleProductKind(productId);
  if (!kind) throw new GooglePlayError('UNKNOWN_PRODUCT');
  const token = encodeURIComponent(purchaseToken);

  if (kind === 'monthly') {
    const s = await pedir<SubscriptionV2>(`${API}/subscriptionsv2/tokens/${token}`);
    const linea = s.lineItems?.find((l) => l.productId === productId) ?? s.lineItems?.[0];
    const expira = linea?.expiryTime ?? null;
    const estado = s.subscriptionState ?? '';
    const vigente =
      ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(estado) &&
      Boolean(expira && new Date(expira).getTime() > Date.now());
    return {
      kind,
      productId,
      purchaseToken,
      orderId: s.latestOrderId ?? null,
      accountId: s.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
      quantity: 1,
      test: Boolean(s.testPurchase),
      purchaseTime: s.startTime ?? null,
      expiresAt: expira,
      valid: vigente,
      autoRenew: estado === 'SUBSCRIPTION_STATE_ACTIVE' && linea?.autoRenewingPlan?.autoRenewEnabled !== false,
    };
  }

  const p = await pedir<ProductPurchase>(`${API}/products/${encodeURIComponent(productId)}/tokens/${token}`);
  return {
    kind,
    productId,
    purchaseToken,
    orderId: p.orderId ?? null,
    accountId: p.obfuscatedExternalAccountId ?? null,
    quantity: Math.max(1, p.quantity ?? 1),
    test: p.purchaseType === 0,
    purchaseTime: p.purchaseTimeMillis ? new Date(Number(p.purchaseTimeMillis)).toISOString() : null,
    expiresAt: null,
    valid: p.purchaseState === 0,
    autoRenew: false,
  };
};

/** Confirma la suscripción en Google (si no, Google la devuelve a los 3 días). */
export const acknowledgeGoogleSubscription = async (productId: string, purchaseToken: string) => {
  try {
    await pedir(
      `${API}/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
  } catch (error) {
    // Ya confirmada por la app: Google responde error y no pasa nada.
    console.log('acknowledge:', error instanceof Error ? error.message : error);
  }
};

export type GoogleGrantResult =
  | { ok: true; kind: GoogleKind; duplicate: boolean }
  | { ok: false; error: string };

/** Activa lo comprado. Repetir la misma compra no suma nada. */
export const grantGooglePurchase = async (
  supabase: SupabaseClient,
  compra: GooglePurchase,
  opts: { profileId: string | null; eventId?: string | null },
): Promise<GoogleGrantResult> => {
  // La compra va atada a la cuenta (`obfuscatedExternalAccountId` = id del perfil).
  const profileId = compra.accountId ?? opts.profileId;
  if (!profileId || (opts.profileId && compra.accountId && compra.accountId !== opts.profileId)) {
    return { ok: false, error: 'WRONG_ACCOUNT' };
  }
  if (!compra.valid) return { ok: false, error: compra.kind === 'monthly' ? 'EXPIRED' : 'NOT_PURCHASED' };
  if (!ALLOW_TEST && compra.test) return { ok: false, error: 'TEST_PURCHASE' };

  const { data: previa } = await supabase
    .from('google_purchases')
    .select('purchase_token, event_id, voided_at')
    .eq('purchase_token', compra.purchaseToken)
    .maybeSingle();
  if (previa?.voided_at) return { ok: false, error: 'REVOKED' };

  let eventId = opts.eventId ?? null;
  if (compra.kind === 'event') {
    if (eventId && eventId !== previa?.event_id) {
      if (!(await eventPurchaseAllowed(supabase, profileId, eventId))) {
        return { ok: false, error: 'NOT_AT_EVENT' };
      }
    }
    if (!eventId) {
      eventId = previa?.event_id ?? null;
      if (!eventId) {
        const { data: activo } = await supabase.rpc('active_event_of', { p_profile_id: profileId });
        eventId = (activo as string | null) ?? null;
      }
      if (!eventId) return { ok: false, error: 'EVENT_REQUIRED' };
    }
  }

  if (!previa) {
    const { error } = await supabase.from('google_purchases').insert({
      purchase_token: compra.purchaseToken,
      order_id: compra.orderId,
      profile_id: profileId,
      product_id: compra.productId,
      kind: compra.kind,
      event_id: compra.kind === 'event' ? eventId : null,
      quantity: compra.quantity,
      test_purchase: compra.test,
      purchase_time: compra.purchaseTime,
      expires_at: compra.expiresAt,
    });
    if (error && error.code !== '23505') throw error;
    if (error && compra.kind !== 'monthly') return { ok: true, kind: compra.kind, duplicate: true };
  } else if (compra.kind === 'monthly') {
    await supabase
      .from('google_purchases')
      .update({ expires_at: compra.expiresAt, order_id: compra.orderId, updated_at: new Date().toISOString() })
      .eq('purchase_token', compra.purchaseToken);
  }

  if (compra.kind === 'supercrush') {
    if (previa) return { ok: true, kind: 'supercrush', duplicate: true };
    const { error } = await supabase.rpc('credit_supercrush_purchase', {
      p_profile_id: profileId,
      p_quantity: compra.quantity,
      p_session_id: `google:${compra.purchaseToken.slice(0, 180)}`,
      p_amount_cents: 0,
    });
    if (error) throw error;
    return { ok: true, kind: 'supercrush', duplicate: false };
  }

  if (compra.kind === 'monthly') {
    const { error } = await supabase.from('premium_subscriptions').upsert(
      {
        user_id: profileId,
        subscription_type: 'monthly',
        event_id: null,
        status: 'active',
        started_at: compra.purchaseTime,
        expires_at: compra.expiresAt,
        cancel_at_period_end: !compra.autoRenew,
        google_purchase_token: compra.purchaseToken,
        apple_original_transaction_id: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      { onConflict: 'user_id,event_id,subscription_type' },
    );
    if (error) throw error;
    return { ok: true, kind: 'monthly', duplicate: Boolean(previa) };
  }

  const { data: evento } = await supabase.from('events').select('end_date').eq('id', eventId).maybeSingle();
  if (!evento) return { ok: false, error: 'EVENT_NOT_FOUND' };
  const { error } = await supabase.from('premium_subscriptions').upsert(
    {
      user_id: profileId,
      subscription_type: 'event',
      event_id: eventId,
      status: 'active',
      started_at: compra.purchaseTime,
      expires_at: new Date(new Date(evento.end_date).getTime() + 3_600_000).toISOString(),
      cancel_at_period_end: false,
      google_purchase_token: compra.purchaseToken,
    },
    { onConflict: 'user_id,event_id,subscription_type' },
  );
  if (error) throw error;
  return { ok: true, kind: 'event', duplicate: Boolean(previa) };
};

/** Google ha devuelto el dinero o anulado la compra: se retira lo que se dio. */
export const voidGooglePurchase = async (supabase: SupabaseClient, purchaseToken: string) => {
  const { data: fila } = await supabase
    .from('google_purchases')
    .select('profile_id, kind, event_id, quantity, voided_at')
    .eq('purchase_token', purchaseToken)
    .maybeSingle();
  if (!fila || fila.voided_at) return;
  await supabase
    .from('google_purchases')
    .update({ voided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('purchase_token', purchaseToken);

  if (fila.kind === 'supercrush' && fila.profile_id) {
    await supabase.from('supercrush_ledger').upsert(
      {
        profile_id: fila.profile_id,
        delta: -Math.max(1, fila.quantity ?? 1),
        reason: 'refund',
        stripe_session_id: `google-refund:${purchaseToken.slice(0, 170)}`,
      },
      { onConflict: 'stripe_session_id', ignoreDuplicates: true },
    );
    return;
  }
  await supabase.from('premium_subscriptions').update({ status: 'cancelled' }).eq('google_purchase_token', purchaseToken);
};
