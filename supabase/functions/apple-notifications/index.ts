import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import {
  APPLE_BUNDLE_IDS,
  AppleJwsError,
  AppleRenewalInfo,
  AppleTransaction,
  productKind,
  verifyAppleJws,
} from '../_shared/apple-jws.ts';
import { grantAppleTransaction } from '../_shared/apple-grant.ts';

/**
 * App Store Server Notifications V2 (migración 074).
 *
 * Apple avisa aquí de lo que pasa con las compras después de hacerlas:
 * renovaciones del Premium mensual, cancelaciones, caducidades y devoluciones.
 * Sin JWT (Apple no manda ninguno): lo que protege es la firma de Apple, que
 * se verifica en el aviso y en la transacción que lleva dentro.
 *
 * Responde 200 a todo aviso bien firmado, aunque no le afecte; si no, Apple lo
 * reintenta durante días.
 */

interface Notification {
  notificationType: string;
  subtype?: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const supabase = adminClient();

  let aviso: Notification;
  try {
    const { signedPayload } = (await req.json()) as { signedPayload?: string };
    aviso = await verifyAppleJws<Notification>(signedPayload ?? '');
  } catch (error) {
    console.error('apple-notifications firma:', error instanceof AppleJwsError ? error.message : error);
    return json({ error: 'INVALID_SIGNATURE' }, 400);
  }

  try {
    const tipo = aviso.notificationType;
    const datos = aviso.data ?? {};
    if (tipo === 'TEST' || !datos.bundleId || !APPLE_BUNDLE_IDS.includes(datos.bundleId)) {
      return json({ ok: true });
    }

    const tx = datos.signedTransactionInfo ? await verifyAppleJws<AppleTransaction>(datos.signedTransactionInfo) : null;
    const renovacion = datos.signedRenewalInfo
      ? await verifyAppleJws<AppleRenewalInfo>(datos.signedRenewalInfo)
      : null;
    const original = tx?.originalTransactionId ?? renovacion?.originalTransactionId;
    const kind = tx ? productKind(tx.bundleId, tx.productId) : null;
    console.log('apple-notifications', tipo, aviso.subtype ?? '', kind ?? '', tx?.environment ?? '');

    switch (tipo) {
      // Compra, renovación o cobro recuperado: Premium hasta la nueva fecha.
      case 'SUBSCRIBED':
      case 'DID_RENEW':
      case 'DID_RECOVER':
      case 'OFFER_REDEEMED': {
        if (tx) await grantAppleTransaction(supabase, tx, { profileId: null });
        break;
      }

      // Activa o desactiva la renovación automática desde los ajustes del iPhone.
      case 'DID_CHANGE_RENEWAL_STATUS': {
        if (original && renovacion) {
          await supabase
            .from('premium_subscriptions')
            .update({ cancel_at_period_end: renovacion.autoRenewStatus === 0 })
            .eq('apple_original_transaction_id', original);
        }
        break;
      }

      // Se acabó: sin renovar, sin cobrar o retirado por Apple.
      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
      case 'REVOKE': {
        if (original && kind !== 'supercrush') {
          await supabase
            .from('premium_subscriptions')
            .update({ status: 'cancelled' })
            .eq('apple_original_transaction_id', original);
        }
        break;
      }

      // Apple devuelve el dinero: se retira lo que se dio.
      case 'REFUND': {
        if (!tx) break;
        await supabase
          .from('apple_transactions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('transaction_id', tx.transactionId);

        if (kind === 'supercrush') {
          const { data: fila } = await supabase
            .from('apple_transactions')
            .select('profile_id, quantity')
            .eq('transaction_id', tx.transactionId)
            .maybeSingle();
          if (fila?.profile_id) {
            await supabase.from('supercrush_ledger').upsert(
              {
                profile_id: fila.profile_id,
                delta: -Math.max(1, fila.quantity ?? 1),
                reason: 'refund',
                stripe_session_id: `apple-refund:${tx.transactionId}`,
              },
              { onConflict: 'stripe_session_id', ignoreDuplicates: true },
            );
          }
        } else if (kind === 'event') {
          const { data: fila } = await supabase
            .from('apple_transactions')
            .select('profile_id, event_id')
            .eq('transaction_id', tx.transactionId)
            .maybeSingle();
          if (fila?.profile_id && fila.event_id) {
            await supabase
              .from('premium_subscriptions')
              .update({ status: 'cancelled' })
              .eq('user_id', fila.profile_id)
              .eq('event_id', fila.event_id)
              .eq('subscription_type', 'event');
          }
        } else if (original) {
          await supabase
            .from('premium_subscriptions')
            .update({ status: 'cancelled' })
            .eq('apple_original_transaction_id', original);
        }
        break;
      }

      default:
        break;
    }

    return json({ ok: true });
  } catch (error) {
    console.error('apple-notifications:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
