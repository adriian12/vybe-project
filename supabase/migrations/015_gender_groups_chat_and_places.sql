-- ============================================================================
-- 015 — Género y preferencias, chat de grupo, foto del evento y localidades
--
-- Cinco cambios de producto que comparten migración porque se tocan entre sí:
--
--   1. Género y a quién se quiere ver, con emparejamiento recíproco.
--   2. Chat de grupo, que caduca con el evento.
--   3. Crear grupo pasa a ser de pago; unirse sigue siendo gratis.
--   4. La foto que se ve al deslizar es la que uno se hace en el evento, no la
--      del perfil.
--   5. Localidad y comunidad en los locales, para poder filtrar eventos.
-- ============================================================================

-- ============================================================================
-- 1. GÉNERO Y PREFERENCIAS
--
-- `gender` es el género de la persona y no se puede cambiar una vez elegido:
-- cambiarlo a voluntad convierte el filtro en algo inútil y es la vía habitual
-- para colarse en el lado contrario. `wants` sí es editable desde ajustes.
-- ============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS wants TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_gender_check') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_gender_check CHECK (gender IN ('man', 'woman'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_wants_check') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_wants_check CHECK (wants IN ('men', 'women', 'all'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_gender ON public.profiles(gender, wants)
    WHERE gender IS NOT NULL;

/**
 * Impide cambiar el género una vez fijado.
 *
 * La restricción va en la base de datos y no en la interfaz porque la anon key
 * viaja en el navegador: cualquiera puede llamar a la API por su cuenta.
 */
CREATE OR REPLACE FUNCTION public.freeze_gender()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
        RAISE EXCEPTION 'GENDER_IS_FINAL';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_gender_trigger ON public.profiles;
CREATE TRIGGER freeze_gender_trigger
    BEFORE UPDATE OF gender ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.freeze_gender();

/** ¿Quiere `p_wants` ver a alguien de género `p_gender`? */
CREATE OR REPLACE FUNCTION public.wants_gender(p_wants TEXT, p_gender TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
    SELECT p_wants = 'all'
        OR p_gender IS NULL
        OR (p_wants = 'men' AND p_gender = 'man')
        OR (p_wants = 'women' AND p_gender = 'woman');
$$;

-- El alta automática recoge género y preferencia del formulario de registro.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_account_type TEXT := COALESCE(NEW.raw_user_meta_data->>'account_type', 'user');
BEGIN
    IF v_account_type = 'venue' THEN
        INSERT INTO public.venues (venue_id, name, email, type, phone)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'venue_name', split_part(NEW.email, '@', 1)),
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'venue_type', 'local'),
            NEW.raw_user_meta_data->>'phone'
        )
        ON CONFLICT (venue_id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (user_id, name, email, age, phone, gender, wants)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
            NEW.email,
            GREATEST(18, COALESCE((NEW.raw_user_meta_data->>'age')::INTEGER, 18)),
            NEW.raw_user_meta_data->>'phone',
            CASE WHEN NEW.raw_user_meta_data->>'gender' IN ('man', 'woman')
                 THEN NEW.raw_user_meta_data->>'gender' END,
            CASE WHEN NEW.raw_user_meta_data->>'wants' IN ('men', 'women', 'all')
                 THEN NEW.raw_user_meta_data->>'wants' ELSE 'all' END
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. FOTO DEL EVENTO
--
-- Al deslizar se ve cómo va la persona esta noche, no una foto de hace un año.
-- Por eso la foto cuelga de la asistencia al evento y no del perfil.
-- ============================================================================

ALTER TABLE public.event_attendance
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS photo_taken_at TIMESTAMPTZ;

-- ============================================================================
-- 3. LOCALIDAD Y COMUNIDAD
-- ============================================================================

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS region TEXT;

CREATE INDEX IF NOT EXISTS idx_venues_place ON public.venues(region, city);

/** Localidades y comunidades con algún evento vigente, para los desplegables. */
CREATE OR REPLACE FUNCTION public.get_event_places()
RETURNS TABLE (region TEXT, city TEXT, events BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT v.region, v.city, COUNT(*)
    FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    WHERE e.end_date > NOW()
      AND v.is_verified
      AND v.city IS NOT NULL
    GROUP BY v.region, v.city
    ORDER BY v.region NULLS LAST, v.city;
$$;

-- ============================================================================
-- 4. CHAT DE GRUPO
--
-- Un grupo sin sitio donde hablar no sirve de nada: se creaba, se veía en una
-- lista y ahí se acababa. Los mensajes caducan con el evento, igual que las
-- conversaciones de un match.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.group_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group
    ON public.group_messages(group_id, created_at);

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group members read messages" ON public.group_messages;
DROP POLICY IF EXISTS "Group members write messages" ON public.group_messages;

CREATE POLICY "Group members read messages"
    ON public.group_messages FOR SELECT TO authenticated
    USING (public.is_group_member(group_id));

CREATE POLICY "Group members write messages"
    ON public.group_messages FOR INSERT TO authenticated
    WITH CHECK (
        profile_id = public.current_profile_id()
        AND public.is_group_member(group_id)
    );

-- Mismo límite por hora que el chat privado.
CREATE OR REPLACE FUNCTION public.enforce_group_message_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF public.current_profile_id() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT public.consume_rate_limit('group_message', 200, 3600) THEN
        RAISE EXCEPTION 'RATE_LIMITED_MESSAGES';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_group_message_limit_trigger ON public.group_messages;
CREATE TRIGGER enforce_group_message_limit_trigger
    BEFORE INSERT ON public.group_messages
    FOR EACH ROW EXECUTE FUNCTION public.enforce_group_message_limit();

/** Mensajes del grupo con el nombre y la foto de quien escribe. */
CREATE OR REPLACE FUNCTION public.get_group_messages(p_group_id UUID)
RETURNS TABLE (
    id UUID,
    profile_id UUID,
    author_name TEXT,
    author_photo TEXT,
    content TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    RETURN QUERY
    SELECT gm.id, gm.profile_id, p.name, COALESCE(p.avatar, p.photos[1]), gm.content, gm.created_at
    FROM public.group_messages gm
    JOIN public.profiles p ON p.id = gm.profile_id
    WHERE gm.group_id = p_group_id
    ORDER BY gm.created_at ASC
    LIMIT 300;
END;
$$;

/** Borra los grupos de eventos ya terminados; los mensajes caen en cascada. */
CREATE OR REPLACE FUNCTION public.purge_finished_groups()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH gone AS (
        DELETE FROM public.groups g
        USING public.events e
        WHERE e.id = g.event_id
          AND e.end_date < NOW() - INTERVAL '6 hours'
        RETURNING g.id
    )
    SELECT COUNT(*) INTO deleted_count FROM gone;

    RETURN deleted_count;
END;
$$;

-- ============================================================================
-- 5. CREAR GRUPO ES DE PAGO
--
-- Unirse sigue siendo gratis: si crear y unirse costaran, no habría grupos a
-- los que unirse y la función no arrancaría nunca.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_group(p_event_id UUID, p_name TEXT)
RETURNS TABLE (group_id UUID, join_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_group_id UUID;
    v_code TEXT;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    IF public.current_group_id(p_event_id) IS NOT NULL THEN
        RAISE EXCEPTION 'ALREADY_IN_GROUP';
    END IF;

    v_code := upper(substring(md5(random()::text) FROM 1 FOR 6));

    INSERT INTO public.groups (event_id, owner_id, name, join_code)
    VALUES (p_event_id, v_profile_id, p_name, v_code)
    RETURNING id INTO v_group_id;

    INSERT INTO public.group_members (group_id, profile_id) VALUES (v_group_id, v_profile_id);

    RETURN QUERY SELECT v_group_id, v_code;
END;
$$;

/** Expulsar a alguien del grupo. Sólo quien lo creó. */
CREATE OR REPLACE FUNCTION public.remove_group_member(p_group_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_owner UUID;
BEGIN
    SELECT owner_id INTO v_owner FROM public.groups WHERE id = p_group_id;

    IF v_owner IS NULL OR v_owner IS DISTINCT FROM public.current_profile_id() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF p_profile_id = v_owner THEN
        RAISE EXCEPTION 'CANNOT_REMOVE_OWNER';
    END IF;

    DELETE FROM public.group_members
    WHERE group_id = p_group_id AND profile_id = p_profile_id;
END;
$$;

/** Miembros del grupo, para la lista y para administrarlo. */
CREATE OR REPLACE FUNCTION public.get_group_members(p_group_id UUID)
RETURNS TABLE (profile_id UUID, name TEXT, photo TEXT, is_owner BOOLEAN, joined_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.is_group_member(p_group_id) THEN
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    RETURN QUERY
    SELECT gm.profile_id, p.name, COALESCE(p.avatar, p.photos[1]),
           g.owner_id = gm.profile_id, gm.joined_at
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    JOIN public.profiles p ON p.id = gm.profile_id
    WHERE gm.group_id = p_group_id
    ORDER BY gm.joined_at;
END;
$$;

-- ============================================================================
-- 6. DESCUBRIMIENTO CON GÉNERO Y FOTO DEL EVENTO
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID, INTEGER, INTEGER, TEXT[]);

CREATE FUNCTION public.get_nearby_profiles(
    p_user_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_radius_meters INTEGER DEFAULT 5000,
    p_event_id UUID DEFAULT NULL,
    p_min_age INTEGER DEFAULT NULL,
    p_max_age INTEGER DEFAULT NULL,
    p_interest_slugs TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    age INTEGER,
    bio TEXT,
    photos TEXT[],
    avatar TEXT,
    distance_meters DOUBLE PRECISION,
    is_verified BOOLEAN,
    interests TEXT[],
    shared_interests INTEGER,
    gender TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_my_interests UUID[];
    v_my_gender TEXT;
    v_my_wants TEXT;
BEGIN
    SELECT COALESCE(array_agg(pi.interest_id), '{}')
    INTO v_my_interests
    FROM public.profile_interests pi
    WHERE pi.profile_id = p_user_id;

    SELECT pr.gender, pr.wants INTO v_my_gender, v_my_wants
    FROM public.profiles pr WHERE pr.id = p_user_id;

    RETURN QUERY
    WITH nearby AS (
        SELECT
            p.id,
            p.name,
            p.age,
            p.bio,
            -- La foto del evento manda sobre la del perfil: es la de esta noche.
            CASE
                WHEN ea.photo_url IS NOT NULL THEN ARRAY[ea.photo_url]
                ELSE p.photos
            END AS photos,
            COALESCE(ea.photo_url, p.avatar) AS avatar,
            p.is_verified,
            p.gender,
            public.get_distance(p_latitude, p_longitude, p.latitude, p.longitude) AS distance_meters,
            COALESCE(
                (SELECT array_agg(i.slug ORDER BY i.sort_order)
                   FROM public.profile_interests pi
                   JOIN public.interests i ON i.id = pi.interest_id
                  WHERE pi.profile_id = p.id),
                '{}'
            ) AS interests,
            (SELECT COUNT(*)::INTEGER
               FROM public.profile_interests pi
              WHERE pi.profile_id = p.id
                AND pi.interest_id = ANY(v_my_interests)) AS shared_interests
        FROM public.profiles p
        LEFT JOIN public.event_attendance ea
               ON ea.profile_id = p.id AND ea.event_id = p_event_id
        WHERE p.id <> p_user_id
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND p.is_verified = TRUE
          AND p.is_invisible = FALSE
          AND p.status = 'active'
          AND (p.suspended_until IS NULL OR p.suspended_until < NOW())
          AND (p_min_age IS NULL OR p.age >= p_min_age)
          AND (p_max_age IS NULL OR p.age <= p_max_age)
          -- Interés mutuo: yo quiero ver su género y esa persona el mío.
          AND public.wants_gender(v_my_wants, p.gender)
          AND public.wants_gender(p.wants, v_my_gender)
          AND (
              p_event_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.event_attendance a
                  WHERE a.event_id = p_event_id
                    AND a.profile_id = p.id
                    AND a.last_seen_at > NOW() - INTERVAL '12 hours'
              )
          )
          AND (
              p_interest_slugs IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.profile_interests pi
                  JOIN public.interests i ON i.id = pi.interest_id
                  WHERE pi.profile_id = p.id AND i.slug = ANY(p_interest_slugs)
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.blocks b
              WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
                 OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.swipes s
              WHERE s.swiper_id = p_user_id
                AND s.swiped_id = p.id
                AND (p_event_id IS NULL OR s.event_id = p_event_id OR s.event_id IS NULL)
          )
    )
    SELECT
        nearby.id, nearby.name, nearby.age, nearby.bio, nearby.photos, nearby.avatar,
        nearby.distance_meters, nearby.is_verified, nearby.interests,
        nearby.shared_interests, nearby.gender
    FROM nearby
    WHERE nearby.distance_meters <= p_radius_meters
    ORDER BY nearby.shared_interests DESC, nearby.distance_meters ASC
    LIMIT 50;
END;
$$;

-- ============================================================================
-- 7. PERMISOS
-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN (
              'get_nearby_profiles', 'get_group_messages', 'get_group_members',
              'remove_group_member', 'get_event_places', 'wants_gender'
          )
          AND p.prorettype <> 'trigger'::regtype
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

-- Las purgas las lanza el servidor, nunca un usuario.
REVOKE ALL ON FUNCTION public.purge_finished_groups() FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON public.group_messages TO authenticated;
REVOKE ALL ON public.group_messages FROM anon;

-- Realtime para que el chat de grupo llegue solo.
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;

-- ============================================================================
-- 8. COMENTARIOS
-- ============================================================================

COMMENT ON COLUMN public.profiles.gender IS 'man | woman. No se puede cambiar una vez elegido: lo impide freeze_gender().';
COMMENT ON COLUMN public.profiles.wants IS 'men | women | all. A quién se quiere ver. Editable desde ajustes.';
COMMENT ON COLUMN public.event_attendance.photo_url IS 'Foto tomada al entrar al evento. Es la que se ve al deslizar, para que se corresponda con cómo va la persona esa noche.';
COMMENT ON TABLE public.group_messages IS 'Chat del grupo. Caduca con el evento: purge_finished_groups() borra el grupo y los mensajes caen en cascada.';
COMMENT ON FUNCTION public.create_group IS 'Crear grupo requiere Premium; unirse es gratis.';
