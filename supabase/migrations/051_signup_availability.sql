-- =============================================================================
-- 051 · ¿Correo o móvil ya registrados?
-- =============================================================================
-- El formulario de alta avisa en rojo «Este correo ya está registrado» / «Este
-- móvil ya está registrado» en lugar de fingir que ha mandado un correo. Lo
-- consulta la Edge Function `auth-email` (acción `check`, con límite por IP), y
-- sólo ella puede llamar a esta función.
--
-- Decisión del producto: se prefiere decirlo claro aunque permita averiguar si
-- un correo tiene cuenta. El límite por IP hace caro recorrerse una lista.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.signup_availability(p_email TEXT, p_phone TEXT)
RETURNS TABLE(email_taken BOOLEAN, phone_taken BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_email TEXT := lower(btrim(COALESCE(p_email, '')));
    v_phone TEXT := public.normalize_phone(p_phone);
BEGIN
    -- Un prefijo solo («+34») no es un número.
    IF v_phone IS NOT NULL AND length(regexp_replace(v_phone, '\D', '', 'g')) < 7 THEN
        v_phone := NULL;
    END IF;

    RETURN QUERY SELECT
        v_email <> '' AND EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email),
        v_phone IS NOT NULL AND (
            EXISTS (SELECT 1 FROM public.profiles p WHERE public.normalize_phone(p.phone) = v_phone)
            OR EXISTS (
                SELECT 1 FROM auth.users u
                WHERE public.normalize_phone(u.raw_user_meta_data->>'phone') = v_phone
            )
        );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_availability(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_availability(TEXT, TEXT) TO service_role;
