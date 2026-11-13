-- 136 · El género es opcional (Apple, guideline 5.1.1(v), rechazo del 12-11-2026).
--
-- Apple no deja exigir el género. Quien no lo dice queda con `gender` NULL y,
-- como ya hacía `wants_gender()`, lo ve todo el mundo y ve a quien quiera ver.
-- Hasta ahora «ficha sin hacer» se medía por `gender IS NULL`; pasa a medirse
-- por `profile_completed_at`, que pone `complete_my_profile()` (los invitados
-- que se registran como tales no la tienen).

CREATE OR REPLACE FUNCTION public.complete_my_profile(
    p_age integer,
    p_gender text,
    p_wants text,
    p_tonight_plan text DEFAULT NULL::text,
    p_bio text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_gender TEXT;
BEGIN
    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;
    IF p_age IS NULL OR p_age < 18 OR p_age > 99 THEN
        RAISE EXCEPTION 'INVALID_AGE';
    END IF;
    -- Opcional: NULL es «prefiero no decirlo».
    IF p_gender IS NOT NULL AND p_gender NOT IN ('man', 'woman') THEN
        RAISE EXCEPTION 'INVALID_GENDER';
    END IF;
    IF p_wants NOT IN ('men', 'women', 'all') THEN
        RAISE EXCEPTION 'WANTS_REQUIRED';
    END IF;

    -- El género, una vez puesto, no cambia (lo mismo que ya exigía el alta).
    SELECT gender INTO v_gender FROM public.profiles WHERE id = v_profile;

    UPDATE public.profiles
    SET age = p_age,
        gender = COALESCE(v_gender, p_gender),
        wants = p_wants,
        plan_tonight = NULLIF(left(btrim(COALESCE(p_tonight_plan, '')), 60), ''),
        bio = CASE WHEN p_bio IS NULL THEN bio ELSE NULLIF(left(btrim(p_bio), 500), '') END,
        profile_completed_at = COALESCE(profile_completed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_profile;
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_account_type_status()
RETURNS TABLE(account_type text, changes_used integer, max_changes integer, next_allowed_at timestamp with time zone, needs_profile boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_max INTEGER;
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    v_max := CASE WHEN public.is_premium(v_profile_id) THEN 3 ELSE 1 END;

    RETURN QUERY
    SELECT
        p.account_type,
        (SELECT COUNT(*)::INTEGER FROM public.account_type_changes c
          WHERE c.profile_id = v_profile_id AND c.to_type = 'vyber'
            AND c.created_at > NOW() - INTERVAL '30 days'),
        v_max,
        -- Cuándo podrá volver a ser vyber si ahora mismo no puede.
        (SELECT c.created_at + INTERVAL '30 days'
           FROM public.account_type_changes c
          WHERE c.profile_id = v_profile_id AND c.to_type = 'vyber'
            AND c.created_at > NOW() - INTERVAL '30 days'
          ORDER BY c.created_at
          OFFSET GREATEST(v_max - 1, 0) LIMIT 1),
        -- Quien se registró como invitado aún no ha rellenado la ficha.
        (p.profile_completed_at IS NULL OR p.wants IS NULL)
    FROM public.profiles p
    WHERE p.id = v_profile_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_account_type(p_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_actual TEXT;
    v_usados INTEGER;
    v_max INTEGER;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;
    IF p_type NOT IN ('vyber', 'guest') THEN
        RAISE EXCEPTION 'INVALID_TYPE';
    END IF;

    SELECT p.account_type INTO v_actual FROM public.profiles p WHERE p.id = v_profile_id;
    IF v_actual = p_type THEN
        RETURN;
    END IF;

    IF p_type = 'vyber' THEN
        -- Volver a vyber sí está limitado.
        IF EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = v_profile_id AND (p.profile_completed_at IS NULL OR p.wants IS NULL)
        ) THEN
            RAISE EXCEPTION 'PROFILE_INCOMPLETE';
        END IF;

        v_max := CASE WHEN public.is_premium(v_profile_id) THEN 3 ELSE 1 END;
        SELECT COUNT(*) INTO v_usados
        FROM public.account_type_changes c
        WHERE c.profile_id = v_profile_id AND c.to_type = 'vyber'
          AND c.created_at > NOW() - INTERVAL '30 days';

        IF v_usados >= v_max THEN
            RAISE EXCEPTION 'SWITCH_LIMIT';
        END IF;
    END IF;

    UPDATE public.profiles SET account_type = p_type WHERE id = v_profile_id;
    INSERT INTO public.account_type_changes (profile_id, to_type) VALUES (v_profile_id, p_type);

    -- Como invitado no se sale en ningún tablón: fuera la foto de la fiesta en
    -- curso y los likes que no llegaron a match.
    IF p_type = 'guest' THEN
        UPDATE public.event_attendance ea
        SET mode = 'guest', photo_url = NULL, photo_taken_at = NULL
        FROM public.events e
        WHERE e.id = ea.event_id
          AND ea.profile_id = v_profile_id
          AND ea.left_at IS NULL
          AND e.end_date > NOW();

        DELETE FROM public.swipes s
        USING public.events e
        WHERE s.event_id = e.id
          AND s.swiper_id = v_profile_id
          AND e.end_date > NOW()
          AND s.swipe_type IN ('like', 'super_like')
          AND NOT public.are_connected(v_profile_id, s.swiped_id);
    END IF;
END;
$function$;
