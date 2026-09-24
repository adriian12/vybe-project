-- 069: Stripe Connect. Las entradas y mesas se cobran a nombre del local y el
-- dinero va a su cuenta de Stripe (Express); la plataforma se queda su
-- comisión (`application_fee`) si la hay.
--
-- La cuenta del local la crea y la consulta la Edge Function `stripe-connect`
-- (alta con los datos que ya tenemos, estado, panel de pagos y devoluciones).
-- Sin cobros activos no se vende: `get_event_ticket_types` no enseña nada y
-- `create_ticket_order` responde PAYMENTS_NOT_ENABLED.

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS stripe_account_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stripe_requirements JSONB,
    ADD COLUMN IF NOT EXISTS stripe_updated_at TIMESTAMPTZ;

ALTER TABLE public.ticket_orders
    ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
    ADD COLUMN IF NOT EXISTS application_fee_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refunded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_orders_pi ON public.ticket_orders(payment_intent_id);

-- El local no puede escribirse a mano la cuenta ni el estado de cobros.
CREATE OR REPLACE FUNCTION public.protect_venue_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    NEW.is_verified         := OLD.is_verified;
    NEW.verification_status := OLD.verification_status;

    -- El radio decide hasta dónde llega la geocerca del evento. Lo fija el tipo
    -- de local al darse de alta; cambiarlo a voluntad permitiría hacer que
    -- «estar dentro» significara media isla.
    NEW.event_radius := OLD.event_radius;

    -- Una vez aprobado, el nombre y el NIF quedan fijos: si no, se podría
    -- verificar una identidad y operar con otra.
    IF COALESCE(OLD.is_verified, FALSE) THEN
        NEW.name   := OLD.name;
        NEW.tax_id := OLD.tax_id;
    END IF;

    -- Stripe Connect: sólo lo escribe la Edge Function (service_role). Si no,
    -- un local podría apuntar sus ventas a otra cuenta o darse cobros activos.
    NEW.stripe_account_id        := OLD.stripe_account_id;
    NEW.stripe_charges_enabled   := OLD.stripe_charges_enabled;
    NEW.stripe_payouts_enabled   := OLD.stripe_payouts_enabled;
    NEW.stripe_details_submitted := OLD.stripe_details_submitted;
    NEW.stripe_requirements      := OLD.stripe_requirements;
    NEW.stripe_updated_at        := OLD.stripe_updated_at;

    RETURN NEW;
END;
$$;

