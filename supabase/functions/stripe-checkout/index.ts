import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, getProfileId } from '../_shared/supabase.ts';

/**
 * Abre una sesión de pago de Stripe.
 *
 * La suscripción NO se crea aquí: la crea el webhook cuando Stripe confirma el
 * cobro. Así una sesión abandonada no deja Premium activado.
 *
 * Sirve para las dos cosas que se cobran, que no se parecen en nada:
 *
 *   · el Premium de un usuario, que se cobra al perfil;
 *   · el plan de un local, que es una suscripción mensual de empresa y se cobra
 *     al local, no a la persona que abre la sesión.
 *
 * Se distinguen por el prefijo del plan (`venue_`), y el destinatario del cobro
 * se resuelve por separado en cada caso.
 *
 * Variables: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_EVENT,
 *            STRIPE_PRICE_LIFETIME, STRIPE_PRICE_VENUE_PRO,
 *            STRIPE_PRICE_VENUE_BUSINESS
 */

type UserPlan = 'monthly' | 'event' | 'lifetime';
type VenuePlan = 'venue_pro' | 'venue_business';
type Plan = UserPlan | VenuePlan;

const PRICE_ENV: Record<Plan, string> = {
  monthly: 'STRIPE_PRICE_MONTHLY',
  event: 'STRIPE_PRICE_EVENT',
  lifetime: 'STRIPE_PRICE_LIFETIME',
  venue_pro: 'STRIPE_PRICE_VENUE_PRO',
  venue_business: 'STRIPE_PRICE_VENUE_BUSINESS',
};

const esPlanDeLocal = (plan: Plan): plan is VenuePlan => plan.startsWith('venue_');

serve(async (req: Request): Promise<Response> => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) return json({ error: 'STRIPE_NOT_CONFIGURED' }, 200);

  const supabase = adminClient();

  try {
    const user = await getUser(req, supabase);
    if (!user) return json({ error: 'No autenticado' }, 401);

    const { plan, eventId, returnUrl } = (await req.json()) as {
      plan?: Plan;
      eventId?: string | null;
      returnUrl?: string;
    };

    if (!plan || !(plan in PRICE_ENV)) return json({ error: 'Plan no válido' }, 400);

    const priceId = Deno.env.get(PRICE_ENV[plan]);
    if (!priceId) return json({ error: 'STRIPE_NOT_CONFIGURED' }, 200);

    const base = returnUrl ?? Deno.env.get('APP_URL') ?? '';

    const params = new URLSearchParams({
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${base}?checkout=success`,
      cancel_url: `${base}?checkout=cancelled`,
      'metadata[plan]': plan,
      locale: 'auto',
    });

    if (esPlanDeLocal(plan)) {
      // El plan lo paga el local, así que el cobro va contra su fila y no
      // contra el perfil de quien abre la sesión: en un local con equipo,
      // quien pulsa el botón puede no ser la misma persona cada mes.
      const { data: venue } = await supabase
        .from('venues')
        .select('id, email, stripe_customer_id:venue_subscriptions(stripe_customer_id)')
        .eq('venue_id', user.id)
        .maybeSingle();

      if (!venue) return json({ error: 'No es una cuenta de local' }, 403);

      const cliente = (
        venue as { stripe_customer_id?: { stripe_customer_id: string | null }[] }
      ).stripe_customer_id?.[0]?.stripe_customer_id;

      params.set('mode', 'subscription');
      params.set('client_reference_id', venue.id);
      params.set('metadata[venue_id]', venue.id);
      // Factura con los datos fiscales del local: es una venta entre empresas y
      // el local necesita la factura con su NIF. No se pasa `customer_creation`:
      // en modo suscripción Stripe crea el cliente siempre, y mandarlo hace que
      // rechace la sesión entera.
      params.set('tax_id_collection[enabled]', 'true');
      params.set('billing_address_collection', 'required');
      // La suscripción lleva el id del local, para poder relacionar una
      // renovación con su fila sin depender de los metadatos de la sesión.
      params.set('subscription_data[metadata][venue_id]', venue.id);

      if (cliente) params.set('customer', cliente);
      else if (venue.email) params.set('customer_email', venue.email);
    } else {
      const profileId = await getProfileId(supabase, user.id);
      if (!profileId) return json({ error: 'Perfil no encontrado' }, 404);

      // Reutilizamos el cliente de Stripe si el usuario ya compró antes.
      const { data: existing } = await supabase
        .from('premium_subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', profileId)
        .not('stripe_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();

      params.set('mode', plan === 'monthly' ? 'subscription' : 'payment');
      params.set('client_reference_id', profileId);
      params.set('metadata[profile_id]', profileId);

      if (eventId) params.set('metadata[event_id]', eventId);
      if (existing?.stripe_customer_id) params.set('customer', existing.stripe_customer_id);
      else if (user.email) params.set('customer_email', user.email);
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      console.error('Stripe error:', await response.text());
      return json({ error: 'CHECKOUT_FAILED' }, 502);
    }

    const session = (await response.json()) as { url?: string };
    return json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
