-- ============================================================================
-- 098 · Los me gusta caducan con la fiesta
-- ============================================================================
-- Un me gusta que no ha llegado a crush es de esa noche: cuando la fiesta
-- termina, desaparece (el que diste y el que te dieron). Una hora antes llega
-- el aviso «Tienes N me gusta que desaparecen en una hora» a quien los tiene
-- sin responder, para que los devuelva.
--
--   · «Le gustas» deja de enseñar los de fiestas terminadas al momento, sin
--     esperar al borrado.
--   · `notify-events` (cada 5 min) borra los de fiestas terminadas con
--     `purge_ended_event_likes()`. Los crushes no se tocan, ni los me gusta
--     sin fiesta (devueltos desde «Le gustas» fuera de una fiesta).
--   · Antes de borrar se guardan los totales de la fiesta
--     (`event_swipe_totals`) para que el embudo y el resumen del negocio no
--     bajen.
--   · Aurora Sessions (sala de pruebas, hasta 2030) no termina, así que sus
--     me gusta de prueba siguen.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_swipe_totals (
    event_id UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
    swipes BIGINT NOT NULL DEFAULT 0,
    swipers BIGINT NOT NULL DEFAULT 0,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.event_swipe_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_swipe_totals FROM PUBLIC, anon, authenticated;

-- Como todas las tablas de `public` (092).
DROP TRIGGER IF EXISTS a_api_rate_guard ON public.event_swipe_totals;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.event_swipe_totals
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

ALTER TABLE public.event_push_log DROP CONSTRAINT IF EXISTS event_push_log_kind_check;
ALTER TABLE public.event_push_log
    ADD CONSTRAINT event_push_log_kind_check
    CHECK (kind IN ('doors_open', 'filling_up', 'ending_soon', 'broadcast', 'likes_expiring'));

-- ---------------------------------------------------------------------------
-- Borrado de los me gusta de fiestas terminadas. Sólo `service_role`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_ended_event_likes(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_borrados INTEGER;
BEGIN
    -- Los totales, antes de que el borrado los cambie (una vez por fiesta).
    INSERT INTO public.event_swipe_totals (event_id, swipes, swipers)
    SELECT e.id,
           (SELECT COUNT(*) FROM public.swipes s2 WHERE s2.event_id = e.id),
           (SELECT COUNT(DISTINCT s2.swiper_id) FROM public.swipes s2 WHERE s2.event_id = e.id)
    FROM public.events e
    WHERE e.end_date <= NOW()
      AND EXISTS (SELECT 1 FROM public.swipes s WHERE s.event_id = e.id AND s.swipe_type IN ('like', 'super_like'))
      AND NOT EXISTS (SELECT 1 FROM public.event_swipe_totals t WHERE t.event_id = e.id)
    ON CONFLICT (event_id) DO NOTHING;

    WITH borrar AS (
        SELECT s.id
        FROM public.swipes s
        JOIN public.events e ON e.id = s.event_id
        WHERE e.end_date <= NOW()
          AND s.swipe_type IN ('like', 'super_like')
          AND NOT EXISTS (
              SELECT 1 FROM public.connections c
              WHERE (c.user_id_1 = s.swiper_id AND c.user_id_2 = s.swiped_id)
                 OR (c.user_id_1 = s.swiped_id AND c.user_id_2 = s.swiper_id)
          )
        LIMIT GREATEST(COALESCE(p_limit, 5000), 1)
    )
    DELETE FROM public.swipes s USING borrar b WHERE s.id = b.id;

    GET DIAGNOSTICS v_borrados = ROW_COUNT;
    RETURN v_borrados;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_ended_event_likes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_ended_event_likes(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- «Le gustas»: sin los de fiestas terminadas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_likes_received()
 RETURNS TABLE(id uuid, name text, age integer, bio text, photos text[], avatar text, swipe_type text, event_name text, liked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT
        p.id, p.name, p.age, p.bio, p.photos, p.avatar,
        s.swipe_type, e.name, s.created_at
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.swiper_id
    LEFT JOIN public.events e ON e.id = s.event_id
    WHERE s.swiped_id = v_profile_id
      AND s.swipe_type IN ('like', 'super_like')
      AND p.status = 'active'
      AND p.is_verified = TRUE
      -- «Quiero ver» también vale aquí, como en el tablón (097).
      AND public.wants_gender(
          COALESCE((SELECT me.wants FROM public.profiles me WHERE me.id = v_profile_id), 'all'), p.gender)
      -- Los de una fiesta que ya terminó caducan con ella (098).
      AND (s.event_id IS NULL OR EXISTS (
          SELECT 1 FROM public.events ev WHERE ev.id = s.event_id AND ev.end_date > NOW()))
      AND NOT public.are_connected(v_profile_id, s.swiper_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes mine
          WHERE mine.swiper_id = v_profile_id AND mine.swiped_id = s.swiper_id
      )
    ORDER BY s.created_at DESC
    LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.likes_for_preview(p_profile_id uuid)
 RETURNS TABLE(profile_id uuid, name text, age integer, photo_url text, swipe_type text, event_name text, liked_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        -- De un like normal no se dice ni quién es: la Edge Function sólo
        -- devuelve una miniatura pixelada. Del super like, todo.
        CASE WHEN s.swipe_type = 'super_like' THEN p.id END,
        CASE WHEN s.swipe_type = 'super_like' THEN p.name END,
        CASE WHEN s.swipe_type = 'super_like' THEN p.age END,
        COALESCE(p.photos[1], p.avatar),
        s.swipe_type, e.name, s.created_at
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.swiper_id
    LEFT JOIN public.events e ON e.id = s.event_id
    WHERE s.swiped_id = p_profile_id
      AND s.swipe_type IN ('like', 'super_like')
      AND p.status = 'active'
      AND p.is_verified = TRUE
      -- «Quiero ver» también vale aquí, como en el tablón (097).
      AND public.wants_gender(
          COALESCE((SELECT me.wants FROM public.profiles me WHERE me.id = p_profile_id), 'all'), p.gender)
      -- Los de una fiesta que ya terminó caducan con ella (098).
      AND (s.event_id IS NULL OR EXISTS (
          SELECT 1 FROM public.events ev WHERE ev.id = s.event_id AND ev.end_date > NOW()))
      AND NOT public.are_connected(p_profile_id, s.swiper_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes mine
          WHERE mine.swiper_id = p_profile_id AND mine.swiped_id = s.swiper_id
      )
    ORDER BY (s.swipe_type = 'super_like') DESC, s.created_at DESC
    LIMIT 50;
$function$;

-- ---------------------------------------------------------------------------
-- Avisos: «likes_expiring» una hora antes del final.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pending_event_pushes()
 RETURNS TABLE(profile_id uuid, event_id uuid, kind text, event_name text, venue_name text, inside bigint, vybes bigint, locale text, vibe_level text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH candidatos AS (
        SELECT
            ei.profile_id,
            e.id AS event_id,
            e.name AS event_name,
            v.name AS venue_name,
            e.start_date,
            p.locale,
            public.vybe_inside(e.id) AS inside,
            (SELECT public.vibe_level_for(GREATEST(f.total, public.vybe_inside(e.id)), e.max_capacity)
             FROM public.fresh_headcount(e.id) f) AS vibe_level
        FROM public.event_intents ei
        JOIN public.events e ON e.id = ei.event_id
        JOIN public.venues v ON v.id = e.venue_id
        JOIN public.profiles p ON p.id = ei.profile_id
        WHERE e.start_date <= NOW()
          AND e.end_date > NOW()
          AND p.notify_events
          AND p.status = 'active'
          -- Quien ya está dentro no necesita que le digan que entre.
          AND NOT EXISTS (
              SELECT 1 FROM public.event_attendance ea
              WHERE ea.event_id = e.id AND ea.profile_id = ei.profile_id
          )
    ),
    dentro AS (
        SELECT
            ea.profile_id,
            e.id AS event_id,
            e.name AS event_name,
            v.name AS venue_name,
            p.locale,
            (SELECT COUNT(*) FROM public.connections c
              WHERE c.event_id = e.id
                AND (c.user_id_1 = ea.profile_id OR c.user_id_2 = ea.profile_id)) AS vybes
        FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        JOIN public.venues v ON v.id = e.venue_id
        JOIN public.profiles p ON p.id = ea.profile_id
        WHERE e.end_date > NOW()
          AND e.end_date <= NOW() + INTERVAL '30 minutes'
          AND e.start_date <= NOW() - INTERVAL '30 minutes'
          AND ea.last_seen_at > NOW() - INTERVAL '3 hours'
          AND p.notify_events
          AND p.status = 'active'
    )
    -- El evento acaba de abrir.
    SELECT c.profile_id, c.event_id, 'doors_open', c.event_name, c.venue_name,
           c.inside, 0::BIGINT, c.locale, c.vibe_level
    FROM candidatos c
    WHERE c.start_date > NOW() - INTERVAL '90 minutes'
      AND NOT EXISTS (
          SELECT 1 FROM public.event_push_log l
          WHERE l.event_id = c.event_id AND l.profile_id = c.profile_id
            AND l.kind = 'doors_open'
      )

    UNION ALL

    -- Se está llenando: por el ambiente que da el local o, si no cuenta, por la
    -- gente con Vybe.
    SELECT c.profile_id, c.event_id, 'filling_up', c.event_name, c.venue_name,
           c.inside, 0::BIGINT, c.locale, c.vibe_level
    FROM candidatos c
    WHERE c.start_date <= NOW() - INTERVAL '30 minutes'
      AND (c.vibe_level IN ('lively', 'almost_full', 'full')
           OR (c.vibe_level IS NULL AND c.inside >= public.filling_up_threshold()))
      AND NOT EXISTS (
          SELECT 1 FROM public.event_push_log l
          WHERE l.event_id = c.event_id AND l.profile_id = c.profile_id
            AND l.kind = 'filling_up'
      )

    UNION ALL

    -- Queda media hora.
    SELECT d.profile_id, d.event_id, 'ending_soon', d.event_name, d.venue_name,
           0::BIGINT, d.vybes, d.locale, NULL::TEXT
    FROM dentro d
    WHERE NOT EXISTS (
        SELECT 1 FROM public.event_push_log l
        WHERE l.event_id = d.event_id AND l.profile_id = d.profile_id
          AND l.kind = 'ending_soon'
    )

    UNION ALL

    -- Queda una hora: los me gusta sin responder de esta fiesta desaparecen al
    -- terminar (098). `inside` lleva cuántos son, con el filtro «Quiero ver».
    SELECT r.profile_id, r.event_id, 'likes_expiring', r.event_name, r.venue_name,
           r.likes, 0::BIGINT, r.locale, NULL::TEXT
    FROM (
        SELECT s.swiped_id AS profile_id, e.id AS event_id, e.name AS event_name,
               v.name AS venue_name, p.locale, COUNT(*) AS likes
        FROM public.swipes s
        JOIN public.events e ON e.id = s.event_id
        JOIN public.venues v ON v.id = e.venue_id
        JOIN public.profiles p ON p.id = s.swiped_id
        JOIN public.profiles l ON l.id = s.swiper_id
        WHERE s.swipe_type IN ('like', 'super_like')
          AND e.end_date > NOW()
          AND e.end_date <= NOW() + INTERVAL '60 minutes'
          AND p.status = 'active'
          AND p.notify_events
          AND l.status = 'active'
          AND l.is_verified = TRUE
          AND public.wants_gender(COALESCE(p.wants, 'all'), l.gender)
          AND NOT public.are_connected(s.swiped_id, s.swiper_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.swipes mine
              WHERE mine.swiper_id = s.swiped_id AND mine.swiped_id = s.swiper_id
          )
        GROUP BY s.swiped_id, e.id, e.name, v.name, p.locale
    ) r
    WHERE NOT EXISTS (
        SELECT 1 FROM public.event_push_log lg
        WHERE lg.event_id = r.event_id AND lg.profile_id = r.profile_id
          AND lg.kind = 'likes_expiring'
    );
$function$;

-- ---------------------------------------------------------------------------
-- Estadísticas del negocio: con los totales guardados.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_funnel(p_event_id uuid)
 RETURNS TABLE(intents bigint, check_ins bigint, active_swipers bigint, swipes bigint, matches bigint, booking_clicks bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY SELECT
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = p_event_id),
        -- Al terminar, los me gusta sin crush se borran (098): cuentan los totales guardados.
        GREATEST((SELECT COUNT(DISTINCT s.swiper_id) FROM public.swipes s WHERE s.event_id = p_event_id),
                 COALESCE((SELECT t.swipers FROM public.event_swipe_totals t WHERE t.event_id = p_event_id), 0)),
        GREATEST((SELECT COUNT(*) FROM public.swipes s WHERE s.event_id = p_event_id),
                 COALESCE((SELECT t.swipes FROM public.event_swipe_totals t WHERE t.event_id = p_event_id), 0)),
        (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.booking_clicks bc WHERE bc.event_id = p_event_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_venue_events_summary(p_venue_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(event_id uuid, event_name text, start_date timestamp with time zone, end_date timestamp with time zone, intents bigint, check_ins bigint, swipes bigint, matches bigint, booking_clicks bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.can_read_venue_metrics(p_venue_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY SELECT
        e.id, e.name, e.start_date, e.end_date,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = e.id),
        GREATEST((SELECT COUNT(*) FROM public.swipes s WHERE s.event_id = e.id),
                 COALESCE((SELECT t.swipes FROM public.event_swipe_totals t WHERE t.event_id = e.id), 0)),
        (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = e.id),
        (SELECT COUNT(*) FROM public.booking_clicks bc WHERE bc.event_id = e.id)
    FROM public.events e
    WHERE e.venue_id = p_venue_id
      AND (p_since IS NULL OR e.start_date >= p_since)
    ORDER BY e.start_date DESC;
END;
$function$;

