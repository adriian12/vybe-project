-- ============================================================================
-- 030. El embudo empieza antes: cuántos se registran y no confirman
-- ============================================================================
-- El embudo de administración arrancaba en «perfiles creados», y ese número no
-- dice nada del problema más caro que tiene el producto ahora mismo: gente que
-- rellena el registro, no recibe el correo y nunca vuelve. Esa pérdida ocurre
-- antes del primer escalón que se estaba midiendo, así que era invisible.
--
-- `auth.users` no la puede leer el navegador, y con razón. Esta función la lee
-- por él, sólo para administración y sólo en agregado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_signup_funnel(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    accounts BIGINT,
    confirmed BIGINT,
    with_photo BIGINT,
    face_verified BIGINT,
    fully_verified BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_since TIMESTAMPTZ := NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN';
    END IF;

    RETURN QUERY
    WITH cuentas AS (
        SELECT u.id, u.email_confirmed_at
        FROM auth.users u
        WHERE u.created_at >= v_since
          -- Las cuentas de local tienen su propio camino y no pasan por fotos.
          AND COALESCE(u.raw_user_meta_data->>'account_type', 'user') <> 'venue'
    )
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE c.email_confirmed_at IS NOT NULL)::BIGINT,
        COUNT(*) FILTER (WHERE COALESCE(array_length(p.photos, 1), 0) > 0)::BIGINT,
        COUNT(*) FILTER (WHERE COALESCE(p.face_verified, FALSE))::BIGINT,
        COUNT(*) FILTER (WHERE COALESCE(p.is_verified, FALSE))::BIGINT
    FROM cuentas c
    LEFT JOIN public.profiles p ON p.user_id = c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_signup_funnel(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_signup_funnel(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_signup_funnel IS
    'Embudo de alta en agregado, incluida la confirmación del correo. Sólo administración.';
