import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { json, preflight } from '../_shared/cors.ts';
import { adminClient, getUser, getProfileId } from '../_shared/supabase.ts';

/**
 * Abre una sesión de pago de Stripe (y cancela la suscripción mensual).
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
 * Productos:
 *   · monthly     9,99 €/mes, Premium en todas partes (suscripción).
 *   · event       4,99 €, Premium sólo en el evento en el que estás dentro.
 *   · supercrush  1 € cada uno, se compran de 1 en adelante y valen en
 *                 cualquier evento.
 *   · venue_pro / venue_business  plan mensual del local.
 *
 * Variables: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY_USER (o
 *            STRIPE_PRICE_MONTHLY), STRIPE_PRICE_EVENT, STRIPE_PRICE_SUPERLIKE,
 *            STRIPE_PRICE_VENUE_PRO, STRIPE_PRICE_VENUE_BUSINESS
 */

type UserPlan = 'monthly' | 'event' | 'supercrush';
type VenuePlan = 'venue_pro' | 'venue_business';
type Plan = UserPlan | VenuePlan | 'event_boost' | 'tickets';

const PRICE_ENV: Record<Exclude<Plan, 'event_boost' | 'tickets'>, string[]> = {
  monthly: ['STRIPE_PRICE_MONTHLY_USER', 'STRIPE_PRICE_MONTHLY'],
  event: ['STRIPE_PRICE_EVENT'],
  supercrush: ['STRIPE_PRICE_SUPERLIKE'],
  venue_pro: ['STRIPE_PRICE_VENUE_PRO'],
  venue_business: ['STRIPE_PRICE_VENUE_BUSINESS'],
};

const precio = (plan: Exclude<Plan, 'event_boost' | 'tickets'>): string | undefined =>
  PRICE_ENV[plan].map((nombre) => Deno.env.get(nombre)).find(Boolean);

/** Supercrush por compra: al menos 1; el tope evita cobros por error. */
const MAX_SUPERCRUSH = 100;

/**
 * Precios de los locales, en céntimos, para cuando no hay un precio creado en
 * Stripe (variable STRIPE_PRICE_VENUE_*): la sesión lleva el importe dentro.
 * Son los de la landing y `src/lib/venue-plans.ts`: si cambias uno, cambia los
 * otros.
 */
const VENUE_PRICE_CENTS: Record<VenuePlan, number> = { venue_pro: 4900, venue_business: 6999 };
const BOOST_PRICE_CENTS = 1900;

/**
 * Lo que se queda la plataforma de cada venta de entradas (Connect).
 *
 *   · El % lo fija administración para cada local
 *     (`venues.platform_fee_percent`, por defecto 0).
 *   · CONNECT_FEE_FIXED_CENTS: céntimos fijos por entrada (por defecto 0).
 *   · CONNECT_PASS_STRIPE_FEES: con cargos a destino la tarifa de Stripe la
 *     paga la plataforma; con «true» (por defecto) se le repercute al local
 *     como 1,5 % + 0,25 € por pago, la tarifa de las tarjetas europeas.
 *
 * Se cambian con `secrets set`, sin desplegar.
 */
const comisionPlataforma = (totalCents: number, unidades: number, pct: number): number => {
  const fijo = Number(Deno.env.get('CONNECT_FEE_FIXED_CENTS') ?? '0') || 0;
  const repercutir = (Deno.env.get('CONNECT_PASS_STRIPE_FEES') ?? 'true') !== 'false';
  const stripeFee = repercutir ? Math.round(totalCents * 0.015) + 25 : 0;
  const total = Math.round((totalCents * pct) / 100) + fijo * unidades + stripeFee;
  return Math.max(0, Math.min(total, totalCents - 1));
};

const esPlanDeLocal = (plan: Plan): plan is VenuePlan => plan.startsWith('venue_');

