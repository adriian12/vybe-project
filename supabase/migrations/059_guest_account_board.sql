-- =============================================================================
-- 059 · La cuenta de invitado no pisa el tablón
-- =============================================================================
-- Con el tipo de cuenta (migración 058), el tablón comprueba las dos cosas: el
-- modo de esa fiesta y el tipo de cuenta. Y al canjear el código, una cuenta de
-- invitado entra ya como invitada, sin preguntarle nada.
-- =============================================================================

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
          AND ea.left_at IS NULL
          -- Un invitado no ve el tablón (ni sale en él).
          AND COALESCE(ea.mode, 'vyber') = 'vyber';

        -- Una cuenta de invitado no ve el tablón en ninguna fiesta.
        IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.account_type = 'guest') THEN
            RETURN;
        END IF;

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
          -- Ni sale en él.
          AND p.account_type = 'vyber'
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
                    AND COALESCE(a.mode, 'vyber') = 'vyber'
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

    -- Una cuenta de invitado entra siempre como invitada: no se le pregunta.
    INSERT INTO public.event_attendance AS ea (
        event_id, profile_id, latitude, longitude, code_id, mode
    )
    VALUES (
        v_event.id, v_profile_id, p_latitude, p_longitude, v_code.id,
        (SELECT CASE WHEN p.account_type = 'guest' THEN 'guest' END FROM public.profiles p WHERE p.id = v_profile_id)
    )
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            -- Volver a entrar con el código borra la salida.
            left_at = NULL,
            mode = COALESCE(EXCLUDED.mode, ea.mode),
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

REVOKE ALL ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
