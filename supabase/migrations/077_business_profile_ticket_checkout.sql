-- 077: perfil del negocio y compra de entradas con datos de cada asistente.
--
-- Perfil del negocio: logo, web, Instagram, correo de contacto y sus propias
-- condiciones (se aceptan al comprar una entrada). El logo va en el bucket
-- público `venue-logos`, en la carpeta del negocio.
--
-- Entradas:
--   · Tipos: entrada, entrada VIP y mesa VIP.
--   · Entradas gratis (0 €): se «compran» igual para tener QR, sin Stripe.
--   · Cada entrada lleva el nombre, correo, teléfono y fecha de nacimiento de
--     su asistente, que salen impresos en el PDF.
--   · «Añadir esta entrada a mi cuenta Fiestea»: si no se marca, la entrada no
--     sale en «Entradas» y se entrega por correo en PDF y en la descarga.
--   · `download_token`: el enlace del PDF y del Wallet funciona sin sesión
--     (desde el correo) y sólo con ese token.

-- --------------------------------------------------------------- negocio
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS business_terms TEXT;
DO $$
BEGIN
    ALTER TABLE public.venues ADD CONSTRAINT venues_business_terms_len
        CHECK (business_terms IS NULL OR char_length(business_terms) <= 6000);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-logos', 'venue-logos', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "venue logos: el negocio sube el suyo" ON storage.objects;
CREATE POLICY "venue logos: el negocio sube el suyo" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'venue-logos'
        AND (storage.foldername(name))[1] = public.current_venue_id()::TEXT
        AND public.current_venue_role() = 'owner'
    );
DROP POLICY IF EXISTS "venue logos: el negocio cambia el suyo" ON storage.objects;
CREATE POLICY "venue logos: el negocio cambia el suyo" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'venue-logos'
        AND (storage.foldername(name))[1] = public.current_venue_id()::TEXT
        AND public.current_venue_role() = 'owner'
    );
DROP POLICY IF EXISTS "venue logos: el negocio borra el suyo" ON storage.objects;
CREATE POLICY "venue logos: el negocio borra el suyo" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'venue-logos'
        AND (storage.foldername(name))[1] = public.current_venue_id()::TEXT
        AND public.current_venue_role() = 'owner'
    );

-- --------------------------------------------------------------- entradas
ALTER TABLE public.ticket_types DROP CONSTRAINT IF EXISTS ticket_types_kind_check;
ALTER TABLE public.ticket_types ADD CONSTRAINT ticket_types_kind_check CHECK (kind IN ('entry', 'vip', 'table'));
ALTER TABLE public.ticket_types DROP CONSTRAINT IF EXISTS ticket_types_price_cents_check;
-- 0 € (entrada gratis con QR) o, si se cobra, lo mínimo que acepta Stripe.
ALTER TABLE public.ticket_types ADD CONSTRAINT ticket_types_price_cents_check
    CHECK (price_cents = 0 OR (price_cents >= 50 AND price_cents <= 500000));
ALTER TABLE public.ticket_types DROP CONSTRAINT IF EXISTS ticket_types_description_check;
ALTER TABLE public.ticket_types ADD CONSTRAINT ticket_types_description_check
    CHECK (description IS NULL OR char_length(description) <= 1500);

ALTER TABLE public.ticket_orders ADD COLUMN IF NOT EXISTS holders JSONB;
ALTER TABLE public.ticket_orders ADD COLUMN IF NOT EXISTS buyer_email TEXT;
ALTER TABLE public.ticket_orders ADD COLUMN IF NOT EXISTS add_to_account BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.ticket_orders ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ticket_orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE public.ticket_orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE public.ticket_orders ADD COLUMN IF NOT EXISTS download_token TEXT
    DEFAULT encode(extensions.gen_random_bytes(18), 'hex');
UPDATE public.ticket_orders SET download_token = encode(extensions.gen_random_bytes(18), 'hex')
WHERE download_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_orders_download ON public.ticket_orders(download_token);

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS holder_name TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS holder_email TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS holder_phone TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS holder_birthdate DATE;

-- Pedido nuevo: cantidad, asistentes y consentimientos. Las gratis no exigen
-- cobros activos (no pasan por Stripe).
DROP FUNCTION IF EXISTS public.create_ticket_order(UUID, UUID, INTEGER);
CREATE FUNCTION public.create_ticket_order(
    p_profile_id UUID,
    p_type_id UUID,
    p_quantity INTEGER,
    p_holders JSONB DEFAULT NULL,
    p_buyer_email TEXT DEFAULT NULL,
    p_add_to_account BOOLEAN DEFAULT TRUE,
    p_marketing BOOLEAN DEFAULT FALSE
)
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
$$;

