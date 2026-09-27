import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import {
  fetchGooglePurchase,
  GOOGLE_PACKAGE,
  grantGooglePurchase,
  voidGooglePurchase,
} from '../_shared/google-play.ts';

/**
 * Avisos en tiempo real de Google Play (Real-time developer notifications),
 * que Google manda por Pub/Sub a esta función (migración 090).
 *
 *   · Suscripción (renovada, cancelada, en gracia, caducada, recuperada…): se
 *     vuelve a preguntar a Google por ella y se pone al día Premium.
 *   · Compra anulada o devuelta (`voidedPurchaseNotification`): se retira lo
 *     que se dio.
 *
 * Sin JWT: Pub/Sub no manda el nuestro. La suscripción de envío de Pub/Sub
 * apunta a `…/google-play-notifications?token=<GOOGLE_RTDN_TOKEN>` y aquí se
 * comprueba ese secreto. Se responde 200 siempre que el aviso se haya
 * entendido, para que Pub/Sub no lo repita sin fin.
 */

serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const secreto = Deno.env.get('GOOGLE_RTDN_TOKEN');
  if (!secreto || new URL(req.url).searchParams.get('token') !== secreto) return json({ error: 'FORBIDDEN' }, 403);

  const supabase = adminClient();
  try {
    const cuerpo = (await req.json()) as { message?: { data?: string } };
    const datos = cuerpo.message?.data;
    if (!datos) return json({ ok: true });
    const aviso = JSON.parse(atob(datos)) as {
      packageName?: string;
      testNotification?: unknown;
      subscriptionNotification?: { notificationType: number; purchaseToken: string; subscriptionId: string };
      oneTimeProductNotification?: { notificationType: number; purchaseToken: string; sku: string };
      voidedPurchaseNotification?: { purchaseToken: string; productType?: number };
    };
    if (aviso.packageName && aviso.packageName !== GOOGLE_PACKAGE) return json({ ok: true });
    if (aviso.testNotification) {
      console.log('google-play-notifications: aviso de prueba recibido');
      return json({ ok: true });
    }

    if (aviso.voidedPurchaseNotification) {
      await voidGooglePurchase(supabase, aviso.voidedPurchaseNotification.purchaseToken);
      return json({ ok: true });
    }

    const sub = aviso.subscriptionNotification;
    if (sub) {
      console.log('google-play-notifications suscripción', sub.notificationType);
      const compra = await fetchGooglePurchase(sub.subscriptionId, sub.purchaseToken);
      if (compra.valid) {
        await grantGooglePurchase(supabase, compra, { profileId: null });
      } else {
        await supabase
          .from('premium_subscriptions')
          .update({ status: 'cancelled' })
          .eq('google_purchase_token', sub.purchaseToken);
      }
      // Renovación automática desactivada o reactivada.
      await supabase
        .from('premium_subscriptions')
        .update({ cancel_at_period_end: !compra.autoRenew })
        .eq('google_purchase_token', sub.purchaseToken);
      return json({ ok: true });
    }

    // Productos sueltos: se activan al comprar desde la app; aquí sólo se anota.
    if (aviso.oneTimeProductNotification) {
      console.log('google-play-notifications producto', aviso.oneTimeProductNotification.notificationType);
    }
    return json({ ok: true });
  } catch (error) {
    console.error('google-play-notifications:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
