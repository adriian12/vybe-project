-- 071: listas de invitados, volver a ver un enlace del portero, comisión de la
-- plataforma por local y avisos de suscripción desde administración.

-- ===========================================================================
-- 1. Listas de invitados (todos los planes)
--
-- Muchos locales trabajan con listas que les pasan sus RRPP: «Adrián +10».
-- Cuando llega, dice de qué lista es y entran él y los acompañantes que
-- vengan; si vienen 5 de 10, quedan 5 huecos para más tarde.
--
-- Cada evento tiene la lista de la app (la gente se apunta desde la ficha al
-- marcar «voy a ir», si el local la ha activado) y las listas de cada RRPP,
-- que el local rellena a mano.
-- ===========================================================================
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS guest_list_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS guest_list_message TEXT
        CHECK (guest_list_message IS NULL OR char_length(guest_list_message) <= 200);

CREATE TABLE IF NOT EXISTS public.guest_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    kind TEXT NOT NULL CHECK (kind IN ('app', 'promoter')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_lists_app ON public.guest_lists(event_id) WHERE kind = 'app';
CREATE INDEX IF NOT EXISTS idx_guest_lists_event ON public.guest_lists(event_id);

CREATE TABLE IF NOT EXISTS public.guest_list_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.guest_lists(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
    companions INTEGER NOT NULL DEFAULT 0 CHECK (companions BETWEEN 0 AND 50),
    -- Cuántas personas de esta línea han entrado ya (la principal incluida).
    admitted INTEGER NOT NULL DEFAULT 0 CHECK (admitted >= 0),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (admitted <= companions + 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_entries_profile
    ON public.guest_list_entries(event_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_entries_event ON public.guest_list_entries(event_id);

ALTER TABLE public.guest_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_list_entries ENABLE ROW LEVEL SECURITY;

-- La lista de la app del evento, creada la primera vez que hace falta.
CREATE OR REPLACE FUNCTION public.app_guest_list(p_event_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.guest_lists WHERE event_id = p_event_id AND kind = 'app';
    IF v_id IS NULL THEN
        INSERT INTO public.guest_lists (event_id, venue_id, name, kind)
        SELECT e.id, e.venue_id, 'app', 'app' FROM public.events e WHERE e.id = p_event_id
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_id;
        IF v_id IS NULL THEN
            SELECT id INTO v_id FROM public.guest_lists WHERE event_id = p_event_id AND kind = 'app';
        END IF;
    END IF;
    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------- local
CREATE OR REPLACE FUNCTION public.set_guest_list_settings(p_event_id UUID, p_enabled BOOLEAN, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    UPDATE public.events
    SET guest_list_enabled = COALESCE(p_enabled, FALSE),
        guest_list_message = NULLIF(left(btrim(COALESCE(p_message, '')), 200), '')
    WHERE id = p_event_id;
    PERFORM public.app_guest_list(p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_guest_lists(p_event_id UUID)
RETURNS TABLE(
    id UUID, name TEXT, kind TEXT, entries INTEGER, people INTEGER, admitted INTEGER,
    enabled BOOLEAN, message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    PERFORM public.app_guest_list(p_event_id);

    RETURN QUERY
    SELECT l.id, l.name, l.kind,
           COUNT(g.id)::INTEGER,
           COALESCE(SUM(g.companions + 1), 0)::INTEGER,
           COALESCE(SUM(g.admitted), 0)::INTEGER,
           e.guest_list_enabled, e.guest_list_message
    FROM public.guest_lists l
    JOIN public.events e ON e.id = l.event_id
    LEFT JOIN public.guest_list_entries g ON g.list_id = l.id
    WHERE l.event_id = p_event_id
    GROUP BY l.id, l.name, l.kind, l.created_at, e.guest_list_enabled, e.guest_list_message
    ORDER BY (l.kind = 'app') DESC, l.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_guest_list_entries(p_event_id UUID)
RETURNS TABLE(id UUID, list_id UUID, name TEXT, companions INTEGER, admitted INTEGER, from_app BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN QUERY
    SELECT g.id, g.list_id, g.name, g.companions, g.admitted, g.profile_id IS NOT NULL, g.created_at
    FROM public.guest_list_entries g
    WHERE g.event_id = p_event_id
    ORDER BY lower(g.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_guest_list(p_event_id UUID, p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF (SELECT COUNT(*) FROM public.guest_lists WHERE event_id = p_event_id) >= 30 THEN
        RAISE EXCEPTION 'TOO_MANY_LISTS';
    END IF;
    INSERT INTO public.guest_lists (event_id, venue_id, name, kind, created_by)
    SELECT e.id, e.venue_id, btrim(p_name), 'promoter', auth.uid() FROM public.events e WHERE e.id = p_event_id
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_guest_list(p_list_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
BEGIN
    SELECT event_id INTO v_event FROM public.guest_lists WHERE id = p_list_id AND kind = 'promoter';
    IF v_event IS NULL OR NOT public.can_count_event(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    DELETE FROM public.guest_lists WHERE id = p_list_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_guest_entry(p_list_id UUID, p_entry_id UUID, p_name TEXT, p_companions INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
    v_id UUID;
BEGIN
    SELECT event_id INTO v_event FROM public.guest_lists WHERE id = p_list_id;
    IF v_event IS NULL OR NOT public.can_count_event(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_companions IS NULL OR p_companions < 0 OR p_companions > 50 THEN
        RAISE EXCEPTION 'INVALID_COMPANIONS';
    END IF;

    IF p_entry_id IS NULL THEN
        INSERT INTO public.guest_list_entries (list_id, event_id, name, companions, added_by)
        VALUES (p_list_id, v_event, btrim(p_name), p_companions, auth.uid())
        RETURNING id INTO v_id;
        RETURN v_id;
    END IF;

    UPDATE public.guest_list_entries
    SET name = btrim(p_name),
        companions = GREATEST(p_companions, admitted - 1),
        updated_at = NOW()
    WHERE id = p_entry_id AND list_id = p_list_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'ENTRY_NOT_FOUND';
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_guest_entry(p_entry_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
BEGIN
    SELECT event_id INTO v_event FROM public.guest_list_entries WHERE id = p_entry_id;
    IF v_event IS NULL OR NOT public.can_count_event(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    DELETE FROM public.guest_list_entries WHERE id = p_entry_id;
END;
$$;

-- En la puerta: entran `p_count` personas de esa línea (negativo para corregir).
-- Nunca más que las apuntadas ni menos de cero.
CREATE OR REPLACE FUNCTION public.admit_guests(p_entry_id UUID, p_count INTEGER)
RETURNS TABLE(admitted INTEGER, total INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_event UUID;
BEGIN
    SELECT event_id INTO v_event FROM public.guest_list_entries WHERE id = p_entry_id;
    IF v_event IS NULL OR NOT public.can_count_event(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    UPDATE public.guest_list_entries g
    SET admitted = LEAST(GREATEST(g.admitted + COALESCE(p_count, 0), 0), g.companions + 1),
        updated_at = NOW()
    WHERE g.id = p_entry_id
    RETURNING g.admitted, g.companions + 1;
END;
$$;

-- ---------------------------------------------------------------- público
CREATE OR REPLACE FUNCTION public.get_guest_list_info(p_event_id UUID)
RETURNS TABLE(enabled BOOLEAN, message TEXT, my_name TEXT, my_companions INTEGER, my_admitted INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.guest_list_enabled AND e.end_date > NOW(),
           e.guest_list_message,
           g.name, g.companions, g.admitted
    FROM public.events e
    LEFT JOIN public.guest_list_entries g
           ON g.event_id = e.id AND g.profile_id = public.current_profile_id()
    WHERE e.id = p_event_id;
$$;

CREATE OR REPLACE FUNCTION public.join_guest_list(p_event_id UUID, p_name TEXT, p_companions INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_list UUID;
BEGIN
    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.events
                   WHERE id = p_event_id AND guest_list_enabled AND end_date > NOW()) THEN
        RAISE EXCEPTION 'GUEST_LIST_CLOSED';
    END IF;
    IF char_length(btrim(COALESCE(p_name, ''))) < 1 THEN
        RAISE EXCEPTION 'NAME_REQUIRED';
    END IF;
    IF p_companions IS NULL OR p_companions < 0 OR p_companions > 50 THEN
        RAISE EXCEPTION 'INVALID_COMPANIONS';
    END IF;

    v_list := public.app_guest_list(p_event_id);

    INSERT INTO public.guest_list_entries (list_id, event_id, name, companions, profile_id, added_by)
    VALUES (v_list, p_event_id, left(btrim(p_name), 80), p_companions, v_profile, auth.uid())
    ON CONFLICT (event_id, profile_id) WHERE profile_id IS NOT NULL DO UPDATE
        SET name = EXCLUDED.name,
            companions = GREATEST(EXCLUDED.companions, public.guest_list_entries.admitted - 1),
            updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_guest_list(p_event_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.guest_list_entries
    WHERE event_id = p_event_id AND profile_id = public.current_profile_id() AND admitted = 0;
$$;

-- ===========================================================================
-- 2. Volver a ver un enlace del portero
--
-- Antes sólo se guardaba el SHA-256 del token y el enlace se enseñaba una vez.
-- Ahora se guarda también el token para poder enseñarlo otra vez a quien
-- lleva la puerta (se puede revocar y caduca 2 h después del evento).
-- ===========================================================================
ALTER TABLE public.event_counter_links ADD COLUMN IF NOT EXISTS token TEXT;

CREATE OR REPLACE FUNCTION public.create_counter_link(p_event_id UUID, p_label TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token TEXT;
    v_end TIMESTAMPTZ;
    v_id UUID;
    v_expires TIMESTAMPTZ;
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.end_date INTO v_end FROM public.events e WHERE e.id = p_event_id;
    IF v_end IS NULL OR v_end + INTERVAL '2 hours' < NOW() THEN
        RAISE EXCEPTION 'EVENT_NOT_LIVE';
    END IF;

    IF (SELECT COUNT(*) FROM public.event_counter_links l
        WHERE l.event_id = p_event_id AND l.revoked_at IS NULL AND l.expires_at > NOW()) >= 10 THEN
        RAISE EXCEPTION 'TOO_MANY_LINKS';
    END IF;

    -- 144 bits aleatorios en base64 apta para URL.
    v_token := translate(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+/', '-_');
    v_expires := v_end + INTERVAL '2 hours';

    INSERT INTO public.event_counter_links (event_id, label, token_hash, token, expires_at, created_by)
    VALUES (
        p_event_id,
        NULLIF(btrim(p_label), ''),
        encode(extensions.digest(v_token, 'sha256'), 'hex'),
        v_token,
        v_expires,
        auth.uid()
    )
    RETURNING event_counter_links.id INTO v_id;

    RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_counter_link_token(p_link_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
    v_token TEXT;
BEGIN
    SELECT event_id, token INTO v_event, v_token
    FROM public.event_counter_links
    WHERE id = p_link_id AND revoked_at IS NULL AND expires_at > NOW();
    IF v_event IS NULL OR NOT public.can_count_event(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN v_token;
END;
$$;

-- ===========================================================================
-- 3. Comisión de la plataforma por local (la fija administración)
-- ===========================================================================
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
        CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 50);

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

    -- La comisión de la plataforma la fija administración.
    NEW.platform_fee_percent := OLD.platform_fee_percent;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_venue_fee(p_venue_id UUID, p_percent NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_percent IS NULL OR p_percent < 0 OR p_percent > 50 THEN
        RAISE EXCEPTION 'INVALID_FEE';
    END IF;
    UPDATE public.venues SET platform_fee_percent = p_percent WHERE id = p_venue_id;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_venues(TEXT);
CREATE FUNCTION public.admin_list_venues(p_search TEXT DEFAULT NULL)
RETURNS TABLE(
    venue_id UUID, name TEXT, email TEXT, city TEXT, type TEXT, is_verified BOOLEAN,
    verification_status TEXT, created_at TIMESTAMPTZ, plan TEXT, plan_status TEXT,
    plan_expires_at TIMESTAMPTZ, events_total BIGINT, events_upcoming BIGINT, members BIGINT,
    followers BIGINT, phone TEXT, address TEXT, tax_id TEXT, plan_cancel_at_period_end BOOLEAN,
    plan_renews BOOLEAN, platform_fee_percent NUMERIC, stripe_connected BOOLEAN,
    stripe_charges_enabled BOOLEAN, stripe_payouts_enabled BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_q TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT
        v.id, v.name, v.email, v.city, v.type, v.is_verified, v.verification_status, v.created_at,
        COALESCE(s.plan, 'free'), COALESCE(s.status, 'none'), s.expires_at,
        (SELECT COUNT(*) FROM public.events e WHERE e.venue_id = v.id),
        (SELECT COUNT(*) FROM public.events e WHERE e.venue_id = v.id AND e.end_date > NOW()),
        (SELECT COUNT(*) FROM public.venue_members m WHERE m.venue_id = v.id),
        (SELECT COUNT(*) FROM public.venue_followers f WHERE f.venue_id = v.id),
        v.phone, v.address, v.tax_id,
        COALESCE(s.cancel_at_period_end, FALSE),
        COALESCE(s.stripe_subscription_id IS NOT NULL AND NOT COALESCE(s.cancel_at_period_end, FALSE), FALSE),
        v.platform_fee_percent,
        v.stripe_account_id IS NOT NULL, v.stripe_charges_enabled, v.stripe_payouts_enabled
    FROM public.venues v
    LEFT JOIN LATERAL (
        SELECT vs.plan, vs.status, vs.expires_at, vs.cancel_at_period_end, vs.stripe_subscription_id
        FROM public.venue_subscriptions vs
        WHERE vs.venue_id = v.id
        ORDER BY vs.started_at DESC NULLS LAST
        LIMIT 1
    ) s ON TRUE
    WHERE v_q IS NULL OR v.name ILIKE '%' || v_q || '%' OR v.email ILIKE '%' || v_q || '%'
       OR v.city ILIKE '%' || v_q || '%'
    ORDER BY v.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_users(TEXT, INTEGER, INTEGER);
CREATE FUNCTION public.admin_list_users(p_search TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE(
    profile_id UUID, name TEXT, email TEXT, age INTEGER, role TEXT, account_type TEXT, status TEXT,
    is_verified BOOLEAN, staff_only BOOLEAN, created_at TIMESTAMPTZ, subscription_type TEXT,
    subscription_expires_at TIMESTAMPTZ, subscription_event_id UUID, supercrush INTEGER,
    check_ins BIGINT, total_count BIGINT, subscription_cancel_at_period_end BOOLEAN,
    subscription_renews BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_q TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT p.*, u.email::TEXT AS correo
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.user_id
        WHERE v_q IS NULL
           OR p.name ILIKE '%' || v_q || '%'
           OR u.email ILIKE '%' || v_q || '%'
           OR p.phone ILIKE '%' || v_q || '%'
    ), total AS (SELECT COUNT(*) AS n FROM base)
    SELECT
        b.id, b.name, b.correo, b.age, b.role, b.account_type, b.status, b.is_verified,
        b.staff_only, b.created_at,
        s.subscription_type, s.expires_at, s.event_id,
        public.supercrush_balance(b.id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.profile_id = b.id),
        (SELECT n FROM total),
        COALESCE(s.cancel_at_period_end, FALSE),
        COALESCE(s.stripe_subscription_id IS NOT NULL AND NOT COALESCE(s.cancel_at_period_end, FALSE), FALSE)
    FROM base b
    LEFT JOIN LATERAL (
        SELECT ps.subscription_type, ps.expires_at, ps.event_id, ps.cancel_at_period_end, ps.stripe_subscription_id
        FROM public.premium_subscriptions ps
        WHERE ps.user_id = b.id
          AND ps.status = 'active'
          AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
        ORDER BY (ps.event_id IS NULL) DESC, ps.started_at DESC
        LIMIT 1
    ) s ON TRUE
    ORDER BY b.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

-- ===========================================================================
-- 4. Avisos de suscripción desde administración
--
-- «Tu suscripción está a punto de caducar» sólo a quien NO renueva sola:
-- la ha cancelado, es una prueba o la dio administración. Una sola vez por
-- fecha de caducidad (`subscription_notices`).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.subscription_notices (
    kind TEXT NOT NULL CHECK (kind IN ('user', 'venue')),
    target_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kind, target_id, expires_at)
);
ALTER TABLE public.subscription_notices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_expiring_targets(p_kind TEXT, p_days INTEGER DEFAULT 7)
RETURNS TABLE(target_id UUID, name TEXT, email TEXT, locale TEXT, plan TEXT, expires_at TIMESTAMPTZ, notified BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    IF NOT (public.is_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF p_kind = 'user' THEN
        RETURN QUERY
        SELECT DISTINCT ON (p.id) p.id, p.name, u.email::TEXT, p.locale, ps.subscription_type, ps.expires_at,
               EXISTS (SELECT 1 FROM public.subscription_notices n
                       WHERE n.kind = 'user' AND n.target_id = p.id AND n.expires_at = ps.expires_at)
        FROM public.premium_subscriptions ps
        JOIN public.profiles p ON p.id = ps.user_id
        LEFT JOIN auth.users u ON u.id = p.user_id
        WHERE ps.status = 'active'
          AND ps.subscription_type = 'monthly'
          AND ps.expires_at > NOW()
          AND ps.expires_at <= NOW() + make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 7), 30)))
          AND (COALESCE(ps.cancel_at_period_end, FALSE) OR ps.stripe_subscription_id IS NULL)
          AND p.status = 'active'
        ORDER BY p.id, ps.expires_at;
    ELSE
        RETURN QUERY
        SELECT v.id, v.name, v.email, NULL::TEXT, vs.plan, vs.expires_at,
               EXISTS (SELECT 1 FROM public.subscription_notices n
                       WHERE n.kind = 'venue' AND n.target_id = v.id AND n.expires_at = vs.expires_at)
        FROM public.venue_subscriptions vs
        JOIN public.venues v ON v.id = vs.venue_id
        WHERE vs.status IN ('active', 'trialing')
          AND vs.plan <> 'free'
          AND vs.expires_at > NOW()
          AND vs.expires_at <= NOW() + make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 7), 30)))
          AND (COALESCE(vs.cancel_at_period_end, FALSE) OR vs.stripe_subscription_id IS NULL);
    END IF;
END;
$$;

-- ===========================================================================
-- Permisos
-- ===========================================================================
REVOKE ALL ON FUNCTION public.app_guest_list(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_guest_list_settings(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_guest_lists(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_guest_list_entries(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_guest_list(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_guest_list(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_guest_entry(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_guest_entry(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admit_guests(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_guest_list_info(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_guest_list(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_guest_list(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_counter_link(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_counter_link_token(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_venue_fee(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_venues(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_expiring_targets(TEXT, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.app_guest_list(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_guest_list_settings(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_lists(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_list_entries(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_guest_list(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_guest_list(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_guest_entry(UUID, UUID, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_guest_entry(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admit_guests(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_guest_list_info(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_guest_list(UUID, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_guest_list(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_counter_link(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_counter_link_token(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_venue_fee(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_venues(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_expiring_targets(TEXT, INTEGER) TO authenticated, service_role;
