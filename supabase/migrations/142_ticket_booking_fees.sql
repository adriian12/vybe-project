-- ============================================================================
-- 142 · Gastos de gestión en las entradas, en lugar de la comisión por local
-- ============================================================================
-- Hasta ahora la plataforma cobraba a cada negocio un % de sus ventas
-- (`venues.platform_fee_percent`, que fijaba administración). Desde el
-- 23-11-2026, como hacen las ticketeras, quien compra paga unos gastos de
-- gestión encima del precio y el negocio cobra el precio entero:
--
--   · 10 % del precio de cada entrada, redondeado al céntimo, máximo 5 €.
--   · Entradas gratis: 0 (el 10 % de 0 es 0).
--   · Sólo las que se venden en Fiestea; las de otras webs (enlace externo) no.
--   · Van a la cuenta de Stripe de Fiestea como `application_fee_amount`.
--
-- La misma regla está en `src/lib/booking-fee.ts` y en
-- `supabase/functions/_shared/booking-fee.ts`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ticket_booking_fee_cents(p_unit_cents INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN COALESCE(p_unit_cents, 0) <= 0 THEN 0
                ELSE LEAST(500, ROUND(p_unit_cents * 0.10)::INTEGER) END;
$$;
GRANT EXECUTE ON FUNCTION public.ticket_booking_fee_cents(INTEGER) TO authenticated, service_role;

-- Gastos de gestión del pedido (todas sus entradas). `amount_cents` sigue siendo
-- lo que cobra el negocio y `application_fee_cents` su comisión (ahora 0), así
-- que lo neto del negocio (`get_ticket_orders`) no cambia.
ALTER TABLE public.ticket_orders
    ADD COLUMN IF NOT EXISTS booking_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (booking_fee_cents >= 0);

-- Fuera la comisión por local: los gastos de gestión la sustituyen.
UPDATE public.venues SET platform_fee_percent = 0 WHERE platform_fee_percent <> 0;

-- El resumen del pedido (TicketOrderPage) enseña también los gastos de gestión.
DROP FUNCTION IF EXISTS public.get_my_ticket_order(UUID);
CREATE FUNCTION public.get_my_ticket_order(p_order_id UUID)
RETURNS TABLE(order_id UUID, status TEXT, download_token TEXT, event_name TEXT, start_date TIMESTAMPTZ,
              venue_name TEXT, type_name TEXT, kind TEXT, quantity INTEGER, amount_cents INTEGER,
              add_to_account BOOLEAN, tickets JSONB, booking_fee_cents INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT o.id, o.status, o.download_token, e.name, e.start_date, v.name, tt.name, tt.kind, o.quantity,
           o.amount_cents, o.add_to_account,
           COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id', tk.id, 'code', tk.code, 'holderName', tk.holder_name,
                                                   'holderEmail', tk.holder_email) ORDER BY tk.created_at)
               FROM public.tickets tk WHERE tk.order_id = o.id
           ), '[]'::JSONB),
           o.booking_fee_cents
    FROM public.ticket_orders o
    JOIN public.events e ON e.id = o.event_id
    JOIN public.venues v ON v.id = o.venue_id
    JOIN public.ticket_types tt ON tt.id = o.ticket_type_id
    WHERE o.id = p_order_id AND o.profile_id = public.current_profile_id();
$$;
REVOKE ALL ON FUNCTION public.get_my_ticket_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_ticket_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_ticket_order(UUID) TO authenticated, service_role;
