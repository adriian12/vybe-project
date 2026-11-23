-- 141: Descargas de la app (primeras aperturas en iOS y Android).
--
-- Cada hora el notificador de la NAS (Z:\fiestea\avisos\avisos.mjs) pide el
-- informe por la Management API y avisa por Telegram sólo si hay descargas
-- nuevas.
--
--   · `app_installs`: una fila por instalación que se abre por primera vez.
--     Sin datos de la persona: plataforma, versión y modelo.
--   · `record_app_install`: la llama la app instalada una sola vez
--     (`recordInstallOnce` en src/services/native.ts). Sin sesión, así que
--     tiene un tope propio: 3 aperturas por conexión y día.
--   · `get_downloads_report`: nuevas desde una fecha y total por plataforma,
--     desde la salida en Google Play (23-11-2026 10:00 UTC). Sólo el servidor.
--     Las versiones que aún no registran la apertura cuentan por los avisos
--     activados: la primera suscripción de cada persona.

CREATE TABLE IF NOT EXISTS public.app_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    app_version TEXT,
    device_model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_installs_created_platform_idx
    ON public.app_installs (created_at DESC, platform);

ALTER TABLE public.app_installs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_installs FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.app_installs;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.app_installs
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

CREATE OR REPLACE FUNCTION public.record_app_install(
    p_platform TEXT,
    p_app_version TEXT DEFAULT NULL,
    p_device_model TEXT DEFAULT NULL
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

    INSERT INTO public.app_installs (platform, app_version, device_model)
    VALUES (p_platform, LEFT(p_app_version, 32), LEFT(p_device_model, 64));
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_install(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_install(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

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
        -- quien ya tenía avisos antes de salir a producción no cuenta.
        SELECT ps.platform, MIN(ps.created_at) AS created_at
        FROM public.push_subscriptions ps
        WHERE ps.platform IN ('ios', 'android')
        GROUP BY ps.profile_id, ps.platform
    ),
    todas AS (
        SELECT ai.platform, ai.created_at
        FROM public.app_installs ai
        WHERE ai.created_at >= v_inicio
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

-- Sólo el servidor (la Management API entra como postgres): las cifras de
-- descargas no son públicas.
REVOKE ALL ON FUNCTION public.get_downloads_report(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_downloads_report(TIMESTAMPTZ) TO service_role;
