-- 149: Las descargas del informe de Telegram, sin robots ni pruebas.
--
-- Cada versión que se sube a Google Play la abren sus robots (informe previo
-- al lanzamiento, Firebase Test Lab), y en iOS la abren TestFlight y el
-- revisor de Apple. Todas contaban como descargas.
--
--   · `app_installs.source`: de dónde viene la instalación, según la app
--     (`FiesteaInstall`): `store` (Google Play o App Store), `test` (robots de
--     Google, simulador), `testflight` (TestFlight y revisión de Apple, que
--     llevan recibo de sandbox) o `sideload` (APK instalado a mano).
--     NULL = versión anterior a esta, que no lo sabe.
--   · `get_downloads_report` sólo cuenta `store`, y NULL de versiones ya
--     publicadas; tampoco la primera suscripción a avisos de las cuentas de
--     prueba (`admin_is_test_account`).

ALTER TABLE public.app_installs ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IS NULL OR source IN ('store', 'test', 'testflight', 'sideload'));

DROP FUNCTION IF EXISTS public.record_app_install(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_app_install(
    p_platform TEXT,
    p_app_version TEXT DEFAULT NULL,
    p_device_model TEXT DEFAULT NULL,
    p_source TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ip TEXT;
    v_hits INTEGER;
BEGIN
    IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android') THEN
        RETURN;
    END IF;

    -- Tope por conexión y día (en el mismo contador que el límite de
    -- peticiones), para que nadie infle el recuento llamando en bucle.
    v_ip := public.fiestea_client_ip();
    IF v_ip IS NOT NULL THEN
        INSERT INTO public.api_request_counters (key, bucket, hits)
        VALUES ('install:' || v_ip, date_trunc('day', NOW()), 1)
        ON CONFLICT (key, bucket) DO UPDATE SET hits = public.api_request_counters.hits + 1
        RETURNING hits INTO v_hits;
        IF v_hits > 3 THEN
            RETURN;
        END IF;
    END IF;

    INSERT INTO public.app_installs (platform, app_version, device_model, source)
    VALUES (
        p_platform,
        LEFT(p_app_version, 32),
        LEFT(p_device_model, 64),
        CASE WHEN p_source IN ('store', 'test', 'testflight', 'sideload') THEN p_source END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_install(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_install(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_downloads_report(p_since TIMESTAMPTZ)
RETURNS TABLE (
    nuevas_ios BIGINT,
    nuevas_android BIGINT,
    total_ios BIGINT,
    total_android BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inicio CONSTANT TIMESTAMPTZ := '2026-11-23 10:00:00+00';
    v_desde TIMESTAMPTZ := GREATEST(COALESCE(p_since, v_inicio), v_inicio);
BEGIN
    RETURN QUERY
    WITH primeras_push AS (
        -- La primera suscripción a avisos de cada persona en cada plataforma;
        -- quien ya tenía avisos antes de salir a producción no cuenta, ni las
        -- cuentas de prueba, de revisión o propias.
        SELECT ps.platform, MIN(ps.created_at) AS created_at
        FROM public.push_subscriptions ps
        JOIN public.profiles p ON p.id = ps.profile_id
        LEFT JOIN auth.users u ON u.id = p.user_id
        WHERE ps.platform IN ('ios', 'android')
          AND NOT public.admin_is_test_account(p.id, u.email::TEXT, p.role)
        GROUP BY ps.profile_id, ps.platform
    ),
    todas AS (
        SELECT ai.platform, ai.created_at
        FROM public.app_installs ai
        WHERE ai.created_at >= v_inicio
          AND COALESCE(ai.source, 'store') = 'store'
        UNION ALL
        SELECT pp.platform, pp.created_at
        FROM primeras_push pp
        WHERE pp.created_at >= v_inicio
          AND NOT EXISTS (
              SELECT 1 FROM public.app_installs ai
              WHERE ai.platform = pp.platform
                AND ai.created_at BETWEEN pp.created_at - INTERVAL '5 minutes'
                                      AND pp.created_at + INTERVAL '5 minutes'
          )
    )
    SELECT
        COUNT(*) FILTER (WHERE t.platform = 'ios' AND t.created_at > v_desde),
        COUNT(*) FILTER (WHERE t.platform = 'android' AND t.created_at > v_desde),
        COUNT(*) FILTER (WHERE t.platform = 'ios'),
        COUNT(*) FILTER (WHERE t.platform = 'android')
    FROM todas t;
END;
$$;

REVOKE ALL ON FUNCTION public.get_downloads_report(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_downloads_report(TIMESTAMPTZ) TO service_role;
