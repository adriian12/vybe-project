-- =============================================================================
-- 043 · Seguir a un local, ficha del local, retorno en euros, mes de Pro
--       gratis y eventos destacados
-- =============================================================================
--
--   · Seguir: el vyber sigue a un local y recibe aviso cuando publica una
--     fiesta. Es el público propio del local, con su consentimiento.
--   · Ficha del local: descripción, horario, ubicación y eventos.
--   · Retorno en euros: con el gasto medio por persona, el informe semanal
--     estima cuánto ha traído Vybe.
--   · Primer mes de Pro gratis al aprobar un local.
--   · Destacar un evento: se paga por noche (Stripe) y sale primero en la app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Datos del local
-- ---------------------------------------------------------------------------
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS opening_hours JSONB,
    ADD COLUMN IF NOT EXISTS avg_spend NUMERIC(8, 2);

ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_description_length;
ALTER TABLE public.venues ADD CONSTRAINT venues_description_length
    CHECK (description IS NULL OR char_length(description) <= 1000);
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_avg_spend_range;
ALTER TABLE public.venues ADD CONSTRAINT venues_avg_spend_range
    CHECK (avg_spend IS NULL OR (avg_spend >= 0 AND avg_spend <= 1000));
-- Horario: una lista de hasta siete días {day: 0-6 (lunes-domingo), open, close, closed}.
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_opening_hours_shape;
ALTER TABLE public.venues ADD CONSTRAINT venues_opening_hours_shape
    CHECK (opening_hours IS NULL OR (jsonb_typeof(opening_hours) = 'array' AND jsonb_array_length(opening_hours) <= 7));

-- ---------------------------------------------------------------------------
-- 2. Eventos: destacado y aviso a seguidores
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS followers_notified_at TIMESTAMPTZ;

-- El destacado se paga: el local no puede ponérselo escribiendo en su evento,
-- y tampoco reiniciar el aviso a seguidores para mandarlo otra vez. Sólo el
-- servidor (webhook de Stripe, funciones) y administración.
CREATE OR REPLACE FUNCTION public.protect_event_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- El servidor (sin sesión), administración o una función de la propia base
    -- de datos que lo ha marcado para esta transacción.
    IF auth.uid() IS NULL OR public.is_admin()
       OR COALESCE(current_setting('vybe.event_system', TRUE), '') = 'on' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.featured_until := NULL;
        NEW.followers_notified_at := NULL;
    ELSE
        NEW.featured_until := OLD.featured_until;
        NEW.followers_notified_at := OLD.followers_notified_at;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_protect_fields ON public.events;
CREATE TRIGGER events_protect_fields
    BEFORE INSERT OR UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.protect_event_fields();

