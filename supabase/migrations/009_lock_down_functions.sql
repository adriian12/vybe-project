-- ============================================================================
-- 009 — Cierre de las funciones y de la vista heredada
--
-- El linter de seguridad de Supabase señaló tres cosas que las migraciones
-- anteriores no cubrían:
--
--   1. Una vista `active_conversations` con SECURITY DEFINER que resumía la
--      tabla `messages` saltándose las policies: cualquier cuenta autenticada
--      podía ver con quién habla todo el mundo y cuántos mensajes se envían.
--   2. Cuarenta y cuatro funciones SECURITY DEFINER ejecutables por `anon` vía
--      `/rest/v1/rpc/…`. Las 006 y 007 revocaban sólo las que enumeraban; el
--      resto conservaba el GRANT implícito a PUBLIC que da PostgreSQL al crear
--      una función. Entre ellas estaba `cleanup_expired_event_codes()`, que
--      desactiva códigos de acceso, y `update_user_location()`.
--   3. Seis funciones heredadas de las migraciones 001 y 002 sin
--      `search_path` fijo, lo que permite secuestrarlas creando objetos con el
--      mismo nombre en un esquema que aparezca antes en la ruta de búsqueda.
-- ============================================================================

-- ============================================================================
-- 1. VISTA HEREDADA
-- Ningún componente de la aplicación la consulta; el listado de conversaciones
-- se arma en `api.getMatches()`.
-- ============================================================================

DROP VIEW IF EXISTS public.active_conversations;

-- ============================================================================
-- 2. SEARCH_PATH FIJO EN LAS FUNCIONES HEREDADAS
-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'update_user_location', 'get_distance', 'is_user_blocked',
              'cleanup_expired_event_codes', 'get_user_conversations',
              'update_updated_at_column'
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.sig);
    END LOOP;
END $$;

-- ============================================================================
-- 3. PERMISOS DE EJECUCIÓN
--
-- Se parte de cero: se revoca PUBLIC y `anon` en las funciones propias del
-- proyecto y después se concede a `authenticated` solo la lista que la
-- aplicación llama por RPC. Las funciones de trigger no se conceden a nadie:
-- PostgreSQL las invoca por sí mismo y exponerlas por REST no tiene ningún uso
-- legítimo.
--
-- Las funciones que pertenecen a una extensión (uuid-ossp, pgcrypto, vector,
-- pg_trgm...) quedan fuera a propósito. `uuid_generate_v4()` es el DEFAULT de
-- casi todas las claves primarias y los DEFAULT se evalúan con los privilegios
-- de quien inserta: revocarla dejaría a `authenticated` sin poder crear una
-- sola fila.
-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.objid = p.oid AND d.deptype = 'e'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
    END LOOP;
END $$;

-- Que las funciones futuras nazcan igual de cerradas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

DO $$
DECLARE
    allowed TEXT[] := ARRAY[
        -- Sesión y roles
        'current_profile_id', 'current_venue_id', 'current_venue_role', 'is_admin',
        'is_current_user_verified', 'are_connected', 'shares_active_event',
        'is_profile_active', 'is_premium',
        -- Acceso a eventos
        'redeem_event_code', 'heartbeat_event_attendance', 'rotate_event_code_if_needed',
        -- Descubrimiento y conexiones
        'get_nearby_profiles', 'get_likes_received', 'keep_connection',
        -- Grupos
        'create_group', 'join_group', 'leave_group', 'get_event_groups',
        'current_group_id', 'is_group_member',
        -- Métricas
        'get_event_stats', 'get_venue_stats', 'get_event_funnel', 'get_event_hourly',
        'get_venue_events_summary', 'get_events_activity',
        'get_profile_reputation', 'get_my_event_history',
        -- Cuenta y RGPD
        'export_my_data', 'request_account_deletion',
        -- Administración (cada una comprueba is_admin() por dentro)
        'review_photo', 'suspend_profile', 'reinstate_profile'
    ];
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY(allowed)
          -- Nunca una función de trigger, aunque el nombre coincidiese.
          AND p.prorettype <> 'trigger'::regtype
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

-- Las tareas de mantenimiento sólo las lanza el servidor (pg_cron o la service
-- role key), nunca un usuario.
-- `purge_expired_connections`, `purge_rate_limits` y `cleanup_expired_event_codes`
-- se quedan sin ningún GRANT.

-- ============================================================================
-- 4. COMPROBACIÓN
-- ============================================================================

DO $$
DECLARE
    leaked INTEGER;
BEGIN
    SELECT COUNT(*) INTO leaked
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
          SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF leaked > 0 THEN
        RAISE EXCEPTION 'Quedan % funciones del proyecto ejecutables por anon', leaked;
    END IF;
END $$;
