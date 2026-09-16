-- ============================================================================
-- 034. El impulso ordena el tablón
-- ============================================================================
-- `start_boost()` no servía de nada por sí solo: el tablón seguía ordenando por
-- intereses en común y distancia. Aquí se añade el impulso como primer criterio.
--
-- No se devuelve ninguna columna que diga quién está destacando. El de al lado
-- no tiene por qué saber quién ha pagado, y decirlo convertiría la ventaja en
-- una etiqueta. Quien lo compra lo ve en su propia pantalla, con su cuenta
-- atrás, y con eso basta.
--
-- Es la función de la migración 025 con dos cambios: un LEFT JOIN a
-- `profile_boosts` y una línea más en el ORDER BY.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]);

CREATE FUNCTION public.get_nearby_profiles(
    p_user_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_radius_meters INTEGER DEFAULT 5000,
    p_event_id UUID DEFAULT NULL,
    p_min_age INTEGER DEFAULT NULL,
    p_max_age INTEGER DEFAULT NULL,
    p_interest_slugs TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    age INTEGER,
    bio TEXT,
    photos TEXT[],
    avatar TEXT,
    distance_meters DOUBLE PRECISION,
    is_verified BOOLEAN,
    interests TEXT[],
    shared_interests INTEGER,
    gender TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_my_interests UUID[];
    v_my_gender TEXT;
    v_my_wants TEXT;
    v_i_have_photo BOOLEAN;
BEGIN
    -- Quien no ha puesto su foto de esta noche no ve el tablón. Se devuelve
    -- vacío en lugar de un error: la pantalla ya sabe pedir la foto, y un error
    -- aquí no le diría al usuario qué tiene que hacer.
    IF p_event_id IS NOT NULL THEN
        SELECT ea.photo_url IS NOT NULL
        INTO v_i_have_photo
        FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = p_user_id;

        IF NOT COALESCE(v_i_have_photo, FALSE) THEN
            RETURN;
        END IF;
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
            -- Solo para ordenar: no sale en el resultado.
            (b.profile_id IS NOT NULL) AS boosted
        FROM public.profiles p
        LEFT JOIN public.event_attendance ea
               ON ea.profile_id = p.id AND ea.event_id = p_event_id
        LEFT JOIN public.profile_boosts b
               ON b.profile_id = p.id
              AND b.event_id = p_event_id
              AND b.expires_at > NOW()
        WHERE p.id <> p_user_id
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND p.is_verified = TRUE
          -- Invisible sólo para quien lo tiene pagado (véase la cabecera).
          AND NOT (p.is_invisible AND public.is_premium(p.id))
          AND p.status = 'active'
          AND (p.suspended_until IS NULL OR p.suspended_until < NOW())
          AND (p_min_age IS NULL OR p.age >= p_min_age)
          AND (p_max_age IS NULL OR p.age <= p_max_age)
          -- Interés mutuo: yo quiero ver su género y esa persona el mío.
          AND public.wants_gender(v_my_wants, p.gender)
          AND public.wants_gender(p.wants, v_my_gender)
          AND (
              p_event_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.event_attendance a
                  WHERE a.event_id = p_event_id
                    AND a.profile_id = p.id
                    AND a.last_seen_at > NOW() - INTERVAL '12 hours'
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
    WHERE nearby.distance_meters <= p_radius_meters
    ORDER BY
        -- Quien ha comprado su hora, primero.
        nearby.boosted DESC,
        -- Después, los intereses en común pesan más que la distancia pura.
        nearby.shared_interests DESC,
        nearby.distance_meters ASC
    LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearby_profiles(uuid, double precision, double precision, integer, uuid, integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_profiles(uuid, double precision, double precision, integer, uuid, integer, integer, text[]) TO authenticated;

COMMENT ON FUNCTION public.get_nearby_profiles IS

    'Tablón del evento. Exige foto de esta noche en las dos direcciones; el modo invisible sólo surte efecto con suscripción, y quien tiene un impulso activo sale primero.';