/** El local de quien pulsa: el suyo o aquel en cuyo equipo está. */
const localDe = async (supabase: ReturnType<typeof adminClient>, userId: string) => {
  const { data: propio } = await supabase.from('venues').select('id, email').eq('venue_id', userId).maybeSingle();
  if (propio) return propio;
  const { data: miembro } = await supabase
    .from('venue_members')
    .select('venues(id, email)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return (miembro?.venues as { id: string; email: string | null } | null) ?? null;
};

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

    const { plan, eventId, returnUrl, quantity, action, ticketTypeId } = (await req.json()) as {
      plan?: Plan;
      eventId?: string | null;
      ticketTypeId?: string;
      returnUrl?: string;
      quantity?: number;
      action?: 'cancel';
    };

    const base = returnUrl ?? Deno.env.get('APP_URL') ?? '';

    // Cancelar la mensual: se para la renovación en Stripe y se conserva lo
    // pagado hasta el final del mes (el webhook la da de baja entonces).
    if (action === 'cancel') {
      const profileId = await getProfileId(supabase, user.id);
      if (!profileId) return json({ error: 'Perfil no encontrado' }, 404);
      const { data: sub } = await supabase
        .from('premium_subscriptions')
        .select('id, stripe_subscription_id')
        .eq('user_id', profileId)
        .eq('subscription_type', 'monthly')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (!sub) return json({ error: 'NO_SUBSCRIPTION' }, 404);
      if (sub.stripe_subscription_id) {
        const r = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ cancel_at_period_end: 'true' }),
        });
        if (!r.ok) {
          console.error('Stripe cancel error:', await r.text());
          return json({ error: 'CANCEL_FAILED' }, 502);
        }
      }
      await supabase.from('premium_subscriptions').update({ cancel_at_period_end: true }).eq('id', sub.id);
      return json({ ok: true });
    }

    // Destacar un evento: pago único por noche. El evento tiene que ser del
    // local de quien paga y no haber terminado.
    if (plan === 'event_boost') {
      if (!eventId) return json({ error: 'Falta el evento' }, 400);
      const venue = await localDe(supabase, user.id);
      if (!venue) return json({ error: 'No es una cuenta de local' }, 403);

      const { data: evento } = await supabase
        .from('events')
        .select('id, name, venue_id, end_date')
        .eq('id', eventId)
        .maybeSingle();
      if (!evento || evento.venue_id !== venue.id) return json({ error: 'Evento no válido' }, 403);
      if (new Date(evento.end_date).getTime() <= Date.now()) return json({ error: 'EVENT_ENDED' }, 400);

      const boost = new URLSearchParams({
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(BOOST_PRICE_CENTS),
        'line_items[0][price_data][product_data][name]': `Destacar «${evento.name}» en Vybes`,
        success_url: `${base}?boost=success`,
        cancel_url: `${base}?boost=cancelled`,
        client_reference_id: venue.id,
        'metadata[kind]': 'event_boost',
        'metadata[event_id]': evento.id,
        'metadata[venue_id]': venue.id,
        'tax_id_collection[enabled]': 'true',
        billing_address_collection: 'required',
        locale: 'auto',
      });
      if (venue.email) boost.set('customer_email', venue.email);

      const respuesta = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: boost,
      });
      if (!respuesta.ok) {
        console.error('Stripe error:', await respuesta.text());
        return json({ error: 'CHECKOUT_FAILED' }, 502);
      }
      const sesion = (await respuesta.json()) as { url?: string };
      return json({ url: sesion.url });
    }

    // Entradas o mesa de una fiesta (locales Business). Las plazas se reservan
    // antes de ir a Stripe y la sesión caduca a los 30 minutos, que es lo que
    // `ticket_type_taken()` tarda en liberarlas.
    if (plan === 'tickets') {
      if (!ticketTypeId) return json({ error: 'Falta el tipo de entrada' }, 400);
      const profileId = await getProfileId(supabase, user.id);
      if (!profileId) return json({ error: 'Perfil no encontrado' }, 404);

      const { data: pedidos, error: errorPedido } = await supabase.rpc('create_ticket_order', {
        p_profile_id: profileId,
        p_type_id: ticketTypeId,
        p_quantity: Math.floor(Number(quantity ?? 1)),
      });
      if (errorPedido) {
        const codigo = ['SOLD_OUT', 'SALES_CLOSED', 'BAD_QUANTITY', 'PAYMENTS_NOT_ENABLED'].find((c) =>
          errorPedido.message.includes(c),
        );
        return json({ error: codigo ?? 'ORDER_FAILED' }, 409);
      }
      const pedido = (Array.isArray(pedidos) ? pedidos[0] : pedidos) as {
        order_id: string;
        unit_cents: number;
        type_name: string;
        kind: string;
        event_name: string;
      };
      const unidades = Math.floor(Number(quantity ?? 1));
      const separador = base.includes('?') ? '&' : '?';

      // El cobro va a la cuenta de Stripe del local (Connect, migración 069).
      const { data: orden } = await supabase
        .from('ticket_orders')
        .select('stripe_account_id, amount_cents, venues(platform_fee_percent)')
        .eq('id', pedido.order_id)
        .single();
      const destino = orden?.stripe_account_id as string | undefined;
      if (!destino) return json({ error: 'PAYMENTS_NOT_ENABLED' }, 409);
      const total = Number(orden?.amount_cents ?? pedido.unit_cents * unidades);
      const porcentaje = Number((orden?.venues as { platform_fee_percent?: number } | null)?.platform_fee_percent ?? 0);
      const comision = comisionPlataforma(total, unidades, porcentaje);

      const entradas = new URLSearchParams({
        mode: 'payment',
        'line_items[0][quantity]': String(unidades),
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(pedido.unit_cents),
        'line_items[0][price_data][product_data][name]': `${pedido.type_name} · ${pedido.event_name}`,
        success_url: `${base}${separador}tickets=success`,
        cancel_url: `${base}${separador}tickets=cancelled`,
        client_reference_id: profileId,
        'metadata[kind]': 'tickets',
        'metadata[order_id]': pedido.order_id,
        'metadata[profile_id]': profileId,
        expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60 + 30),
        locale: 'auto',
        // Cobro a nombre del local: sale su nombre en el extracto y el dinero
        // llega a su cuenta; la plataforma se queda `application_fee_amount`.
        'payment_intent_data[on_behalf_of]': destino,
        'payment_intent_data[transfer_data][destination]': destino,
        'payment_intent_data[metadata][order_id]': pedido.order_id,
      });
      if (comision > 0) entradas.set('payment_intent_data[application_fee_amount]', String(comision));
      if (user.email) entradas.set('customer_email', user.email);

      const respuesta = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: entradas,
      });
      if (!respuesta.ok) {
        console.error('Stripe error:', await respuesta.text());
        await supabase.from('ticket_orders').update({ status: 'cancelled' }).eq('id', pedido.order_id);
        return json({ error: 'CHECKOUT_FAILED' }, 502);
      }
      const sesion = (await respuesta.json()) as { id: string; url?: string };
      await supabase
        .from('ticket_orders')
        .update({ stripe_session_id: sesion.id, application_fee_cents: comision })
        .eq('id', pedido.order_id);
      return json({ url: sesion.url });
    }

    if (!plan || !(plan in PRICE_ENV)) return json({ error: 'Plan no válido' }, 400);

    const priceId = precio(plan as Exclude<Plan, 'event_boost' | 'tickets'>);
    // Los planes de local pueden cobrarse sin precio creado en Stripe; el
    // Premium de usuario, no.
    if (!priceId && !esPlanDeLocal(plan)) return json({ error: 'STRIPE_NOT_CONFIGURED' }, 200);

    const params = new URLSearchParams({
      'line_items[0][quantity]': '1',
      success_url: `${base}?checkout=success`,
      cancel_url: `${base}?checkout=cancelled`,
      'metadata[plan]': plan,
      locale: 'auto',
    });

    if (priceId) {
      params.set('line_items[0][price]', priceId);
    } else if (esPlanDeLocal(plan)) {
      params.set('line_items[0][price_data][currency]', 'eur');
      params.set('line_items[0][price_data][unit_amount]', String(VENUE_PRICE_CENTS[plan]));
      params.set('line_items[0][price_data][recurring][interval]', 'month');
      params.set(
        'line_items[0][price_data][product_data][name]',
        plan === 'venue_pro' ? 'Vybes Pro para locales' : 'Vybes Business para locales',
      );
    }

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

      // ¿Ya tiene Premium que valga en todas partes?
      const { data: mensual } = await supabase
        .from('premium_subscriptions')
        .select('id')
        .eq('user_id', profileId)
        .eq('status', 'active')
        .is('event_id', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .limit(1)
        .maybeSingle();

      if (plan === 'monthly' && mensual) return json({ error: 'ALREADY_PREMIUM' }, 409);

      if (plan === 'event') {
        // Premium de un evento: sólo el evento en el que la persona está
        // dentro ahora mismo, que no haya terminado, y sin pagarlo dos veces.
        if (!eventId) return json({ error: 'EVENT_REQUIRED' }, 400);
        if (mensual) return json({ error: 'ALREADY_PREMIUM' }, 409);

        const { data: dentro } = await supabase
          .from('event_attendance')
          .select('event_id, left_at, events!inner(id, end_date)')
          .eq('profile_id', profileId)
          .eq('event_id', eventId)
          .is('left_at', null)
          .maybeSingle();
        const fin = (dentro?.events as { end_date: string } | null)?.end_date;
        if (!dentro || !fin || new Date(fin).getTime() <= Date.now()) {
          return json({ error: 'NOT_AT_EVENT' }, 403);
        }

        const { data: yaPagado } = await supabase
          .from('premium_subscriptions')
          .select('id')
          .eq('user_id', profileId)
          .eq('event_id', eventId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (yaPagado) return json({ error: 'ALREADY_PREMIUM' }, 409);

        params.set('metadata[event_id]', eventId);
      }

      if (plan === 'supercrush') {
        const cuantos = Math.floor(Number(quantity ?? 1));
        if (!Number.isFinite(cuantos) || cuantos < 1 || cuantos > MAX_SUPERCRUSH) {
          return json({ error: 'INVALID_QUANTITY' }, 400);
        }
        params.set('line_items[0][quantity]', String(cuantos));
        params.set('metadata[kind]', 'supercrush');
        params.set('metadata[quantity]', String(cuantos));
        params.set('success_url', `${base}?supercrush=success`);
        params.set('cancel_url', `${base}?supercrush=cancelled`);
      }
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
