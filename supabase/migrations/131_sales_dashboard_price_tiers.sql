-- ============================================================================
-- 131 · Ventas → Resumen y tramos de precio
-- ============================================================================
-- Fase 1 del plan del negocio (Business):
--   · `get_sales_dashboard()`: facturación, entradas, pedidos, devoluciones,
--     invitaciones y entradas validadas de todo el local en un periodo o de una
--     fiesta, por día (General / VIP / Mesas) y por fiesta.
--   · Tramos de precio por cantidad o por fecha (`ticket_price_tiers`). El
--     precio lo decide la base de datos al reservar (`create_ticket_order`),
--     con el tipo bloqueado: nadie compra a un precio que ya no existe.
--
-- Nada cambia de forma: `create_ticket_order`, `get_event_ticket_types` y
-- `get_ticket_checkout` conservan su firma y lo que devuelven (las apps
-- publicadas siguen igual); sólo el precio pasa a ser el del tramo.
-- `venue_has_feature` gana `sales_dashboard` y `price_tiers` (Business), que
-- se repiten en `src/lib/venue-plans.ts`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.venue_has_feature(p_feature text, p_venue_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_plan TEXT := public.venue_plan(p_venue_id);
BEGIN
    RETURN COALESCE(CASE p_feature
        -- En todos los planes.
        WHEN 'ticket_sales'          THEN TRUE
        WHEN 'forecast'              THEN TRUE
        -- Sólo Business.
        WHEN 'promoter_codes'        THEN v_plan = 'business'
        WHEN 'promoter_commissions'  THEN v_plan = 'business'
        WHEN 'promotions'            THEN v_plan = 'business'
        WHEN 'demographics'          THEN v_plan = 'business'
        WHEN 'csv_export'            THEN v_plan = 'business'
        WHEN 'pdf_export'            THEN v_plan = 'business'
        WHEN 'headcount_curve'       THEN v_plan = 'business'
        WHEN 'ratings'               THEN v_plan = 'business'
        WHEN 'segmented_broadcasts'  THEN v_plan = 'business'
        WHEN 'included_boost'        THEN v_plan = 'business'
        WHEN 'sales_dashboard'       THEN v_plan = 'business'
        WHEN 'price_tiers'           THEN v_plan = 'business'
        ELSE FALSE
    END, FALSE);
END;
$function$;

-- ---------------------------------------------------------- tramos de precio
-- Hasta 5 tramos por tipo de entrada, en orden. Un tramo vale mientras se
-- hayan vendido menos de `up_to` entradas (si lo tiene) y no haya pasado
-- `until_at` (si lo tiene). Vale el primero que cumpla; si ninguno, el precio
-- del tipo, que es el precio final.
CREATE TABLE IF NOT EXISTS public.ticket_price_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id) ON DELETE CASCADE,
    step SMALLINT NOT NULL CHECK (step BETWEEN 1 AND 5),
    price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 50 AND 500000),
    up_to INTEGER CHECK (up_to IS NULL OR up_to > 0),
    until_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (up_to IS NOT NULL OR until_at IS NOT NULL),
    UNIQUE (ticket_type_id, step)
);

