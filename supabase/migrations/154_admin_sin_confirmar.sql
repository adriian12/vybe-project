-- ============================================================================
-- 154. Admin › Usuarios: cuentas con el correo sin confirmar, marcadas
-- ============================================================================
-- Un alta por correo crea el perfil antes de confirmar. Si el correo estaba mal
-- escrito (o nunca se abrió el enlace) la cuenta salía como un usuario más:
-- el 27-11-2026 aparecían dos «rosasanchez», una con el correo equivocado.
-- Siguen saliendo en la lista, pero marcadas (email_confirmed) para poder
-- reenviarles el correo, y no cuentan entre los reales: van en su contador.

DROP FUNCTION IF EXISTS public.admin_list_users(TEXT, INTEGER, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_user_counts();

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
    is_test BOOLEAN, profile_completed BOOLEAN, email_confirmed BOOLEAN
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
               public.admin_is_test_account(p.id, u.email::TEXT, p.role) AS prueba,
               (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL) AS confirmada
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
        b.account_type = 'guest' OR b.profile_completed_at IS NOT NULL,
        COALESCE(b.confirmada, FALSE)
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
RETURNS TABLE(real_users BIGINT, fiesteros BIGINT, guests BIGINT, incomplete BIGINT, test_accounts BIGINT, unconfirmed BIGINT)
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
               public.admin_is_test_account(p.id, u.email::TEXT, p.role) AS prueba,
               (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL) AS confirmada
        FROM public.profiles p
        LEFT JOIN auth.users u ON u.id = p.user_id
    ), r AS (
        SELECT *, NOT prueba AND COALESCE(confirmada, FALSE) AS real FROM c
    )
    SELECT
        COUNT(*) FILTER (WHERE real),
        COUNT(*) FILTER (WHERE real AND account_type <> 'guest' AND profile_completed_at IS NOT NULL),
        COUNT(*) FILTER (WHERE real AND account_type = 'guest'),
        COUNT(*) FILTER (WHERE real AND account_type <> 'guest' AND profile_completed_at IS NULL),
        COUNT(*) FILTER (WHERE prueba),
        COUNT(*) FILTER (WHERE NOT prueba AND NOT COALESCE(confirmada, FALSE))
    FROM r;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_counts() TO authenticated;

-- Las altas del informe de descargas (152), con el mismo criterio.
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
           AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
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
