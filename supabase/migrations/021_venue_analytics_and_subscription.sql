-- ============================================================================
-- 021 — Métricas que un local puede vender o usar para programar, y la
--       suscripción del propio local
-- ============================================================================

-- ============================================================================
-- 1. DEMOGRAFÍA AGREGADA
--
-- Sirve para negociar patrocinio y ajustar la programación, pero es dato
-- personal: se devuelve siempre agregada y con un mínimo de personas por
-- tramo. Por debajo de ese mínimo, un grupo de dos identifica a esas dos.
-- ============================================================================

/** Mínimo de personas para que un grupo se pueda mostrar. */
CREATE OR REPLACE FUNCTION public.demographics_min_bucket()
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
AS $$ SELECT 5; $$;

-- ============================================================================
-- 2. COMPARATIVA POR DÍA DE LA SEMANA
--
-- «Los jueves de techno llenan un 40% más que los viernes de house» es una
-- decisión de programación, y hoy se toma de memoria.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_venue_weekday_stats(
    p_venue_id UUID,
    p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    weekday INTEGER,
    events BIGINT,
    avg_check_ins NUMERIC,
    avg_matches NUMERIC,
    best_theme TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_venue_metrics(p_venue_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    WITH por_evento AS (
        SELECT
            -- 0 = domingo, para que coincida con lo que espera el cliente.
            EXTRACT(DOW FROM e.start_date)::INTEGER AS weekday,
            e.theme,
            (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = e.id) AS check_ins,
            (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = e.id) AS matches
        FROM public.events e
        WHERE e.venue_id = p_venue_id
          AND e.end_date < NOW()
          AND (p_since IS NULL OR e.start_date >= p_since)
    )
    SELECT
        pe.weekday,
        COUNT(*),
        ROUND(AVG(pe.check_ins), 1),
        ROUND(AVG(pe.matches), 1),
        -- El tema que más gente ha metido ese día de la semana.
        (SELECT p2.theme FROM por_evento p2
          WHERE p2.weekday = pe.weekday AND p2.theme IS NOT NULL
          GROUP BY p2.theme
          ORDER BY AVG(p2.check_ins) DESC
          LIMIT 1)
    FROM por_evento pe
    GROUP BY pe.weekday
    ORDER BY pe.weekday;
END;
$$;

-- ============================================================================
-- 3. CURVA DE ABANDONO
--
-- A qué hora se empieza a vaciar la sala. Sirve para decidir cierre de barra,
-- cambio de sesión o si merece la pena el after.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_event_dropoff(p_event_id UUID)
RETURNS TABLE (
    hour TIMESTAMPTZ,
    present BIGINT,
    arrived BIGINT,
    left_count BIGINT
)
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
        -- Dentro en esa hora: llegó antes y su última señal fue después.
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.checked_in_at <= s.hour + INTERVAL '1 hour'
            AND ea.last_seen_at >= s.hour),
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.checked_in_at >= s.hour
            AND ea.checked_in_at < s.hour + INTERVAL '1 hour'),
        -- Se fue: su última señal cae en esta hora y el evento siguió.
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.last_seen_at >= s.hour
            AND ea.last_seen_at < s.hour + INTERVAL '1 hour'
            AND ea.last_seen_at < (SELECT b.to_ts FROM bounds b))
    FROM series s
    ORDER BY s.hour;
END;
$$;

