-- =============================================================================
-- 056 · El tablón no ve a los invitados (ni ellos a él)
-- =============================================================================
-- Misma función que la 046, con el modo de asistencia: quien entra como
-- invitado no sale en el tablón y su propio tablón queda vacío.
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

REVOKE ALL ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) TO authenticated;
