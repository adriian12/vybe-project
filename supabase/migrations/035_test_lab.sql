-- ============================================================================
-- 035 · Sala de pruebas
--
-- Una sala de pruebas que administración puede llevar a donde esté con un
-- toque, para probar el flujo completo (geocerca, QR, tablón y matches) sin
-- tener que ir a un local de verdad ni tocar coordenadas a mano.
--
-- La sala y su gente salen del seed `supabase/seeds/mallorca_test_data.sql`
-- (cuentas `@seed.vybes.test`). Esta función:
--
--   · mueve el local y su evento a las coordenadas que se le pasan;
--   · deja el evento en marcha al menos siete días más y reactiva su código
--     (`LAB777`);
--   · recoloca a la gente del seed que está dentro, a unos metros del punto, y
--     la mantiene presente mientras dure el evento;
--   · hace que la mitad de esa gente le dé like a quien la llama, para poder
--     probar un match sin una segunda persona;
--   · opcionalmente borra los swipes de quien la llama en ese evento, para
--     volver a ver el tablón entero.
--
-- Sólo administración: mover un local cambia dónde vale su geocerca.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_test_lab(
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_reset_my_swipes BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    access_code TEXT,
    people_inside INTEGER,
    likes_for_you INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_me UUID := public.current_profile_id();
    v_venue_id UUID;
    v_event public.events%ROWTYPE;
    v_inside INTEGER;
    v_likes INTEGER := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF p_latitude IS NULL OR p_longitude IS NULL
       OR p_latitude NOT BETWEEN -90 AND 90
       OR p_longitude NOT BETWEEN -180 AND 180 THEN
        RAISE EXCEPTION 'INVALID_LOCATION';
    END IF;

    SELECT v.id INTO v_venue_id
    FROM public.venues v
    WHERE v.email = 'sala-pruebas@seed.vybes.test';

    IF v_venue_id IS NULL THEN
        RAISE EXCEPTION 'TEST_LAB_NOT_FOUND';
    END IF;

    UPDATE public.venues
    SET latitude = p_latitude, longitude = p_longitude
    WHERE id = v_venue_id;

    SELECT * INTO v_event
    FROM public.events e
    WHERE e.venue_id = v_venue_id
    ORDER BY e.created_at
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TEST_LAB_NOT_FOUND';
    END IF;

    UPDATE public.events e
    SET latitude   = p_latitude,
        longitude  = p_longitude,
        start_date = LEAST(e.start_date, NOW() - INTERVAL '1 hour'),
        end_date   = GREATEST(e.end_date, NOW() + INTERVAL '7 days')
    WHERE e.id = v_event.id
    RETURNING * INTO v_event;

    UPDATE public.event_codes c
    SET active = TRUE, expires_at = v_event.end_date, event_id = v_event.id, venue_id = v_venue_id
    WHERE c.code = 'LAB777';

    IF NOT FOUND THEN
        INSERT INTO public.event_codes (venue_id, event_id, code, expires_at, active, kind, label)
        VALUES (v_venue_id, v_event.id, 'LAB777', v_event.end_date, TRUE, 'general', 'Sala de pruebas');
    END IF;

    -- Cada persona del seed a unos metros del punto. El desplazamiento sale del
    -- hash de su id: siempre la misma posición relativa, sin amontonarse.
    UPDATE public.profiles p
    SET latitude  = p_latitude
                    + ((('x' || substr(md5(p.id::text), 1, 4))::bit(16)::int % 60) - 30) * 0.000008,
        longitude = p_longitude
                    + ((('x' || substr(md5(p.id::text), 5, 4))::bit(16)::int % 60) - 30) * 0.00001
    FROM public.event_attendance ea
    WHERE ea.profile_id = p.id
      AND ea.event_id = v_event.id
      AND p.email LIKE '%@seed.vybes.test';

    -- Presentes mientras dure el evento: el tablón sólo enseña a quien se ha
    -- visto en las últimas doce horas.
    UPDATE public.event_attendance ea
    SET latitude = p.latitude, longitude = p.longitude, last_seen_at = v_event.end_date
    FROM public.profiles p
    WHERE p.id = ea.profile_id
      AND ea.event_id = v_event.id
      AND p.email LIKE '%@seed.vybes.test';

    SELECT COUNT(*) INTO v_inside
    FROM public.event_attendance ea
    JOIN public.profiles p ON p.id = ea.profile_id
    WHERE ea.event_id = v_event.id AND p.email LIKE '%@seed.vybes.test';

    IF v_me IS NOT NULL THEN
        IF p_reset_my_swipes THEN
            DELETE FROM public.swipes s WHERE s.swiper_id = v_me AND s.event_id = v_event.id;
        END IF;

        -- La mitad de la sala te da like (una de cada cinco, super like). Si ya
        -- le habías dado like a alguien, el disparador crea el match al momento.
        WITH candidatos AS (
            SELECT ea.profile_id,
                   ('x' || substr(md5(ea.profile_id::text || v_me::text), 1, 2))::bit(8)::int AS h
            FROM public.event_attendance ea
            JOIN public.profiles p ON p.id = ea.profile_id
            WHERE ea.event_id = v_event.id
              AND p.email LIKE '%@seed.vybes.test'
              AND p.id <> v_me
        ), insertados AS (
            INSERT INTO public.swipes (swiper_id, swiped_id, swipe_type, event_id)
            SELECT c.profile_id, v_me,
                   CASE WHEN c.h % 5 = 0 THEN 'super_like' ELSE 'like' END,
                   v_event.id
            FROM candidatos c
            WHERE c.h % 2 = 0
              AND NOT EXISTS (
                  SELECT 1 FROM public.swipes s
                  WHERE s.swiper_id = c.profile_id AND s.swiped_id = v_me
              )
            RETURNING 1
        )
        SELECT COUNT(*) INTO v_likes FROM insertados;

        SELECT COUNT(*) INTO v_likes
        FROM public.swipes s
        JOIN public.profiles p ON p.id = s.swiper_id
        WHERE s.swiped_id = v_me
          AND s.event_id = v_event.id
          AND s.swipe_type IN ('like', 'super_like')
          AND p.email LIKE '%@seed.vybes.test';
    END IF;

    RETURN QUERY SELECT v_event.id, v_event.name, 'LAB777'::TEXT, v_inside, v_likes;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_test_lab(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_test_lab(DOUBLE PRECISION, DOUBLE PRECISION, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.admin_reset_test_lab IS
    'Sólo administración. Mueve la sala de pruebas del seed a unas coordenadas, la deja en marcha con su gente dentro y hace que la mitad le dé like a quien llama.';
