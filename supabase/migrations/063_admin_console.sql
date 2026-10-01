-- 063: consola de administración.
--
-- Una cuenta de administración que sólo administra (`profiles.staff_only`) y
-- las funciones que necesita el panel: ver a todas las personas y locales,
-- cambiarles la suscripción, regalar supercrush y ver los eventos de cada
-- local. Todo pasa por `is_admin()`: sin eso, cualquiera con sesión podría
-- leer la lista entera de usuarios.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS staff_only BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.staff_only IS
  'Cuenta sólo de administración: no sale de fiesta, no aparece en tablones.';

-- El móvil no puede ponerse ni quitarse esta marca. Es la función de la
-- migración 045 con `staff_only` añadida: lo demás se queda igual.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    -- Dentro de una función SECURITY DEFINER `current_user` es su propietario:
    -- esas funciones ya comprueban quién llama y calculan las columnas.
    IF current_user NOT IN ('authenticated', 'anon')
       OR auth.uid() IS NULL
       OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    NEW.role              := OLD.role;
    NEW.is_verified       := OLD.is_verified;
    NEW.face_verified     := OLD.face_verified;
    NEW.phone_verified    := OLD.phone_verified;
    NEW.status            := OLD.status;
    NEW.suspended_until   := OLD.suspended_until;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.staff_only        := OLD.staff_only;

    -- Las fotos se pueden quitar, no añadir: las añade `review_photo()` cuando
    -- la moderación las aprueba.
    IF NEW.photos IS DISTINCT FROM OLD.photos
       AND NOT (NEW.photos <@ COALESCE(OLD.photos, '{}'::text[])) THEN
        NEW.photos := OLD.photos;
    END IF;

    -- El avatar: quitarlo o elegir una foto ya aprobada.
    IF NEW.avatar IS DISTINCT FROM OLD.avatar
       AND NEW.avatar IS NOT NULL
       AND NOT (NEW.avatar = ANY (COALESCE(NEW.photos, '{}'::text[]))) THEN
        NEW.avatar := OLD.avatar;
    END IF;

    RETURN NEW;
END;
$function$;

-- Quien sólo administra no sale en ningún tablón.
CREATE OR REPLACE FUNCTION public.admin_is_staff_only()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT staff_only FROM public.profiles WHERE user_id = auth.uid()), FALSE);
$$;