CREATE TABLE IF NOT EXISTS public.event_boosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur',
    stripe_session_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.event_boosts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_boosts FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Seguidores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_followers (
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (venue_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_followers_profile ON public.venue_followers (profile_id);
ALTER TABLE public.venue_followers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.venue_followers FROM anon, authenticated;

-- Seguir o dejar de seguir. Devuelve si ahora se sigue.
CREATE OR REPLACE FUNCTION public.toggle_venue_follow(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
BEGIN
    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = p_venue_id AND v.is_verified) THEN
        RAISE EXCEPTION 'VENUE_NOT_FOUND';
    END IF;

    IF EXISTS (SELECT 1 FROM public.venue_followers f WHERE f.venue_id = p_venue_id AND f.profile_id = v_profile) THEN
        DELETE FROM public.venue_followers WHERE venue_id = p_venue_id AND profile_id = v_profile;
        RETURN FALSE;
    END IF;

    INSERT INTO public.venue_followers (venue_id, profile_id) VALUES (p_venue_id, v_profile);
    RETURN TRUE;
END;
$$;

-- La ficha pública del local.
CREATE OR REPLACE FUNCTION public.get_venue_profile(p_venue_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    city TEXT,
    region TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    description TEXT,
    opening_hours JSONB,
    followers BIGINT,
    i_follow BOOLEAN,
    subscribed BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        v.id, v.name, v.type, v.city, v.region, v.address, v.latitude, v.longitude,
        v.description, v.opening_hours,
        (SELECT COUNT(*) FROM public.venue_followers f WHERE f.venue_id = v.id),
        EXISTS (SELECT 1 FROM public.venue_followers f
                WHERE f.venue_id = v.id AND f.profile_id = public.current_profile_id()),
        public.venue_plan(v.id) IN ('pro', 'business')
    FROM public.venues v
    WHERE v.id = p_venue_id AND v.is_verified;
$$;

-- Eventos del local para su ficha: en marcha y próximos, y los últimos pasados.
CREATE OR REPLACE FUNCTION public.get_venue_events_public(p_venue_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    poster_url TEXT,
    price NUMERIC,
    theme TEXT,
    featured BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    (SELECT e.id, e.name, e.start_date, e.end_date, e.poster_url, e.price, e.theme,
            COALESCE(e.featured_until > NOW(), FALSE)
     FROM public.events e JOIN public.venues v ON v.id = e.venue_id AND v.is_verified
     WHERE e.venue_id = p_venue_id AND e.end_date > NOW()
     ORDER BY e.start_date
     LIMIT 20)
    UNION ALL
    (SELECT e.id, e.name, e.start_date, e.end_date, e.poster_url, e.price, e.theme, FALSE
     FROM public.events e JOIN public.venues v ON v.id = e.venue_id AND v.is_verified
     WHERE e.venue_id = p_venue_id AND e.end_date <= NOW()
     ORDER BY e.start_date DESC
     LIMIT 8);
$$;

-- Para el panel: cuántos le siguen y cuántos nuevos esta semana.
CREATE OR REPLACE FUNCTION public.get_venue_followers_summary()
RETURNS TABLE (total BIGINT, last_week BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN QUERY
    SELECT COUNT(*), COUNT(*) FILTER (WHERE f.created_at > NOW() - INTERVAL '7 days')
    FROM public.venue_followers f WHERE f.venue_id = v_venue;
END;
$$;

-- Avisar a los seguidores de un evento. Una vez por evento: se hace solo al
-- publicarlo y, si se quiere repetir, no se puede (sería spam).
CREATE OR REPLACE FUNCTION public.queue_followers_notice(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_found BOOLEAN;
BEGIN
    PERFORM set_config('vybe.event_system', 'on', TRUE);
    UPDATE public.events SET followers_notified_at = NOW()
    WHERE id = p_event_id AND followers_notified_at IS NULL AND start_date > NOW() - INTERVAL '6 hours';
    v_found := FOUND;
    PERFORM set_config('vybe.event_system', 'off', TRUE);

    IF v_found THEN
        PERFORM public.push_webhook(jsonb_build_object(
            'type', 'EVENT_PUBLISHED', 'table', 'venue_events', 'record', jsonb_build_object('id', p_event_id)
        ));
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_followers(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.followers_notified_at IS NOT NULL) THEN
        RETURN FALSE;
    END IF;
    PERFORM public.queue_followers_notice(p_event_id);
    RETURN TRUE;
END;
$$;

-- Al publicar un evento (de un local verificado), aviso a quien le sigue.
CREATE OR REPLACE FUNCTION public.push_on_event_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.start_date > NOW()
       AND EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.is_verified)
       AND EXISTS (SELECT 1 FROM public.venue_followers f WHERE f.venue_id = NEW.venue_id) THEN
        PERFORM public.queue_followers_notice(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_event_published ON public.events;
CREATE TRIGGER push_on_event_published
    AFTER INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.push_on_event_published();

-- ---------------------------------------------------------------------------
-- 4. Primer mes de Pro gratis
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_subscriptions DROP CONSTRAINT IF EXISTS venue_subscriptions_status_check;
ALTER TABLE public.venue_subscriptions ADD CONSTRAINT venue_subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'cancelled', 'past_due'));

CREATE OR REPLACE FUNCTION public.venue_plan(p_venue_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT vs.plan
         FROM public.venue_subscriptions vs
         WHERE vs.venue_id = COALESCE(p_venue_id, public.current_venue_id())
           AND vs.status IN ('active', 'trialing')
           AND (vs.expires_at IS NULL OR vs.expires_at > NOW())),
        'free'
    );
$$;

-- El mes empieza cuando se aprueba el local, no al registrarse: si no, se
-- gastaría esperando la verificación.
CREATE OR REPLACE FUNCTION public.start_venue_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF COALESCE(NEW.is_verified, FALSE)
       AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.is_verified, FALSE))
       AND NOT EXISTS (SELECT 1 FROM public.venue_subscriptions vs WHERE vs.venue_id = NEW.id) THEN
        INSERT INTO public.venue_subscriptions (venue_id, plan, status, started_at, expires_at, cancel_at_period_end)
        VALUES (NEW.id, 'pro', 'trialing', NOW(), NOW() + INTERVAL '30 days', TRUE);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_start_trial ON public.venues;
CREATE TRIGGER venues_start_trial
    AFTER INSERT OR UPDATE OF is_verified ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.start_venue_trial();

-- Los locales ya aprobados sin plan empiezan hoy su mes.
INSERT INTO public.venue_subscriptions (venue_id, plan, status, started_at, expires_at, cancel_at_period_end)
SELECT v.id, 'pro', 'trialing', NOW(), NOW() + INTERVAL '30 days', TRUE
FROM public.venues v
WHERE v.is_verified
  AND NOT EXISTS (SELECT 1 FROM public.venue_subscriptions vs WHERE vs.venue_id = v.id);

-- ---------------------------------------------------------------------------
-- 5. Retorno en euros en el informe semanal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_venue_avg_spend(p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL OR COALESCE(public.current_venue_role(), '') NOT IN ('owner', 'marketing') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_amount IS NOT NULL AND (p_amount < 0 OR p_amount > 1000) THEN
        RAISE EXCEPTION 'INVALID_AMOUNT';
    END IF;

    UPDATE public.venues SET avg_spend = p_amount WHERE id = v_venue;
    -- El informe de la semana pasada se rehace con la cifra nueva.
    PERFORM public.generate_weekly_report(v_venue, public.last_week_start());
END;
$$;

CREATE OR REPLACE FUNCTION public.build_weekly_report(p_venue_id UUID, p_week_start DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_from TIMESTAMPTZ := (p_week_start::TIMESTAMP AT TIME ZONE 'Europe/Madrid');
    v_to TIMESTAMPTZ := ((p_week_start + 7)::TIMESTAMP AT TIME ZONE 'Europe/Madrid');
    v_prev_from TIMESTAMPTZ := ((p_week_start - 7)::TIMESTAMP AT TIME ZONE 'Europe/Madrid');
    v_type TEXT;
    v_spend NUMERIC;
    v_result JSONB;
BEGIN
    SELECT v.type, v.avg_spend INTO v_type, v_spend FROM public.venues v WHERE v.id = p_venue_id;

    WITH ev AS (
        SELECT e.* FROM public.events e
        WHERE e.venue_id = p_venue_id AND e.start_date >= v_from AND e.start_date < v_to
    ),
    att AS (
        SELECT ea.*, ev.price AS precio FROM public.event_attendance ea JOIN ev ON ev.id = ea.event_id
    ),
    prev_att AS (
        SELECT ea.* FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        WHERE e.venue_id = p_venue_id AND e.start_date >= v_prev_from AND e.start_date < v_from
    ),
    repetidores AS (
        SELECT DISTINCT att.profile_id FROM att
        WHERE EXISTS (
            SELECT 1 FROM public.event_attendance a2
            JOIN public.events e2 ON e2.id = a2.event_id
            WHERE a2.profile_id = att.profile_id AND e2.venue_id = p_venue_id AND e2.start_date < v_from
        )
    ),
    -- A quién ha traído Vybe: dijo que iba, entró con un código de RRPP o de
    -- lista, o seguía al local antes de venir. Cada entrada cuenta una vez.
    traidos AS (
        SELECT
            att.id,
            att.precio,
            EXISTS (SELECT 1 FROM public.event_intents ei
                    WHERE ei.event_id = att.event_id AND ei.profile_id = att.profile_id) AS por_intencion,
            EXISTS (SELECT 1 FROM public.event_codes ec
                    WHERE ec.id = att.code_id AND ec.kind IN ('promoter', 'guest_list')) AS por_codigo,
            EXISTS (SELECT 1 FROM public.venue_followers f
                    WHERE f.venue_id = p_venue_id AND f.profile_id = att.profile_id
                      AND f.created_at < att.checked_in_at) AS por_seguir
        FROM att
    ),
    hora_pico AS (
        SELECT EXTRACT(HOUR FROM att.checked_in_at AT TIME ZONE 'Europe/Madrid')::INTEGER AS hora, COUNT(*) n
        FROM att GROUP BY 1 ORDER BY n DESC LIMIT 1
    ),
    mejor AS (
        SELECT ev.name, COUNT(att.id) n FROM ev LEFT JOIN att ON att.event_id = ev.id
        GROUP BY ev.id, ev.name ORDER BY n DESC LIMIT 1
    ),
    codigo AS (
        SELECT COALESCE(ec.promoter_name, ec.label, ec.code) AS nombre, COUNT(*) n
        FROM att JOIN public.event_codes ec ON ec.id = att.code_id
        WHERE ec.kind <> 'general'
        GROUP BY 1 ORDER BY n DESC LIMIT 1
    ),
    comparables AS (
        SELECT AVG(n)::NUMERIC AS media, COUNT(DISTINCT venue) AS locales FROM (
            SELECT e.venue_id AS venue, e.id, COUNT(ea.id) n
            FROM public.events e
            JOIN public.venues v ON v.id = e.venue_id AND v.type = v_type AND v.is_verified
            LEFT JOIN public.event_attendance ea ON ea.event_id = e.id
            WHERE e.start_date >= v_from AND e.start_date < v_to
            GROUP BY e.venue_id, e.id
        ) x
    )
    SELECT jsonb_build_object(
        'from', v_from,
        'to', v_to,
        'events', (SELECT COUNT(*) FROM ev),
        'check_ins', (SELECT COUNT(*) FROM att),
        'check_ins_prev', (SELECT COUNT(*) FROM prev_att),
        'unique_people', (SELECT COUNT(DISTINCT profile_id) FROM att),
        'returning_people', (SELECT COUNT(*) FROM repetidores),
        'intents', (SELECT COUNT(*) FROM public.event_intents ei JOIN ev ON ev.id = ei.event_id),
        'intents_arrived', (SELECT COUNT(*) FROM public.event_intents ei JOIN ev ON ev.id = ei.event_id
                            WHERE EXISTS (SELECT 1 FROM att WHERE att.event_id = ei.event_id AND att.profile_id = ei.profile_id)),
        'matches', (SELECT COUNT(*) FROM public.connections c JOIN ev ON ev.id = c.event_id),
        'peak_hour', (SELECT hora FROM hora_pico),
        'best_event', (SELECT name FROM mejor WHERE n > 0),
        'best_event_check_ins', (SELECT n FROM mejor),
        'top_code', (SELECT nombre FROM codigo),
        'top_code_check_ins', (SELECT n FROM codigo),
        'headcount_peak', (SELECT MAX(l.total) FROM public.event_headcount_log l JOIN ev ON ev.id = l.event_id),
        'promos_claimed', (SELECT COUNT(*) FROM public.promotion_redemptions r
                           JOIN public.promotions pr ON pr.id = r.promotion_id JOIN ev ON ev.id = pr.event_id),
        'promos_validated', (SELECT COUNT(*) FROM public.promotion_redemptions r
                             JOIN public.promotions pr ON pr.id = r.promotion_id JOIN ev ON ev.id = pr.event_id
                             WHERE r.validated_at IS NOT NULL),
        'raffles', (SELECT COUNT(*) FROM public.event_raffles r JOIN ev ON ev.id = r.event_id WHERE r.status = 'drawn'),
        'stamp_cards_completed', (SELECT COUNT(*) FROM public.stamp_rewards sr
                                  WHERE sr.venue_id = p_venue_id AND sr.created_at >= v_from AND sr.created_at < v_to),
        'songs_requested', (SELECT COUNT(*) FROM public.song_requests s JOIN ev ON ev.id = s.event_id),
        'benchmark_check_ins_per_event', (SELECT CASE WHEN locales >= 3 THEN ROUND(media, 1) END FROM comparables),
        -- Retorno
        'brought_people', (SELECT COUNT(*) FROM traidos WHERE por_intencion OR por_codigo OR por_seguir),
        'brought_by_intent', (SELECT COUNT(*) FROM traidos WHERE por_intencion),
        'brought_by_code', (SELECT COUNT(*) FROM traidos WHERE por_codigo AND NOT por_intencion),
        'brought_by_follow', (SELECT COUNT(*) FROM traidos WHERE por_seguir AND NOT por_intencion AND NOT por_codigo),
        'avg_spend', v_spend,
        'estimated_revenue', CASE WHEN v_spend IS NOT NULL THEN
            (SELECT ROUND(COALESCE(SUM(v_spend + COALESCE(precio, 0)), 0))
             FROM traidos WHERE por_intencion OR por_codigo OR por_seguir) END,
        'followers_total', (SELECT COUNT(*) FROM public.venue_followers f WHERE f.venue_id = p_venue_id),
        'followers_new', (SELECT COUNT(*) FROM public.venue_followers f
                          WHERE f.venue_id = p_venue_id AND f.created_at >= v_from AND f.created_at < v_to),
        'boosts', (SELECT COUNT(*) FROM public.event_boosts b JOIN ev ON ev.id = b.event_id)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. «¿Dónde seguimos?»: los destacados, primero
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_parties(
    p_after TIMESTAMPTZ,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL,
    p_exclude_event UUID DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    venue_id UUID,
    venue_name TEXT,
    venue_type TEXT,
    city TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    poster_url TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    subscribed BOOLEAN,
    vibe_level TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        e.id, e.name, v.id, v.name, v.type, v.city, e.start_date, e.end_date, e.poster_url,
        COALESCE(e.latitude, v.latitude), COALESCE(e.longitude, v.longitude),
        CASE WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL
                  AND COALESCE(e.latitude, v.latitude) IS NOT NULL
             THEN public.get_distance(p_latitude, p_longitude,
                                      COALESCE(e.latitude, v.latitude), COALESCE(e.longitude, v.longitude))
        END AS distancia,
        public.venue_plan(v.id) IN ('pro', 'business') AS suscrito,
        (SELECT public.vibe_level_for(GREATEST(f.total, public.vybe_inside(e.id)), e.max_capacity)
         FROM public.fresh_headcount(e.id) f)
    FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    WHERE v.is_verified
      AND e.end_date > p_after + INTERVAL '30 minutes'
      AND e.start_date <= p_after + INTERVAL '2 hours'
      AND (p_exclude_event IS NULL OR e.id <> p_exclude_event)
    ORDER BY COALESCE(e.featured_until > NOW(), FALSE) DESC, suscrito DESC, distancia NULLS LAST, e.start_date
    LIMIT 30;
$$;

-- ---------------------------------------------------------------------------
-- 7. Permisos
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.protect_event_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toggle_venue_follow(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_venue_profile(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_venue_events_public(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_venue_followers_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.queue_followers_notice(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_followers(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.push_on_event_published() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_venue_trial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_venue_avg_spend(NUMERIC) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.toggle_venue_follow(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_events_public(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_followers_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_followers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_venue_avg_spend(NUMERIC) TO authenticated;
