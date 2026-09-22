-- =============================================================================
-- 046 · Salir del evento y foto de la noche sólo si está aprobada
-- =============================================================================
-- 1. «Salir» sólo vaciaba el estado del móvil: en la base de datos seguías
--    dentro, así que seguías en el tablón de los demás y al volver a abrir la
--    app el evento reaparecía. Ahora `leave_event()` anota `left_at`, el
--    tablón y el evento activo lo respetan y volver a canjear el código lo
--    borra. Las conversaciones con los matches no dependen de estar dentro:
--    la conexión vive hasta que caduca (24 h después del final) o se guarda.
-- 2. `set_event_photo()` aceptaba cualquier dirección que mandara el móvil: se
--    podía publicar en el tablón una imagen sin revisar. Ahora sólo acepta una
--    foto de la persona que la moderación automática haya aprobado como foto
--    de evento.
-- =============================================================================

ALTER TABLE public.event_attendance
    ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Salir
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    UPDATE public.event_attendance
    SET left_at = NOW()
    WHERE event_id = p_event_id AND profile_id = v_profile_id;
END;
$$;

-- El evento activo es el último en el que se sigue dentro.
CREATE OR REPLACE FUNCTION public.get_my_active_event()
 RETURNS TABLE(event_id uuid, event_name text, venue_id uuid, venue_name text, venue_type text, event_radius integer, start_date timestamp with time zone, end_date timestamp with time zone, checked_in_at timestamp with time zone, latitude double precision, longitude double precision, photo_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        e.id, e.name, v.id, v.name, v.type,
        COALESCE(v.event_radius, 50),
        e.start_date, e.end_date, ea.checked_in_at,
        COALESCE(e.latitude, v.latitude),
        COALESCE(e.longitude, v.longitude),
        ea.photo_url
    FROM public.event_attendance ea
    JOIN public.events e ON e.id = ea.event_id
    JOIN public.venues v ON v.id = e.venue_id
    WHERE ea.profile_id = public.current_profile_id()
      AND ea.left_at IS NULL
      AND e.end_date > NOW()
    ORDER BY ea.last_seen_at DESC
    LIMIT 1;
$function$;

-- El latido de la app no devuelve a nadie a un evento del que ha salido.
CREATE OR REPLACE FUNCTION public.heartbeat_event_attendance(p_event_id uuid, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN RETURN; END IF;

    UPDATE public.event_attendance
    SET last_seen_at = NOW(),
        latitude = COALESCE(p_latitude, latitude),
        longitude = COALESCE(p_longitude, longitude)
    WHERE event_id = p_event_id AND profile_id = v_profile_id
      AND left_at IS NULL;

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles
        SET latitude = p_latitude, longitude = p_longitude
        WHERE id = v_profile_id;
    END IF;
END;
$function$;

-- Volver a entrar con el código borra la salida.
CREATE OR REPLACE FUNCTION public.redeem_event_code(p_code text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision)
 RETURNS TABLE(event_id uuid, event_name text, venue_id uuid, venue_name text, venue_type text, event_radius integer, start_date timestamp with time zone, end_date timestamp with time zone, distance_meters double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_profile_id UUID;
    v_code RECORD;
    v_event RECORD;
    v_venue RECORD;
    v_distance DOUBLE PRECISION;
BEGIN
    v_profile_id := public.current_profile_id();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_code
    FROM public.event_codes ec
    WHERE upper(ec.code) = upper(btrim(p_code))
      AND ec.active = TRUE
      AND ec.expires_at > NOW()
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_CODE';
    END IF;

    -- Las listas cerradas tienen aforo propio: cuando se agota, se agota.
    IF v_code.max_uses IS NOT NULL AND v_code.uses >= v_code.max_uses THEN
        RAISE EXCEPTION 'CODE_EXHAUSTED';
    END IF;

    SELECT * INTO v_venue FROM public.venues WHERE id = v_code.venue_id;
    IF NOT FOUND OR v_venue.is_verified = FALSE THEN
        RAISE EXCEPTION 'VENUE_NOT_VERIFIED';
    END IF;

    IF v_code.event_id IS NOT NULL THEN
        SELECT * INTO v_event FROM public.events WHERE id = v_code.event_id;
    ELSE
        SELECT * INTO v_event
        FROM public.events e
        WHERE e.venue_id = v_code.venue_id AND e.end_date > NOW()
        ORDER BY e.start_date ASC
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_EVENT';
    END IF;

    IF v_event.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;

    -- Puerta cerrada: sólo vuelve a entrar quien ya estaba dentro.
    IF v_event.entry_closed_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.event_attendance a
        WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'ENTRY_CLOSED';
    END IF;

    v_distance := NULL;
    IF v_event.requires_location AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        IF v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
        ELSIF v_venue.latitude IS NOT NULL AND v_venue.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_venue.latitude, v_venue.longitude);
        END IF;

        IF v_distance IS NOT NULL AND v_distance > COALESCE(v_venue.event_radius, 50) THEN
            RAISE EXCEPTION 'TOO_FAR';
        END IF;
    END IF;

    INSERT INTO public.event_attendance AS ea (
        event_id, profile_id, latitude, longitude, code_id
    )
    VALUES (v_event.id, v_profile_id, p_latitude, p_longitude, v_code.id)
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            -- Volver a entrar con el código borra la salida.
            left_at = NULL,
            latitude = COALESCE(EXCLUDED.latitude, ea.latitude),
            longitude = COALESCE(EXCLUDED.longitude, ea.longitude),
            -- La atribución es del primer código con el que entró: si vuelve a
            -- canjear otro, el RRPP que lo trajo no cambia.
            code_id = COALESCE(ea.code_id, EXCLUDED.code_id);

    -- El contador sólo sube en el primer canje de esta persona con este código.
    UPDATE public.event_codes
    SET uses = uses + 1
    WHERE id = v_code.id
      AND EXISTS (
          SELECT 1 FROM public.event_attendance a
          WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
            AND a.code_id = v_code.id AND a.checked_in_at > NOW() - INTERVAL '5 seconds'
      );

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles
        SET latitude = p_latitude, longitude = p_longitude
        WHERE id = v_profile_id;
    END IF;

    RETURN QUERY SELECT
        v_event.id, v_event.name, v_venue.id, v_venue.name, v_venue.type,
        COALESCE(v_venue.event_radius, 50),
        v_event.start_date, v_event.end_date, v_distance;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Tablón: fuera quien ha salido (y quien ha salido no ve el tablón)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nearby_profiles(p_user_id uuid, p_latitude double precision, p_longitude double precision, p_radius_meters integer DEFAULT 5000, p_event_id uuid DEFAULT NULL::uuid, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_interest_slugs text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, name text, age integer, bio text, photos text[], avatar text, distance_meters double precision, is_verified boolean, interests text[], shared_interests integer, gender text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_my_interests UUID[];
    v_my_gender TEXT;
    v_my_wants TEXT;
    v_i_have_photo BOOLEAN;
    v_sin_distancia BOOLEAN := FALSE;
    v_lab BOOLEAN := FALSE;
BEGIN
    -- Quien no ha puesto su foto de esta noche no ve el tablón. Se devuelve
    -- vacío en lugar de un error: la pantalla ya sabe pedir la foto, y un error
    -- aquí no le diría al usuario qué tiene que hacer.
    IF p_event_id IS NOT NULL THEN
        SELECT ea.photo_url IS NOT NULL
        INTO v_i_have_photo
        FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = p_user_id
          AND ea.left_at IS NULL;

        IF NOT COALESCE(v_i_have_photo, FALSE) THEN
            RETURN;
        END IF;

        SELECT NOT e.requires_location INTO v_sin_distancia
        FROM public.events e WHERE e.id = p_event_id;
        v_sin_distancia := COALESCE(v_sin_distancia, FALSE);
        v_lab := public.is_test_lab_event(p_event_id);
    END IF;

    SELECT COALESCE(array_agg(pi.interest_id), '{}')
    INTO v_my_interests
    FROM public.profile_interests pi
    WHERE pi.profile_id = p_user_id;

    SELECT pr.gender, pr.wants INTO v_my_gender, v_my_wants
    FROM public.profiles pr WHERE pr.id = p_user_id;

    RETURN QUERY
    WITH nearby AS (
        SELECT
            p.id,
            p.name,
            p.age,
            p.bio,
            -- La foto del evento manda sobre la del perfil: es la de esta noche.
            CASE
                WHEN ea.photo_url IS NOT NULL THEN ARRAY[ea.photo_url]
                ELSE p.photos
            END AS photos,
            COALESCE(ea.photo_url, p.avatar) AS avatar,
            p.is_verified,
            p.gender,
            public.get_distance(p_latitude, p_longitude, p.latitude, p.longitude) AS distance_meters,
            COALESCE(
                (SELECT array_agg(i.slug ORDER BY i.sort_order)
                   FROM public.profile_interests pi
                   JOIN public.interests i ON i.id = pi.interest_id
                  WHERE pi.profile_id = p.id),
                '{}'
            ) AS interests,
            (SELECT COUNT(*)::INTEGER
               FROM public.profile_interests pi
              WHERE pi.profile_id = p.id
                AND pi.interest_id = ANY(v_my_interests)) AS shared_interests,
            -- Sólo para ordenar: no sale en el resultado.
            (b.profile_id IS NOT NULL) AS boosted,
            (v_lab AND p.email LIKE '%@seed.vybe.test') AS de_prueba
        FROM public.profiles p
        LEFT JOIN public.event_attendance ea
               ON ea.profile_id = p.id AND ea.event_id = p_event_id
        LEFT JOIN public.profile_boosts b
               ON b.profile_id = p.id
              AND b.event_id = p_event_id
              AND b.expires_at > NOW()
        WHERE p.id <> p_user_id
          AND (v_sin_distancia OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL))
          AND p.is_verified = TRUE
          -- Invisible sólo para quien lo tiene pagado.
          AND NOT (p.is_invisible AND public.is_premium(p.id))
          AND p.status = 'active'
          AND (p.suspended_until IS NULL OR p.suspended_until < NOW())
          AND (p_min_age IS NULL OR p.age >= p_min_age)
          AND (p_max_age IS NULL OR p.age <= p_max_age)
          -- Interés mutuo: yo quiero ver su género y esa persona el mío. Las
          -- personas de prueba aceptan a cualquiera.
          AND public.wants_gender(v_my_wants, p.gender)
          AND ((v_lab AND p.email LIKE '%@seed.vybe.test') OR public.wants_gender(p.wants, v_my_gender))
          AND (
              p_event_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.event_attendance a
                  WHERE a.event_id = p_event_id
                    AND a.profile_id = p.id
                    -- Quien ha salido del evento deja de salir en el tablón.
                    AND a.left_at IS NULL
                    -- Las personas de prueba no caducan.
                    AND ((v_lab AND p.email LIKE '%@seed.vybe.test')
                         OR a.last_seen_at > NOW() - INTERVAL '12 hours')
                    -- Sin la foto de esta noche no se sale en el tablón.
                    AND a.photo_url IS NOT NULL
              )
          )
          AND (
              p_interest_slugs IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.profile_interests pi
                  JOIN public.interests i ON i.id = pi.interest_id
                  WHERE pi.profile_id = p.id AND i.slug = ANY(p_interest_slugs)
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.blocks b2
              WHERE (b2.blocker_id = p_user_id AND b2.blocked_id = p.id)
                 OR (b2.blocker_id = p.id AND b2.blocked_id = p_user_id)
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.swipes s
              WHERE s.swiper_id = p_user_id
                AND s.swiped_id = p.id
                AND (p_event_id IS NULL OR s.event_id = p_event_id OR s.event_id IS NULL)
          )
    )
    SELECT
        nearby.id, nearby.name, nearby.age, nearby.bio, nearby.photos, nearby.avatar,
        nearby.distance_meters, nearby.is_verified, nearby.interests,
        nearby.shared_interests, nearby.gender
    FROM nearby
    WHERE v_sin_distancia OR nearby.distance_meters <= p_radius_meters
    ORDER BY
        -- Quien ha comprado su hora, primero.
        nearby.boosted DESC,
        -- Después, los intereses en común pesan más que la distancia pura.
        nearby.shared_interests DESC,
        nearby.distance_meters ASC NULLS LAST
    LIMIT 60;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Foto de la noche: sólo la aprobada por la moderación automática
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_event_photo(p_event_id uuid, p_photo_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.moderation_queue mq
        WHERE mq.profile_id = v_profile_id
          AND mq.url = p_photo_url
          AND mq.kind = 'event_photo'
          AND mq.status = 'approved'
    ) THEN
        RAISE EXCEPTION 'PHOTO_NOT_APPROVED';
    END IF;

    UPDATE public.event_attendance
    SET photo_url = p_photo_url, photo_taken_at = NOW()
    WHERE event_id = p_event_id AND profile_id = v_profile_id AND left_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.leave_event(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_event(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_active_event() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_active_event() TO authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_event_attendance(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_event_attendance(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
REVOKE ALL ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.set_event_photo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_photo(UUID, TEXT) TO authenticated;
