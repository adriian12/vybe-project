import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser } from '../_shared/supabase.ts';
import { stripeSecretKey, stripeTestMode } from '../_shared/stripe-env.ts';

/**
 * Stripe Connect para los locales (migración 069).
 *
 * Cada negocio cobra sus entradas en su propia cuenta de Stripe, con cargos
 * directos: es el vendedor, paga la tarifa de Stripe y responde de reembolsos y
 * contracargos. La cuenta se crea con Stripe asumiendo las pérdidas y con el
 * panel completo de Stripe para el negocio. Acciones:
 *   · `onboard`: crea la cuenta (con todo lo que ya sabemos del local, para que
 *     en Stripe sólo le quede lo imprescindible) y devuelve el enlace de alta.
 *     Si ya usa Stripe, en ese formulario puede entrar con su cuenta y
 *     reutilizar sus datos.
 *   · `status`: pregunta a Stripe cómo está la cuenta y lo guarda. Se llama al
 *     volver del alta y al abrir Ventas: así no depende de configurar un
 *     webhook de Connect.
 *   · `dashboard`: el panel de Stripe del negocio (entra con su usuario).
 *   · `refund`: devuelve un pedido entero (el dinero sale de la cuenta del
 *     local y se devuelve también la comisión de la plataforma).
 *
 * Sólo el propietario del local, y sólo en Business.
 *
 * Variables: STRIPE_SECRET_KEY (o STRIPE_TEST_SECRET_KEY con STRIPE_MODE=test), APP_URL.
 */

const STRIPE = 'https://api.stripe.com/v1';

const stripe = async (
  secret: string,
  path: string,
  params?: URLSearchParams,
  method: 'GET' | 'POST' = params ? 'POST' : 'GET',
  cuenta?: string,
): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
  const respuesta = await fetch(`${STRIPE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Operaciones sobre la cuenta del negocio (cargos directos).
      ...(cuenta ? { 'Stripe-Account': cuenta } : {}),
    },
    body: params,
  });
  const data = (await respuesta.json()) as Record<string, unknown>;
  if (!respuesta.ok) console.error(`Stripe ${path}:`, JSON.stringify(data));
  return { ok: respuesta.ok, data };
};

/** API v2 de Stripe (cuentas y enlaces de alta): JSON y versión fija. */
const stripeV2 = async (
  secret: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
  const respuesta = await fetch(`https://api.stripe.com/v2${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': '2026-08-26.dahlia',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await respuesta.json()) as Record<string, unknown>;
  if (!respuesta.ok) console.error(`Stripe v2 ${path}:`, JSON.stringify(data));
  return { ok: respuesta.ok, data };
};