ALTER TABLE public.ticket_price_tiers ENABLE ROW LEVEL SECURITY;
-- Sin políticas: se leen y se escriben sólo con las funciones de abajo.
REVOKE ALL ON public.ticket_price_tiers FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.ticket_price_tiers;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR DELETE OR UPDATE ON public.ticket_price_tiers
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- El precio de ahora, cuántas quedan a ese precio (NULL: sin límite por
-- cantidad) y el siguiente precio (NULL: no cambia). Sin el plan, los tramos
-- no cuentan.
CREATE OR REPLACE FUNCTION public.ticket_type_price(p_type_id UUID)
RETURNS TABLE (price_cents INTEGER, tier_left INTEGER, next_price_cents INTEGER, tier_until TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type public.ticket_types%ROWTYPE;
    v_sold INTEGER;
    v_tier public.ticket_price_tiers%ROWTYPE;
    v_next INTEGER;
BEGIN
    SELECT * INTO v_type FROM public.ticket_types WHERE id = p_type_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_type.price_cents > 0 AND public.venue_has_feature(v_type.venue_id, 'price_tiers') THEN
        v_sold := public.ticket_type_taken(p_type_id);
        SELECT * INTO v_tier
        FROM public.ticket_price_tiers t
        WHERE t.ticket_type_id = p_type_id
          AND (t.up_to IS NULL OR v_sold < t.up_to)
          AND (t.until_at IS NULL OR NOW() < t.until_at)
        ORDER BY t.step
        LIMIT 1;

        IF FOUND THEN
            SELECT t.price_cents INTO v_next
            FROM public.ticket_price_tiers t
            WHERE t.ticket_type_id = p_type_id
              AND t.step > v_tier.step
              AND (t.up_to IS NULL OR v_sold < t.up_to)
              AND (t.until_at IS NULL OR NOW() < t.until_at)
            ORDER BY t.step
            LIMIT 1;

            RETURN QUERY SELECT v_tier.price_cents,
                                CASE WHEN v_tier.up_to IS NULL THEN NULL ELSE v_tier.up_to - v_sold END,
                                COALESCE(v_next, v_type.price_cents),
                                v_tier.until_at;
            RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT v_type.price_cents, NULL::INTEGER, NULL::INTEGER, NULL::TIMESTAMPTZ;
END;
$$;

REVOKE ALL ON FUNCTION public.ticket_type_price(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticket_type_price(UUID) TO anon, authenticated, service_role;

-- Para la ficha: «Quedan 23 a este precio» y el precio siguiente.
CREATE OR REPLACE FUNCTION public.get_event_price_tiers(p_event_id UUID)
RETURNS TABLE (type_id UUID, price_cents INTEGER, tier_left INTEGER, next_price_cents INTEGER, tier_until TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.id, tp.price_cents, tp.tier_left, tp.next_price_cents, tp.tier_until
    FROM public.ticket_types t
    JOIN public.events e ON e.id = t.event_id
    CROSS JOIN LATERAL public.ticket_type_price(t.id) tp
    WHERE t.event_id = p_event_id
      AND t.active
      AND t.deleted_at IS NULL
      AND e.end_date > NOW()
      AND tp.next_price_cents IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_event_price_tiers(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_price_tiers(UUID) TO anon, authenticated;

-- El editor: los tramos de un tipo. Sólo el propietario (o administración).
CREATE OR REPLACE FUNCTION public.get_ticket_price_tiers(p_type_id UUID)
RETURNS TABLE (step SMALLINT, price_cents INTEGER, up_to INTEGER, until_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := (SELECT venue_id FROM public.ticket_types WHERE id = p_type_id);
BEGIN
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR COALESCE(public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN QUERY
    SELECT t.step, t.price_cents, t.up_to, t.until_at
    FROM public.ticket_price_tiers t
    WHERE t.ticket_type_id = p_type_id
    ORDER BY t.step;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ticket_price_tiers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_price_tiers(UUID) TO authenticated;

-- Guarda los tramos de un tipo (los sustituye todos). `p_tiers`:
-- [{ "price_cents": 1000, "up_to": 100, "until_at": null }, …], en orden.
CREATE OR REPLACE FUNCTION public.save_ticket_price_tiers(p_type_id UUID, p_tiers JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type public.ticket_types%ROWTYPE;
    v_item JSONB;
    v_pos SMALLINT := 0;
    v_price INTEGER;
    v_up_to INTEGER;
    v_until TIMESTAMPTZ;
    v_prev_up_to INTEGER := 0;
BEGIN
    SELECT * INTO v_type FROM public.ticket_types WHERE id = p_type_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND';
    END IF;
    IF NOT (public.is_admin()
        OR COALESCE(public.current_venue_id() = v_type.venue_id AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    p_tiers := COALESCE(p_tiers, '[]'::JSONB);
    IF jsonb_typeof(p_tiers) <> 'array' OR jsonb_array_length(p_tiers) > 5 THEN
        RAISE EXCEPTION 'INVALID_TIERS';
    END IF;
    IF jsonb_array_length(p_tiers) > 0 THEN
        IF NOT public.venue_has_feature(v_type.venue_id, 'price_tiers') THEN
            RAISE EXCEPTION 'PLAN_REQUIRED';
        END IF;
        -- Gratis es gratis: los tramos son para entradas de pago.
        IF v_type.price_cents = 0 OR v_type.kind = 'table' THEN
            RAISE EXCEPTION 'INVALID_TIERS';
        END IF;
    END IF;

    DELETE FROM public.ticket_price_tiers WHERE ticket_type_id = p_type_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_tiers) LOOP
        v_pos := v_pos + 1;
        v_price := (v_item->>'price_cents')::INTEGER;
        v_up_to := NULLIF(v_item->>'up_to', '')::INTEGER;
        v_until := NULLIF(v_item->>'until_at', '')::TIMESTAMPTZ;
        IF v_price IS NULL OR v_price < 50 OR v_price > 500000 THEN
            RAISE EXCEPTION 'INVALID_TIER_PRICE';
        END IF;
        IF v_up_to IS NULL AND v_until IS NULL THEN
            RAISE EXCEPTION 'INVALID_TIER_LIMIT';
        END IF;
        -- Las cantidades, cada vez mayores: «los primeros 100», «hasta 250»…
        IF v_up_to IS NOT NULL THEN
            IF v_up_to <= v_prev_up_to OR (v_type.capacity IS NOT NULL AND v_up_to > v_type.capacity) THEN
                RAISE EXCEPTION 'INVALID_TIER_LIMIT';
            END IF;
            v_prev_up_to := v_up_to;
        END IF;
        INSERT INTO public.ticket_price_tiers (ticket_type_id, step, price_cents, up_to, until_at)
        VALUES (p_type_id, v_pos, v_price, v_up_to, v_until);
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ticket_price_tiers(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ticket_price_tiers(UUID, JSONB) TO authenticated;

-- ------------------------------------------------------- resumen de ventas
-- Ventas → Resumen: todo el local en un periodo (o una fiesta). Las fechas,
-- por la de pago y en hora de España. Invitaciones fuera de la facturación.
CREATE OR REPLACE FUNCTION public.get_sales_dashboard(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_event_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
    v_result JSONB;
BEGIN
    IF v_venue IS NULL OR NOT COALESCE(public.current_venue_role() = 'owner', FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'sales_dashboard') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > INTERVAL '400 days' THEN
        RAISE EXCEPTION 'INVALID_RANGE';
    END IF;

    WITH pedidos AS (
        SELECT o.*, tt.kind, COALESCE(o.paid_at, o.created_at) AS cuando
        FROM public.ticket_orders o
        JOIN public.ticket_types tt ON tt.id = o.ticket_type_id
        WHERE o.venue_id = v_venue
          AND o.status IN ('paid', 'refunded')
          AND COALESCE(o.paid_at, o.created_at) >= p_from
          AND COALESCE(o.paid_at, o.created_at) < p_to
          AND (p_event_id IS NULL OR o.event_id = p_event_id)
    ),
    pagados AS (
        SELECT * FROM pedidos WHERE status = 'paid' AND COALESCE(source, '') <> 'comp'
    )
    SELECT jsonb_build_object(
        'kpis', jsonb_build_object(
            'revenue_cents', COALESCE((SELECT SUM(amount_cents) FROM pagados), 0),
            'tickets', COALESCE((SELECT SUM(quantity) FROM pagados), 0),
            'orders', (SELECT COUNT(*) FROM pagados),
            'refunded_cents', COALESCE((SELECT SUM(amount_cents) FROM pedidos WHERE status = 'refunded'), 0),
            'refunded_orders', (SELECT COUNT(*) FROM pedidos WHERE status = 'refunded'),
            'comps', COALESCE((SELECT SUM(quantity) FROM pedidos WHERE status = 'paid' AND source = 'comp'), 0),
            'entered', (SELECT COUNT(*) FROM public.tickets tk
                        WHERE tk.order_id IN (SELECT id FROM pedidos WHERE status = 'paid')
                          AND tk.status = 'used')
        ),
        'by_day', COALESCE((
            SELECT jsonb_agg(d ORDER BY d->>'day')
            FROM (
                SELECT jsonb_build_object(
                    'day', to_char((cuando AT TIME ZONE 'Europe/Madrid')::DATE, 'YYYY-MM-DD'),
                    'entry', COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'entry'), 0),
                    'vip', COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'vip'), 0),
                    'table', COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'table'), 0),
                    'tickets', SUM(quantity)
                ) AS d
                FROM pagados
                GROUP BY (cuando AT TIME ZONE 'Europe/Madrid')::DATE
            ) x
        ), '[]'::JSONB),
        'events', COALESCE((
            SELECT jsonb_agg(ev ORDER BY ev->>'start_date' DESC)
            FROM (
                SELECT jsonb_build_object(
                    'event_id', e.id,
                    'name', e.name,
                    'start_date', e.start_date,
                    'revenue_cents', COALESCE(SUM(p.amount_cents), 0),
                    'tickets', COALESCE(SUM(p.quantity), 0),
                    'capacity', (SELECT SUM(tt.capacity) FROM public.ticket_types tt
                                 WHERE tt.event_id = e.id AND tt.deleted_at IS NULL AND tt.kind <> 'table'),
                    'entered', (SELECT COUNT(*) FROM public.tickets tk
                                WHERE tk.event_id = e.id AND tk.status = 'used')
                ) AS ev
                FROM pagados p
                JOIN public.events e ON e.id = p.event_id
                GROUP BY e.id, e.name, e.start_date
            ) y
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_dashboard(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_dashboard(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ------------------------------------------- el precio del tramo, al vender
CREATE OR REPLACE FUNCTION public.create_ticket_order(p_profile_id uuid, p_type_id uuid, p_quantity integer, p_holders jsonb DEFAULT NULL::jsonb, p_buyer_email text DEFAULT NULL::text, p_add_to_account boolean DEFAULT true, p_marketing boolean DEFAULT false)
 RETURNS TABLE(order_id uuid, amount_cents integer, unit_cents integer, type_name text, kind text, event_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_type public.ticket_types%ROWTYPE;
    v_event public.events%ROWTYPE;
    v_account TEXT;
    v_enabled BOOLEAN;
    v_id UUID;
    v_price INTEGER;
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
    -- Ventana de venta del tipo (096).
    IF v_type.sales_start_at IS NOT NULL AND NOW() < v_type.sales_start_at THEN
        RAISE EXCEPTION 'SALES_NOT_STARTED';
    END IF;
    IF v_type.sales_end_at IS NOT NULL AND NOW() >= v_type.sales_end_at THEN
        RAISE EXCEPTION 'SALES_CLOSED';
    END IF;
    -- El precio de ahora: el del tramo que toca o el del tipo (131). Se calcula
    -- con el tipo bloqueado, así nadie compra a un precio que ya no existe.
    v_price := (SELECT tp.price_cents FROM public.ticket_type_price(p_type_id) tp);

    SELECT stripe_account_id, stripe_charges_enabled INTO v_account, v_enabled
    FROM public.venues WHERE id = v_type.venue_id;
    IF v_price > 0 AND (v_account IS NULL OR NOT v_enabled) THEN
        RAISE EXCEPTION 'PAYMENTS_NOT_ENABLED';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > v_type.max_per_order THEN
        RAISE EXCEPTION 'BAD_QUANTITY';
    END IF;
    IF v_type.capacity IS NOT NULL
       AND public.ticket_type_taken(p_type_id) + p_quantity > v_type.capacity THEN
        RAISE EXCEPTION 'SOLD_OUT';
    END IF;
    IF p_holders IS NOT NULL AND (jsonb_typeof(p_holders) <> 'array' OR jsonb_array_length(p_holders) <> p_quantity) THEN
        RAISE EXCEPTION 'BAD_HOLDERS';
    END IF;

    INSERT INTO public.ticket_orders (
        ticket_type_id, event_id, venue_id, profile_id, quantity, unit_cents, amount_cents, stripe_account_id,
        holders, buyer_email, add_to_account, marketing_opt_in, terms_accepted_at
    )
    VALUES (
        p_type_id, v_type.event_id, v_type.venue_id, p_profile_id, p_quantity,
        v_price, v_price * p_quantity, v_account,
        p_holders, NULLIF(btrim(COALESCE(p_buyer_email, '')), ''), COALESCE(p_add_to_account, TRUE),
        COALESCE(p_marketing, FALSE), NOW()
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_price * p_quantity, v_price,
                        v_type.name, v_type.kind, v_event.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_ticket_types(p_event_id uuid)
 RETURNS TABLE(id uuid, kind text, name text, description text, price_cents integer, remaining integer, guests integer, min_spend_cents integer, max_per_order integer, sales_start_at timestamp with time zone, sales_end_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT t.id, t.kind, t.name, t.description,
           (SELECT tp.price_cents FROM public.ticket_type_price(t.id) tp),
           CASE WHEN t.capacity IS NULL THEN NULL
                ELSE GREATEST(t.capacity - public.ticket_type_taken(t.id), 0) END,
           t.guests, t.min_spend_cents, t.max_per_order, t.sales_start_at, t.sales_end_at
    FROM public.ticket_types t
    JOIN public.events e ON e.id = t.event_id
    JOIN public.venues v ON v.id = t.venue_id
    WHERE t.event_id = p_event_id
      AND t.active
      AND t.deleted_at IS NULL
      AND e.end_date > NOW()
      AND (t.sales_end_at IS NULL OR t.sales_end_at > NOW())
      AND (t.price_cents = 0 OR COALESCE(v.stripe_charges_enabled, FALSE))
      AND public.venue_has_feature(t.venue_id, 'ticket_sales')
    ORDER BY CASE t.kind WHEN 'entry' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END, 5;
$function$;

CREATE OR REPLACE FUNCTION public.get_ticket_checkout(p_type_id uuid)
 RETURNS TABLE(type_id uuid, kind text, name text, description text, price_cents integer, remaining integer, guests integer, min_spend_cents integer, max_per_order integer, event_id uuid, event_name text, start_date timestamp with time zone, end_date timestamp with time zone, dress_code text, min_age integer, venue_name text, venue_logo text, venue_terms text, payments_enabled boolean, venue_tax_id text, venue_address text, venue_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT tt.id, tt.kind, tt.name, tt.description,
           (SELECT tp.price_cents FROM public.ticket_type_price(tt.id) tp),
           CASE WHEN tt.capacity IS NULL THEN NULL ELSE GREATEST(tt.capacity - public.ticket_type_taken(tt.id), 0) END,
           tt.guests, tt.min_spend_cents, tt.max_per_order, e.id, e.name, e.start_date, e.end_date,
           COALESCE(tt.dress_code, e.dress_code), COALESCE(tt.min_age, e.min_age), v.name, v.logo_url, v.business_terms,
           (tt.price_cents = 0 OR (v.stripe_account_id IS NOT NULL AND v.stripe_charges_enabled)),
           v.tax_id, v.address, COALESCE(v.contact_email, v.email)
    FROM public.ticket_types tt
    JOIN public.events e ON e.id = tt.event_id
    JOIN public.venues v ON v.id = tt.venue_id
    WHERE tt.id = p_type_id AND tt.active AND e.end_date > NOW()
      AND (tt.sales_end_at IS NULL OR tt.sales_end_at > NOW());
$function$;
