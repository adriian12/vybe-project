-- ============================================================================
-- 096 · Gestión de entradas
-- ============================================================================
-- Lo que necesita la sección «Gestión de entradas» de Ventas:
--
--   · Ventana de venta por tipo de entrada (`sales_start_at`, `sales_end_at`):
--     «early bird» hasta el jueves, taquilla desde las 20:00…
--   · Invitaciones: entradas de 0 € que emite el negocio a nombre de alguien
--     (`ticket_orders.source = 'comp'`), con su QR, su PDF y su correo.
--   · Lista de asistentes con el estado de cada entrada y check-in manual.
--   · Pedidos completos (correo de quien compra, origen, sin el tope de 100).
--   · Cinco funciones de Ventas dejaban pasar a cualquiera con sesión (abajo).
--   · `validate_event_ticket` sólo encontraba entradas con perfil: las de una
--     cuenta borrada (073) o una invitación sin cuenta daban «no existe».
-- ============================================================================

ALTER TABLE public.ticket_types
    ADD COLUMN IF NOT EXISTS sales_start_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sales_end_at TIMESTAMPTZ;

ALTER TABLE public.ticket_types DROP CONSTRAINT IF EXISTS ticket_types_sales_window_check;
ALTER TABLE public.ticket_types
    ADD CONSTRAINT ticket_types_sales_window_check
    CHECK (sales_start_at IS NULL OR sales_end_at IS NULL OR sales_end_at > sales_start_at);

ALTER TABLE public.ticket_orders
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online',
    ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE public.ticket_orders DROP CONSTRAINT IF EXISTS ticket_orders_source_check;
ALTER TABLE public.ticket_orders
    ADD CONSTRAINT ticket_orders_source_check CHECK (source IN ('online', 'comp'));
ALTER TABLE public.ticket_orders DROP CONSTRAINT IF EXISTS ticket_orders_note_check;
ALTER TABLE public.ticket_orders
    ADD CONSTRAINT ticket_orders_note_check CHECK (note IS NULL OR char_length(note) <= 200);

