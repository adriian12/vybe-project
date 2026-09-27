import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getProfileId, getUser } from '../_shared/supabase.ts';
import { AppleJwsError, AppleTransaction, verifyAppleJws } from '../_shared/apple-jws.ts';
import { grantAppleTransaction } from '../_shared/apple-grant.ts';
import { storePrecheck } from '../_shared/iap-precheck.ts';

/**
 * Compras integradas de Apple desde la app de iOS (migración 074).
 *
 *   · `precheck` (`plan`, `eventId`): antes de abrir la hoja de pago de Apple,
 *     las mismas reglas que `stripe-checkout` (no pagar dos veces Premium y,
 *     el de una fiesta, sólo estando dentro y sin que haya terminado). Así
 *     nadie paga algo que luego no se le puede dar.
 *   · `verify` (`jws`, `eventId`): la transacción firmada por Apple. Se
 *     comprueba la firma y se activa lo comprado. La app sólo cierra la
 *     transacción en StoreKit cuando esto responde bien; si falla, la vuelve a
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
    const profileId = await getProfileId(supabase, user.id);
    if (!profileId) return json({ error: 'PROFILE_NOT_FOUND' }, 404);

    const { action, plan, eventId, jws } = (await req.json()) as {
      action?: 'precheck' | 'verify';
      plan?: 'monthly' | 'event' | 'supercrush';
      eventId?: string | null;
      jws?: string;
    };

    // ------------------------------------------------------------- precheck
    if (action === 'precheck') {
      const fallo = await storePrecheck(supabase, profileId, plan, eventId);
      if (fallo) return json({ error: fallo.error }, fallo.status);
      return json({ ok: true, profileId });
    }

    // --------------------------------------------------------------- verify
    if (action === 'verify') {
      if (!jws) return json({ error: 'JWS_REQUIRED' }, 400);
      let tx: AppleTransaction;
      try {
        tx = await verifyAppleJws<AppleTransaction>(jws);
      } catch (error) {
        console.error('apple-iap verify:', error instanceof AppleJwsError ? error.message : error);
        return json({ error: 'INVALID_TRANSACTION' }, 400);
      }

      const r = await grantAppleTransaction(supabase, tx, { profileId, eventId: eventId ?? null });
      if (!r.ok) {
        // Ya caducada o devuelta: no hay nada que dar, pero la app puede
        // cerrarla en StoreKit.
        const final = r.error === 'EXPIRED' || r.error === 'REVOKED';
        return json({ error: r.error, finish: final }, final ? 200 : 400);
      }
      return json({ ok: true, kind: r.kind, duplicate: r.duplicate });
    }

    return json({ error: 'INVALID_ACTION' }, 400);
  } catch (error) {
    console.error('apple-iap:', error);
    return json({ error: 'INTERNAL' }, 500);
  }
});
