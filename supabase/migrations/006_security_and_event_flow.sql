-- ============================================================================
-- Vybe App - Migración 006
-- Corrige seguridad (RLS), crea el flujo real de acceso a eventos y añade
-- las piezas que faltaban: roles, asistencia, estadísticas reales y trigger
-- de alta automática de perfiles/venues.
--
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- ============================================================================

-- ============================================================================
-- 1. NUEVAS COLUMNAS
-- ============================================================================

-- Rol del perfil. Sustituye al chequeo por email hardcodeado 'admin@vybe.com'.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
    END IF;
END $$;

-- El email del perfil, para poder mostrarlo sin consultar auth.users.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT;

-- Modo invisible: el usuario no aparece en los perfiles cercanos.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_invisible BOOLEAN NOT NULL DEFAULT FALSE;

-- Un código de acceso pertenece a un evento concreto, no sólo a un venue.
ALTER TABLE public.event_codes
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

-- Teléfono del venue (el formulario de alta ya lo pedía pero no se guardaba).
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS phone TEXT;

-- Estado de la solicitud de verificación del venue.
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venues_verification_status_check'
    ) THEN
        ALTER TABLE public.venues
            ADD CONSTRAINT venues_verification_status_check
            CHECK (verification_status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

-- Un swipe sin evento asociado debe seguir siendo único (UNIQUE ignora NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS idx_swipes_unique_no_event
    ON public.swipes (swiper_id, swiped_id)
    WHERE event_id IS NULL;

-- ============================================================================
-- 2. ASISTENCIA A EVENTOS
-- Registra cada check-in validado. Es la fuente de verdad para saber quién
-- está dentro de un evento y para las estadísticas del venue.
--
-- ⚠️ En esta base de datos ya existía una tabla `event_attendance` creada
-- fuera de las migraciones, con otras columnas (user_id / verified_at).
-- Un `CREATE TABLE IF NOT EXISTS` la habría dejado intacta y todo el flujo de
-- eventos habría fallado en ejecución: redeem_event_code(), get_nearby_profiles()
-- y get_event_stats() insertan y leen `profile_id`.
-- Por eso la apartamos primero y migramos sus filas después.
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'event_attendance'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'event_attendance'
          AND column_name = 'profile_id'
    ) THEN
        ALTER TABLE public.event_attendance RENAME TO event_attendance_legacy;
        RAISE NOTICE 'event_attendance anterior renombrada a event_attendance_legacy';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.event_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    UNIQUE (event_id, profile_id)
);

-- Recupera los check-ins de la tabla antigua, traduciendo user_id a profile_id.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'event_attendance_legacy'
    ) THEN
        INSERT INTO public.event_attendance (event_id, profile_id, checked_in_at, last_seen_at)
        SELECT
            legacy.event_id,
            p.id,
            COALESCE(legacy.verified_at, legacy.created_at, NOW()),
            COALESCE(legacy.verified_at, legacy.created_at, NOW())
        FROM public.event_attendance_legacy legacy
        JOIN public.profiles p ON p.user_id = legacy.user_id
        ON CONFLICT (event_id, profile_id) DO NOTHING;

        -- La dejamos como copia de seguridad, sin acceso desde la API.
        ALTER TABLE public.event_attendance_legacy ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.event_attendance_legacy FROM anon, authenticated;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_event ON public.event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_profile ON public.event_attendance(profile_id);
CREATE INDEX IF NOT EXISTS idx_attendance_last_seen ON public.event_attendance(last_seen_at DESC);

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. FUNCIONES HELPER (SECURITY DEFINER)
-- Rompen la recursión infinita de las policies: una policy sobre `profiles`
-- no puede hacer SELECT sobre `profiles` sin provocar el error 42P17.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_venue_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.venues WHERE venue_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_verified()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() AND is_verified = TRUE
    );
$$;

