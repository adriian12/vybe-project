-- 117: administración puede cambiar el plan de quien tiene Premium de una fiesta.
--
-- El panel bloqueaba el selector en cuanto la persona tenía un Premium de una
-- fiesta, y en la sala de pruebas (que termina en 2030) ese Premium caducaba en
-- 2031: no había forma de quitárselo ni de darle otro. Ahora:
--   - «Sin Premium» cancela también los de una fiesta;
--   - mensual o vitalicio se añaden y dejan el de la fiesta como está (la
--     lista de administración ya enseña antes el que no es de una fiesta).

CREATE OR REPLACE FUNCTION public.admin_set_subscription(p_profile_id UUID, p_type TEXT, p_days INTEGER DEFAULT 30)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expira TIMESTAMPTZ;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_type NOT IN ('none', 'monthly', 'lifetime') THEN
        RAISE EXCEPTION 'INVALID_TYPE';
    END IF;

    UPDATE public.premium_subscriptions
    SET status = 'cancelled'
    WHERE user_id = p_profile_id
      AND status = 'active'
      AND (event_id IS NULL OR p_type = 'none');

    IF p_type = 'none' THEN
        RETURN 'none';
    END IF;

    v_expira := CASE WHEN p_type = 'lifetime' THEN NULL
                     ELSE NOW() + (GREATEST(1, COALESCE(p_days, 30)) || ' days')::INTERVAL END;

    INSERT INTO public.premium_subscriptions (user_id, subscription_type, event_id, status, started_at, expires_at)
    VALUES (p_profile_id, p_type, NULL, 'active', NOW(), v_expira)
    ON CONFLICT (user_id, event_id, subscription_type)
    DO UPDATE SET status = 'active', started_at = NOW(), expires_at = EXCLUDED.expires_at,
                  cancel_at_period_end = FALSE;

    RETURN p_type;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_subscription(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, INTEGER) TO authenticated;
