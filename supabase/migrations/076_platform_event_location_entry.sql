-- 076: a las fiestas de Fiestea se entra sólo con la ubicación.
--
-- Las fiestas que crea administración sin negocio (verbenas, fiestas de
-- pueblo) cuelgan del negocio de la casa (`venues.is_platform`). No hay puerta
-- ni nadie que enseñe un QR: basta con estar dentro del radio de la fiesta.
-- SOLO para ese negocio; el resto sigue entrando con su código.

-- Una verbena ocupa más que una discoteca.
UPDATE public.venues SET event_radius = GREATEST(COALESCE(event_radius, 0), 300) WHERE is_platform;

CREATE OR REPLACE FUNCTION public.enter_platform_event(
    p_event_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION
)
RETURNS TABLE(
    event_id UUID, event_name TEXT, venue_id UUID, venue_name TEXT, venue_type TEXT,
    event_radius INTEGER, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_event RECORD;
    v_venue RECORD;
    v_distance DOUBLE PRECISION;
    v_radius INTEGER;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_event FROM public.events e WHERE e.id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_EVENT';
    END IF;

    SELECT * INTO v_venue FROM public.venues v WHERE v.id = v_event.venue_id;
    IF NOT FOUND OR NOT v_venue.is_platform THEN
        -- Las fiestas de un negocio se entran con su código.
        RAISE EXCEPTION 'CODE_REQUIRED';
    END IF;

    IF v_event.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    -- Se puede entrar desde una hora antes de que empiece.
    IF v_event.start_date > NOW() + INTERVAL '1 hour' THEN
        RAISE EXCEPTION 'EVENT_NOT_STARTED';
    END IF;

    IF v_event.entry_closed_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.event_attendance a
        WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'ENTRY_CLOSED';
    END IF;

    v_radius := COALESCE(v_venue.event_radius, 300);
    IF v_event.requires_location THEN
        IF p_latitude IS NULL OR p_longitude IS NULL THEN
            RAISE EXCEPTION 'LOCATION_REQUIRED';
        END IF;
        IF v_event.latitude IS NULL OR v_event.longitude IS NULL THEN
            RAISE EXCEPTION 'EVENT_WITHOUT_LOCATION';
        END IF;
        v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
        IF v_distance > v_radius THEN
            RAISE EXCEPTION 'TOO_FAR';
        END IF;
    END IF;

    INSERT INTO public.event_attendance AS ea (event_id, profile_id, latitude, longitude, mode)
    VALUES (
        v_event.id, v_profile_id, p_latitude, p_longitude,
        (SELECT CASE WHEN p.account_type = 'guest' THEN 'guest' END FROM public.profiles p WHERE p.id = v_profile_id)
    )
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            left_at = NULL,
            mode = COALESCE(EXCLUDED.mode, ea.mode),
            latitude = COALESCE(EXCLUDED.latitude, ea.latitude),
            longitude = COALESCE(EXCLUDED.longitude, ea.longitude);

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles SET latitude = p_latitude, longitude = p_longitude WHERE id = v_profile_id;
    END IF;

    RETURN QUERY SELECT
        v_event.id, v_event.name, v_venue.id, v_venue.name, v_venue.type, v_radius,
        v_event.start_date, v_event.end_date, v_distance;
END;
$$;

REVOKE ALL ON FUNCTION public.enter_platform_event(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enter_platform_event(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- El negocio de la casa nace con radio de verbena.
CREATE OR REPLACE FUNCTION public.admin_house_venue()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_owner UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT id INTO v_id FROM public.venues WHERE is_platform ORDER BY created_at LIMIT 1;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    SELECT p.user_id INTO v_owner FROM public.profiles p WHERE p.user_id = auth.uid();

    INSERT INTO public.venues (venue_id, name, email, type, verification_status, is_verified, city, is_platform, event_radius)
    VALUES (v_owner, 'Fiestea', COALESCE((SELECT email FROM auth.users WHERE id = v_owner), 'hola@fiestea.es'),
            'local', 'approved', TRUE, 'España', TRUE, 300)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;
