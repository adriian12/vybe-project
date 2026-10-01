-- 068: entradas y mesas, comisiones de RRPP, valoraciones, avisos por público y
-- previsión de asistencia.
--
-- Qué incluye cada plan (la interfaz lo repite en src/lib/venue-plans.ts):
--   · Business: venta de entradas y reservas de mesa, comisiones de RRPP.
--   · Pro y Business: valoraciones de clientes, avisos a públicos concretos.
--   · Todos (también sin suscripción): previsión de asistencia.
--
-- El dinero de las entradas lo cobra la plataforma con Stripe; el panel del
-- local ve lo vendido para liquidarlo. Todo se toca con funciones: las tablas
-- nuevas tienen RLS sin policies.

-- ===========================================================================
-- Qué función tiene cada plan
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.venue_has_feature(p_venue_id UUID, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        CASE
            WHEN p_feature IN ('ticket_sales', 'promoter_commissions')
                THEN public.venue_plan(p_venue_id) = 'business'
            WHEN p_feature IN ('ratings', 'segmented_broadcasts')
                THEN public.venue_plan(p_venue_id) IN ('pro', 'business')
            WHEN p_feature = 'forecast' THEN TRUE
            ELSE FALSE
        END,
        FALSE
    );
$$;

-- ===========================================================================
-- 1. Entradas y mesas (Business)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('entry', 'table')),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 280),
    -- En una mesa es la señal que se paga al reservar.
    price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 100 AND 500000),
    -- Entradas a la venta o número de mesas. NULL = sin límite (sólo entradas).
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    -- Mesas: personas por mesa y consumo mínimo (informativo).
    guests INTEGER CHECK (guests IS NULL OR guests BETWEEN 1 AND 50),
    min_spend_cents INTEGER CHECK (min_spend_cents IS NULL OR min_spend_cents >= 0),
    max_per_order INTEGER NOT NULL DEFAULT 6 CHECK (max_per_order BETWEEN 1 AND 20),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON public.ticket_types(event_id);

