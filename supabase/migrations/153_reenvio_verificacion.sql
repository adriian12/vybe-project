-- ============================================================================
-- 153. No anular el correo de verificación con un reenvío inmediato
-- ============================================================================
-- Cada enlace nuevo que crea `generateLink()` anula el anterior. Quien pulsaba
-- «Reenviar» mientras esperaba el primer correo recibía dos y, al abrir el
-- primero, GoTrue contestaba «One-time token not found» (27-11-2026, dos
-- altas). `auth-email` pregunta esto antes de reenviar: si el último salió
-- hace menos de 90 segundos no crea otro.

CREATE OR REPLACE FUNCTION public.auth_confirmation_recent(p_email TEXT, p_seconds INTEGER DEFAULT 90)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((
        SELECT u.email_confirmed_at IS NULL
           AND u.confirmation_sent_at > NOW() - make_interval(secs => GREATEST(p_seconds, 0))
          FROM auth.users u
         WHERE lower(u.email) = lower(trim(p_email))
         LIMIT 1
    ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.auth_confirmation_recent(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_confirmation_recent(TEXT, INTEGER) TO service_role;