-- ---------------------------------------------------------------------------
-- Compra y pantalla de compra: respetan la ventana de venta.
-- ---------------------------------------------------------------------------
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
    SELECT stripe_account_id, stripe_charges_enabled INTO v_account, v_enabled
    FROM public.venues WHERE id = v_type.venue_id;
    IF v_type.price_cents > 0 AND (v_account IS NULL OR NOT v_enabled) THEN
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
        v_type.price_cents, v_type.price_cents * p_quantity, v_account,
        p_holders, NULLIF(btrim(COALESCE(p_buyer_email, '')), ''), COALESCE(p_add_to_account, TRUE),
        COALESCE(p_marketing, FALSE), NOW()
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, v_type.price_cents * p_quantity, v_type.price_cents,
                        v_type.name, v_type.kind, v_event.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ticket_checkout(p_type_id uuid)
 RETURNS TABLE(type_id uuid, kind text, name text, description text, price_cents integer, remaining integer, guests integer, min_spend_cents integer, max_per_order integer, event_id uuid, event_name text, start_date timestamp with time zone, end_date timestamp with time zone, dress_code text, min_age integer, venue_name text, venue_logo text, venue_terms text, payments_enabled boolean, venue_tax_id text, venue_address text, venue_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT tt.id, tt.kind, tt.name, tt.description, tt.price_cents,
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

-- ---------------------------------------------------------------------------
-- Tipos de entrada: la ventana se guarda con el resto. Se borra la firma
-- antigua: con dos versiones, PostgREST no sabría a cuál llamar (véase 070).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_ticket_type(uuid, uuid, text, text, text, integer, integer, integer, integer, integer, boolean, integer, text);
CREATE OR REPLACE FUNCTION public.save_ticket_type(p_id uuid, p_event_id uuid, p_kind text, p_name text, p_description text, p_price_cents integer, p_capacity integer, p_guests integer DEFAULT NULL::integer, p_min_spend_cents integer DEFAULT NULL::integer, p_max_per_order integer DEFAULT 6, p_active boolean DEFAULT true, p_min_age integer DEFAULT NULL::integer, p_dress_code text DEFAULT NULL::text, p_sales_start_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sales_end_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            OR COALESCE(public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    IF v_end < NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    IF p_kind NOT IN ('entry', 'vip', 'table') THEN
        RAISE EXCEPTION 'INVALID_KIND';
    END IF;
    IF p_kind = 'table' AND p_capacity IS NULL THEN
        RAISE EXCEPTION 'TABLES_NEED_CAPACITY';
    END IF;
    IF p_min_age IS NOT NULL AND (p_min_age < 14 OR p_min_age > 99) THEN
        RAISE EXCEPTION 'INVALID_MIN_AGE';
    END IF;
    IF p_sales_start_at IS NOT NULL AND p_sales_end_at IS NOT NULL AND p_sales_end_at <= p_sales_start_at THEN
        RAISE EXCEPTION 'INVALID_SALES_WINDOW';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.ticket_types (
            event_id, venue_id, kind, name, description, price_cents, capacity,
            guests, min_spend_cents, max_per_order, active, min_age, dress_code,
            sales_start_at, sales_end_at
        )
        VALUES (
            p_event_id, v_venue, p_kind, btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''),
            p_price_cents, p_capacity,
            CASE WHEN p_kind = 'table' THEN p_guests END,
            CASE WHEN p_kind = 'table' THEN p_min_spend_cents END,
            CASE WHEN p_kind = 'table' THEN 1 ELSE COALESCE(p_max_per_order, 6) END,
            COALESCE(p_active, TRUE),
            p_min_age, NULLIF(left(btrim(COALESCE(p_dress_code, '')), 40), ''),
            p_sales_start_at, p_sales_end_at
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
        min_age = p_min_age,
        dress_code = NULLIF(left(btrim(COALESCE(p_dress_code, '')), 40), ''),
        sales_start_at = p_sales_start_at,
        sales_end_at = p_sales_end_at,
        updated_at = NOW()
    WHERE id = p_id;

    RETURN p_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Lo que ve el público: no salen los tipos cuya venta ya terminó, y los que
-- aún no han empezado salen con su fecha.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_event_ticket_types(uuid);
CREATE FUNCTION public.get_event_ticket_types(p_event_id uuid)
 RETURNS TABLE(id uuid, kind text, name text, description text, price_cents integer, remaining integer, guests integer, min_spend_cents integer, max_per_order integer, sales_start_at timestamp with time zone, sales_end_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT t.id, t.kind, t.name, t.description, t.price_cents,
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
    ORDER BY CASE t.kind WHEN 'entry' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END, t.price_cents;
$function$;

-- ---------------------------------------------------------------------------
-- Panel: tipos con su ventana y cuántas invitaciones lleva cada uno.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_ticket_sales(uuid);
CREATE FUNCTION public.get_ticket_sales(p_event_id uuid)
 RETURNS TABLE(id uuid, kind text, name text, description text, price_cents integer, capacity integer, guests integer, min_spend_cents integer, max_per_order integer, active boolean, sold integer, used integer, revenue_cents bigint, min_age integer, dress_code text, sales_start_at timestamp with time zone, sales_end_at timestamp with time zone, comps integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.events WHERE events.id = p_event_id;
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR COALESCE(public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner', FALSE)) THEN
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
                      WHERE o.ticket_type_id = t.id AND o.status = 'paid'), 0)::BIGINT,
           t.min_age, t.dress_code, t.sales_start_at, t.sales_end_at,
           COALESCE((SELECT SUM(o.quantity) FROM public.ticket_orders o
                      WHERE o.ticket_type_id = t.id AND o.status = 'paid' AND o.source = 'comp'), 0)::INTEGER
    FROM public.ticket_types t
    WHERE t.event_id = p_event_id AND t.deleted_at IS NULL
    ORDER BY CASE t.kind WHEN 'entry' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END, t.price_cents;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Pedidos: completos, con el correo de quien compra y su origen.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_ticket_orders(uuid);
CREATE FUNCTION public.get_ticket_orders(p_event_id uuid)
 RETURNS TABLE(id uuid, buyer text, type_name text, kind text, quantity integer, amount_cents integer, net_cents integer, status text, paid_at timestamp with time zone, refunded_at timestamp with time zone, used integer, refundable boolean, buyer_email text, source text, note text, type_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.events WHERE events.id = p_event_id;
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR COALESCE(public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT o.id,
           COALESCE(NULLIF(btrim(p.name), ''), NULLIF(btrim(o.holders -> 0 ->> 'name'), ''), ''),
           t.name, t.kind, o.quantity, o.amount_cents,
           o.amount_cents - o.application_fee_cents, o.status, o.paid_at, o.refunded_at,
           (SELECT COUNT(*) FROM public.tickets tk WHERE tk.order_id = o.id AND tk.status = 'used')::INTEGER,
           (o.status = 'paid' AND o.payment_intent_id IS NOT NULL),
           COALESCE(o.buyer_email, p.email),
           o.source, o.note, o.ticket_type_id
    FROM public.ticket_orders o
    JOIN public.ticket_types t ON t.id = o.ticket_type_id
    LEFT JOIN public.profiles p ON p.id = o.profile_id
    WHERE o.event_id = p_event_id AND o.status IN ('paid', 'refunded')
    ORDER BY o.paid_at DESC
    LIMIT 5000;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Asistentes: una fila por entrada, con su estado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_attendees(p_event_id uuid)
 RETURNS TABLE(id uuid, code text, holder_name text, holder_email text, holder_phone text, type_name text, kind text, status text, used_at timestamp with time zone, order_id uuid, source text, buyer text, paid_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.events WHERE events.id = p_event_id;
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR COALESCE(public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT tk.id, tk.code,
           COALESCE(NULLIF(btrim(tk.holder_name), ''), NULLIF(btrim(p.name), ''), ''),
           COALESCE(tk.holder_email, p.email),
           tk.holder_phone, t.name, t.kind, tk.status, tk.used_at, o.id, o.source,
           COALESCE(NULLIF(btrim(bp.name), ''), o.buyer_email, ''),
           o.paid_at
    FROM public.tickets tk
    JOIN public.ticket_orders o ON o.id = tk.order_id
    JOIN public.ticket_types t ON t.id = tk.ticket_type_id
    LEFT JOIN public.profiles p ON p.id = tk.profile_id
    LEFT JOIN public.profiles bp ON bp.id = o.profile_id
    WHERE tk.event_id = p_event_id
    ORDER BY lower(COALESCE(NULLIF(btrim(tk.holder_name), ''), p.name, '')), tk.created_at
    LIMIT 10000;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Check-in a mano (alguien sin el móvil, un error en la puerta).
-- Propietarios y Seguridad del negocio, como el validador.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ticket_checked_in(p_ticket_id uuid, p_checked_in boolean)
 RETURNS TABLE(status text, used_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_ticket public.tickets%ROWTYPE;
BEGIN
    SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND';
    END IF;
    IF NOT (public.is_admin()
            OR COALESCE(public.current_venue_id() = v_ticket.venue_id
                AND COALESCE(public.current_venue_role(), '') IN ('owner', 'security'), FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF v_ticket.status = 'refunded' THEN
        RAISE EXCEPTION 'TICKET_REFUNDED';
    END IF;

    IF p_checked_in THEN
        UPDATE public.tickets tk
        SET status = 'used', used_at = COALESCE(tk.used_at, NOW()), used_by = COALESCE(tk.used_by, auth.uid())
        WHERE tk.id = p_ticket_id;
    ELSE
        UPDATE public.tickets tk SET status = 'valid', used_at = NULL, used_by = NULL WHERE tk.id = p_ticket_id;
    END IF;

    RETURN QUERY SELECT tk.status, tk.used_at FROM public.tickets tk WHERE tk.id = p_ticket_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Invitaciones: el negocio emite entradas de 0 € a nombre de alguien. Cuentan
-- para el aforo del tipo. Si el correo es de una cuenta de Fiestea, la entrada
-- sale también en su pestaña «Entradas». El correo lo manda `ticket-admin`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_comp_tickets(
    p_type_id uuid,
    p_quantity integer,
    p_holder_name text,
    p_holder_email text DEFAULT NULL,
    p_note text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_type public.ticket_types%ROWTYPE;
    v_end TIMESTAMPTZ;
    v_name TEXT := btrim(COALESCE(p_holder_name, ''));
    v_email TEXT := NULLIF(lower(btrim(COALESCE(p_holder_email, ''))), '');
    v_profile UUID;
    v_holders JSONB;
    v_id UUID;
BEGIN
    SELECT * INTO v_type FROM public.ticket_types WHERE id = p_type_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND';
    END IF;
    IF NOT (public.is_admin()
            OR COALESCE(public.current_venue_id() = v_type.venue_id AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_type.venue_id, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    SELECT end_date INTO v_end FROM public.events WHERE id = v_type.event_id;
    IF v_end <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN
        RAISE EXCEPTION 'BAD_QUANTITY';
    END IF;
    IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
        RAISE EXCEPTION 'BAD_NAME';
    END IF;
    IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
        RAISE EXCEPTION 'BAD_EMAIL';
    END IF;
    IF v_type.capacity IS NOT NULL
       AND public.ticket_type_taken(p_type_id) + p_quantity > v_type.capacity THEN
        RAISE EXCEPTION 'SOLD_OUT';
    END IF;

    IF v_email IS NOT NULL THEN
        SELECT p.id INTO v_profile
        FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
        WHERE lower(u.email) = v_email
        LIMIT 1;
    END IF;

    SELECT jsonb_agg(jsonb_build_object('name', v_name, 'email', v_email))
    INTO v_holders
    FROM generate_series(1, p_quantity);

    INSERT INTO public.ticket_orders (
        ticket_type_id, event_id, venue_id, profile_id, quantity, unit_cents, amount_cents,
        holders, buyer_email, add_to_account, marketing_opt_in, source, issued_by, note
    )
    VALUES (
        p_type_id, v_type.event_id, v_type.venue_id, v_profile, p_quantity, 0, 0,
        v_holders, v_email, v_profile IS NOT NULL, FALSE, 'comp', auth.uid(),
        NULLIF(left(btrim(COALESCE(p_note, '')), 200), '')
    )
    RETURNING id INTO v_id;

    PERFORM public.fulfill_ticket_order(v_id, NULL);
    RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- ¿Puede quien pregunta gestionar este pedido? (reenviar el correo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_ticket_order(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE((
        SELECT public.is_admin()
               OR COALESCE(public.current_venue_id() = o.venue_id AND public.current_venue_role() = 'owner', FALSE)
        FROM public.ticket_orders o
        WHERE o.id = p_order_id AND o.status = 'paid'
    ), FALSE);
$function$;

-- ---------------------------------------------------------------------------
-- Validar: también entradas sin perfil (invitaciones, cuentas borradas), y con
-- el nombre de quien la lleva.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_event_ticket(p_code text)
 RETURNS TABLE(kind text, type_name text, holder_name text, event_name text, guests integer, already_used boolean, used_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_row RECORD;
BEGIN
    IF public.current_venue_id() IS NULL
       OR COALESCE(public.current_venue_role(), '') NOT IN ('owner', 'security') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT tk.id, tk.status, tk.used_at, tk.venue_id, tt.kind, tt.name AS type_name, tt.guests,
           COALESCE(tk.holder_name, p.name) AS holder, e.name AS ev_name
    INTO v_row
    FROM public.tickets tk
    JOIN public.ticket_types tt ON tt.id = tk.ticket_type_id
    LEFT JOIN public.profiles p ON p.id = tk.profile_id
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
$function$;

-- ---------------------------------------------------------------------------
-- Permisos que daban NULL (como en la 041): sin negocio, `current_venue_id()`
-- es NULL, `NOT (is_admin() OR NULL)` también es NULL y el IF no saltaba.
-- Cualquiera con sesión podía leer los pedidos de cualquier fiesta, crear o
-- borrar tipos de entrada ajenos y, a través de `owner_business_for_event`,
-- ver y tocar las comisiones de RRPP de otro negocio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_business_for_event(p_event_id uuid, p_feature text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.events WHERE id = p_event_id;
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR COALESCE(public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, p_feature) THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    RETURN v_venue;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_ticket_type(p_type_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.ticket_types WHERE id = p_type_id AND deleted_at IS NULL;
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND';
    END IF;
    IF NOT (public.is_admin()
            OR COALESCE(public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner', FALSE)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF EXISTS (SELECT 1 FROM public.ticket_orders WHERE ticket_type_id = p_type_id)
       OR EXISTS (SELECT 1 FROM public.tickets WHERE ticket_type_id = p_type_id) THEN
        UPDATE public.ticket_types SET active = FALSE, deleted_at = NOW() WHERE id = p_type_id;
        RETURN 'archived';
    END IF;

    DELETE FROM public.ticket_types WHERE id = p_type_id;
    RETURN 'deleted';
END;
$function$;

-- ---------------------------------------------------------------------------
-- Permisos: sólo con sesión, como el resto del panel.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.save_ticket_type(uuid, uuid, text, text, text, integer, integer, integer, integer, integer, boolean, integer, text, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_ticket_types(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ticket_sales(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ticket_orders(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_attendees(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_ticket_checked_in(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_comp_tickets(uuid, integer, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_ticket_order(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_ticket_type(uuid, uuid, text, text, text, integer, integer, integer, integer, integer, boolean, integer, text, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_types(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ticket_sales(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ticket_orders(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_attendees(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_ticket_checked_in(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_comp_tickets(uuid, integer, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_ticket_order(uuid) TO authenticated, service_role;