/** Guarda en el local lo que dice Stripe de su cuenta. */
const guardarEstado = async (
  supabase: ReturnType<typeof adminClient>,
  venueId: string,
  cuenta: Record<string, unknown>,
) => {
  const requisitos = (cuenta.requirements ?? {}) as Record<string, unknown>;
  const estado = {
    stripe_charges_enabled: Boolean(cuenta.charges_enabled),
    stripe_payouts_enabled: Boolean(cuenta.payouts_enabled),
    stripe_details_submitted: Boolean(cuenta.details_submitted),
    stripe_requirements: {
      currently_due: requisitos.currently_due ?? [],
      past_due: requisitos.past_due ?? [],
      disabled_reason: requisitos.disabled_reason ?? null,
    },
    stripe_updated_at: new Date().toISOString(),
  };
  await supabase.from('venues').update(estado).eq('id', venueId);
  return {
    connected: true,
    chargesEnabled: estado.stripe_charges_enabled,
    payoutsEnabled: estado.stripe_payouts_enabled,
    detailsSubmitted: estado.stripe_details_submitted,
    pendingFields: (estado.stripe_requirements.currently_due as unknown[]).length,
  };
};

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const secret = stripeSecretKey();
  if (!secret) return json({ error: 'STRIPE_NOT_CONFIGURED' }, 200);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'NOT_AUTHENTICATED' }, 401);

    const { action, returnUrl, orderId } = (await req.json()) as {
      action?: 'onboard' | 'status' | 'dashboard' | 'refund';
      returnUrl?: string;
      orderId?: string;
    };

    // El local del que es propietario quien llama: la cuenta del local o un
    // miembro con papel de propietario.
    let { data: venue } = await supabase
      .from('venues')
      .select('id, name, email, stripe_account_id, stripe_charges_enabled')
      .eq('venue_id', user.id)
      .maybeSingle();
    if (!venue) {
      const { data: miembro } = await supabase
        .from('venue_members')
        .select('venue_id')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();
      if (miembro) {
        const { data } = await supabase
          .from('venues')
          .select('id, name, email, stripe_account_id, stripe_charges_enabled')
          .eq('id', miembro.venue_id)
          .maybeSingle();
        venue = data;
      }
    }
    if (!venue) return json({ error: 'NOT_AUTHORIZED' }, 403);

    const { data: business } = await supabase.rpc('venue_has_feature', {
      p_venue_id: venue.id,
      p_feature: 'ticket_sales',
    });
    if (!business) return json({ error: 'PLAN_REQUIRED' }, 403);

    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
    // Stripe sólo acepta https en producción.
    const base = returnUrl && /^https:\/\//.test(returnUrl) ? returnUrl.replace(/\/+$/, '') : `${appUrl}/venue/dashboard`;

    // ------------------------------------------------------------ onboard
    if (action === 'onboard') {
      let cuentaId = venue.stripe_account_id as string | null;

      if (!cuentaId) {
        // Todo lo que ya sabemos va relleno: en Stripe sólo le queda lo que la
        // ley exige que ponga él (persona responsable, IBAN, verificación).
        // Accounts v2: Stripe ya no deja crear cuentas conectadas con la v1.
        // El teléfono y la dirección no se mandan: si Stripe no acepta su
        // formato (o el tipo de empresa aún no está elegido) rechaza el alta
        // entera. Los pide el propio formulario.
        const creada = await stripeV2(secret, '/core/accounts', {
          contact_email: venue.email ?? undefined,
          display_name: venue.name,
          dashboard: 'full',
          identity: { country: 'es' },
          configuration: {
            // 5813: bares, discotecas y salas de fiestas.
            merchant: { capabilities: { card_payments: { requested: true } }, mcc: '5813' },
          },
          defaults: {
            currency: 'eur',
            locales: ['es-ES'],
            // Quien paga las tarifas y responde de pérdidas y contracargos es el
            // negocio (y Stripe si su saldo no llega), no la plataforma.
            responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
            profile: {
              business_url: `${appUrl}/local/${venue.id}`,
              product_description: 'Venta de entradas y reservas de mesa para sus fiestas.',
            },
          },
          metadata: { venue_id: venue.id },
        });
        if (!creada.ok) {
          const mensaje = String((creada.data.error as { message?: string } | undefined)?.message ?? '');
          // Sin activar Connect en el panel de Stripe no se pueden crear cuentas.
          const codigo = /connect/i.test(mensaje) ? 'CONNECT_NOT_ENABLED' : 'ONBOARD_FAILED';
          return json({ error: codigo }, 502);
        }
        cuentaId = creada.data.id as string;
        await supabase
          .from('venues')
          .update({ stripe_account_id: cuentaId, stripe_updated_at: new Date().toISOString() })
          .eq('id', venue.id);
      }

      const enlace = await stripeV2(secret, '/core/account_links', {
        account: cuentaId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            refresh_url: `${base}?seccion=sales&connect=refresh`,
            return_url: `${base}?seccion=sales&connect=return`,
          },
        },
      });
      if (!enlace.ok) return json({ error: 'ONBOARD_FAILED' }, 502);
      return json({ url: enlace.data.url });
    }

    if (!venue.stripe_account_id) {
      if (action === 'status') {
        return json({ connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, pendingFields: 0 });
      }
      return json({ error: 'NOT_CONNECTED' }, 409);
    }

    // ------------------------------------------------------------- status
    if (action === 'status') {
      const cuenta = await stripe(secret, `/accounts/${venue.stripe_account_id}`);
      if (!cuenta.ok) return json({ error: 'STATUS_FAILED' }, 502);
      return json(await guardarEstado(supabase, venue.id, cuenta.data));
    }

    // ---------------------------------------------------------- dashboard
    if (action === 'dashboard') {
      // Panel completo: el negocio entra en su Stripe con su propio usuario.
      return json({ url: stripeTestMode() ? 'https://dashboard.stripe.com/test/dashboard' : 'https://dashboard.stripe.com/dashboard' });
    }

    // ------------------------------------------------------------- refund
    if (action === 'refund') {
      if (!orderId) return json({ error: 'ORDER_NOT_FOUND' }, 400);
      const { data: pedido } = await supabase
        .from('ticket_orders')
        .select('id, venue_id, status, payment_intent_id')
        .eq('id', orderId)
        .maybeSingle();
      if (!pedido || pedido.venue_id !== venue.id) return json({ error: 'ORDER_NOT_FOUND' }, 404);
      if (pedido.status === 'refunded') return json({ ok: true });
      if (pedido.status !== 'paid' || !pedido.payment_intent_id) return json({ error: 'NOT_REFUNDABLE' }, 409);

      const devolucion = await stripe(
        secret,
        '/refunds',
        new URLSearchParams({
          payment_intent: pedido.payment_intent_id,
          // Cargo directo: el dinero sale de la cuenta del negocio, y la
          // comisión de la plataforma también se devuelve.
          refund_application_fee: 'true',
          'metadata[order_id]': pedido.id,
        }),
        'POST',
        venue.stripe_account_id as string,
      );
      if (!devolucion.ok) {
        const codigo = String((devolucion.data.error as { code?: string } | undefined)?.code ?? '');
        return json({ error: codigo === 'charge_already_refunded' ? 'ALREADY_REFUNDED' : 'REFUND_FAILED' }, 502);
      }
      await supabase.rpc('mark_ticket_order_refunded', { p_order_id: pedido.id, p_by: user.id });
      return json({ ok: true });
    }

    return json({ error: 'Acción no válida' }, 400);
  } catch (error) {
    console.error('stripe-connect:', error);
    return json({ error: 'SERVER_ERROR' }, 500);
  }
});
