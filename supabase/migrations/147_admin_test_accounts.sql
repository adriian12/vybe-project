-- 147: Usuarios reales en el panel de administración.
--
--   · `admin_test_accounts`: cuentas que administración marca como de prueba
--     (revisores de Apple y Google que entran con «Iniciar sesión con Apple»,
--     cuentas propias…). Sólo la leen y escriben las funciones de abajo.
--   · `admin_is_test_account`: prueba = marcada a mano, administración, o un
--     correo de los dominios de prueba (seed, @fiestea.es de revisión…).
--   · `admin_list_users`: nuevo `p_only_real` (por defecto TRUE) y dos
--     columnas: `is_test` y `profile_completed` (el fiester@ que aún no ha
--     terminado el alta; al invitado no se le pide nada más).
--   · `admin_user_counts`: reales, fiester@s, invitados y altas sin terminar.
--   · `admin_set_test_account`: marcar o desmarcar una cuenta.

CREATE TABLE IF NOT EXISTS public.admin_test_accounts (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_test_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_test_accounts FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.admin_test_accounts;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.admin_test_accounts
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

CREATE OR REPLACE FUNCTION public.admin_is_test_account(p_profile_id UUID, p_email TEXT, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT COALESCE(
        p_role = 'admin'
        OR LOWER(COALESCE(p_email, '')) ~ '@(seed\.vybe\.test|vybe-test\.local|test\.com|example\.com|fiestea\.es)$'
        OR EXISTS (SELECT 1 FROM public.admin_test_accounts t WHERE t.profile_id = p_profile_id),
        FALSE
    );
$$;

REVOKE ALL ON FUNCTION public.admin_is_test_account(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.admin_list_users(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.admin_list_users(
    p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_only_real BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    profile_id UUID, name TEXT, email TEXT, age INTEGER, role TEXT, account_type TEXT, status TEXT,
    is_verified BOOLEAN, staff_only BOOLEAN, created_at TIMESTAMPTZ, subscription_type TEXT,
    subscription_expires_at TIMESTAMPTZ, subscription_event_id UUID, supercrush INTEGER, check_ins BIGINT,
    total_count BIGINT, subscription_cancel_at_period_end BOOLEAN, subscription_renews BOOLEAN,
    is_test BOOLEAN, profile_completed BOOLEAN
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_q TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT p.*, u.email::TEXT AS correo,
               public.admin_is_test_account(p.id, u.email::TEXT, p.role) AS prueba
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.user_id
        WHERE v_q IS NULL
           OR p.name ILIKE '%' || v_q || '%'
           OR u.email ILIKE '%' || v_q || '%'
           OR p.phone ILIKE '%' || v_q || '%'
    ), filtrada AS (
        SELECT * FROM base WHERE NOT COALESCE(p_only_real, TRUE) OR NOT base.prueba
    ), total AS (SELECT COUNT(*) AS n FROM filtrada)
    SELECT
        b.id, b.name, b.correo, b.age, b.role, b.account_type, b.status, b.is_verified,
        b.staff_only, b.created_at,
        s.subscription_type, s.expires_at, s.event_id,
        public.supercrush_balance(b.id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.profile_id = b.id),
        (SELECT n FROM total),
        COALESCE(s.cancel_at_period_end, FALSE),
        COALESCE(s.stripe_subscription_id IS NOT NULL AND NOT COALESCE(s.cancel_at_period_end, FALSE), FALSE),
        b.prueba,
        b.account_type = 'guest' OR b.profile_completed_at IS NOT NULL
    FROM filtrada b
    LEFT JOIN LATERAL (
        SELECT ps.subscription_type, ps.expires_at, ps.event_id, ps.cancel_at_period_end, ps.stripe_subscription_id
        FROM public.premium_subscriptions ps
        WHERE ps.user_id = b.id
          AND ps.status = 'active'
          AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
        ORDER BY (ps.event_id IS NULL) DESC, ps.started_at DESC
        LIMIT 1
    ) s ON TRUE
    ORDER BY b.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_user_counts()
RETURNS TABLE(real_users BIGINT, fiesteros BIGINT, guests BIGINT, incomplete BIGINT, test_accounts BIGINT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    WITH c AS (
        SELECT p.account_type, p.profile_completed_at,
               public.admin_is_test_account(p.id, u.email::TEXT, p.role) AS prueba
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.user_id
    )
    SELECT
        COUNT(*) FILTER (WHERE NOT prueba),
        COUNT(*) FILTER (WHERE NOT prueba AND account_type <> 'guest' AND profile_completed_at IS NOT NULL),
        COUNT(*) FILTER (WHERE NOT prueba AND account_type = 'guest'),
        COUNT(*) FILTER (WHERE NOT prueba AND account_type <> 'guest' AND profile_completed_at IS NULL),
        COUNT(*) FILTER (WHERE prueba)
    FROM c;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_counts() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_test_account(p_profile_id UUID, p_test BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF COALESCE(p_test, FALSE) THEN
        INSERT INTO public.admin_test_accounts (profile_id) VALUES (p_profile_id)
        ON CONFLICT (profile_id) DO NOTHING;
    ELSE
        DELETE FROM public.admin_test_accounts WHERE profile_id = p_profile_id;
    END IF;

    RETURN COALESCE(p_test, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_test_account(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_test_account(UUID, BOOLEAN) TO authenticated;
