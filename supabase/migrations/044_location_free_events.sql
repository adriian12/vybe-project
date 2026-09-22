-- =============================================================================
-- 044 · Eventos sin ubicación y sala de pruebas permanente
-- =============================================================================
-- Un evento puede no exigir ubicación: se entra con el código desde cualquier
-- sitio y el tablón no filtra por distancia. Es lo que necesita la sala de
-- pruebas («Aurora Sessions», `events.test_lab`): cualquier
-- cuenta, también una recién creada y lejos de Palma, entra y ve a las personas
-- del seed para deslizar, hasta que se borren a mano.
-- =============================================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS requires_location BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.events.requires_location IS
    'FALSE: se entra sin comprobar la ubicación y el tablón no filtra por distancia.';

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS test_lab BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.test_lab IS
    'Sala de pruebas: las personas del seed salen a cualquiera, no caducan y dan likes al entrar.';

-- ---------------------------------------------------------------------------
-- ¿Es el evento de la sala de pruebas?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_test_lab_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT e.test_lab FROM public.events e WHERE e.id = p_event_id), FALSE);
$$;

-- ---------------------------------------------------------------------------
-- Canje: sin comprobar distancia si el evento no la exige
-- ---------------------------------------------------------------------------
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
-- Tablón: sin distancia en eventos sin ubicación; en la sala de pruebas, las
-- personas del seed aceptan a cualquiera (sólo cuenta lo que busca quien mira)
-- y no caducan.
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
        WHERE ea.event_id = p_event_id AND ea.profile_id = p_user_id;

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
-- Quien entra en la sala de pruebas recibe likes de la mitad de las personas
-- del seed, igual que las cuentas de prueba: así se puede probar el match.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_lab_welcome_likes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_test_lab_event(NEW.event_id) THEN
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.profile_id AND p.email LIKE '%@seed.vybe.test') THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.swipes (swiper_id, swiped_id, swipe_type, event_id)
    SELECT ea.profile_id, NEW.profile_id,
           CASE WHEN ('x' || substr(md5(ea.profile_id::text || NEW.profile_id::text), 1, 2))::bit(8)::int % 5 = 0
                THEN 'super_like' ELSE 'like' END,
           NEW.event_id
    FROM public.event_attendance ea
    JOIN public.profiles p ON p.id = ea.profile_id
    WHERE ea.event_id = NEW.event_id
      AND p.email LIKE '%@seed.vybe.test'
      AND ('x' || substr(md5(ea.profile_id::text || NEW.profile_id::text), 1, 2))::bit(8)::int % 2 = 0
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes s
          WHERE s.swiper_id = ea.profile_id AND s.swiped_id = NEW.profile_id
      );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_attendance_test_lab_likes ON public.event_attendance;
CREATE TRIGGER event_attendance_test_lab_likes
    AFTER INSERT ON public.event_attendance
    FOR EACH ROW EXECUTE FUNCTION public.test_lab_welcome_likes();

-- ---------------------------------------------------------------------------
-- Aurora Sessions: sin ubicación y abierta hasta que se borre a mano
-- ---------------------------------------------------------------------------
UPDATE public.events e
SET requires_location = FALSE,
    test_lab = TRUE,
    start_date = LEAST(e.start_date, NOW() - INTERVAL '1 hour'),
    end_date = GREATEST(e.end_date, TIMESTAMPTZ '2030-12-31 23:00:00+00')
FROM public.venues v
WHERE v.id = e.venue_id
  AND v.email = 'local@vybe-test.local'
  AND e.name = 'Aurora Sessions';

UPDATE public.event_codes c
SET expires_at = e.end_date
FROM public.events e
WHERE c.event_id = e.id
  AND c.active
  AND e.test_lab;

-- Las personas del seed siguen «vistas» mientras dure el evento.
UPDATE public.event_attendance ea
SET last_seen_at = e.end_date
FROM public.events e, public.profiles p
WHERE e.id = ea.event_id
  AND p.id = ea.profile_id
  AND p.email LIKE '%@seed.vybe.test'
  AND e.test_lab;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_test_lab_event(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.test_lab_welcome_likes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]) TO authenticated;
