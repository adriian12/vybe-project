-- =============================================================================
-- 040 · Aforo real del local, contador de puerta y acceso del equipo
-- =============================================================================
--
-- Vybe sólo contaba a quien entra con la app. En una sala con 250 personas y 50
-- con Vybe, la app decía «50 dentro» y el local parecía vacío, que es lo que
-- espanta al público. Ahora el local da el total real desde la puerta:
--
--   · el panel (propietario y personal) suma y resta con
--     `adjust_event_headcount()` / `set_event_headcount()`;
--   · el portero, sin cuenta, con un enlace de contador que valida la Edge
--     Function `door-counter` (`counter_link_apply()`, sólo service_role).
--
-- El público **nunca ve el total**: `get_events_activity()` sólo devuelve el
-- ambiente (`vibe_level`) calculado contra el aforo, y sólo si el local lo ha
-- actualizado en los últimos 45 minutos con el evento en marcha. El local sí ve
-- la cifra (`get_event_occupancy()`), y en Pro y Business la curva de la noche.
--
-- Además, el equipo del local (`venue_members`) no podía entrar al panel: la RLS
-- de `venues` sólo deja leer la fila al propietario. `get_my_venue_membership()`
-- se la da al miembro con su rol.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_headcount (
    event_id UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
    total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

CREATE TABLE IF NOT EXISTS public.event_headcount_log (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total INTEGER NOT NULL,
    delta INTEGER,
    source TEXT NOT NULL CHECK (source IN ('panel', 'link'))
);

CREATE INDEX IF NOT EXISTS idx_headcount_log_event_at
    ON public.event_headcount_log (event_id, at);

CREATE TABLE IF NOT EXISTS public.event_counter_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    label TEXT CHECK (label IS NULL OR char_length(label) <= 40),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_counter_links_event ON public.event_counter_links (event_id);

-- Sin políticas: nadie las lee ni las escribe directamente, sólo las funciones.
ALTER TABLE public.event_headcount ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_headcount_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_counter_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_headcount, public.event_headcount_log, public.event_counter_links
    FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.event_headcount_log_id_seq FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ambiente
-- ---------------------------------------------------------------------------
-- Los mismos cortes que `src/lib/vibe.ts`: si cambias uno, cambia el otro.
CREATE OR REPLACE FUNCTION public.vibe_level_for(p_count BIGINT, p_capacity INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN COALESCE(p_capacity, 0) <= 0 THEN NULL
        WHEN p_count::NUMERIC / p_capacity < 0.35 THEN 'quiet'
        WHEN p_count::NUMERIC / p_capacity < 0.70 THEN 'lively'
        WHEN p_count::NUMERIC / p_capacity < 0.95 THEN 'almost_full'
        ELSE 'full'
    END;
$$;

-- Total del local si es de fiar: evento en marcha, aforo puesto y actualizado
-- hace menos de 45 minutos. Si no, NULL y se usan sólo las cifras de Vybe.
CREATE OR REPLACE FUNCTION public.fresh_headcount(p_event_id UUID)
RETURNS TABLE (total INTEGER, updated_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT h.total, h.updated_at
    FROM public.event_headcount h
    JOIN public.events e ON e.id = h.event_id
    WHERE h.event_id = p_event_id
      AND h.updated_at > NOW() - INTERVAL '45 minutes'
      AND e.start_date <= NOW()
      AND e.end_date > NOW()
      AND COALESCE(e.max_capacity, 0) > 0;
$$;

-- Gente con Vybe dentro: la misma ventana que el panel y los avisos.
CREATE OR REPLACE FUNCTION public.vybe_inside(p_event_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*) FROM public.event_attendance ea
    WHERE ea.event_id = p_event_id
      AND ea.last_seen_at > NOW() - INTERVAL '2 hours';
$$;

-- ---------------------------------------------------------------------------
-- Aplicar un cambio de aforo (interna: la llaman el panel y el enlace)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_event_headcount(
    p_event_id UUID,
    p_delta INTEGER,
    p_total INTEGER,
    p_source TEXT,
    p_by UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity INTEGER;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_max INTEGER;
    v_total INTEGER;
BEGIN
    SELECT e.max_capacity, e.start_date, e.end_date
    INTO v_capacity, v_start, v_end
    FROM public.events e WHERE e.id = p_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND';
    END IF;

    -- Sin aforo no hay ambiente que calcular ni tope que vigilar.
    IF COALESCE(v_capacity, 0) <= 0 THEN
        RAISE EXCEPTION 'CAPACITY_REQUIRED';
    END IF;

    -- Se cuenta desde unas horas antes (colas, apertura adelantada) hasta un
    -- rato después del cierre, no en cualquier momento.
    IF NOW() < v_start - INTERVAL '6 hours' OR NOW() > v_end + INTERVAL '2 hours' THEN
        RAISE EXCEPTION 'EVENT_NOT_LIVE';
    END IF;

    v_max := GREATEST(v_capacity * 2, 5000);

    IF p_total IS NOT NULL THEN
        IF p_total < 0 OR p_total > v_max THEN
            RAISE EXCEPTION 'INVALID_TOTAL';
        END IF;

        INSERT INTO public.event_headcount (event_id, total, updated_at, updated_by)
        VALUES (p_event_id, p_total, NOW(), p_by)
        ON CONFLICT (event_id) DO UPDATE
            SET total = EXCLUDED.total, updated_at = NOW(), updated_by = EXCLUDED.updated_by
        RETURNING total INTO v_total;
    ELSE
        -- Veinte de golpe como mucho: las pulsaciones se agrupan cada segundo
        -- y un grupo más grande es un error o un abuso del enlace.
        IF p_delta IS NULL OR p_delta = 0 OR ABS(p_delta) > 20 THEN
            RAISE EXCEPTION 'INVALID_DELTA';
        END IF;

        -- Suma atómica: dos porteros pulsando a la vez no se pisan.
        INSERT INTO public.event_headcount AS h (event_id, total, updated_at, updated_by)
        VALUES (p_event_id, LEAST(GREATEST(p_delta, 0), v_max), NOW(), p_by)
        ON CONFLICT (event_id) DO UPDATE
            SET total = LEAST(GREATEST(h.total + p_delta, 0), v_max),
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
        RETURNING total INTO v_total;
    END IF;

    INSERT INTO public.event_headcount_log (event_id, total, delta, source)
    VALUES (p_event_id, v_total, CASE WHEN p_total IS NULL THEN p_delta END, p_source);

    RETURN v_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- Panel: quién puede contar
-- ---------------------------------------------------------------------------
-- Propietario y personal del local del evento, o administración. Marketing ve
-- las cifras pero no las toca.
CREATE OR REPLACE FUNCTION public.can_count_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_admin()
        OR (public.can_read_event_metrics(p_event_id)
            AND public.current_venue_role() IN ('owner', 'staff'));
$$;

CREATE OR REPLACE FUNCTION public.adjust_event_headcount(p_event_id UUID, p_delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN public.apply_event_headcount(p_event_id, p_delta, NULL, 'panel', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.set_event_headcount(p_event_id UUID, p_total INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_total IS NULL THEN
        RAISE EXCEPTION 'INVALID_TOTAL';
    END IF;
    RETURN public.apply_event_headcount(p_event_id, NULL, p_total, 'panel', auth.uid());
END;
$$;

-- ---------------------------------------------------------------------------
-- Enlaces de contador
-- ---------------------------------------------------------------------------
-- El token sólo se devuelve al crearlo; se guarda su SHA-256. Caduca dos horas
-- después del cierre del evento.
CREATE OR REPLACE FUNCTION public.create_counter_link(p_event_id UUID, p_label TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token TEXT;
    v_end TIMESTAMPTZ;
    v_id UUID;
    v_expires TIMESTAMPTZ;
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.end_date INTO v_end FROM public.events e WHERE e.id = p_event_id;
    IF v_end IS NULL OR v_end + INTERVAL '2 hours' < NOW() THEN
        RAISE EXCEPTION 'EVENT_NOT_LIVE';
    END IF;

    IF (SELECT COUNT(*) FROM public.event_counter_links l
        WHERE l.event_id = p_event_id AND l.revoked_at IS NULL AND l.expires_at > NOW()) >= 10 THEN
        RAISE EXCEPTION 'TOO_MANY_LINKS';
    END IF;

    -- 144 bits aleatorios en base64 apta para URL.
    v_token := translate(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+/', '-_');
    v_expires := v_end + INTERVAL '2 hours';

    INSERT INTO public.event_counter_links (event_id, label, token_hash, expires_at, created_by)
    VALUES (
        p_event_id,
        NULLIF(btrim(p_label), ''),
        encode(extensions.digest(v_token, 'sha256'), 'hex'),
        v_expires,
        auth.uid()
    )
    RETURNING event_counter_links.id INTO v_id;

    RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_counter_links(p_event_id UUID)
RETURNS TABLE (
    id UUID,
    label TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT l.id, l.label, l.created_at, l.expires_at, l.revoked_at, l.last_used_at
    FROM public.event_counter_links l
    WHERE l.event_id = p_event_id
    ORDER BY l.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_counter_link(p_link_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
BEGIN
    SELECT l.event_id INTO v_event FROM public.event_counter_links l WHERE l.id = p_link_id;
    IF v_event IS NULL OR NOT public.can_count_event(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.event_counter_links SET revoked_at = NOW()
    WHERE id = p_link_id AND revoked_at IS NULL;
END;
$$;

-- La usa sólo `door-counter`, con el SHA-256 del token. Sin delta ni total,
-- devuelve el estado. Aquí sí va el total: quien tiene el enlace es el portero.
CREATE OR REPLACE FUNCTION public.counter_link_apply(
    p_token_hash TEXT,
    p_delta INTEGER DEFAULT NULL,
    p_total INTEGER DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    venue_name TEXT,
    total INTEGER,
    capacity INTEGER,
    inside BIGINT,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link public.event_counter_links%ROWTYPE;
BEGIN
    SELECT * INTO v_link FROM public.event_counter_links l
    WHERE l.token_hash = p_token_hash
      AND l.revoked_at IS NULL
      AND l.expires_at > NOW();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LINK';
    END IF;

    IF p_delta IS NOT NULL OR p_total IS NOT NULL THEN
        PERFORM public.apply_event_headcount(v_link.event_id, p_delta, p_total, 'link', NULL);
        UPDATE public.event_counter_links SET last_used_at = NOW() WHERE id = v_link.id;
    END IF;

    RETURN QUERY
    SELECT e.id, e.name, v.name, COALESCE(h.total, 0), e.max_capacity,
           public.vybe_inside(e.id), h.updated_at, v_link.expires_at
    FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    LEFT JOIN public.event_headcount h ON h.event_id = e.id
    WHERE e.id = v_link.event_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Lo que ve el público: ambiente, no cifras del local
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_events_activity(UUID[]);

CREATE FUNCTION public.get_events_activity(p_event_ids UUID[])
RETURNS TABLE (
    event_id UUID,
    going BIGINT,
    inside BIGINT,
    vibe_level TEXT,
    vibe_at TIMESTAMPTZ,
    friends_going BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH yo AS (SELECT public.current_profile_id() AS id)
    SELECT
        e.id,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        app.inside,
        CASE WHEN f.total IS NOT NULL
             THEN public.vibe_level_for(GREATEST(f.total, app.inside), e.max_capacity) END,
        f.updated_at,
        -- «Tus vybes»: conexiones guardadas (sin caducidad) que van a ir.
        (SELECT COUNT(*)
         FROM public.event_intents ei
         JOIN public.connections c
           ON c.expires_at IS NULL
          AND ((c.user_id_1 = yo.id AND c.user_id_2 = ei.profile_id)
            OR (c.user_id_2 = yo.id AND c.user_id_1 = ei.profile_id))
         WHERE ei.event_id = e.id)
    FROM public.events e
    CROSS JOIN yo
    CROSS JOIN LATERAL (SELECT public.vybe_inside(e.id) AS inside) app
    LEFT JOIN LATERAL public.fresh_headcount(e.id) f ON TRUE
    WHERE e.id = ANY(p_event_ids);
$$;

-- ---------------------------------------------------------------------------
-- Lo que ve el local: la cifra real
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_event_occupancy(UUID);

CREATE FUNCTION public.get_event_occupancy(p_event_id UUID)
RETURNS TABLE (
    inside BIGINT,
    total_check_ins BIGINT,
    capacity INTEGER,
    ratio NUMERIC,
    alert BOOLEAN,
    headcount INTEGER,
    headcount_at TIMESTAMPTZ,
    vybe_share NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity INTEGER;
    v_alert_ratio NUMERIC;
    v_inside BIGINT;
    v_fresh INTEGER;
    v_last INTEGER;
    v_last_at TIMESTAMPTZ;
    v_people BIGINT;
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.max_capacity, e.capacity_alert_ratio
    INTO v_capacity, v_alert_ratio
    FROM public.events e WHERE e.id = p_event_id;

    v_inside := public.vybe_inside(p_event_id);

    SELECT h.total, h.updated_at INTO v_last, v_last_at
    FROM public.event_headcount h WHERE h.event_id = p_event_id;

    SELECT f.total INTO v_fresh FROM public.fresh_headcount(p_event_id) f;

    -- Para el aviso de aforo cuenta el total del local si está al día; si no,
    -- la gente con Vybe, que es el mínimo seguro.
    v_people := GREATEST(COALESCE(v_fresh, 0), v_inside);

    RETURN QUERY SELECT
        v_inside,
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = p_event_id),
        v_capacity,
        CASE WHEN COALESCE(v_capacity, 0) > 0
             THEN ROUND(v_people::NUMERIC / v_capacity, 3) END,
        CASE WHEN COALESCE(v_capacity, 0) > 0
             THEN v_people::NUMERIC / v_capacity >= COALESCE(v_alert_ratio, 0.9)
             ELSE FALSE END,
        v_last,
        v_last_at,
        CASE WHEN COALESCE(v_last, 0) > 0
             THEN ROUND(LEAST(v_inside::NUMERIC / v_last, 1), 3) END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Curva de la noche (Pro y Business)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_headcount_curve(p_event_id UUID)
RETURNS TABLE (bucket TIMESTAMPTZ, total INTEGER, vybe BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_venue UUID;
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.start_date, e.end_date, e.venue_id INTO v_start, v_end, v_venue
    FROM public.events e WHERE e.id = p_event_id;

    IF NOT public.is_admin() AND public.venue_plan(v_venue) NOT IN ('pro', 'business') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;

    -- Desde la primera cuenta (o el inicio) hasta ahora o el cierre, en tramos
    -- de 15 minutos. Como mucho 24 horas: un evento largo no puede generar
    -- miles de filas.
    v_start := LEAST(
        v_start,
        COALESCE((SELECT MIN(l.at) FROM public.event_headcount_log l WHERE l.event_id = p_event_id), v_start)
    );
    v_end := LEAST(v_end, NOW());
    v_start := GREATEST(v_start, v_end - INTERVAL '24 hours');

    RETURN QUERY
    SELECT
        b.t,
        -- El último total contado antes del final del tramo.
        (SELECT l.total FROM public.event_headcount_log l
          WHERE l.event_id = p_event_id AND l.at < b.t + INTERVAL '15 minutes'
          ORDER BY l.at DESC LIMIT 1),
        -- Gente con Vybe que había entrado y seguía dando señales en el tramo.
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.checked_in_at < b.t + INTERVAL '15 minutes'
            AND ea.last_seen_at >= b.t)
    FROM generate_series(
        date_trunc('hour', v_start),
        v_end,
        INTERVAL '15 minutes'
    ) AS b(t);
END;
$$;

-- ---------------------------------------------------------------------------
-- Equipo del local
-- ---------------------------------------------------------------------------
-- El propietario también figura en `venue_members` como 'owner' con su propia
-- cuenta de local; esa fila no cuenta aquí (ya entra como local).
CREATE OR REPLACE FUNCTION public.get_my_venue_membership()
RETURNS TABLE (role TEXT, venue JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.role, to_jsonb(v)
    FROM public.venue_members m
    JOIN public.venues v ON v.id = m.venue_id
    WHERE m.user_id = auth.uid()
      AND v.venue_id <> auth.uid()
    ORDER BY m.created_at
    LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Aviso «se está llenando» por ambiente
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pending_event_pushes();

CREATE FUNCTION public.pending_event_pushes()
RETURNS TABLE (
    profile_id UUID,
    event_id UUID,
    kind TEXT,
    event_name TEXT,
    venue_name TEXT,
    inside BIGINT,
    vybes BIGINT,
    locale TEXT,
    vibe_level TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    );
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- Supabase concede EXECUTE a anon y authenticated en cada función nueva: se
-- quita todo y se da sólo lo que usa cada quien.
REVOKE ALL ON FUNCTION public.vibe_level_for(BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fresh_headcount(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vybe_inside(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_event_headcount(UUID, INTEGER, INTEGER, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_count_event(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_event_headcount(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_headcount(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_counter_link(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_counter_links(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_counter_link(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.counter_link_apply(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_events_activity(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_occupancy(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_headcount_curve(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_venue_membership() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pending_event_pushes() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.adjust_event_headcount(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_headcount(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_counter_link(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_counter_links(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_counter_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_events_activity(UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_occupancy(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_headcount_curve(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_venue_membership() TO authenticated;
GRANT EXECUTE ON FUNCTION public.counter_link_apply(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.pending_event_pushes() TO service_role;
