-- 092: límite de peticiones a la API por usuario o por IP.
--
-- Cada petición que escribe (directa o a través de una función) cuenta una
-- vez por minuto:
--
--   · con sesión, por usuario (`sub` del JWT): 120 al minuto. No por IP: en
--     una discoteca o con datos móviles (CGNAT) cientos de personas comparten
--     IP, y se bloquearía a gente legítima;
--   · sin sesión, por IP: 60 al minuto.
--
-- Al pasarse, la petición falla con «TOO_MANY_REQUESTS» (código `PT429`, que
-- PostgREST devuelve como HTTP 429).
--
-- Cómo: un disparador por sentencia en todas las tablas de `public` llama a
-- `api_rate_guard()`, que cuenta una sola vez por transacción (una petición =
-- una transacción). Iba a ser `pgrst.db_pre_request`, pero en este proyecto el
-- rol `authenticator` está reservado y `postgres` no puede cambiarlo.
--
-- No cuentan: las lecturas (van en transacción de sólo lectura y ahí no se
-- puede apuntar nada), `service_role` (Edge Functions) ni los crons (no llevan
-- JWT). Las Edge Functions tienen además su propio límite por usuario o IP
-- (`_shared/rate-limit.ts`, con `consume_anon_rate_limit`).

CREATE UNLOGGED TABLE IF NOT EXISTS public.api_request_counters (
    key TEXT NOT NULL,
    bucket TIMESTAMPTZ NOT NULL,
    hits INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (key, bucket)
);
ALTER TABLE public.api_request_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.api_rate_guard()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub TEXT;
    v_ip TEXT;
    v_key TEXT;
    v_max INTEGER;
    v_hits INTEGER;
BEGIN
    -- Nada de esto puede tumbar una petición por un fallo propio: cualquier
    -- error aquí deja pasar la petición. Sólo el 429 de abajo la para.
    BEGIN
        IF current_setting('transaction_read_only', TRUE) = 'on'
           OR COALESCE(current_setting('request.jwt.claims', TRUE), '') = ''
           OR current_setting('request.jwt.claims', TRUE)::jsonb->>'role' = 'service_role'
           OR current_setting('fiestea.rate_counted', TRUE) = '1' THEN
            RETURN;
        END IF;
        -- Una vez por transacción, aunque la petición toque varias tablas.
        PERFORM set_config('fiestea.rate_counted', '1', TRUE);

        v_sub := NULLIF(current_setting('request.jwt.claims', TRUE)::jsonb->>'sub', '');
        IF v_sub IS NOT NULL THEN
            v_key := 'u:' || v_sub;
            v_max := 120;
        ELSE
            v_ip := NULLIF(trim(split_part(
                COALESCE(current_setting('request.headers', TRUE)::jsonb->>'x-forwarded-for', ''), ',', 1)), '');
            IF v_ip IS NULL THEN
                RETURN;
            END IF;
            v_key := 'ip:' || v_ip;
            v_max := 60;
        END IF;

        INSERT INTO public.api_request_counters (key, bucket, hits)
        VALUES (v_key, date_trunc('minute', NOW()), 1)
        ON CONFLICT (key, bucket) DO UPDATE SET hits = public.api_request_counters.hits + 1
        RETURNING hits INTO v_hits;
    EXCEPTION WHEN OTHERS THEN
        RETURN;
    END;

    IF v_hits > v_max THEN
        RAISE SQLSTATE 'PT429' USING
            MESSAGE = 'TOO_MANY_REQUESTS',
            DETAIL = 'Demasiadas peticiones seguidas. Espera un minuto.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.api_rate_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.api_rate_guard() TO anon, authenticated, service_role;

-- Limpieza: los contadores de la API duran minutos; los de las Edge Functions
-- (`auth_throttle`), un día. Antes `auth_throttle` no se limpiaba nunca.
CREATE OR REPLACE FUNCTION public.purge_api_counters()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.api_request_counters WHERE bucket < NOW() - INTERVAL '10 minutes';
    DELETE FROM public.auth_throttle WHERE window_start < NOW() - INTERVAL '1 day';
$$;
REVOKE ALL ON FUNCTION public.purge_api_counters() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    PERFORM cron.unschedule('fiestea-limpiar-limites') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiestea-limpiar-limites');
    PERFORM cron.schedule('fiestea-limpiar-limites', '*/10 * * * *', 'SELECT public.purge_api_counters()');
END $$;

-- Disparador por sentencia en todas las tablas de `public`, salvo los propios
-- contadores y la analítica.
CREATE OR REPLACE FUNCTION public.api_rate_guard_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.api_rate_guard();
    RETURN NULL;
END;
$$;

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname NOT IN ('api_request_counters', 'auth_throttle', 'rate_limits', 'analytics_events', 'spatial_ref_sys')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS a_api_rate_guard ON public.%I', t.relname);
        EXECUTE format(
            'CREATE TRIGGER a_api_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
            'FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger()', t.relname);
    END LOOP;
END $$;
