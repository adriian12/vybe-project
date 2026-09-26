-- Ajustes de la fiesta que decide el negocio (panel → Puerta y edición del evento):
--
--   · swipe_enabled: si dentro se puede conocer gente (tablón, deslizar, match).
--     Apagado, nadie entra como fiester@ (set_event_mode), el tablón sale vacío
--     (get_nearby_profiles) y no se puede deslizar (disparador en swipes).
--   · show_headcount: el público ve cuánta gente hay dentro, en directo. Sale
--     el total de la puerta si el negocio lo actualiza, y si no, quien entró con
--     la app.
--   · show_gender_split: el público ve el % de hombres y mujeres, en directo.
--
-- Por defecto el swipe está encendido y las dos cifras, apagadas: sin permiso
-- del negocio no se publica ni cuánta gente tiene ni quién es.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS swipe_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_headcount BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_gender_split BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------------ ajustes
CREATE OR REPLACE FUNCTION public.set_event_live_settings(
    p_event_id UUID,
    p_swipe BOOLEAN,
    p_headcount BOOLEAN,
    p_gender BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Son decisiones del negocio: propietario o administración.
    IF NOT (
        public.is_admin()
        OR (COALESCE(public.current_venue_role(), '') = 'owner'
            AND EXISTS (SELECT 1 FROM public.events e
                        WHERE e.id = p_event_id AND e.venue_id = public.current_venue_id()))
    ) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.events
    SET swipe_enabled = COALESCE(p_swipe, swipe_enabled),
        show_headcount = COALESCE(p_headcount, show_headcount),
        show_gender_split = COALESCE(p_gender, show_gender_split)
    WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_live_settings(UUID, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_live_settings(UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------ swipe apagado
CREATE OR REPLACE FUNCTION public.check_event_swipe_enabled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.event_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = NEW.event_id AND NOT e.swipe_enabled) THEN
        RAISE EXCEPTION 'SWIPE_DISABLED';
    END IF;
    RETURN NEW;
END;
$$;

-- Se llama «a_…» para ir antes que el cobro de supercrush (los disparadores
-- van por orden alfabético): un swipe rechazado no gasta saldo.
DROP TRIGGER IF EXISTS a_check_event_swipe_enabled ON public.swipes;
CREATE TRIGGER a_check_event_swipe_enabled
    BEFORE INSERT ON public.swipes
    FOR EACH ROW EXECUTE FUNCTION public.check_event_swipe_enabled();

CREATE OR REPLACE FUNCTION public.set_event_mode(p_event_id uuid, p_mode text)
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
    IF p_mode NOT IN ('vyber', 'guest') THEN
        RAISE EXCEPTION 'INVALID_MODE';
    END IF;
    -- Sin swipe en la fiesta, sólo se entra como invitado.
    IF p_mode = 'vyber' AND EXISTS (
        SELECT 1 FROM public.events e WHERE e.id = p_event_id AND NOT e.swipe_enabled
    ) THEN
        RAISE EXCEPTION 'SWIPE_DISABLED';
    END IF;

    UPDATE public.event_attendance
    SET mode = p_mode,
        -- Como invitado no se sale en el tablón: la foto de esta noche se va.
        photo_url = CASE WHEN p_mode = 'guest' THEN NULL ELSE photo_url END,
        photo_taken_at = CASE WHEN p_mode = 'guest' THEN NULL ELSE photo_taken_at END
    WHERE event_id = p_event_id AND profile_id = v_profile_id AND left_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    -- Y los likes de esta fiesta que no llegaron a match tampoco tienen sentido.
    IF p_mode = 'guest' THEN
        DELETE FROM public.swipes s
        WHERE s.swiper_id = v_profile_id
          AND s.event_id = p_event_id
          AND s.swipe_type IN ('like', 'super_like')
          AND NOT public.are_connected(v_profile_id, s.swiped_id);
    END IF;
END;
$function$;

-- ---------------------------------------------------------- tablón (swipe)
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

        -- El negocio decide si en su fiesta se conoce gente (migración 081).
        IF EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND NOT e.swipe_enabled) THEN
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

-- ------------------------------------------------ cifras en directo (ficha)
-- Nuevas columnas: headcount (sólo si el negocio lo publica y la fiesta está en
-- marcha) y swipe_enabled. women_share sale sólo con show_gender_split.
DROP FUNCTION IF EXISTS public.get_events_activity(uuid[]);

CREATE FUNCTION public.get_events_activity(p_event_ids uuid[])
 RETURNS TABLE(event_id uuid, going bigint, inside bigint, vibe_level text, vibe_at timestamp with time zone, friends_going bigint, trend text, women_share integer, queue_level text, now_playing text, entry_closed boolean, headcount integer, swipe_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH yo AS (SELECT public.current_profile_id() AS id)
    SELECT
        e.id,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        app.inside,
        CASE WHEN f.total IS NOT NULL
             THEN public.vibe_level_for(GREATEST(f.total, app.inside), e.max_capacity) END,
        f.updated_at,
        (SELECT COUNT(*)
         FROM public.event_intents ei
         JOIN public.connections c
           ON c.expires_at IS NULL
          AND ((c.user_id_1 = yo.id AND c.user_id_2 = ei.profile_id)
            OR (c.user_id_2 = yo.id AND c.user_id_1 = ei.profile_id))
         WHERE ei.event_id = e.id),
        CASE WHEN e.start_date <= NOW() AND e.end_date > NOW() THEN public.event_trend(e.id) END,
        CASE WHEN e.show_gender_split AND e.start_date <= NOW() AND e.end_date > NOW()
             THEN public.event_women_share(e.id) END,
        CASE WHEN e.queue_updated_at > NOW() - INTERVAL '45 minutes' AND e.end_date > NOW()
             THEN e.queue_level END,
        CASE WHEN e.now_playing_at > NOW() - INTERVAL '30 minutes' AND e.end_date > NOW()
             THEN e.now_playing END,
        e.entry_closed_at IS NOT NULL,
        CASE WHEN e.show_headcount AND e.start_date <= NOW() AND e.end_date > NOW()
             THEN GREATEST(COALESCE(f.total, 0), app.inside)::INTEGER END,
        e.swipe_enabled
    FROM public.events e
    CROSS JOIN yo
    CROSS JOIN LATERAL (SELECT public.vybe_inside(e.id) AS inside) app
    LEFT JOIN LATERAL public.fresh_headcount(e.id) f ON TRUE
    WHERE e.id = ANY(p_event_ids);
$function$;

REVOKE ALL ON FUNCTION public.get_events_activity(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_events_activity(uuid[]) TO authenticated, service_role;
