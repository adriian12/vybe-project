-- Las entradas de 0 € se «venden» aunque el negocio no tenga los cobros de
-- Stripe activados: hay fiestas gratuitas que reparten entradas para llevar
-- el control de quién viene. Antes la ficha sólo enseñaba entradas si el
-- negocio ya cobraba con Stripe, así que las gratuitas no salían.
--
-- También se ordenan como en Ventas: entrada, entrada VIP y mesa VIP.

CREATE OR REPLACE FUNCTION public.get_event_ticket_types(p_event_id UUID)
RETURNS TABLE(
    id UUID, kind TEXT, name TEXT, description TEXT, price_cents INTEGER, remaining INTEGER,
    guests INTEGER, min_spend_cents INTEGER, max_per_order INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.id, t.kind, t.name, t.description, t.price_cents,
           CASE WHEN t.capacity IS NULL THEN NULL
                ELSE GREATEST(t.capacity - public.ticket_type_taken(t.id), 0) END,
           t.guests, t.min_spend_cents, t.max_per_order
    FROM public.ticket_types t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.venues v ON v.id = t.venue_id
    WHERE t.event_id = p_event_id
      AND t.active
      AND e.end_date > NOW()
      AND (t.price_cents = 0 OR COALESCE(v.stripe_charges_enabled, FALSE))
      AND public.venue_has_feature(t.venue_id, 'ticket_sales')
    ORDER BY CASE t.kind WHEN 'entry' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END, t.price_cents;
$$;
