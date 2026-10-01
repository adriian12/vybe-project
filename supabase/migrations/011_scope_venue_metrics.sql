-- ============================================================================
-- 011 — Las métricas de un local sólo las ve ese local
--
-- Encontrado probando el panel: las cinco funciones de estadísticas son
-- SECURITY DEFINER, así que se saltan las policies, y ninguna comprobaba de
-- quién es el evento o el local. Bastaba con llamar a la RPC pasando el
-- identificador de otro para leer sus datos:
--
--     get_event_funnel('<evento de la competencia>')
--       → {check_ins: 4, active_swipers: 4, swipes: 4, matches: 2}
--
-- Los identificadores no son secretos: cualquier local ve el resto de eventos
-- vigentes, porque los necesita la propia aplicación. Y las métricas son
-- justamente lo que se factura, así que la fuga es directamente comercial.
--
-- La corrección añade a cada función la misma comprobación de propiedad, con
-- una excepción explícita para el rol de administración.
-- ============================================================================

-- ============================================================================
-- 1. COMPROBACIÓN DE PROPIEDAD
-- ============================================================================

/** ¿El local que hay en sesión es este, o quien pregunta es administración? */
CREATE OR REPLACE FUNCTION public.can_read_venue_metrics(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT p_venue_id IS NOT NULL
       AND (public.current_venue_id() = p_venue_id OR public.is_admin());
$$;

/** Igual, pero a partir del evento. */
CREATE OR REPLACE FUNCTION public.can_read_event_metrics(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT public.can_read_venue_metrics(
        (SELECT e.venue_id FROM public.events e WHERE e.id = p_event_id)
    );
$$;

-- ============================================================================
-- 2. MÉTRICAS POR EVENTO
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_event_stats(UUID);

CREATE FUNCTION public.get_event_stats(p_event_id UUID)
RETURNS TABLE (
    scans_count BIGINT,
    active_users_count BIGINT,
    matches_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY SELECT
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.last_seen_at > NOW() - INTERVAL '3 hours'),
        (SELECT COUNT(DISTINCT c.id)
           FROM public.connections c
           JOIN public.swipes s
             ON (s.swiper_id = c.user_id_1 AND s.swiped_id = c.user_id_2)
             OR (s.swiper_id = c.user_id_2 AND s.swiped_id = c.user_id_1)
          WHERE s.event_id = p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_event_funnel(p_event_id UUID)
RETURNS TABLE (
    intents BIGINT,
    check_ins BIGINT,
    active_swipers BIGINT,
    swipes BIGINT,
    matches BIGINT,
    booking_clicks BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY SELECT
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = p_event_id),
        (SELECT COUNT(DISTINCT s.swiper_id) FROM public.swipes s WHERE s.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.swipes s WHERE s.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.booking_clicks bc WHERE bc.event_id = p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_event_hourly(p_event_id UUID)
RETURNS TABLE (hour TIMESTAMPTZ, check_ins BIGINT, matches BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    WITH bounds AS (
        SELECT date_trunc('hour', e.start_date) AS from_ts,
               date_trunc('hour', LEAST(e.end_date, NOW())) AS to_ts
        FROM public.events e WHERE e.id = p_event_id
    ),
    series AS (
        SELECT generate_series(b.from_ts, GREATEST(b.to_ts, b.from_ts), INTERVAL '1 hour') AS hour
        FROM bounds b
    )
    SELECT
        s.hour,
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.checked_in_at >= s.hour
            AND ea.checked_in_at < s.hour + INTERVAL '1 hour'),
        (SELECT COUNT(*) FROM public.connections c
          WHERE c.event_id = p_event_id
            AND c.created_at >= s.hour
            AND c.created_at < s.hour + INTERVAL '1 hour')
    FROM series s
    ORDER BY s.hour;
END;
$$;

-- ============================================================================
-- 3. MÉTRICAS POR LOCAL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_venue_stats(
    p_venue_id UUID,
    p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    scans_count BIGINT,
    active_users_count BIGINT,
    events_count BIGINT,
    avg_attendance NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_venue_metrics(p_venue_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    WITH venue_events AS (
        SELECT e.id
        FROM public.events e
        WHERE e.venue_id = p_venue_id
          AND (p_since IS NULL OR e.start_date >= p_since)
    ),
    attendance AS (
        SELECT ea.event_id, ea.profile_id, ea.last_seen_at
        FROM public.event_attendance ea
        JOIN venue_events ve ON ve.id = ea.event_id
    )
    SELECT
        (SELECT COUNT(*) FROM attendance),
        (SELECT COUNT(DISTINCT a.profile_id) FROM attendance a
          WHERE a.last_seen_at > NOW() - INTERVAL '3 hours'),
        (SELECT COUNT(*) FROM venue_events),
        COALESCE(ROUND(
            (SELECT COUNT(*)::NUMERIC FROM attendance) /
            NULLIF((SELECT COUNT(*) FROM venue_events), 0)
        , 1), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_venue_events_summary(
    p_venue_id UUID,
    p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    intents BIGINT,
    check_ins BIGINT,
    swipes BIGINT,
    matches BIGINT,
    booking_clicks BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_venue_metrics(p_venue_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY SELECT
        e.id, e.name, e.start_date, e.end_date,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = e.id),
        (SELECT COUNT(*) FROM public.swipes s WHERE s.event_id = e.id),
        (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = e.id),
        (SELECT COUNT(*) FROM public.booking_clicks bc WHERE bc.event_id = e.id)
    FROM public.events e
    WHERE e.venue_id = p_venue_id
      AND (p_since IS NULL OR e.start_date >= p_since)
    ORDER BY e.start_date DESC;
END;
$$;

-- ============================================================================
-- 4. PERMISOS
-- get_event_stats se recrea con DROP, así que pierde los GRANT anteriores.
-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN (
              'get_event_stats', 'get_event_funnel', 'get_event_hourly',
              'get_venue_stats', 'get_venue_events_summary',
              'can_read_venue_metrics', 'can_read_event_metrics'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

COMMENT ON FUNCTION public.can_read_venue_metrics IS
    'Guarda de las funciones de métricas: son SECURITY DEFINER y por tanto se saltan las policies, así que la propiedad hay que comprobarla a mano.';
