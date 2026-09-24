import { serve } from 'https://deno.land/std@0.193.0/http/server.ts';
import { adminClient } from '../_shared/supabase.ts';

/**
 * Webhook de Stripe: activa, renueva y cancela las suscripciones.
 *
 * Es la única vía por la que Premium se activa de verdad; el cliente nunca
 * escribe `status = 'active'` por su cuenta.
 *
 * Debe configurarse con `verify_jwt = false` (Stripe no envía JWT) y validarse
 * con la firma del encabezado, que es lo que autentica la petición.
 *
 * Variables: STRIPE_WEBHOOK_SECRET
 */

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** Verifica la firma `t=…,v1=…` que Stripe envía en Stripe-Signature. */
const verifySignature = async (
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> => {
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key.trim(), value];
    }),
  );

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Rechazamos eventos de más de cinco minutos para evitar repeticiones.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const expected = toHex(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)),
  );

  // Comparación en tiempo constante.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
};

/**
 * El id de la suscripción de una factura. Desde la API 2025-03 (basil) ya no
 * viene en `invoice.subscription` sino en
 * `invoice.parent.subscription_details.subscription`; el webhook de producción
 * usa una versión posterior. Se aceptan las dos formas.
 */
const invoiceSubscription = (invoice: Record<string, unknown>): string | null => {
  const directa = invoice.subscription;
  if (typeof directa === 'string') return directa;
  if (directa && typeof directa === 'object' && 'id' in directa) return String((directa as { id: string }).id);
  const parent = invoice.parent as { subscription_details?: { subscription?: string | { id: string } } } | null;
  const sub = parent?.subscription_details?.subscription;
  if (typeof sub === 'string') return sub;
  return sub?.id ?? null;
};

/** Fin del periodo pagado de una factura, si viene (segundos Unix). */
const invoicePeriodEnd = (invoice: Record<string, unknown>): string | null => {
  const lines = (invoice.lines as { data?: { period?: { end?: number } }[] } | undefined)?.data ?? [];
  const fin = Math.max(0, ...lines.map((l) => l.period?.end ?? 0));
  return fin > 0 ? new Date(fin * 1000).toISOString() : null;
};

const monthFromNow = (): string => {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);
  return expires.toISOString();
};

serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('Webhook no configurado', { status: 500 });

  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return new Response('Falta la firma', { status: 400 });

  const payload = await req.text();

  if (!(await verifySignature(payload, signature, secret))) {
    return new Response('Firma no válida', { status: 400 });
  }

  const supabase = adminClient();

  try {
    const event = JSON.parse(payload) as StripeEvent;
    const object = event.data.object;

    switch (event.type) {
      case 'checkout.session.completed': {
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        const profileId = metadata.profile_id ?? (object.client_reference_id as string | null);
        const plan = metadata.plan ?? 'monthly';

        // Un pago pendiente (transferencia, etc.) no activa nada todavía.
        const pagado = object.payment_status as string | undefined;
        if (pagado && pagado !== 'paid' && pagado !== 'no_payment_required') break;

        // Entradas y mesas: se emiten una sola vez por pedido.
        if (metadata.kind === 'tickets' && metadata.order_id) {
          const { error } = await supabase.rpc('fulfill_ticket_order', {
            p_order_id: metadata.order_id,
            p_session_id: object.id as string,
          });
          if (error) throw error;
          // Hace falta para poder devolverlo desde Ventas.
          if (object.payment_intent) {
            await supabase
              .from('ticket_orders')
              .update({ payment_intent_id: object.payment_intent as string })
              .eq('id', metadata.order_id);
          }
          break;
        }

        // Supercrush comprados: se suman al saldo una sola vez por sesión.
        if (metadata.kind === 'supercrush' && profileId) {
          const { error } = await supabase.rpc('credit_supercrush_purchase', {
            p_profile_id: profileId,
            p_quantity: Number(metadata.quantity ?? 0),
            p_session_id: object.id as string,
            p_amount_cents: Number(object.amount_total ?? 0),
          });
          if (error) throw error;
          break;
        }

        // Destacar un evento: queda destacado hasta que termina. El pago se
        // guarda una vez por sesión (Stripe puede repetir el aviso).
        if (metadata.kind === 'event_boost' && metadata.event_id && metadata.venue_id) {
          const { data: evento } = await supabase
            .from('events')
            .select('end_date')
            .eq('id', metadata.event_id)
            .maybeSingle();
          if (!evento) break;

          await supabase.from('event_boosts').upsert(
            {
              event_id: metadata.event_id,
              venue_id: metadata.venue_id,
              amount_cents: Number(object.amount_total ?? 0),
              currency: (object.currency as string | null) ?? 'eur',
              stripe_session_id: object.id as string,
            },
            { onConflict: 'stripe_session_id' },
          );
          await supabase.from('events').update({ featured_until: evento.end_date }).eq('id', metadata.event_id);
          break;
        }

        // El plan de un local va a su propia tabla: no es Premium de nadie, es
        // una suscripción de empresa y la paga el local.
        if (metadata.venue_id) {
          const expira = new Date();
          expira.setMonth(expira.getMonth() + 1);

          await supabase.from('venue_subscriptions').upsert(
            {
              venue_id: metadata.venue_id,
              // `venue_pro` -> `pro`: el prefijo sólo sirve para distinguir el
              // plan en el checkout, la tabla guarda el nombre a secas.
              plan: plan.replace(/^venue_/, ''),
              status: 'active',
              started_at: new Date().toISOString(),
              expires_at: expira.toISOString(),
              cancel_at_period_end: false,
              stripe_customer_id: (object.customer as string | null) ?? null,
              stripe_subscription_id: (object.subscription as string | null) ?? null,
            },
            { onConflict: 'venue_id' },
          );
          break;
        }

        if (!profileId) break;

        // Premium de un evento: vale hasta una hora después de que acabe, lo
        // mismo que duran sus matches. Sin evento válido no se activa nada.
        let expiresAt = monthFromNow();
        if (plan === 'event') {
          if (!metadata.event_id) break;
          const { data: evento } = await supabase
            .from('events')
            .select('end_date')
            .eq('id', metadata.event_id)
            .maybeSingle();
          if (!evento) break;
          expiresAt = new Date(new Date(evento.end_date).getTime() + 3_600_000).toISOString();
        }

        await supabase.from('premium_subscriptions').upsert(
          {
            user_id: profileId,
            subscription_type: plan,
            event_id: plan === 'event' ? metadata.event_id : null,
            status: 'active',
            started_at: new Date().toISOString(),
            expires_at: expiresAt,
            cancel_at_period_end: false,
            stripe_customer_id: (object.customer as string | null) ?? null,
            stripe_subscription_id: (object.subscription as string | null) ?? null,
          },
          { onConflict: 'user_id,event_id,subscription_type' },
        );
        break;
      }

      // Devolución hecha desde el panel de Stripe: las entradas dejan de valer.
      case 'charge.refunded': {
        const pi = object.payment_intent as string | null;
        if (pi && object.refunded) {
          const { data: pedido } = await supabase
            .from('ticket_orders')
            .select('id')
            .eq('payment_intent_id', pi)
            .maybeSingle();
          if (pedido) await supabase.rpc('mark_ticket_order_refunded', { p_order_id: pedido.id });
        }
        break;
      }

      // Estado de la cuenta de un local (si el webhook escucha cuentas conectadas).
      case 'account.updated': {
        const requisitos = (object.requirements ?? {}) as Record<string, unknown>;
        await supabase
          .from('venues')
          .update({
            stripe_charges_enabled: Boolean(object.charges_enabled),
            stripe_payouts_enabled: Boolean(object.payouts_enabled),
            stripe_details_submitted: Boolean(object.details_submitted),
            stripe_requirements: {
              currently_due: requisitos.currently_due ?? [],
              past_due: requisitos.past_due ?? [],
              disabled_reason: requisitos.disabled_reason ?? null,
            },
            stripe_updated_at: new Date().toISOString(),
          })
          .eq('stripe_account_id', object.id as string);
        break;
      }

      // La pasarela de unas entradas caducó sin pagar: se liberan las plazas.
      case 'checkout.session.expired': {
        const metadata = (object.metadata ?? {}) as Record<string, string>;
        if (metadata.kind === 'tickets') {
          await supabase.rpc('cancel_ticket_order', { p_session_id: object.id as string });
        }
        break;
      }

      case 'invoice.paid': {
        // Renovación: empujamos la fecha de caducidad un mes más.
        //
        // La suscripción puede ser de un usuario o de un local, y desde aquí no
        // se sabe cuál: se actualizan las dos tablas por el mismo id de Stripe,
        // y la que no lo tenga no cambia ninguna fila.
        const subscriptionId = invoiceSubscription(object);
        if (!subscriptionId) break;

        // Hasta el final del periodo que se acaba de pagar (con un día de
        // margen por si el siguiente cobro tarda); si no viene, un mes.
        const finPeriodo = invoicePeriodEnd(object);
        const expires = finPeriodo ? new Date(finPeriodo) : new Date();
        if (finPeriodo) expires.setDate(expires.getDate() + 1);
        else expires.setMonth(expires.getMonth() + 1);

        await Promise.all([
          supabase
            .from('premium_subscriptions')
            .update({ status: 'active', expires_at: expires.toISOString() })
            .eq('stripe_subscription_id', subscriptionId),
          supabase
            .from('venue_subscriptions')
            .update({ status: 'active', expires_at: expires.toISOString() })
            .eq('stripe_subscription_id', subscriptionId),
        ]);
        break;
      }

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        // En `customer.subscription.deleted` el objeto es la suscripción; en
        // `invoice.payment_failed`, la factura (su id es el de la factura, no
        // el de la suscripción).
        const subscriptionId =
          event.type === 'customer.subscription.deleted' ? (object.id as string | null) : invoiceSubscription(object);
        if (!subscriptionId) break;

        await Promise.all([
          supabase
            .from('premium_subscriptions')
            .update({ status: 'cancelled' })
            .eq('stripe_subscription_id', subscriptionId),
          // El local no pierde el plan de golpe: se queda cancelado y conserva
          // lo pagado hasta que caduque, que es lo que dice el contrato.
          supabase
            .from('venue_subscriptions')
            .update({ status: 'cancelled', cancel_at_period_end: true })
            .eq('stripe_subscription_id', subscriptionId),
        ]);
        break;
      }

      default:
        // Los demás eventos no nos afectan.
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error procesando el evento', { status: 500 });
  }
});