-- ============================================================================
-- 4. SUSCRIPCIÓN DEL LOCAL
--
-- El cobro estaba montado sólo para usuarios. Un local paga por herramientas
-- que le ahorran dinero —el fraude de las listas, el clicker de la puerta— y
-- es ahí donde está el negocio, no en los cinco euros de un usuario.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.venue_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_subscriptions_plan_check') THEN
        ALTER TABLE public.venue_subscriptions
            ADD CONSTRAINT venue_subscriptions_plan_check
            CHECK (plan IN ('free', 'pro', 'business'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_subscriptions_status_check') THEN
        ALTER TABLE public.venue_subscriptions
            ADD CONSTRAINT venue_subscriptions_status_check
            CHECK (status IN ('active', 'cancelled', 'past_due'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_venue_subs_stripe
    ON public.venue_subscriptions(stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.venue_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Venue reads own subscription" ON public.venue_subscriptions;
CREATE POLICY "Venue reads own subscription"
    ON public.venue_subscriptions FOR SELECT TO authenticated
    USING (venue_id = public.current_venue_id() OR public.is_admin());

/**
 * Límites de cada plan.
 *
 * Se guardan en una función y no en una tabla de configuración porque son
 * decisiones de producto, no datos: cambiarlos es un despliegue, y así queda en
 * el control de versiones quién cambió qué.
 *
 * Se seleccionan sólo las columnas que declara la firma: con `SELECT *` la
 * primera sería `plan`, que es texto, y PostgreSQL rechaza la función.
 */
CREATE OR REPLACE FUNCTION public.venue_plan_limits(p_plan TEXT)
RETURNS TABLE (
    max_active_events INTEGER,
    max_team_members INTEGER,
    promoter_codes BOOLEAN,
    demographics BOOLEAN,
    promotions BOOLEAN,
    csv_export BOOLEAN
)
LANGUAGE sql IMMUTABLE
AS $$
    SELECT planes.max_active_events, planes.max_team_members, planes.promoter_codes,
           planes.demographics, planes.promotions, planes.csv_export
    FROM (VALUES
        ('free',     1,   2,  FALSE, FALSE, FALSE, FALSE),
        ('pro',      5,   8,  TRUE,  FALSE, TRUE,  TRUE),
        ('business', 50,  40, TRUE,  TRUE,  TRUE,  TRUE)
    ) AS planes(plan, max_active_events, max_team_members, promoter_codes,
                demographics, promotions, csv_export)
    WHERE planes.plan = COALESCE(p_plan, 'free');
$$;

/** Plan vigente del local. Sin fila, o caducado, cuenta como `free`. */
CREATE OR REPLACE FUNCTION public.venue_plan(p_venue_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT vs.plan
         FROM public.venue_subscriptions vs
         WHERE vs.venue_id = COALESCE(p_venue_id, public.current_venue_id())
           AND vs.status = 'active'
           AND (vs.expires_at IS NULL OR vs.expires_at > NOW())),
        'free'
    );
$$;

/** ¿Tiene el local contratada esta capacidad? */
CREATE OR REPLACE FUNCTION public.venue_has_feature(p_feature TEXT, p_venue_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_limits RECORD;
BEGIN
    SELECT * INTO v_limits
    FROM public.venue_plan_limits(public.venue_plan(p_venue_id));

    RETURN CASE p_feature
        WHEN 'promoter_codes' THEN v_limits.promoter_codes
        WHEN 'demographics'   THEN v_limits.demographics
        WHEN 'promotions'     THEN v_limits.promotions
        WHEN 'csv_export'     THEN v_limits.csv_export
        ELSE FALSE
    END;
END;
$$;

/** Resumen del plan y de lo consumido, para la pantalla de facturación. */
CREATE OR REPLACE FUNCTION public.get_venue_plan_status()
RETURNS TABLE (
    plan TEXT,
    status TEXT,
    expires_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN,
    active_events BIGINT,
    max_active_events INTEGER,
    team_members BIGINT,
    max_team_members INTEGER,
    promoter_codes BOOLEAN,
    demographics BOOLEAN,
    promotions BOOLEAN,
    csv_export BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_venue_id UUID := public.current_venue_id();
    v_plan TEXT;
BEGIN
    IF v_venue_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    v_plan := public.venue_plan(v_venue_id);

    RETURN QUERY
    SELECT
        v_plan,
        COALESCE((SELECT vs.status FROM public.venue_subscriptions vs
                   WHERE vs.venue_id = v_venue_id), 'active'),
        (SELECT vs.expires_at FROM public.venue_subscriptions vs WHERE vs.venue_id = v_venue_id),
        COALESCE((SELECT vs.cancel_at_period_end FROM public.venue_subscriptions vs
                   WHERE vs.venue_id = v_venue_id), FALSE),
        (SELECT COUNT(*) FROM public.events e
          WHERE e.venue_id = v_venue_id AND e.end_date > NOW()),
        l.max_active_events,
        (SELECT COUNT(*) FROM public.venue_members vm WHERE vm.venue_id = v_venue_id),
        l.max_team_members,
        l.promoter_codes, l.demographics, l.promotions, l.csv_export
    FROM public.venue_plan_limits(v_plan) l;
END;
$$;

/**
 * Impide pasarse del número de eventos que permite el plan.
 *
 * Va en un disparador y no en la interfaz porque el local escribe en `events`
 * con su propia sesión: comprobarlo sólo en el cliente no serviría de nada.
 */
CREATE OR REPLACE FUNCTION public.enforce_venue_event_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_max INTEGER;
    v_current BIGINT;
BEGIN
    -- Sin sesión la escritura viene del servidor (seeds, recurrencia, cron).
    IF public.current_venue_id() IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT l.max_active_events INTO v_max
    FROM public.venue_plan_limits(public.venue_plan(NEW.venue_id)) l;

    SELECT COUNT(*) INTO v_current
    FROM public.events e
    WHERE e.venue_id = NEW.venue_id AND e.end_date > NOW();

    IF v_current >= v_max THEN
        RAISE EXCEPTION 'PLAN_EVENT_LIMIT';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_venue_event_limit_trigger ON public.events;
CREATE TRIGGER enforce_venue_event_limit_trigger
    BEFORE INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.enforce_venue_event_limit();

/** Igual para el equipo. */
CREATE OR REPLACE FUNCTION public.enforce_venue_team_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_max INTEGER;
    v_current BIGINT;
BEGIN
    IF public.current_venue_id() IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT l.max_team_members INTO v_max
    FROM public.venue_plan_limits(public.venue_plan(NEW.venue_id)) l;

    SELECT COUNT(*) INTO v_current
    FROM public.venue_members vm WHERE vm.venue_id = NEW.venue_id;

    IF v_current >= v_max THEN
        RAISE EXCEPTION 'PLAN_TEAM_LIMIT';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_venue_team_limit_trigger ON public.venue_members;
CREATE TRIGGER enforce_venue_team_limit_trigger
    BEFORE INSERT ON public.venue_members
    FOR EACH ROW EXECUTE FUNCTION public.enforce_venue_team_limit();

-- Los códigos con etiqueta y las promociones también dependen del plan.
CREATE OR REPLACE FUNCTION public.create_labeled_code(
    p_event_id UUID,
    p_kind TEXT,
    p_label TEXT,
    p_promoter_name TEXT DEFAULT NULL,
    p_max_uses INTEGER DEFAULT NULL
)
RETURNS TABLE (id UUID, code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_venue_id UUID;
    v_end TIMESTAMPTZ;
    v_code TEXT;
    v_id UUID;
BEGIN
    SELECT e.venue_id, e.end_date INTO v_venue_id, v_end
    FROM public.events e WHERE e.id = p_event_id;

    IF v_venue_id IS NULL OR v_venue_id IS DISTINCT FROM public.current_venue_id() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF NOT public.venue_has_feature('promoter_codes', v_venue_id) THEN
        RAISE EXCEPTION 'PLAN_UPGRADE_REQUIRED';
    END IF;

    IF p_kind NOT IN ('promoter', 'guest_list', 'staff') THEN
        RAISE EXCEPTION 'INVALID_KIND';
    END IF;

    FOR i IN 1..10 LOOP
        v_code := upper(substring(md5(random()::text) FROM 1 FOR 6));
        BEGIN
            INSERT INTO public.event_codes (
                venue_id, event_id, code, expires_at, active, kind, label,
                promoter_name, max_uses
            )
            VALUES (v_venue_id, p_event_id, v_code, v_end, TRUE, p_kind, p_label,
                    p_promoter_name, p_max_uses)
            RETURNING event_codes.id INTO v_id;

            RETURN QUERY SELECT v_id, v_code;
            RETURN;
        EXCEPTION WHEN unique_violation THEN
            CONTINUE;
        END;
    END LOOP;

    RAISE EXCEPTION 'CODE_GENERATION_FAILED';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_promotions_plan()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF public.current_venue_id() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT public.venue_has_feature('promotions', NEW.venue_id) THEN
        RAISE EXCEPTION 'PLAN_UPGRADE_REQUIRED';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_promotions_plan_trigger ON public.promotions;
CREATE TRIGGER enforce_promotions_plan_trigger
    BEFORE INSERT ON public.promotions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_promotions_plan();

-- La demografía se cobra aparte: es lo que justifica el plan más alto.
CREATE OR REPLACE FUNCTION public.get_event_demographics(p_event_id UUID)
RETURNS TABLE (
    bucket TEXT,
    gender TEXT,
    people BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_venue_id UUID;
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.venue_id INTO v_venue_id FROM public.events e WHERE e.id = p_event_id;

    IF NOT public.is_admin() AND NOT public.venue_has_feature('demographics', v_venue_id) THEN
        RAISE EXCEPTION 'PLAN_UPGRADE_REQUIRED';
    END IF;

    RETURN QUERY
    WITH tramos AS (
        SELECT
            CASE
                WHEN p.age < 21 THEN '18-20'
                WHEN p.age < 26 THEN '21-25'
                WHEN p.age < 31 THEN '26-30'
                WHEN p.age < 41 THEN '31-40'
                ELSE '41+'
            END AS bucket,
            COALESCE(p.gender, 'unknown') AS gender
        FROM public.event_attendance ea
        JOIN public.profiles p ON p.id = ea.profile_id
        WHERE ea.event_id = p_event_id
    )
    SELECT t.bucket, t.gender, COUNT(*)
    FROM tramos t
    GROUP BY t.bucket, t.gender
    -- Se descartan los grupos demasiado pequeños en lugar de redondearlos:
    -- mostrar «1 mujer de 41+» señala a una persona concreta.
    HAVING COUNT(*) >= public.demographics_min_bucket()
    ORDER BY t.bucket, t.gender;
END;
$$;

-- ============================================================================
-- 5. PERMISOS
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
              'get_event_demographics', 'get_venue_weekday_stats', 'get_event_dropoff',
              'get_venue_plan_status', 'venue_plan', 'venue_plan_limits',
              'venue_has_feature', 'demographics_min_bucket', 'create_labeled_code'
          )
          AND p.prorettype <> 'trigger'::regtype
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

GRANT SELECT ON public.venue_subscriptions TO authenticated;
REVOKE ALL ON public.venue_subscriptions FROM anon;

COMMENT ON FUNCTION public.get_event_demographics IS
    'Demografía agregada con mínimo de personas por grupo: por debajo de él, el grupo señalaría a individuos concretos.';
COMMENT ON TABLE public.venue_subscriptions IS
    'Plan del local. free / pro / business, con los límites que declara venue_plan_limits().';