-- Al entregar, cada entrada se lleva los datos de su asistente.
CREATE OR REPLACE FUNCTION public.fulfill_ticket_order(p_order_id UUID, p_session_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.ticket_orders%ROWTYPE;
    v_code TEXT;
    v_holder JSONB;
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
        v_holder := CASE WHEN v_order.holders IS NULL THEN NULL ELSE v_order.holders -> (i - 1) END;
        INSERT INTO public.tickets (
            order_id, ticket_type_id, event_id, venue_id, profile_id, code,
            holder_name, holder_email, holder_phone, holder_birthdate
        )
        VALUES (
            v_order.id, v_order.ticket_type_id, v_order.event_id, v_order.venue_id, v_order.profile_id, v_code,
            NULLIF(btrim(v_holder->>'name'), ''), NULLIF(btrim(v_holder->>'email'), ''),
            NULLIF(btrim(v_holder->>'phone'), ''), NULLIF(v_holder->>'birthdate', '')::DATE
        );
    END LOOP;

    RETURN v_order.quantity;
END;
$$;

-- «Entradas» sólo enseña las que se añadieron a la cuenta.
CREATE OR REPLACE FUNCTION public.my_tickets()
RETURNS TABLE(
    id UUID, code TEXT, status TEXT, used_at TIMESTAMPTZ, kind TEXT, type_name TEXT, guests INTEGER,
    min_spend_cents INTEGER, unit_cents INTEGER, event_id UUID, event_name TEXT, start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ, venue_name TEXT
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
      AND o.add_to_account
      AND e.end_date > NOW() - INTERVAL '30 days'
    ORDER BY e.start_date DESC, tt.kind, tk.created_at;
$$;

-- El resultado de un pedido (pantalla de «Proceso completado»): sus entradas,
-- el token de descarga y los datos para el Wallet. Sólo quien compró.
CREATE OR REPLACE FUNCTION public.get_my_ticket_order(p_order_id UUID)
RETURNS TABLE(
    order_id UUID, status TEXT, download_token TEXT, event_name TEXT, start_date TIMESTAMPTZ,
    venue_name TEXT, type_name TEXT, kind TEXT, quantity INTEGER, amount_cents INTEGER,
    add_to_account BOOLEAN, tickets JSONB
)
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
           ), '[]'::JSONB)
    FROM public.ticket_orders o
    JOIN public.events e ON e.id = o.event_id
    JOIN public.venues v ON v.id = o.venue_id
    JOIN public.ticket_types tt ON tt.id = o.ticket_type_id
    WHERE o.id = p_order_id AND o.profile_id = public.current_profile_id();
$$;

-- Lo que se ve antes de comprar: el negocio (logo y condiciones) y el tipo.
CREATE OR REPLACE FUNCTION public.get_ticket_checkout(p_type_id UUID)
RETURNS TABLE(
    type_id UUID, kind TEXT, name TEXT, description TEXT, price_cents INTEGER, remaining INTEGER,
    guests INTEGER, min_spend_cents INTEGER, max_per_order INTEGER, event_id UUID, event_name TEXT,
    start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, dress_code TEXT, min_age INTEGER, venue_name TEXT,
    venue_logo TEXT, venue_terms TEXT, payments_enabled BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tt.id, tt.kind, tt.name, tt.description, tt.price_cents,
           CASE WHEN tt.capacity IS NULL THEN NULL ELSE GREATEST(tt.capacity - public.ticket_type_taken(tt.id), 0) END,
           tt.guests, tt.min_spend_cents, tt.max_per_order, e.id, e.name, e.start_date, e.end_date,
           e.dress_code, e.min_age, v.name, v.logo_url, v.business_terms,
           (tt.price_cents = 0 OR (v.stripe_account_id IS NOT NULL AND v.stripe_charges_enabled))
    FROM public.ticket_types tt
    JOIN public.events e ON e.id = tt.event_id
    JOIN public.venues v ON v.id = tt.venue_id
    WHERE tt.id = p_type_id AND tt.active AND e.end_date > NOW();
$$;

-- Las condiciones de un negocio, para leerlas antes de aceptarlas.
CREATE OR REPLACE FUNCTION public.get_venue_terms(p_venue_id UUID)
RETURNS TABLE(venue_name TEXT, terms TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT v.name, v.business_terms FROM public.venues v WHERE v.id = p_venue_id AND v.is_verified;
$$;

REVOKE ALL ON FUNCTION public.create_ticket_order(UUID, UUID, INTEGER, JSONB, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(UUID, UUID, INTEGER, JSONB, TEXT, BOOLEAN, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.get_my_ticket_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ticket_order(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_ticket_checkout(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_checkout(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_venue_terms(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_terms(UUID) TO anon, authenticated;

-- `save_ticket_type` acepta también la entrada VIP.
CREATE OR REPLACE FUNCTION public.save_ticket_type(p_id uuid, p_event_id uuid, p_kind text, p_name text, p_description text, p_price_cents integer, p_capacity integer, p_guests integer DEFAULT NULL::integer, p_min_spend_cents integer DEFAULT NULL::integer, p_max_per_order integer DEFAULT 6, p_active boolean DEFAULT true)
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
            OR (public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner')) THEN
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
$function$;