-- Estado de cobros del local, para el panel.
CREATE OR REPLACE FUNCTION public.get_venue_payments_status()
RETURNS TABLE(connected BOOLEAN, charges_enabled BOOLEAN, payouts_enabled BOOLEAN,
              details_submitted BOOLEAN, pending_fields INTEGER, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL OR COALESCE(public.current_venue_role(), '') <> 'owner' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN QUERY
    SELECT v.stripe_account_id IS NOT NULL, v.stripe_charges_enabled, v.stripe_payouts_enabled,
           v.stripe_details_submitted,
           COALESCE(jsonb_array_length(v.stripe_requirements -> 'currently_due'), 0),
           v.stripe_updated_at
    FROM public.venues v WHERE v.id = v_venue;
END;
$$;

-- Sin cobros activos no se enseña nada a la venta.
CREATE OR REPLACE FUNCTION public.get_event_ticket_types(p_event_id UUID)
RETURNS TABLE(
    id UUID, kind TEXT, name TEXT, description TEXT, price_cents INTEGER,
    remaining INTEGER, guests INTEGER, min_spend_cents INTEGER, max_per_order INTEGER
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
      AND v.stripe_charges_enabled
      AND public.venue_has_feature(t.venue_id, 'ticket_sales')
    ORDER BY t.kind, t.price_cents;
$$;

CREATE OR REPLACE FUNCTION public.create_ticket_order(p_profile_id UUID, p_type_id UUID, p_quantity INTEGER)
RETURNS TABLE(order_id UUID, amount_cents INTEGER, unit_cents INTEGER, type_name TEXT, kind TEXT, event_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type public.ticket_types%ROWTYPE;
    v_event public.events%ROWTYPE;
    v_account TEXT;
    v_enabled BOOLEAN;
    v_id UUID;
BEGIN
    -- Bloquea el tipo: dos compras a la vez no pueden vender la última plaza dos veces.
    SELECT * INTO v_type FROM public.ticket_types WHERE id = p_type_id FOR UPDATE;
    IF NOT FOUND OR NOT v_type.active THEN
        RAISE EXCEPTION 'SALES_CLOSED';
    END IF;
    SELECT * INTO v_event FROM public.events WHERE id = v_type.event_id;
    IF v_event.end_date <= NOW() OR NOT public.venue_has_feature(v_type.venue_id, 'ticket_sales') THEN
        RAISE EXCEPTION 'SALES_CLOSED';
    END IF;
    SELECT stripe_account_id, stripe_charges_enabled INTO v_account, v_enabled
    FROM public.venues WHERE id = v_type.venue_id;
    IF v_account IS NULL OR NOT v_enabled THEN
        RAISE EXCEPTION 'PAYMENTS_NOT_ENABLED';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > v_type.max_per_order THEN
        RAISE EXCEPTION 'BAD_QUANTITY';
    END IF;
    IF v_type.capacity IS NOT NULL
       AND public.ticket_type_taken(p_type_id) + p_quantity > v_type.capacity THEN
        RAISE EXCEPTION 'SOLD_OUT';
    END IF;

    INSERT INTO public.ticket_orders (
        ticket_type_id, event_id, venue_id, profile_id, quantity, unit_cents, amount_cents, stripe_account_id
    )
    VALUES (
        p_type_id, v_type.event_id, v_type.venue_id, p_profile_id, p_quantity,
        v_type.price_cents, v_type.price_cents * p_quantity, v_account
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_type.price_cents * p_quantity, v_type.price_cents,
                        v_type.name, v_type.kind, v_event.name;
END;
$$;

-- Devolución confirmada por Stripe: el pedido y sus entradas dejan de valer.
CREATE OR REPLACE FUNCTION public.mark_ticket_order_refunded(p_order_id UUID, p_by UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.ticket_orders
    SET status = 'refunded', refunded_at = COALESCE(refunded_at, NOW()), refunded_by = COALESCE(refunded_by, p_by)
    WHERE id = p_order_id AND status = 'paid';
    UPDATE public.tickets SET status = 'refunded' WHERE order_id = p_order_id AND status <> 'refunded';
$$;

-- Compras del evento con su estado, lo que recibe el local y si se puede devolver.
DROP FUNCTION IF EXISTS public.get_ticket_orders(UUID);
CREATE FUNCTION public.get_ticket_orders(p_event_id UUID)
RETURNS TABLE(
    id UUID, buyer TEXT, type_name TEXT, kind TEXT, quantity INTEGER, amount_cents INTEGER,
    net_cents INTEGER, status TEXT, paid_at TIMESTAMPTZ, refunded_at TIMESTAMPTZ, used INTEGER, refundable BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.events WHERE events.id = p_event_id;
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR (public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner')) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT o.id, split_part(COALESCE(p.name, ''), ' ', 1), t.name, t.kind, o.quantity, o.amount_cents,
           o.amount_cents - o.application_fee_cents, o.status, o.paid_at, o.refunded_at,
           (SELECT COUNT(*) FROM public.tickets tk WHERE tk.order_id = o.id AND tk.status = 'used')::INTEGER,
           (o.status = 'paid' AND o.payment_intent_id IS NOT NULL)
    FROM public.ticket_orders o
    JOIN public.ticket_types t ON t.id = o.ticket_type_id
    JOIN public.profiles p ON p.id = o.profile_id
    WHERE o.event_id = p_event_id AND o.status IN ('paid', 'refunded')
    ORDER BY o.paid_at DESC
    LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_venue_payments_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_ticket_order_refunded(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ticket_orders(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_ticket_types(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_ticket_order(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_venue_payments_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_ticket_order_refunded(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ticket_orders(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_types(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(UUID, UUID, INTEGER) TO service_role;