-- ¿Comparten los dos perfiles algún evento activo ahora mismo?
CREATE OR REPLACE FUNCTION public.shares_active_event(p_profile_a UUID, p_profile_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.event_attendance a
        JOIN public.event_attendance b ON a.event_id = b.event_id
        JOIN public.events e ON e.id = a.event_id
        WHERE a.profile_id = p_profile_a
          AND b.profile_id = p_profile_b
          AND e.end_date > NOW()
    );
$$;

-- ¿Están estos dos perfiles conectados (match)?
CREATE OR REPLACE FUNCTION public.are_connected(p_profile_a UUID, p_profile_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.connections
        WHERE (user_id_1 = p_profile_a AND user_id_2 = p_profile_b)
           OR (user_id_1 = p_profile_b AND user_id_2 = p_profile_a)
    );
$$;

-- ============================================================================
-- 4. ALTA AUTOMÁTICA DE PERFIL / VENUE
-- El insert desde el cliente justo después de signUp() fallaba siempre que la
-- confirmación de email estaba activa: en ese momento no hay sesión, auth.uid()
-- es NULL y la policy WITH CHECK (auth.uid() = user_id) rechaza la fila.
-- Se resuelve creando la fila desde un trigger sobre auth.users.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    account_type TEXT := COALESCE(meta->>'account_type', 'user');
    v_radius INTEGER;
