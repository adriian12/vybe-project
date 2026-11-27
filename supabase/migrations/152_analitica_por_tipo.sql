-- ============================================================================
-- 152. Analítica de uso por tipo de persona y descargas en el admin
-- ============================================================================
-- `analytics_events` guardaba las pantallas sin saber de quién ni de qué
-- sesión (el cliente mandaba la clave anónima y `profile_id` salía siempre
-- vacío). Ahora `analytics-collect` apunta:
--   · segment: fiester | guest | incomplete | explorer | venue | admin | visitor
--   · session_id: una por apertura de la app (nueva tras 30 min en segundo plano)
--   · platform, app_version, install_source (test / testflight no cuentan)
--   · user_id: la cuenta (también la anónima de «Ver fiestas sin cuenta»)
-- Con eso el admin ve por dónde entra y por dónde se va cada tipo de persona.
-- Las filas se borran a los 13 meses.

ALTER TABLE public.analytics_events
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS segment TEXT,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS app_version TEXT,
    ADD COLUMN IF NOT EXISTS install_source TEXT,
    ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS analytics_events_session_idx
    ON public.analytics_events (session_id, created_at)
    WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_created_idx
    ON public.analytics_events (created_at);

-- ---------------------------------------------------------------------------
-- La pantalla de una ruta: los ids, enlaces con nombre y tokens se agrupan
-- (/event/<id> y /event/<sitio>/<fiesta> son la misma pantalla).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_route(p_path TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN r ~ '^/event/[^/]+/(live|access)$' THEN regexp_replace(r, '^/event/[^/]+/', '/event/:id/')
        WHEN r ~ '^/event/[^/]+(/[^/]+)?$' THEN '/event/:id'
        WHEN r ~ '^/local/[^/]+/dia/' THEN '/local/:id/dia'
        WHEN r ~ '^/(local|chat|u|sala|contador|equipo|tickets/buy|tickets/order)/[^/]+$'
            THEN regexp_replace(r, '/[^/]+$', '/:id')
        WHEN r ~ '^/legal/' THEN '/legal'
        ELSE r
    END
    FROM (
        SELECT COALESCE(NULLIF(regexp_replace(split_part(COALESCE(p_path, ''), '?', 1), '/+$', ''), ''), '/') AS r
    ) x;
$$;

REVOKE ALL ON FUNCTION public.analytics_route(TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics_report(p_days INTEGER DEFAULT 30, p_segment TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_since TIMESTAMPTZ;
    v_out JSONB;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;

    v_since := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 400));

    WITH pruebas AS (
        SELECT p.id
          FROM public.profiles p
          LEFT JOIN auth.users u ON u.id = p.user_id
         WHERE public.admin_is_test_account(p.id, u.email, p.role)
    ),
    ev AS (
        SELECT a.session_id, a.name, a.props, a.created_at, a.segment, a.platform,
               a.profile_id, a.user_id,
               public.analytics_route(a.props->>'path') AS ruta
          FROM public.analytics_events a
         WHERE a.created_at >= v_since
           AND a.session_id IS NOT NULL
           AND COALESCE(a.segment, '') <> 'admin'
           AND COALESCE(a.install_source, 'store') NOT IN ('test', 'testflight')
           AND (a.profile_id IS NULL OR a.profile_id NOT IN (SELECT id FROM pruebas))
    ),
    ses AS (
        SELECT session_id,
               (array_agg(segment ORDER BY created_at))[1] AS seg,
               (array_agg(platform ORDER BY created_at))[1] AS plat,
               bool_or(segment IN ('fiester', 'guest', 'incomplete')) AS con_cuenta,
               MIN(created_at) AS inicio,
               MAX(created_at) AS fin,
               COUNT(*) FILTER (WHERE name = 'page_view') AS vistas,
               COALESCE(
                   (array_agg(profile_id::TEXT ORDER BY created_at) FILTER (WHERE profile_id IS NOT NULL))[1],
                   (array_agg(user_id::TEXT ORDER BY created_at) FILTER (WHERE user_id IS NOT NULL))[1],
                   session_id
               ) AS quien
          FROM ev
         GROUP BY session_id
    ),
    sel AS (
        SELECT * FROM ses WHERE p_segment = 'all' OR seg = p_segment
    ),
    tl AS (
        SELECT e.session_id, e.name, e.ruta, e.created_at,
               LEAD(e.created_at) OVER (PARTITION BY e.session_id ORDER BY e.created_at) AS siguiente_at
          FROM ev e
         WHERE e.name IN ('page_view', 'app_background')
           AND e.session_id IN (SELECT session_id FROM sel)
    ),
    pg AS (
        SELECT session_id, ruta, created_at,
               LEAST(EXTRACT(EPOCH FROM (siguiente_at - created_at)), 1800) AS segundos,
               ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) AS n,
               ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) AS n_inv,
               LEAD(ruta) OVER (PARTITION BY session_id ORDER BY created_at) AS siguiente
          FROM tl
         WHERE name = 'page_view'
    ),
    acc AS (
        SELECT e.* FROM ev e
         WHERE e.name NOT IN ('page_view', 'app_background')
           AND e.session_id IN (SELECT session_id FROM sel)
    )
    SELECT jsonb_build_object(
        'resumen', (
            SELECT jsonb_build_object(
                'sesiones', COUNT(*),
                'personas', COUNT(DISTINCT quien),
                'vistas', COALESCE(SUM(vistas), 0),
                'paginas_sesion', COALESCE(ROUND(AVG(vistas)::NUMERIC, 1), 0),
                'duracion_media', COALESCE(ROUND(AVG(LEAST(EXTRACT(EPOCH FROM (fin - inicio)), 14400)))::INTEGER, 0),
                'rebote', COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE vistas <= 1) / NULLIF(COUNT(*), 0)), 0),
                'conversiones', COUNT(*) FILTER (WHERE seg = 'explorer' AND con_cuenta)
            )
              FROM sel
        ),
        'segmentos', (
            SELECT COALESCE(jsonb_object_agg(seg, n), '{}'::JSONB)
              FROM (SELECT COALESCE(seg, 'visitor') AS seg, COUNT(*) AS n FROM ses GROUP BY 1) x
        ),
        'por_dia', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', dia, 'sesiones', sesiones, 'personas', personas) ORDER BY dia), '[]'::JSONB)
              FROM (
                  SELECT (inicio AT TIME ZONE 'Europe/Madrid')::DATE AS dia,
                         COUNT(*) AS sesiones, COUNT(DISTINCT quien) AS personas
                    FROM sel GROUP BY 1
              ) x
        ),
        'paginas', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('ruta', ruta, 'vistas', vistas, 'sesiones', sesiones, 'segundos', segundos) ORDER BY vistas DESC), '[]'::JSONB)
              FROM (
                  SELECT ruta, COUNT(*) AS vistas, COUNT(DISTINCT session_id) AS sesiones,
                         ROUND(AVG(segundos))::INTEGER AS segundos
                    FROM pg GROUP BY ruta ORDER BY COUNT(*) DESC LIMIT 20
              ) x
        ),
        'entradas', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('ruta', ruta, 'n', n) ORDER BY n DESC), '[]'::JSONB)
              FROM (SELECT ruta, COUNT(*) AS n FROM pg WHERE pg.n = 1 GROUP BY ruta ORDER BY 2 DESC LIMIT 10) x
        ),
        'salidas', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('ruta', ruta, 'n', n, 'pct', pct) ORDER BY n DESC), '[]'::JSONB)
              FROM (
                  SELECT ruta,
                         COUNT(*) FILTER (WHERE n_inv = 1) AS n,
                         ROUND(100.0 * COUNT(*) FILTER (WHERE n_inv = 1) / NULLIF(COUNT(*), 0)) AS pct
                    FROM pg GROUP BY ruta
                  HAVING COUNT(*) FILTER (WHERE n_inv = 1) > 0
                   ORDER BY 2 DESC LIMIT 10
              ) x
        ),
        'recorridos', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('desde', ruta, 'hacia', siguiente, 'n', n) ORDER BY n DESC), '[]'::JSONB)
              FROM (
                  SELECT ruta, siguiente, COUNT(*) AS n
                    FROM pg WHERE siguiente IS NOT NULL AND siguiente <> ruta
                   GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12
              ) x
        ),
        'acciones', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', name, 'n', n, 'sesiones', sesiones) ORDER BY n DESC), '[]'::JSONB)
              FROM (
                  SELECT name, COUNT(*) AS n, COUNT(DISTINCT session_id) AS sesiones
                    FROM acc WHERE name NOT IN ('account_prompt', 'account_prompt_cta')
                   GROUP BY name ORDER BY 2 DESC LIMIT 20
              ) x
        ),
        'avisos_cuenta', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('motivo', motivo, 'n', n, 'crear', crear, 'entrar', entrar) ORDER BY n DESC), '[]'::JSONB)
              FROM (
                  SELECT COALESCE(props->>'reason', 'generic') AS motivo,
                         COUNT(*) FILTER (WHERE name = 'account_prompt') AS n,
                         COUNT(*) FILTER (WHERE name = 'account_prompt_cta' AND props->>'choice' = 'create') AS crear,
                         COUNT(*) FILTER (WHERE name = 'account_prompt_cta' AND props->>'choice' = 'login') AS entrar
                    FROM acc WHERE name IN ('account_prompt', 'account_prompt_cta')
                   GROUP BY 1
              ) x
        ),
        'plataformas', (
            SELECT COALESCE(jsonb_object_agg(COALESCE(plat, 'web'), n), '{}'::JSONB)
              FROM (SELECT plat, COUNT(*) AS n FROM sel GROUP BY 1) x
        ),
        'horas', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('hora', hora, 'n', n) ORDER BY hora), '[]'::JSONB)
              FROM (
                  SELECT EXTRACT(HOUR FROM inicio AT TIME ZONE 'Europe/Madrid')::INTEGER AS hora, COUNT(*) AS n
                    FROM sel GROUP BY 1
              ) x
        ),
        'desde', (SELECT MIN(created_at) FROM public.analytics_events WHERE session_id IS NOT NULL)
    )
    INTO v_out;

    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_report(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_analytics_report(INTEGER, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Descargas de las apps (mismo criterio que el aviso de Telegram, migración 149)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_downloads_report(p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_since TIMESTAMPTZ;
    v_out JSONB;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;

    v_since := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 400));

    WITH tienda AS (
        SELECT * FROM public.app_installs WHERE COALESCE(source, 'store') = 'store'
    ),
    altas AS (
        SELECT p.account_type, p.created_at
          FROM public.profiles p
          LEFT JOIN auth.users u ON u.id = p.user_id
         WHERE NOT COALESCE(public.admin_is_test_account(p.id, u.email, p.role), FALSE)
    )
    SELECT jsonb_build_object(
        'total', jsonb_build_object(
            'ios', (SELECT COUNT(*) FROM tienda WHERE platform = 'ios'),
            'android', (SELECT COUNT(*) FROM tienda WHERE platform = 'android')
        ),
        'periodo', jsonb_build_object(
            'ios', (SELECT COUNT(*) FROM tienda WHERE platform = 'ios' AND created_at >= v_since),
            'android', (SELECT COUNT(*) FROM tienda WHERE platform = 'android' AND created_at >= v_since)
        ),
        'pruebas', (
            SELECT COALESCE(jsonb_object_agg(source, n), '{}'::JSONB)
              FROM (SELECT source, COUNT(*) AS n FROM public.app_installs
                     WHERE source IS NOT NULL AND source <> 'store' GROUP BY 1) x
        ),
        'altas', jsonb_build_object(
            'fiesteros', (SELECT COUNT(*) FROM altas WHERE account_type <> 'guest' AND created_at >= v_since),
            'invitados', (SELECT COUNT(*) FROM altas WHERE account_type = 'guest' AND created_at >= v_since),
            'total', (SELECT COUNT(*) FROM altas)
        ),
        'por_dia', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', dia, 'ios', ios, 'android', android) ORDER BY dia), '[]'::JSONB)
              FROM (
                  SELECT (created_at AT TIME ZONE 'Europe/Madrid')::DATE AS dia,
                         COUNT(*) FILTER (WHERE platform = 'ios') AS ios,
                         COUNT(*) FILTER (WHERE platform = 'android') AS android
                    FROM tienda WHERE created_at >= v_since GROUP BY 1
              ) x
        ),
        'versiones', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('plataforma', platform, 'version', app_version, 'n', n) ORDER BY n DESC), '[]'::JSONB)
              FROM (
                  SELECT platform, COALESCE(app_version, '?') AS app_version, COUNT(*) AS n
                    FROM tienda GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8
              ) x
        )
    )
    INTO v_out;

    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_downloads_report(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_downloads_report(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Las estadísticas de uso se guardan 13 meses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_analytics()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.analytics_events WHERE created_at < NOW() - INTERVAL '13 months';
$$;

REVOKE ALL ON FUNCTION public.purge_old_analytics() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'fiestea-purgar-analitica';
SELECT cron.schedule('fiestea-purgar-analitica', '50 3 * * *', 'SELECT public.purge_old_analytics()');
