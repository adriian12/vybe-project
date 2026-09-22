-- =============================================================================
-- 058 · Cuenta Vyber o cuenta invitado
-- =============================================================================
-- Vybe reúne las fiestas de toda España y mucha gente la usará sólo para eso.
-- Por eso la cuenta tiene tipo desde el registro:
--
--   · **vyber**: foto del momento, tablón, swipe y match.
--   · **guest** («invitado»): ve fiestas, mapa, ofertas, sorteos y avisos, y
--     no aparece en ningún tablón ni ve ninguno.
--
-- Cambiar a invitado se puede siempre y al momento: es lo que protege la
-- privacidad. Volver a vyber está limitado, para que nadie entre y salga sólo
-- para cotillear: una vez cada 30 días, tres con Premium. Y hace falta tener
-- rellenado lo que el registro de vyber pide y el de invitado no (género y a
-- quién quiere ver).
--
-- Además, el móvil pasa a ser único: si ya hay una cuenta con ese número, no
-- se puede registrar otra.
-- =============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'vyber';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type_check
    CHECK (account_type IN ('vyber', 'guest'));

-- Un móvil, una cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique
    ON public.profiles (public.normalize_phone(phone))
    WHERE phone IS NOT NULL AND phone <> '';

CREATE TABLE IF NOT EXISTS public.account_type_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    to_type TEXT NOT NULL CHECK (to_type IN ('vyber', 'guest')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_type_changes_profile
    ON public.account_type_changes(profile_id, created_at DESC);
ALTER TABLE public.account_type_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own account changes" ON public.account_type_changes;
CREATE POLICY "Users read own account changes" ON public.account_type_changes
    FOR SELECT USING (profile_id = public.current_profile_id());

-- El tipo de cuenta lo decide el registro (metadato `profile_kind`).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_account_type TEXT := COALESCE(NEW.raw_user_meta_data->>'account_type', 'user');
    v_venue_type TEXT;
    v_radius INTEGER;
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
            COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
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
$function$;

-- ---------------------------------------------------------------------------
-- Estado y cambio de tipo de cuenta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_account_type_status()
RETURNS TABLE(
    account_type TEXT,
    changes_used INTEGER,
    max_changes INTEGER,
    next_allowed_at TIMESTAMPTZ,
    needs_profile BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
        -- Al registrarse como invitado no se piden estos dos.
        (p.gender IS NULL OR p.wants IS NULL)
    FROM public.profiles p
    WHERE p.id = v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_account_type(p_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
            WHERE p.id = v_profile_id AND (p.gender IS NULL OR p.wants IS NULL)
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
$$;

-- El perfil puede completar género y «a quién quiere ver» al pasarse a vyber.
-- `gender` sigue sin poderse cambiar una vez puesto: sólo rellenarlo si falta.
CREATE OR REPLACE FUNCTION public.set_my_gender(p_gender TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;
    IF p_gender NOT IN ('man', 'woman') THEN
        RAISE EXCEPTION 'INVALID_GENDER';
    END IF;

    UPDATE public.profiles SET gender = p_gender
    WHERE id = v_profile_id AND gender IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'GENDER_ALREADY_SET';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_type(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_account_type(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.my_account_type_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_type_status() TO authenticated;
REVOKE ALL ON FUNCTION public.set_my_gender(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_gender(TEXT) TO authenticated;