BEGIN
    IF account_type = 'venue' THEN
        v_radius := CASE COALESCE(meta->>'venue_type', 'bar')
            WHEN 'discoteca' THEN 100
            WHEN 'festival' THEN 500
            WHEN 'evento_empresarial' THEN 250
            ELSE 50
        END;

        INSERT INTO public.venues (venue_id, name, email, type, phone, event_radius, is_verified, documents)
        VALUES (
            NEW.id,
            COALESCE(NULLIF(meta->>'venue_name', ''), split_part(NEW.email, '@', 1)),
            NEW.email,
            COALESCE(NULLIF(meta->>'venue_type', ''), 'bar'),
            NULLIF(meta->>'phone', ''),
            v_radius,
            FALSE,
            COALESCE(
                ARRAY(SELECT jsonb_array_elements_text(meta->'documents')),
                '{}'::text[]
            )
        )
        ON CONFLICT (venue_id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (user_id, name, email, age, bio, photos, is_verified)
        VALUES (
            NEW.id,
            COALESCE(NULLIF(meta->>'name', ''), split_part(NEW.email, '@', 1)),
            NEW.email,
            GREATEST(COALESCE((meta->>'age')::INTEGER, 18), 18),
            COALESCE(meta->>'bio', ''),
            '{}'::text[],
            FALSE
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rellena el email en los perfiles que ya existían sin él.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- ============================================================================
-- 5. CANJEO DE CÓDIGO DE EVENTO (server-side)
-- Antes, cualquiera con la anon key podía listar public.event_codes y entrar
-- en cualquier evento. Ahora los códigos no son legibles por los usuarios:
-- el canjeo se hace con esta función, que valida código + geocerca en servidor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.redeem_event_code(
    p_code TEXT,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    venue_id UUID,
    venue_name TEXT,
    venue_type TEXT,
    event_radius INTEGER,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- Los parámetros OUT (event_id, venue_id, start_date…) se llaman igual que
-- columnas reales de event_attendance y events. Sin esta directiva, PL/pgSQL
-- resolvería a favor de la variable en sitios como el ON CONFLICT de abajo.
#variable_conflict use_column
DECLARE
    v_profile_id UUID;
    v_code RECORD;
    v_event RECORD;
    v_venue RECORD;
    v_distance DOUBLE PRECISION;
BEGIN
    v_profile_id := public.current_profile_id();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_code
    FROM public.event_codes ec
    WHERE upper(ec.code) = upper(btrim(p_code))
      AND ec.active = TRUE
      AND ec.expires_at > NOW()
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_CODE';
    END IF;

    SELECT * INTO v_venue FROM public.venues WHERE id = v_code.venue_id;
    IF NOT FOUND OR v_venue.is_verified = FALSE THEN
        RAISE EXCEPTION 'VENUE_NOT_VERIFIED';
    END IF;

    -- El evento del código; si el código no tiene evento asociado se usa el
    -- evento vigente más próximo del venue.
    IF v_code.event_id IS NOT NULL THEN
        SELECT * INTO v_event FROM public.events WHERE id = v_code.event_id;
    ELSE
        SELECT * INTO v_event
        FROM public.events e
        WHERE e.venue_id = v_code.venue_id
          AND e.end_date > NOW()
        ORDER BY e.start_date ASC
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_EVENT';
    END IF;

    IF v_event.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;

    -- Geocerca: si el evento (o su venue) tiene coordenadas, exigimos que el
    -- usuario esté dentro del radio configurado.
    v_distance := NULL;
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        IF v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
        ELSIF v_venue.latitude IS NOT NULL AND v_venue.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_venue.latitude, v_venue.longitude);
        END IF;

        IF v_distance IS NOT NULL AND v_distance > COALESCE(v_venue.event_radius, 50) THEN
            RAISE EXCEPTION 'TOO_FAR';
        END IF;
    END IF;

    -- Check-in (o actualización si ya estaba dentro).
    INSERT INTO public.event_attendance AS ea (event_id, profile_id, latitude, longitude)
    VALUES (v_event.id, v_profile_id, p_latitude, p_longitude)
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            latitude = COALESCE(EXCLUDED.latitude, ea.latitude),
            longitude = COALESCE(EXCLUDED.longitude, ea.longitude);

    -- Guardamos la última ubicación conocida del usuario.
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles
        SET latitude = p_latitude, longitude = p_longitude
        WHERE id = v_profile_id;
    END IF;

    RETURN QUERY SELECT
        v_event.id,
        v_event.name,
        v_venue.id,
        v_venue.name,
        v_venue.type,
        COALESCE(v_venue.event_radius, 50),
        v_event.start_date,
        v_event.end_date,
        v_distance;
END;
$$;

-- Mantiene viva la asistencia mientras el usuario sigue en el evento.
CREATE OR REPLACE FUNCTION public.heartbeat_event_attendance(
    p_event_id UUID,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.event_attendance
    SET last_seen_at = NOW(),
        latitude = COALESCE(p_latitude, latitude),
        longitude = COALESCE(p_longitude, longitude)
    WHERE event_id = p_event_id AND profile_id = v_profile_id;

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles
        SET latitude = p_latitude, longitude = p_longitude
        WHERE id = v_profile_id;
    END IF;
END;
$$;

-- ============================================================================
-- 6. PERFILES CERCANOS (actualizado)
-- Ahora, si se pasa un evento, sólo devuelve asistentes confirmados de ese
-- evento. También respeta el modo invisible.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID);

CREATE FUNCTION public.get_nearby_profiles(
    p_user_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_radius_meters INTEGER DEFAULT 5000,
    p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    age INTEGER,
    bio TEXT,
    photos TEXT[],
    avatar TEXT,
    distance_meters DOUBLE PRECISION,
    is_verified BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
-- Los parámetros OUT (id, name, age…) coinciden con columnas de profiles.
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH nearby AS (
        SELECT
            p.id,
            p.name,
            p.age,
            p.bio,
            p.photos,
            p.avatar,
            p.is_verified,
            public.get_distance(p_latitude, p_longitude, p.latitude, p.longitude) AS distance_meters
        FROM public.profiles p
        WHERE p.id <> p_user_id
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND p.is_verified = TRUE
          AND p.is_invisible = FALSE
          AND (
              p_event_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.event_attendance ea
                  WHERE ea.event_id = p_event_id
                    AND ea.profile_id = p.id
                    AND ea.last_seen_at > NOW() - INTERVAL '12 hours'
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
        nearby.id,
        nearby.name,
        nearby.age,
        nearby.bio,
        nearby.photos,
        nearby.avatar,
        nearby.distance_meters,
        nearby.is_verified
    FROM nearby
    WHERE nearby.distance_meters <= p_radius_meters
    ORDER BY nearby.distance_meters ASC
    LIMIT 50;
END;
$$;

-- ============================================================================
-- 7. ESTADÍSTICAS REALES
-- La versión anterior referenciaba p.last_location, columna que ya no existe,
-- por lo que fallaba en tiempo de ejecución.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_event_stats(UUID);

CREATE FUNCTION public.get_event_stats(p_event_id UUID)
RETURNS TABLE (
    scans_count BIGINT,
    active_users_count BIGINT,
    matches_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.last_seen_at > NOW() - INTERVAL '3 hours'),
        (SELECT COUNT(DISTINCT c.id)
           FROM public.connections c
           JOIN public.swipes s
             ON (s.swiper_id = c.user_id_1 AND s.swiped_id = c.user_id_2)
             OR (s.swiper_id = c.user_id_2 AND s.swiped_id = c.user_id_1)
          WHERE s.event_id = p_event_id);
$$;

-- Estadísticas agregadas del venue para un periodo.
CREATE OR REPLACE FUNCTION public.get_venue_stats(
    p_venue_id UUID,
    p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    scans_count BIGINT,
    active_users_count BIGINT,
    events_count BIGINT,
    avg_attendance NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH venue_events AS (
        SELECT e.id
        FROM public.events e
        WHERE e.venue_id = p_venue_id
          AND (p_since IS NULL OR e.start_date >= p_since)
    ),
    attendance AS (
        SELECT ea.event_id, ea.profile_id, ea.last_seen_at
        FROM public.event_attendance ea
        JOIN venue_events ve ON ve.id = ea.event_id
    )
    SELECT
        (SELECT COUNT(*) FROM attendance),
        (SELECT COUNT(DISTINCT a.profile_id) FROM attendance a
          WHERE a.last_seen_at > NOW() - INTERVAL '3 hours'),
        (SELECT COUNT(*) FROM venue_events),
        COALESCE(ROUND(
            (SELECT COUNT(*)::NUMERIC FROM attendance) /
            NULLIF((SELECT COUNT(*) FROM venue_events), 0)
        , 1), 0);
$$;

-- ============================================================================
-- 8. TRIGGER DE MATCH (endurecido)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    reverse_swipe RECORD;
BEGIN
    SELECT * INTO reverse_swipe
    FROM public.swipes s
    WHERE s.swiper_id = NEW.swiped_id
      AND s.swiped_id = NEW.swiper_id
      AND s.swipe_type IN ('like', 'super_like')
    LIMIT 1;

    IF FOUND THEN
        INSERT INTO public.connections (user_id_1, user_id_2, connection_type)
        VALUES (
            LEAST(NEW.swiper_id, NEW.swiped_id),
            GREATEST(NEW.swiper_id, NEW.swiped_id),
            CASE WHEN NEW.swipe_type = 'super_like' OR reverse_swipe.swipe_type = 'super_like'
                 THEN 'vybe_check'
                 ELSE 'match'
            END
        )
        ON CONFLICT (user_id_1, user_id_2) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 9. POLICIES — se reescriben todas las que eran inseguras.
-- Regla general: TO authenticated. La anon key va en el bundle JS, así que
-- cualquier policy sin comprobación de identidad equivale a datos públicos.
-- ============================================================================

-- ---------- PROFILES ----------
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Verified users can view verified profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are visible to event peers and matches" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Sin recursión: usa funciones SECURITY DEFINER en vez de un SELECT sobre profiles.
CREATE POLICY "Profiles are visible to event peers and matches"
    ON public.profiles FOR SELECT TO authenticated
    USING (
        is_verified = TRUE
        AND public.is_current_user_verified()
        AND (
            public.are_connected(public.current_profile_id(), id)
            OR public.shares_active_event(public.current_profile_id(), id)
        )
    );

CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can update profiles"
    ON public.profiles FOR UPDATE TO authenticated
    USING (public.is_admin());

-- ---------- VENUES ----------
DROP POLICY IF EXISTS "Venues can view own venue" ON public.venues;
DROP POLICY IF EXISTS "Venues can update own venue" ON public.venues;
DROP POLICY IF EXISTS "Venues can insert own venue" ON public.venues;
DROP POLICY IF EXISTS "Users can view verified venues" ON public.venues;
DROP POLICY IF EXISTS "Admins can view all venues" ON public.venues;
DROP POLICY IF EXISTS "Admins can update venues" ON public.venues;

CREATE POLICY "Venues can view own venue"
    ON public.venues FOR SELECT TO authenticated
    USING (auth.uid() = venue_id);

CREATE POLICY "Venues can update own venue"
    ON public.venues FOR UPDATE TO authenticated
    USING (auth.uid() = venue_id)
    WITH CHECK (auth.uid() = venue_id);

CREATE POLICY "Venues can insert own venue"
    ON public.venues FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = venue_id);

CREATE POLICY "Users can view verified venues"
    ON public.venues FOR SELECT TO authenticated
    USING (is_verified = TRUE);

CREATE POLICY "Admins can view all venues"
    ON public.venues FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can update venues"
    ON public.venues FOR UPDATE TO authenticated
    USING (public.is_admin());

-- ---------- EVENTS ----------
DROP POLICY IF EXISTS "Venues can view own events" ON public.events;
DROP POLICY IF EXISTS "Venues can create own events" ON public.events;
DROP POLICY IF EXISTS "Venues can update own events" ON public.events;
DROP POLICY IF EXISTS "Venues can delete own events" ON public.events;
DROP POLICY IF EXISTS "Users can view active events" ON public.events;
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
DROP POLICY IF EXISTS "Admins can update events" ON public.events;
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;

CREATE POLICY "Venues can view own events"
    ON public.events FOR SELECT TO authenticated
    USING (venue_id = public.current_venue_id());

CREATE POLICY "Venues can create own events"
    ON public.events FOR INSERT TO authenticated
    WITH CHECK (venue_id = public.current_venue_id());

CREATE POLICY "Venues can update own events"
    ON public.events FOR UPDATE TO authenticated
    USING (venue_id = public.current_venue_id())
    WITH CHECK (venue_id = public.current_venue_id());

CREATE POLICY "Venues can delete own events"
    ON public.events FOR DELETE TO authenticated
    USING (venue_id = public.current_venue_id());

-- Los usuarios sólo ven eventos vigentes de venues ya verificados.
CREATE POLICY "Users can view active events"
    ON public.events FOR SELECT TO authenticated
    USING (
        end_date > NOW()
        AND EXISTS (
            SELECT 1 FROM public.venues v
            WHERE v.id = events.venue_id AND v.is_verified = TRUE
        )
    );

CREATE POLICY "Admins can manage events"
    ON public.events FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can update events"
    ON public.events FOR UPDATE TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can delete events"
    ON public.events FOR DELETE TO authenticated
    USING (public.is_admin());

-- ---------- EVENT_CODES ----------
-- Se elimina la policy que permitía a cualquiera (incluido anon) listar todos
-- los códigos activos. El canjeo pasa por redeem_event_code().
DROP POLICY IF EXISTS "Users can view active event codes" ON public.event_codes;
DROP POLICY IF EXISTS "Venues can view own event codes" ON public.event_codes;
DROP POLICY IF EXISTS "Venues can create event codes" ON public.event_codes;
DROP POLICY IF EXISTS "Venues can update own event codes" ON public.event_codes;

CREATE POLICY "Venues can view own event codes"
    ON public.event_codes FOR SELECT TO authenticated
    USING (venue_id = public.current_venue_id());

CREATE POLICY "Venues can create event codes"
    ON public.event_codes FOR INSERT TO authenticated
    WITH CHECK (venue_id = public.current_venue_id());

CREATE POLICY "Venues can update own event codes"
    ON public.event_codes FOR UPDATE TO authenticated
    USING (venue_id = public.current_venue_id());

-- ---------- CONNECTIONS ----------
DROP POLICY IF EXISTS "Users can view own connections" ON public.connections;
DROP POLICY IF EXISTS "Users can create connections" ON public.connections;
DROP POLICY IF EXISTS "Users can delete own connections" ON public.connections;

CREATE POLICY "Users can view own connections"
    ON public.connections FOR SELECT TO authenticated
    USING (
        user_id_1 = public.current_profile_id()
        OR user_id_2 = public.current_profile_id()
    );

CREATE POLICY "Users can delete own connections"
    ON public.connections FOR DELETE TO authenticated
    USING (
        user_id_1 = public.current_profile_id()
        OR user_id_2 = public.current_profile_id()
    );

-- ---------- MESSAGES ----------
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to connections" ON public.messages;
DROP POLICY IF EXISTS "Users can update own received messages" ON public.messages;

CREATE POLICY "Users can view own messages"
    ON public.messages FOR SELECT TO authenticated
    USING (
        sender_id = public.current_profile_id()
        OR receiver_id = public.current_profile_id()
    );

CREATE POLICY "Users can send messages to connections"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = public.current_profile_id()
        AND public.are_connected(sender_id, receiver_id)
        AND NOT EXISTS (
            SELECT 1 FROM public.blocks b
            WHERE (b.blocker_id = receiver_id AND b.blocked_id = sender_id)
               OR (b.blocker_id = sender_id AND b.blocked_id = receiver_id)
        )
    );

CREATE POLICY "Users can update own received messages"
    ON public.messages FOR UPDATE TO authenticated
    USING (receiver_id = public.current_profile_id());

-- ---------- SWIPES ----------
DROP POLICY IF EXISTS "Users can view own swipes" ON public.swipes;
DROP POLICY IF EXISTS "Users can create swipes" ON public.swipes;

CREATE POLICY "Users can view own swipes"
    ON public.swipes FOR SELECT TO authenticated
    USING (swiper_id = public.current_profile_id());

CREATE POLICY "Users can create swipes"
    ON public.swipes FOR INSERT TO authenticated
    WITH CHECK (swiper_id = public.current_profile_id());

-- ---------- REPORTS ----------
DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
DROP POLICY IF EXISTS "Admins can update reports" ON public.reports;

CREATE POLICY "Users can view own reports"
    ON public.reports FOR SELECT TO authenticated
    USING (reporter_id = public.current_profile_id());

CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT TO authenticated
    WITH CHECK (reporter_id = public.current_profile_id());

CREATE POLICY "Admins can view all reports"
    ON public.reports FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can update reports"
    ON public.reports FOR UPDATE TO authenticated
    USING (public.is_admin());

-- ---------- BLOCKS ----------
DROP POLICY IF EXISTS "Users can view own blocks" ON public.blocks;
DROP POLICY IF EXISTS "Users can create blocks" ON public.blocks;
DROP POLICY IF EXISTS "Users can delete own blocks" ON public.blocks;

CREATE POLICY "Users can view own blocks"
    ON public.blocks FOR SELECT TO authenticated
    USING (blocker_id = public.current_profile_id());

CREATE POLICY "Users can create blocks"
    ON public.blocks FOR INSERT TO authenticated
    WITH CHECK (blocker_id = public.current_profile_id());

CREATE POLICY "Users can delete own blocks"
    ON public.blocks FOR DELETE TO authenticated
    USING (blocker_id = public.current_profile_id());

-- ---------- VERIFICATION_CODES ----------
-- La tabla tenía RLS activado pero ninguna policy: nadie podía leer ni escribir,
-- así que api.verifyCode() fallaba siempre.
DROP POLICY IF EXISTS "Users can view own verification codes" ON public.verification_codes;
DROP POLICY IF EXISTS "Users can create own verification codes" ON public.verification_codes;
DROP POLICY IF EXISTS "Users can update own verification codes" ON public.verification_codes;

CREATE POLICY "Users can view own verification codes"
    ON public.verification_codes FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create own verification codes"
    ON public.verification_codes FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own verification codes"
    ON public.verification_codes FOR UPDATE TO authenticated
    USING (user_id = auth.uid());

-- ---------- PREMIUM_SUBSCRIPTIONS ----------
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.premium_subscriptions;
DROP POLICY IF EXISTS "Users can create subscriptions" ON public.premium_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.premium_subscriptions;

CREATE POLICY "Users can view own subscriptions"
    ON public.premium_subscriptions FOR SELECT TO authenticated
    USING (user_id = public.current_profile_id());

CREATE POLICY "Users can create subscriptions"
    ON public.premium_subscriptions FOR INSERT TO authenticated
    WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update own subscriptions"
    ON public.premium_subscriptions FOR UPDATE TO authenticated
    USING (user_id = public.current_profile_id());

-- ---------- EVENT_ATTENDANCE ----------
DROP POLICY IF EXISTS "Users can view own attendance" ON public.event_attendance;
DROP POLICY IF EXISTS "Venues can view attendance of own events" ON public.event_attendance;

CREATE POLICY "Users can view own attendance"
    ON public.event_attendance FOR SELECT TO authenticated
    USING (profile_id = public.current_profile_id());

CREATE POLICY "Venues can view attendance of own events"
    ON public.event_attendance FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_attendance.event_id
              AND e.venue_id = public.current_venue_id()
        )
    );

-- ---------- EVENT_STATS ----------
DROP POLICY IF EXISTS "Venues can view own event stats" ON public.event_stats;

CREATE POLICY "Venues can view own event stats"
    ON public.event_stats FOR SELECT TO authenticated
    USING (venue_id = public.current_venue_id());

-- ============================================================================
-- 10. PERMISOS DE EJECUCIÓN
-- ============================================================================

REVOKE ALL ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

REVOKE ALL ON FUNCTION public.heartbeat_event_attendance(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_event_attendance(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

REVOKE ALL ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_venue_stats(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_venue_stats(UUID, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.get_event_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_stats(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_venue_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_connected(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_active_event(UUID, UUID) TO authenticated;

-- ============================================================================
-- 11. REALTIME
-- ============================================================================

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN
            CREATE PUBLICATION supabase_realtime FOR TABLE public.messages;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
    EXCEPTION
        WHEN duplicate_object THEN NULL;
    END;
END $$;

-- ============================================================================
-- 12. CIERRE DEL ACCESO ANÓNIMO
--
-- La anon key viaja en el bundle JavaScript, así que el rol `anon` equivale a
-- "cualquiera en internet". Vybe exige sesión para todo: nada debe leerse sin
-- autenticar. Comprobado en la base de datos real, `venues`, `events`,
-- `event_codes`, `verification_codes`, `event_stats` y `event_attendance` eran
-- legibles por anon.
--
-- Esto es defensa en profundidad por encima de las policies: aunque alguien
-- añada mañana una policy permisiva, sin GRANT no hay lectura posible.
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Y que las tablas futuras nazcan igual de cerradas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Cualquier tabla de `public` sin RLS queda expuesta a los usuarios
-- autenticados. Esta base de datos tenía una tabla `users` creada fuera de las
-- migraciones; el bucle la protege sin necesidad de conocer su contenido.
DO $$
DECLARE
    unprotected RECORD;
BEGIN
    FOR unprotected IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND NOT c.relrowsecurity
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', unprotected.relname);
        RAISE NOTICE 'RLS activado en tabla sin proteger: %', unprotected.relname;
    END LOOP;
END $$;

-- ============================================================================
-- 13. COMENTARIOS
-- ============================================================================

COMMENT ON TABLE public.event_attendance IS 'Check-ins validados en eventos. Fuente de verdad para perfiles visibles y estadísticas.';
COMMENT ON FUNCTION public.redeem_event_code IS 'Canjea un código de evento validando vigencia y geocerca en servidor. Los códigos no son legibles directamente por los usuarios.';
COMMENT ON FUNCTION public.current_profile_id IS 'Id del perfil del usuario autenticado. SECURITY DEFINER para evitar recursión en las policies de profiles.';
COMMENT ON COLUMN public.profiles.role IS 'user | admin. Sustituye al chequeo por email hardcodeado.';
