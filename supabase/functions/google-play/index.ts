import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { overLimit, tooManyRequests } from '../_shared/rate-limit.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getProfileId, getUser } from '../_shared/supabase.ts';
import { storePrecheck } from '../_shared/iap-precheck.ts';
import {
  acknowledgeGoogleSubscription,
  fetchGooglePurchase,
  GooglePlayError,
  grantGooglePurchase,
} from '../_shared/google-play.ts';

/**
 * Compras de Google Play desde la app de Android (migración 090).
 *
 *   · `precheck` (`plan`, `eventId`): las mismas reglas que Stripe y Apple
 *     antes de abrir la hoja de pago de Google.
 *   · `verify` (`productId`, `purchaseToken`, `eventId`): se pregunta a Google
 *     por la compra y se activa. La app sólo la confirma (o la consume, si es
 *     un producto suelto) cuando esto responde bien; si falla, la vuelve a
 *     mandar al abrirse.
 *
 * Con JWT: sólo la persona que ha comprado.
 */

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);
    if (await overLimit(supabase, req, 'google-play', 20, { userId: user.id })) return tooManyRequests();
    const profileId = await getProfileId(supabase, user.id);
    if (!profileId) return json({ error: 'PROFILE_NOT_FOUND' }, 404);

    const { action, plan, eventId, productId, purchaseToken } = (await req.json()) as {
      action?: 'precheck' | 'verify';
      plan?: 'monthly' | 'event' | 'supercrush';
      eventId?: string | null;
      productId?: string;
      purchaseToken?: string;
    };

    if (action === 'precheck') {
      const fallo = await storePrecheck(supabase, profileId, plan, eventId);
      if (fallo) return json({ error: fallo.error }, fallo.status);
      return json({ ok: true, profileId });
    }

    if (action === 'verify') {
      if (!productId || !purchaseToken) return json({ error: 'PURCHASE_REQUIRED' }, 400);
      let compra;
      try {
        compra = await fetchGooglePurchase(productId, purchaseToken);
      } catch (error) {
        console.error('google-play verify:', error instanceof GooglePlayError ? error.message : error);
        const sinConfigurar = error instanceof Error && error.message === 'GOOGLE_NOT_CONFIGURED';
        return json({ error: sinConfigurar ? 'STORE_NOT_CONFIGURED' : 'INVALID_PURCHASE' }, sinConfigurar ? 503 : 400);
      }

      const r = await grantGooglePurchase(supabase, compra, { profileId, eventId: eventId ?? null });
      if (!r.ok) {
        // Caducada, anulada o no pagada: no hay nada que dar, pero la app
        // puede cerrarla.
        const final = ['EXPIRED', 'REVOKED', 'NOT_PURCHASED'].includes(r.error);
        return json({ error: r.error, finish: final }, final ? 200 : 400);
      }
      if (compra.kind === 'monthly') await acknowledgeGoogleSubscription(productId, purchaseToken);
      return json({ ok: true, kind: r.kind, duplicate: r.duplicate });
    }

    return json({ error: 'INVALID_ACTION' }, 400);
  } catch (error) {
    console.error('google-play:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
