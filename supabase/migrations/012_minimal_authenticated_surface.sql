-- ============================================================================
-- 012 — Superficie mínima para el rol `authenticated`
--
-- La 009 cerró el acceso de `anon`, pero `authenticated` seguía pudiendo
-- ejecutar todo lo que hay en `public`, porque Supabase trae configurado
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon, authenticated`
-- y cada función nace concedida.
--
-- Eso deja expuestas por `/rest/v1/rpc/…` cosas que ninguna pantalla llama:
--
--   · funciones de trigger (`check_match`, `enforce_swipe_limit`,
--     `handle_new_user`, `delete_connection_messages`…), que PostgreSQL invoca
--     por su cuenta y que no necesitan permiso para dispararse;
--   · tareas de mantenimiento (`purge_expired_connections`, `purge_rate_limits`,
--     `cleanup_expired_event_codes`), pensadas para pg_cron o la service role;
--   · restos del modelo antiguo (`update_user_location`,
--     `get_user_conversations`, `is_user_blocked`).
--
-- También se retira `authenticated` de las tablas heredadas que ya no usa
-- ninguna pantalla. Tienen RLS y ninguna policy, así que hoy no devuelven
-- filas, pero seguían apareciendo en el esquema de GraphQL.
-- ============================================================================

-- ============================================================================
-- 1. FUNCIONES
-- Sólo se conceden las que la aplicación llama de verdad. La lista es la misma
-- de la 009 más las dos guardas de métricas que añadió la 011.
-- ============================================================================

DO $$
DECLARE
    allowed TEXT[] := ARRAY[
        'current_profile_id', 'current_venue_id', 'current_venue_role', 'is_admin',
        'is_current_user_verified', 'are_connected', 'shares_active_event',
        'is_profile_active', 'is_premium',
        'redeem_event_code', 'heartbeat_event_attendance', 'rotate_event_code_if_needed',
        'get_nearby_profiles', 'get_likes_received', 'keep_connection',
        'create_group', 'join_group', 'leave_group', 'get_event_groups',
        'current_group_id', 'is_group_member',
        'get_event_stats', 'get_venue_stats', 'get_event_funnel', 'get_event_hourly',
        'get_venue_events_summary', 'get_events_activity',
        'get_profile_reputation', 'get_my_event_history',
        'can_read_venue_metrics', 'can_read_event_metrics',
        'export_my_data', 'request_account_deletion',
        'review_photo', 'suspend_profile', 'reinstate_profile'
    ];
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig, p.proname
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.sig);
    END LOOP;

    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname = ANY(allowed)
          AND p.prorettype <> 'trigger'::regtype
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

-- ============================================================================
-- 2. TABLAS HEREDADAS
--
-- No se borran: `users` guarda los roles originales con los que la 008 dio de
-- alta las cuentas, y conviene poder consultarlo si algo sale mal. Simplemente
-- dejan de estar al alcance del cliente.
-- ============================================================================

DO $$
DECLARE
    legacy TEXT;
BEGIN
    FOREACH legacy IN ARRAY ARRAY[
        'users', 'venue_profiles', 'venue_events', 'user_preferences',
        'blocked_users', 'notifications', 'activity_log', 'event_attendance_legacy'
    ]
    LOOP
        IF to_regclass('public.' || legacy) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', legacy);
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- 3. COMPROBACIÓN
-- ============================================================================

DO $$
DECLARE
    expuestas TEXT;
BEGIN
    SELECT string_agg(p.proname, ', ')
    INTO expuestas
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND p.prorettype = 'trigger'::regtype
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
           OR has_function_privilege('anon', p.oid, 'EXECUTE'));

    IF expuestas IS NOT NULL THEN
        RAISE EXCEPTION 'Funciones de trigger todavía expuestas por REST: %', expuestas;
    END IF;
END $$;
