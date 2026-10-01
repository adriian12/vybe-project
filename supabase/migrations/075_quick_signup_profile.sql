-- 075: alta rápida y ficha de fiester@.
--
-- El alta pide sólo nombre, correo y contraseña (o Google / Apple). Si la
-- cuenta es de fiester@, al entrar la app pide una vez la ficha: edad, si es
-- hombre o mujer, a quién quiere ver, el plan de esta noche y una bio
-- opcional. `profile_completed_at` dice si ya la rellenó.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;
-- El plan de esta noche ya existía (`plan_tonight`); aquí sólo se rellena.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS tonight_plan;

-- Quien ya tenía cuenta no tiene que volver a rellenar nada.
UPDATE public.profiles SET profile_completed_at = COALESCE(profile_completed_at, created_at, NOW())
WHERE profile_completed_at IS NULL;

-- Google y Apple mandan el nombre como `full_name` o `name` (Apple sólo la
-- primera vez). Sin nombre, la parte del correo antes de la arroba.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_type TEXT := COALESCE(NEW.raw_user_meta_data->>'account_type', 'user');
    v_venue_type TEXT;
    v_radius INTEGER;
    v_name TEXT := NULLIF(btrim(COALESCE(
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'full_name',
        ''
    )), '');
BEGIN
    IF v_account_type = 'venue' THEN
        v_venue_type := COALESCE(NULLIF(NEW.raw_user_meta_data->>'venue_type', ''), 'local');

        v_radius := CASE v_venue_type
            WHEN 'discoteca' THEN 100
            WHEN 'festival' THEN 500
            WHEN 'evento_empresarial' THEN 250
            ELSE 50
        END;

        INSERT INTO public.venues (
            venue_id, name, email, type, phone, tax_id, address, event_radius
        )
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'venue_name', split_part(NEW.email, '@', 1)),
            NEW.email,
            v_venue_type,
            NEW.raw_user_meta_data->>'phone',
            NULLIF(NEW.raw_user_meta_data->>'tax_id', ''),
            NULLIF(NEW.raw_user_meta_data->>'address', ''),
            v_radius
        )
        ON CONFLICT (venue_id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (user_id, name, email, age, phone, gender, wants, account_type)
        VALUES (
            NEW.id,
            COALESCE(v_name, split_part(COALESCE(NEW.email, 'fiester'), '@', 1)),
            NEW.email,
            GREATEST(18, COALESCE((NEW.raw_user_meta_data->>'age')::INTEGER, 18)),
            NEW.raw_user_meta_data->>'phone',
            CASE WHEN NEW.raw_user_meta_data->>'gender' IN ('man', 'woman')
                 THEN NEW.raw_user_meta_data->>'gender' END,
            CASE WHEN NEW.raw_user_meta_data->>'wants' IN ('men', 'women', 'all')
                 THEN NEW.raw_user_meta_data->>'wants' ELSE 'all' END,
            CASE WHEN NEW.raw_user_meta_data->>'profile_kind' = 'guest' THEN 'guest' ELSE 'vyber' END
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- La ficha de fiester@. SECURITY DEFINER porque el género está protegido
-- contra escrituras directas (028): se fija aquí, una vez, con la ficha.
CREATE OR REPLACE FUNCTION public.complete_my_profile(
    p_age INTEGER,
    p_gender TEXT,
    p_wants TEXT,
    p_tonight_plan TEXT DEFAULT NULL,
    p_bio TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF p_gender NOT IN ('man', 'woman') THEN
        RAISE EXCEPTION 'GENDER_REQUIRED';
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
$$;

REVOKE ALL ON FUNCTION public.complete_my_profile(INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_my_profile(INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;