CREATE TABLE IF NOT EXISTS public.ticket_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    unit_cents INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
    stripe_session_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_type ON public.ticket_orders(ticket_type_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_event ON public.ticket_orders(event_id, status);

CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
    ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'used', 'refunded')),
    used_at TIMESTAMPTZ,
    used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_profile ON public.tickets(profile_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON public.tickets(event_id);

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Plazas ocupadas: vendidas más pedidos en curso (la pasarela caduca a los 30 min).
CREATE OR REPLACE FUNCTION public.ticket_type_taken(p_type_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(o.quantity), 0)::INTEGER
    FROM public.ticket_orders o
    WHERE o.ticket_type_id = p_type_id
      AND (o.status = 'paid' OR (o.status = 'pending' AND o.created_at > NOW() - INTERVAL '31 minutes'));
$$;

-- Crear o editar un tipo de entrada o de mesa. Sólo el propietario, en Business.
CREATE OR REPLACE FUNCTION public.save_ticket_type(
    p_id UUID,
    p_event_id UUID,
    p_kind TEXT,
    p_name TEXT,
    p_description TEXT,
    p_price_cents INTEGER,
    p_capacity INTEGER,
    p_guests INTEGER DEFAULT NULL,
    p_min_spend_cents INTEGER DEFAULT NULL,
    p_max_per_order INTEGER DEFAULT 6,
    p_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
    v_end TIMESTAMPTZ;
    v_id UUID;
    v_taken INTEGER;
BEGIN
    SELECT venue_id, end_date INTO v_venue, v_end FROM public.events WHERE id = p_event_id;
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND';
    END IF;
    IF NOT (public.is_admin()
            OR (public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner')) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    IF v_end < NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    IF p_kind NOT IN ('entry', 'table') THEN
        RAISE EXCEPTION 'INVALID_KIND';
    END IF;
    IF p_kind = 'table' AND p_capacity IS NULL THEN
        RAISE EXCEPTION 'TABLES_NEED_CAPACITY';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.ticket_types (
            event_id, venue_id, kind, name, description, price_cents, capacity,
            guests, min_spend_cents, max_per_order, active
        )
        VALUES (
            p_event_id, v_venue, p_kind, btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''),
            p_price_cents, p_capacity,
            CASE WHEN p_kind = 'table' THEN p_guests END,
            CASE WHEN p_kind = 'table' THEN p_min_spend_cents END,
            CASE WHEN p_kind = 'table' THEN 1 ELSE COALESCE(p_max_per_order, 6) END,
            COALESCE(p_active, TRUE)
        )
        RETURNING id INTO v_id;
        RETURN v_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.ticket_types WHERE id = p_id AND event_id = p_event_id) THEN
        RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND';
    END IF;

    v_taken := public.ticket_type_taken(p_id);
    IF p_capacity IS NOT NULL AND p_capacity < v_taken THEN
        RAISE EXCEPTION 'CAPACITY_BELOW_SOLD';
    END IF;

    UPDATE public.ticket_types
    SET name = btrim(p_name),
        description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        price_cents = p_price_cents,
        capacity = p_capacity,
        guests = CASE WHEN kind = 'table' THEN p_guests END,
        min_spend_cents = CASE WHEN kind = 'table' THEN p_min_spend_cents END,
        max_per_order = CASE WHEN kind = 'table' THEN 1 ELSE COALESCE(p_max_per_order, 6) END,
        active = COALESCE(p_active, TRUE),
        updated_at = NOW()
    WHERE id = p_id;

    RETURN p_id;
END;
$$;

-- Lo que ve el público en la ficha de la fiesta.
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
    WHERE t.event_id = p_event_id
      AND t.active
      AND e.end_date > NOW()
      AND public.venue_has_feature(t.venue_id, 'ticket_sales')
    ORDER BY t.kind, t.price_cents;
$$;

-- Reserva de plazas antes de ir a Stripe (lo llama stripe-checkout).
CREATE OR REPLACE FUNCTION public.create_ticket_order(p_profile_id UUID, p_type_id UUID, p_quantity INTEGER)
RETURNS TABLE(order_id UUID, amount_cents INTEGER, unit_cents INTEGER, type_name TEXT, kind TEXT, event_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type public.ticket_types%ROWTYPE;
    v_event public.events%ROWTYPE;
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
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > v_type.max_per_order THEN
        RAISE EXCEPTION 'BAD_QUANTITY';
    END IF;
    IF v_type.capacity IS NOT NULL
       AND public.ticket_type_taken(p_type_id) + p_quantity > v_type.capacity THEN
        RAISE EXCEPTION 'SOLD_OUT';
    END IF;

    INSERT INTO public.ticket_orders (
        ticket_type_id, event_id, venue_id, profile_id, quantity, unit_cents, amount_cents
    )
    VALUES (
        p_type_id, v_type.event_id, v_type.venue_id, p_profile_id, p_quantity,
        v_type.price_cents, v_type.price_cents * p_quantity
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_type.price_cents * p_quantity, v_type.price_cents,
                        v_type.name, v_type.kind, v_event.name;
END;
$$;

-- Pago confirmado (lo llama stripe-webhook). Idempotente: Stripe repite avisos.
CREATE OR REPLACE FUNCTION public.fulfill_ticket_order(p_order_id UUID, p_session_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.ticket_orders%ROWTYPE;
    v_code TEXT;
    i INTEGER;
BEGIN
    SELECT * INTO v_order FROM public.ticket_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF v_order.status = 'paid' THEN
        RETURN 0;
    END IF;

    -- Aunque el pedido hubiera caducado, si Stripe ha cobrado se entrega.
    UPDATE public.ticket_orders
    SET status = 'paid', paid_at = NOW(), stripe_session_id = COALESCE(stripe_session_id, p_session_id)
    WHERE id = p_order_id;

    FOR i IN 1..v_order.quantity LOOP
        LOOP
            v_code := 'E-' || upper(substring(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 8));
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tickets WHERE code = v_code);
        END LOOP;
        INSERT INTO public.tickets (order_id, ticket_type_id, event_id, venue_id, profile_id, code)
        VALUES (v_order.id, v_order.ticket_type_id, v_order.event_id, v_order.venue_id, v_order.profile_id, v_code);
    END LOOP;

    RETURN v_order.quantity;
END;
$$;

-- La pasarela caducó sin pagar: se liberan las plazas.
CREATE OR REPLACE FUNCTION public.cancel_ticket_order(p_session_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.ticket_orders SET status = 'cancelled'
    WHERE stripe_session_id = p_session_id AND status = 'pending';
$$;

-- Mis entradas y mesas, con el código para el QR.
CREATE OR REPLACE FUNCTION public.my_tickets()
RETURNS TABLE(
    id UUID, code TEXT, status TEXT, used_at TIMESTAMPTZ, kind TEXT, type_name TEXT,
    guests INTEGER, min_spend_cents INTEGER, unit_cents INTEGER,
    event_id UUID, event_name TEXT, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, venue_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tk.id, tk.code, tk.status, tk.used_at, tt.kind, tt.name, tt.guests, tt.min_spend_cents,
           o.unit_cents, e.id, e.name, e.start_date, e.end_date, v.name
    FROM public.tickets tk
    JOIN public.ticket_types tt ON tt.id = tk.ticket_type_id
    JOIN public.ticket_orders o ON o.id = tk.order_id
    JOIN public.events e ON e.id = tk.event_id
    JOIN public.venues v ON v.id = tk.venue_id
    WHERE tk.profile_id = public.current_profile_id()
      AND e.end_date > NOW() - INTERVAL '30 days'
    ORDER BY e.start_date DESC, tt.kind, tk.created_at;
$$;

-- Validar una entrada o mesa en la puerta (propietario o personal).
CREATE OR REPLACE FUNCTION public.validate_event_ticket(p_code TEXT)
RETURNS TABLE(
    kind TEXT, type_name TEXT, holder_name TEXT, event_name TEXT, guests INTEGER,
    already_used BOOLEAN, used_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_row RECORD;
BEGIN
    IF public.current_venue_id() IS NULL
       OR COALESCE(public.current_venue_role(), '') NOT IN ('owner', 'staff') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT tk.id, tk.status, tk.used_at, tk.venue_id, tt.kind, tt.name AS type_name, tt.guests,
           p.name AS holder, e.name AS ev_name
    INTO v_row
    FROM public.tickets tk
    JOIN public.ticket_types tt ON tt.id = tk.ticket_type_id
    JOIN public.profiles p ON p.id = tk.profile_id
    JOIN public.events e ON e.id = tk.event_id
    WHERE upper(tk.code) = upper(btrim(p_code));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND';
    END IF;
    IF v_row.venue_id IS DISTINCT FROM public.current_venue_id() THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND';
    END IF;
    IF v_row.status = 'refunded' THEN
        RAISE EXCEPTION 'TICKET_REFUNDED';
    END IF;
    IF v_row.status = 'used' THEN
        RETURN QUERY SELECT v_row.kind, v_row.type_name, v_row.holder, v_row.ev_name, v_row.guests, TRUE, v_row.used_at;
        RETURN;
    END IF;

    UPDATE public.tickets SET status = 'used', used_at = NOW(), used_by = auth.uid() WHERE id = v_row.id;
    RETURN QUERY SELECT v_row.kind, v_row.type_name, v_row.holder, v_row.ev_name, v_row.guests, FALSE, NOW();
END;
$$;

-- Ventas del evento por tipo (propietario, Business).
CREATE OR REPLACE FUNCTION public.get_ticket_sales(p_event_id UUID)
RETURNS TABLE(
    id UUID, kind TEXT, name TEXT, description TEXT, price_cents INTEGER, capacity INTEGER,
    guests INTEGER, min_spend_cents INTEGER, max_per_order INTEGER, active BOOLEAN,
    sold INTEGER, used INTEGER, revenue_cents BIGINT
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
    SELECT t.id, t.kind, t.name, t.description, t.price_cents, t.capacity, t.guests,
           t.min_spend_cents, t.max_per_order, t.active,
           COALESCE((SELECT SUM(o.quantity) FROM public.ticket_orders o
                      WHERE o.ticket_type_id = t.id AND o.status = 'paid'), 0)::INTEGER,
           (SELECT COUNT(*) FROM public.tickets tk WHERE tk.ticket_type_id = t.id AND tk.status = 'used')::INTEGER,
           COALESCE((SELECT SUM(o.amount_cents) FROM public.ticket_orders o
                      WHERE o.ticket_type_id = t.id AND o.status = 'paid'), 0)::BIGINT
    FROM public.ticket_types t
    WHERE t.event_id = p_event_id
    ORDER BY t.kind, t.price_cents;
END;
$$;

-- Últimas compras del evento (propietario, Business). Sólo el nombre de pila.
CREATE OR REPLACE FUNCTION public.get_ticket_orders(p_event_id UUID)
RETURNS TABLE(id UUID, buyer TEXT, type_name TEXT, kind TEXT, quantity INTEGER, amount_cents INTEGER, paid_at TIMESTAMPTZ)
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
    SELECT o.id, split_part(COALESCE(p.name, ''), ' ', 1), t.name, t.kind, o.quantity, o.amount_cents, o.paid_at
    FROM public.ticket_orders o
    JOIN public.ticket_types t ON t.id = o.ticket_type_id
    JOIN public.profiles p ON p.id = o.profile_id
    WHERE o.event_id = p_event_id AND o.status = 'paid'
    ORDER BY o.paid_at DESC
    LIMIT 100;
END;
$$;

-- ===========================================================================
-- 2. Comisiones de RRPP (Business)
-- ===========================================================================
ALTER TABLE public.event_codes
    ADD COLUMN IF NOT EXISTS commission_type TEXT CHECK (commission_type IN ('per_person', 'percent')),
    ADD COLUMN IF NOT EXISTS commission_value NUMERIC(10, 2) CHECK (commission_value IS NULL OR commission_value >= 0);

CREATE TABLE IF NOT EXISTS public.promoter_payouts (
    code_id UUID PRIMARY KEY REFERENCES public.event_codes(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.promoter_payouts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owner_business_for_event(p_event_id UUID, p_feature TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.events WHERE id = p_event_id;
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR (public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner')) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, p_feature) THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    RETURN v_venue;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_code_commission(p_code_id UUID, p_type TEXT, p_value NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
BEGIN
    SELECT event_id INTO v_event FROM public.event_codes WHERE id = p_code_id;
    IF v_event IS NULL THEN
        RAISE EXCEPTION 'CODE_NOT_FOUND';
    END IF;
    PERFORM public.owner_business_for_event(v_event, 'promoter_commissions');

    IF p_type IS NULL THEN
        UPDATE public.event_codes SET commission_type = NULL, commission_value = NULL WHERE id = p_code_id;
        RETURN;
    END IF;
    IF p_type NOT IN ('per_person', 'percent') OR p_value IS NULL OR p_value < 0
       OR (p_type = 'percent' AND p_value > 100)
       OR (p_type = 'per_person' AND p_value > 1000) THEN
        RAISE EXCEPTION 'INVALID_COMMISSION';
    END IF;

    UPDATE public.event_codes SET commission_type = p_type, commission_value = p_value WHERE id = p_code_id;
END;
$$;

-- Liquidación de la noche: por código, personas que trajo, lo que gastaron en
-- entradas (compradores que entraron con ese código) y la comisión.
CREATE OR REPLACE FUNCTION public.get_promoter_settlement(p_event_id UUID)
RETURNS TABLE(
    code_id UUID, code TEXT, label TEXT, promoter_name TEXT, kind TEXT,
    check_ins INTEGER, ticket_revenue_cents BIGINT,
    commission_type TEXT, commission_value NUMERIC, commission_cents BIGINT,
    paid_at TIMESTAMPTZ, paid_cents INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    PERFORM public.owner_business_for_event(p_event_id, 'promoter_commissions');

    RETURN QUERY
    WITH base AS (
        SELECT ec.id, ec.code, ec.label, ec.promoter_name, ec.kind, ec.commission_type, ec.commission_value,
               (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.code_id = ec.id)::INTEGER AS ins,
               COALESCE((
                   SELECT SUM(o.amount_cents) FROM public.ticket_orders o
                   WHERE o.event_id = p_event_id AND o.status = 'paid'
                     AND o.profile_id IN (SELECT ea.profile_id FROM public.event_attendance ea WHERE ea.code_id = ec.id)
               ), 0)::BIGINT AS revenue
        FROM public.event_codes ec
        WHERE ec.event_id = p_event_id AND ec.kind IN ('promoter', 'guest_list')
    )
    SELECT b.id, b.code, b.label, b.promoter_name, b.kind, b.ins, b.revenue,
           b.commission_type, b.commission_value,
           CASE b.commission_type
               WHEN 'per_person' THEN ROUND(b.commission_value * 100 * b.ins)::BIGINT
               WHEN 'percent' THEN ROUND(b.revenue * b.commission_value / 100)::BIGINT
               ELSE 0::BIGINT
           END,
           pp.paid_at, pp.amount_cents
    FROM base b
    LEFT JOIN public.promoter_payouts pp ON pp.code_id = b.id
    ORDER BY b.ins DESC, b.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_promoter_paid(p_code_id UUID, p_paid BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
    v_venue UUID;
    v_amount BIGINT;
BEGIN
    SELECT event_id INTO v_event FROM public.event_codes WHERE id = p_code_id;
    IF v_event IS NULL THEN
        RAISE EXCEPTION 'CODE_NOT_FOUND';
    END IF;
    v_venue := public.owner_business_for_event(v_event, 'promoter_commissions');

    IF NOT p_paid THEN
        DELETE FROM public.promoter_payouts WHERE code_id = p_code_id;
        RETURN;
    END IF;

    SELECT s.commission_cents INTO v_amount
    FROM public.get_promoter_settlement(v_event) s WHERE s.code_id = p_code_id;

    INSERT INTO public.promoter_payouts (code_id, event_id, venue_id, amount_cents, paid_by)
    VALUES (p_code_id, v_event, v_venue, COALESCE(v_amount, 0), auth.uid())
    ON CONFLICT (code_id) DO UPDATE
        SET amount_cents = EXCLUDED.amount_cents, paid_at = NOW(), paid_by = EXCLUDED.paid_by;
END;
$$;

-- ===========================================================================
-- 3. Valoraciones (el usuario valora; el local las ve en Pro y Business)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.event_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    overall SMALLINT NOT NULL CHECK (overall BETWEEN 1 AND 5),
    music SMALLINT CHECK (music IS NULL OR music BETWEEN 1 AND 5),
    atmosphere SMALLINT CHECK (atmosphere IS NULL OR atmosphere BETWEEN 1 AND 5),
    price SMALLINT CHECK (price IS NULL OR price BETWEEN 1 AND 5),
    comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_event_ratings_venue ON public.event_ratings(venue_id, created_at DESC);
ALTER TABLE public.event_ratings ENABLE ROW LEVEL SECURITY;

-- Sólo valora quien estuvo dentro, y una vez por fiesta (puede cambiarla).
CREATE OR REPLACE FUNCTION public.rate_event(
    p_event_id UUID,
    p_overall INTEGER,
    p_music INTEGER DEFAULT NULL,
    p_atmosphere INTEGER DEFAULT NULL,
    p_price INTEGER DEFAULT NULL,
    p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_venue UUID;
BEGIN
    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.event_attendance
                   WHERE event_id = p_event_id AND profile_id = v_profile) THEN
        RAISE EXCEPTION 'NOT_ATTENDED';
    END IF;
    SELECT venue_id INTO v_venue FROM public.events WHERE id = p_event_id;
    IF p_overall NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'INVALID_RATING';
    END IF;

    INSERT INTO public.event_ratings (event_id, venue_id, profile_id, overall, music, atmosphere, price, comment)
    VALUES (
        p_event_id, v_venue, v_profile, p_overall,
        CASE WHEN p_music BETWEEN 1 AND 5 THEN p_music END,
        CASE WHEN p_atmosphere BETWEEN 1 AND 5 THEN p_atmosphere END,
        CASE WHEN p_price BETWEEN 1 AND 5 THEN p_price END,
        NULLIF(left(btrim(COALESCE(p_comment, '')), 500), '')
    )
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET overall = EXCLUDED.overall, music = EXCLUDED.music, atmosphere = EXCLUDED.atmosphere,
            price = EXCLUDED.price, comment = EXCLUDED.comment, updated_at = NOW();
END;
$$;

-- La fiesta que toca valorar: una en la que estuviste, de la que ya saliste o
-- que ya terminó, de los últimos tres días y sin valorar.
CREATE OR REPLACE FUNCTION public.my_pending_rating()
RETURNS TABLE(event_id UUID, event_name TEXT, venue_name TEXT, start_date TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.id, e.name, v.name, e.start_date
    FROM public.event_attendance ea
    JOIN public.events e ON e.id = ea.event_id
    JOIN public.venues v ON v.id = e.venue_id
    WHERE ea.profile_id = public.current_profile_id()
      AND (ea.left_at IS NOT NULL OR e.end_date < NOW())
      AND COALESCE(ea.left_at, e.end_date) > NOW() - INTERVAL '3 days'
      AND NOT COALESCE(e.test_lab, FALSE)
      AND NOT EXISTS (SELECT 1 FROM public.event_ratings r
                      WHERE r.event_id = e.id AND r.profile_id = ea.profile_id)
    ORDER BY COALESCE(ea.left_at, e.end_date) DESC
    LIMIT 1;
$$;

-- Nota pública: la de la fiesta y la del local (180 días). Con menos de tres
-- valoraciones no se enseña media.
CREATE OR REPLACE FUNCTION public.get_event_rating(p_event_id UUID)
RETURNS TABLE(event_avg NUMERIC, event_count INTEGER, venue_avg NUMERIC, venue_count INTEGER, my_rating INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH ev AS (SELECT venue_id FROM public.events WHERE id = p_event_id),
    e AS (SELECT AVG(overall) a, COUNT(*)::INTEGER n FROM public.event_ratings WHERE event_id = p_event_id),
    v AS (SELECT AVG(r.overall) a, COUNT(*)::INTEGER n FROM public.event_ratings r, ev
          WHERE r.venue_id = ev.venue_id AND r.created_at > NOW() - INTERVAL '180 days')
    SELECT CASE WHEN e.n >= 3 THEN ROUND(e.a, 1) END, e.n,
           CASE WHEN v.n >= 3 THEN ROUND(v.a, 1) END, v.n,
           (SELECT r.overall::INTEGER FROM public.event_ratings r
             WHERE r.event_id = p_event_id AND r.profile_id = public.current_profile_id())
    FROM e, v;
$$;

-- Panel del local (Pro y Business): medias, reparto, por noche y comentarios.
-- Los comentarios van sin nombre.
CREATE OR REPLACE FUNCTION public.get_venue_ratings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ratings') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;

    RETURN jsonb_build_object(
        'summary', (
            SELECT jsonb_build_object(
                'count', COUNT(*),
                'overall', ROUND(AVG(overall), 2),
                'music', ROUND(AVG(music), 2),
                'atmosphere', ROUND(AVG(atmosphere), 2),
                'price', ROUND(AVG(price), 2),
                'last30', ROUND(AVG(overall) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 2),
                'prev30', ROUND(AVG(overall) FILTER (WHERE created_at <= NOW() - INTERVAL '30 days'
                                                    AND created_at > NOW() - INTERVAL '60 days'), 2)
            )
            FROM public.event_ratings WHERE venue_id = v_venue
        ),
        'distribution', (
            SELECT jsonb_agg(jsonb_build_object('stars', s, 'count',
                   (SELECT COUNT(*) FROM public.event_ratings r WHERE r.venue_id = v_venue AND r.overall = s))
                   ORDER BY s DESC)
            FROM generate_series(1, 5) s
        ),
        'nights', COALESCE((
            SELECT jsonb_agg(n ORDER BY n->>'start_date' DESC)
            FROM (
                SELECT jsonb_build_object(
                    'event_id', e.id, 'name', e.name, 'start_date', e.start_date,
                    'avg', ROUND(AVG(r.overall), 2), 'count', COUNT(*)
                ) AS n
                FROM public.event_ratings r JOIN public.events e ON e.id = r.event_id
                WHERE r.venue_id = v_venue
                GROUP BY e.id, e.name, e.start_date
                ORDER BY e.start_date DESC
                LIMIT 12
            ) x
        ), '[]'::jsonb),
        'comments', COALESCE((
            SELECT jsonb_agg(c ORDER BY c->>'created_at' DESC)
            FROM (
                SELECT jsonb_build_object(
                    'overall', r.overall, 'comment', r.comment, 'created_at', r.created_at, 'event_name', e.name
                ) AS c
                FROM public.event_ratings r JOIN public.events e ON e.id = r.event_id
                WHERE r.venue_id = v_venue AND r.comment IS NOT NULL
                ORDER BY r.created_at DESC
                LIMIT 30
            ) y
        ), '[]'::jsonb)
    );
END;
$$;

-- ===========================================================================
-- 4. Avisos a públicos concretos (Pro y Business)
-- ===========================================================================
ALTER TABLE public.broadcasts
    ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'inside'
        CHECK (audience IN ('inside', 'followers', 'regulars', 'no_show', 'never_came'));

-- Quién es cada público. Una sola definición para contar y para enviar.
CREATE OR REPLACE FUNCTION public.audience_members(p_venue_id UUID, p_audience TEXT, p_event_id UUID)
RETURNS TABLE(profile_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id
    FROM public.profiles p
    WHERE p.status = 'active'
      AND p.notify_events
      AND CASE p_audience
          WHEN 'followers' THEN EXISTS (
              SELECT 1 FROM public.venue_followers f WHERE f.venue_id = p_venue_id AND f.profile_id = p.id)
          WHEN 'regulars' THEN (
              SELECT COUNT(DISTINCT ea.event_id) FROM public.event_attendance ea
              JOIN public.events e ON e.id = ea.event_id
              WHERE e.venue_id = p_venue_id AND ea.profile_id = p.id AND NOT COALESCE(e.test_lab, FALSE)) >= 3
          WHEN 'no_show' THEN p_event_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.event_intents i WHERE i.event_id = p_event_id AND i.profile_id = p.id)
              AND NOT EXISTS (SELECT 1 FROM public.event_attendance ea
                              WHERE ea.event_id = p_event_id AND ea.profile_id = p.id)
          WHEN 'never_came' THEN EXISTS (
                  SELECT 1 FROM public.venue_followers f WHERE f.venue_id = p_venue_id AND f.profile_id = p.id)
              AND NOT EXISTS (SELECT 1 FROM public.event_attendance ea
                              JOIN public.events e ON e.id = ea.event_id
                              WHERE e.venue_id = p_venue_id AND ea.profile_id = p.id)
          ELSE FALSE
      END;
$$;

CREATE OR REPLACE FUNCTION public.count_broadcast_audience(p_audience TEXT, p_event_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_event_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND venue_id = v_venue) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN (SELECT COUNT(*) FROM public.audience_members(v_venue, p_audience, p_event_id))::INTEGER;
END;
$$;

-- Aviso a un público del local. «Dentro ahora» sigue por queue_broadcast().
CREATE OR REPLACE FUNCTION public.queue_audience_broadcast(
    p_audience TEXT,
    p_title TEXT,
    p_body TEXT,
    p_event_id UUID DEFAULT NULL,
    p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
    v_id UUID;
    v_recientes INTEGER;
    v_programados INTEGER;
BEGIN
    IF p_audience = 'inside' THEN
        RETURN public.queue_broadcast(p_title, p_body, p_event_id, NULL, p_scheduled_at);
    END IF;
    IF p_audience NOT IN ('followers', 'regulars', 'no_show', 'never_came') THEN
        RAISE EXCEPTION 'INVALID_AUDIENCE';
    END IF;
    IF v_venue IS NULL OR COALESCE(public.current_venue_role(), '') NOT IN ('owner', 'marketing') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'segmented_broadcasts') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    IF p_event_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND venue_id = v_venue) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_audience = 'no_show' AND (p_event_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.events WHERE id = p_event_id AND start_date < NOW())) THEN
        RAISE EXCEPTION 'NO_SHOW_NEEDS_STARTED_EVENT';
    END IF;
    IF btrim(COALESCE(p_title, '')) = '' OR btrim(COALESCE(p_body, '')) = '' THEN
        RAISE EXCEPTION 'EMPTY_MESSAGE';
    END IF;
    IF p_scheduled_at IS NOT NULL AND p_scheduled_at < NOW() - INTERVAL '2 minutes' THEN
        RAISE EXCEPTION 'SCHEDULE_IN_PAST';
    END IF;

    -- Que un local no pueda bombardear a sus seguidores: 5 avisos de público al día.
    SELECT COUNT(*) INTO v_recientes FROM public.broadcasts
    WHERE venue_id = v_venue AND audience <> 'inside' AND created_at > NOW() - INTERVAL '24 hours';
    IF v_recientes >= 5 THEN
        RAISE EXCEPTION 'AUDIENCE_DAILY_LIMIT';
    END IF;

    IF p_scheduled_at IS NOT NULL THEN
        SELECT COUNT(*) INTO v_programados FROM public.broadcasts
        WHERE venue_id = v_venue AND status = 'pending' AND scheduled_at IS NOT NULL;
        IF v_programados >= public.venue_scheduled_broadcast_limit(v_venue) THEN
            RAISE EXCEPTION 'SCHEDULE_LIMIT';
        END IF;
    END IF;

    INSERT INTO public.broadcasts (event_id, venue_id, created_by, title, body, url, scheduled_at, audience)
    VALUES (
        p_event_id, v_venue, auth.uid(), btrim(p_title), btrim(p_body),
        CASE WHEN p_event_id IS NOT NULL THEN '/event/' || p_event_id ELSE '/local/' || v_venue END,
        p_scheduled_at, p_audience
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Destinatarios de un aviso: «dentro ahora» como hasta ahora; el resto, su público.
CREATE OR REPLACE FUNCTION public.broadcast_recipients(p_broadcast_id UUID)
RETURNS TABLE(profile_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    b public.broadcasts%ROWTYPE;
BEGIN
    SELECT * INTO b FROM public.broadcasts WHERE id = p_broadcast_id AND status = 'pending';
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF b.audience IS DISTINCT FROM 'inside' THEN
        RETURN QUERY SELECT m.profile_id FROM public.audience_members(b.venue_id, b.audience, b.event_id) m;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id
    FROM public.profiles p
    WHERE p.status = 'active'
      AND p.notify_events
      AND (
          b.event_id IS NULL
          OR EXISTS (
              SELECT 1 FROM public.event_attendance ea
              WHERE ea.event_id = b.event_id
                AND ea.profile_id = p.id
                AND ea.left_at IS NULL
                AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
          )
      );
END;
$$;

-- ===========================================================================
-- 5. Previsión de asistencia (todos los planes)
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_event_forecast(p_event_id UUID)
RETURNS TABLE(
    intents INTEGER, past_nights INTEGER, expected_checkins INTEGER, expected_total INTEGER,
    low INTEGER, high INTEGER, capacity INTEGER, confidence TEXT, full_risk BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_event public.events%ROWTYPE;
    v_intents INTEGER;
    v_nights INTEGER;
    v_conversion NUMERIC;
    v_dow_avg NUMERIC;
    v_all_avg NUMERIC;
    v_share NUMERIC;
    v_checkins NUMERIC;
    v_total NUMERIC;
    v_margin NUMERIC;
    v_conf TEXT;
    v_ref NUMERIC;
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;

    SELECT COUNT(*) INTO v_intents FROM public.event_intents WHERE event_id = p_event_id;

    WITH past AS (
        SELECT
            (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = e.id)::NUMERIC AS ins,
            (SELECT COUNT(*) FROM public.event_intents i WHERE i.event_id = e.id)::NUMERIC AS intents,
            (SELECT MAX(l.total) FROM public.event_headcount_log l WHERE l.event_id = e.id)::NUMERIC AS peak,
            EXTRACT(ISODOW FROM e.start_date AT TIME ZONE 'Europe/Madrid')::INTEGER AS dow
        FROM public.events e
        WHERE e.venue_id = v_event.venue_id
          AND e.id <> p_event_id
          AND e.end_date < NOW()
          AND e.start_date > NOW() - INTERVAL '120 days'
          AND NOT COALESCE(e.test_lab, FALSE)
    )
    SELECT
        COUNT(*) FILTER (WHERE ins > 0),
        SUM(ins) FILTER (WHERE intents > 0 AND ins > 0) / NULLIF(SUM(intents) FILTER (WHERE intents > 0 AND ins > 0), 0),
        AVG(ins) FILTER (WHERE ins > 0
            AND dow = EXTRACT(ISODOW FROM v_event.start_date AT TIME ZONE 'Europe/Madrid')::INTEGER),
        AVG(ins) FILTER (WHERE ins > 0),
        AVG(LEAST(ins / NULLIF(peak, 0), 1)) FILTER (WHERE peak > 0 AND ins > 0)
    INTO v_nights, v_conversion, v_dow_avg, v_all_avg, v_share
    FROM past;

    v_conversion := LEAST(GREATEST(v_conversion, 0.2), 6);
    v_ref := COALESCE(v_dow_avg, v_all_avg);

    IF v_intents > 0 AND v_conversion IS NOT NULL AND v_ref IS NOT NULL THEN
        v_checkins := 0.6 * v_intents * v_conversion + 0.4 * v_ref;
    ELSIF v_intents > 0 AND v_conversion IS NOT NULL THEN
        v_checkins := v_intents * v_conversion;
    ELSIF v_ref IS NOT NULL THEN
        v_checkins := GREATEST(v_ref, v_intents * 0.6);
    ELSE
        -- Sin historial: de media viene algo más de la mitad de quien dice que va.
        v_checkins := v_intents * 0.6;
    END IF;

    -- Del aforo real que da la puerta sale qué parte del público usa la app.
    IF v_share IS NOT NULL THEN
        v_total := v_checkins / GREATEST(v_share, 0.02);
    END IF;

    v_conf := CASE WHEN v_nights >= 6 THEN 'high' WHEN v_nights >= 2 THEN 'medium' ELSE 'low' END;
    v_margin := CASE v_conf WHEN 'high' THEN 0.12 WHEN 'medium' THEN 0.2 ELSE 0.35 END;

    RETURN QUERY SELECT
        v_intents,
        v_nights,
        ROUND(v_checkins)::INTEGER,
        CASE WHEN v_total IS NOT NULL THEN ROUND(v_total)::INTEGER END,
        ROUND(COALESCE(v_total, v_checkins) * (1 - v_margin))::INTEGER,
        ROUND(COALESCE(v_total, v_checkins) * (1 + v_margin))::INTEGER,
        v_event.max_capacity,
        v_conf,
        COALESCE(v_event.max_capacity IS NOT NULL
                 AND COALESCE(v_total, v_checkins) >= 0.9 * v_event.max_capacity, FALSE);
END;
$$;

-- ===========================================================================
-- Permisos
-- ===========================================================================
REVOKE ALL ON FUNCTION public.venue_has_feature(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ticket_type_taken(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_ticket_type(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_ticket_types(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_ticket_order(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_ticket_order(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_ticket_order(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_tickets() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_event_ticket(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ticket_sales(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ticket_orders(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_business_for_event(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_code_commission(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_promoter_settlement(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_promoter_paid(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rate_event(UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_pending_rating() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_rating(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_venue_ratings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audience_members(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_broadcast_audience(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_audience_broadcast(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.broadcast_recipients(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_event_forecast(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.venue_has_feature(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ticket_type_taken(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_ticket_type(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_types(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_ticket_order(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_ticket_order(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_tickets() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_event_ticket(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ticket_sales(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ticket_orders(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owner_business_for_event(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_code_commission(UUID, TEXT, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_promoter_settlement(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_promoter_paid(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rate_event(UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_pending_rating() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_rating(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_venue_ratings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audience_members(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_broadcast_audience(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.queue_audience_broadcast(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_recipients(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_event_forecast(UUID) TO authenticated, service_role;