-- ---------------------------------------------------------------- personas
CREATE OR REPLACE FUNCTION public.admin_list_users(
    p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    profile_id UUID,
    name TEXT,
    email TEXT,
    age INTEGER,
    role TEXT,
    account_type TEXT,
    status TEXT,
    is_verified BOOLEAN,
    staff_only BOOLEAN,
    created_at TIMESTAMPTZ,
    subscription_type TEXT,
    subscription_expires_at TIMESTAMPTZ,
    subscription_event_id UUID,
    supercrush INTEGER,
    check_ins BIGINT,
    total_count BIGINT
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
        (SELECT n FROM total)
    FROM base b
    LEFT JOIN LATERAL (
        SELECT ps.subscription_type, ps.expires_at, ps.event_id
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

-- Cambiar la suscripción de alguien a mano: 'none' la quita.
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
    p_profile_id UUID,
    p_type TEXT,
    p_days INTEGER DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expira TIMESTAMPTZ;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_type NOT IN ('none', 'monthly', 'lifetime') THEN
        RAISE EXCEPTION 'INVALID_TYPE';
    END IF;

    -- Las de un evento no se tocan: son de una noche y las pone el pago.
    UPDATE public.premium_subscriptions
    SET status = 'cancelled'
    WHERE user_id = p_profile_id AND status = 'active' AND event_id IS NULL;

    IF p_type = 'none' THEN
        RETURN 'none';
    END IF;

    v_expira := CASE WHEN p_type = 'lifetime' THEN NULL
                     ELSE NOW() + (GREATEST(1, COALESCE(p_days, 30)) || ' days')::INTERVAL END;

    INSERT INTO public.premium_subscriptions (user_id, subscription_type, event_id, status, started_at, expires_at)
    VALUES (p_profile_id, p_type, NULL, 'active', NOW(), v_expira)
    ON CONFLICT (user_id, event_id, subscription_type)
    DO UPDATE SET status = 'active', started_at = NOW(), expires_at = EXCLUDED.expires_at,
                  cancel_at_period_end = FALSE;

    RETURN p_type;
END;
$$;

-- Regalar (o quitar) supercrush.
CREATE OR REPLACE FUNCTION public.admin_add_supercrush(p_profile_id UUID, p_quantity INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_quantity = 0 OR ABS(p_quantity) > 100 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;
    IF public.supercrush_balance(p_profile_id) + p_quantity < 0 THEN
        RAISE EXCEPTION 'NOT_ENOUGH';
    END IF;

    INSERT INTO public.supercrush_ledger (profile_id, delta, reason)
    VALUES (p_profile_id, p_quantity, 'admin');

    RETURN public.supercrush_balance(p_profile_id);
END;
$$;

-- ----------------------------------------------------------------- locales
CREATE OR REPLACE FUNCTION public.admin_list_venues(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
    venue_id UUID,
    name TEXT,
    email TEXT,
    city TEXT,
    type TEXT,
    is_verified BOOLEAN,
    verification_status TEXT,
    created_at TIMESTAMPTZ,
    plan TEXT,
    plan_status TEXT,
    plan_expires_at TIMESTAMPTZ,
    events_total BIGINT,
    events_upcoming BIGINT,
    members BIGINT,
    followers BIGINT
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
        (SELECT COUNT(*) FROM public.venue_followers f WHERE f.venue_id = v.id)
    FROM public.venues v
    LEFT JOIN LATERAL (
        SELECT vs.plan, vs.status, vs.expires_at
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

CREATE OR REPLACE FUNCTION public.admin_set_venue_plan(p_venue_id UUID, p_plan TEXT, p_days INTEGER DEFAULT 30)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_plan NOT IN ('free', 'pro', 'business') THEN
        RAISE EXCEPTION 'INVALID_PLAN';
    END IF;

    IF p_plan = 'free' THEN
        UPDATE public.venue_subscriptions SET status = 'cancelled' WHERE venue_id = p_venue_id;
        RETURN 'free';
    END IF;

    INSERT INTO public.venue_subscriptions (venue_id, plan, status, started_at, expires_at, cancel_at_period_end)
    VALUES (p_venue_id, p_plan, 'active', NOW(),
            NOW() + (GREATEST(1, COALESCE(p_days, 30)) || ' days')::INTERVAL, FALSE)
    ON CONFLICT (venue_id)
    DO UPDATE SET plan = EXCLUDED.plan, status = 'active', started_at = NOW(),
                  expires_at = EXCLUDED.expires_at, cancel_at_period_end = FALSE;

    RETURN p_plan;
END;
$$;

-- Los eventos de un local, con lo que ha dado cada noche.
CREATE OR REPLACE FUNCTION public.admin_venue_events(p_venue_id UUID)
RETURNS TABLE (
    event_id UUID,
    name TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    max_capacity INTEGER,
    featured_until TIMESTAMPTZ,
    check_ins BIGINT,
    matches BIGINT,
    intents BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT
        e.id, e.name, e.start_date, e.end_date, e.max_capacity, e.featured_until,
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = e.id),
        (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = e.id),
        (SELECT COUNT(*) FROM public.event_intents i WHERE i.event_id = e.id)
    FROM public.events e
    WHERE e.venue_id = p_venue_id
    ORDER BY e.start_date DESC;
END;
$$;

-- ------------------------------------------------------------- permisos
REVOKE ALL ON FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_supercrush(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_venues(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_venue_plan(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_venue_events(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_is_staff_only() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_supercrush(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_venues(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_venue_plan(UUID, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_venue_events(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_is_staff_only() TO authenticated, service_role;
