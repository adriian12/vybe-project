-- ============================================================================
-- Vybe — SQL a aplicar en el SQL Editor de Supabase
--
-- Tu base de datos ya tiene las migraciones 001, 002 y 003. Este archivo junta
-- las dos que faltan (006 y 007) para poder pegarlas de una sola vez.
--
-- NO incluye la 001: volver a ejecutarla fallaría, porque sus CREATE TRIGGER
-- no llevan IF NOT EXISTS y esos triggers ya existen.
--
-- Ambas partes son idempotentes: se pueden ejecutar varias veces sin romper
-- nada. Al terminar, comprueba el resultado con las consultas del final.
-- ============================================================================


-- ############################################################################
-- 006_security_and_event_flow.sql — Seguridad, flujo real de eventos y alta automática de perfiles
-- ############################################################################

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


-- ############################################################################
-- 007_product_features.sql — Intereses, grupos, moderación, SOS, push, límites, RGPD y métricas
-- ############################################################################

-- ============================================================================
-- Vybe App - Migración 007
-- Esquema de las funcionalidades de producto:
--   intereses y filtros, grupos, reputación, chat efímero, moderación de fotos,
--   suspensión de cuentas, SOS, push, límites de uso, consentimiento RGPD,
--   borrado de cuenta, equipos de local, rotación de códigos, embudo de eventos,
--   analítica y campos de Stripe.
--
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================================

-- ============================================================================
-- 1. ESTADO DE LA CUENTA (suspensión y borrado)
-- ============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS plan_tonight TEXT,
    ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'es';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_status_check
            CHECK (status IN ('active', 'suspended', 'pending_deletion', 'deleted'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status)
    WHERE status <> 'active';

/** Una cuenta activa es la que no está suspendida ni pendiente de borrado. */
CREATE OR REPLACE FUNCTION public.is_profile_active(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_profile_id
          AND status = 'active'
          AND (suspended_until IS NULL OR suspended_until < NOW())
    );
$$;

-- ============================================================================
-- 2. INTERESES Y ETIQUETAS
-- Hasta ahora el único criterio de match era la proximidad, que es un filtro,
-- no un algoritmo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.interests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.profile_interests (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    interest_id UUID NOT NULL REFERENCES public.interests(id) ON DELETE CASCADE,
    PRIMARY KEY (profile_id, interest_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_interests_interest
    ON public.profile_interests(interest_id);

ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_interests ENABLE ROW LEVEL SECURITY;

-- Catálogo base. El `slug` es la clave de traducción en el cliente.
INSERT INTO public.interests (slug, category, sort_order) VALUES
    ('techno', 'music', 10), ('house', 'music', 20), ('reggaeton', 'music', 30),
    ('pop', 'music', 40), ('rock', 'music', 50), ('jazz', 'music', 60),
    ('latin', 'music', 70), ('rnb', 'music', 80),
    ('dancing', 'vibe', 110), ('chill', 'vibe', 120), ('afterparty', 'vibe', 130),
    ('live_music', 'vibe', 140), ('cocktails', 'vibe', 150), ('terrace', 'vibe', 160),
    ('meet_people', 'goal', 210), ('friends', 'goal', 220), ('dating', 'goal', 230),
    ('networking', 'goal', 240)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 3. EQUIPOS DE LOCAL
-- Un local necesita más de una cuenta: dueño, portero y marketing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.venue_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (venue_id, user_id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_members_role_check') THEN
        ALTER TABLE public.venue_members
            ADD CONSTRAINT venue_members_role_check
            CHECK (role IN ('owner', 'staff', 'marketing'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_venue_members_user ON public.venue_members(user_id);
ALTER TABLE public.venue_members ENABLE ROW LEVEL SECURITY;

-- El dueño original pasa a ser miembro con rol owner.
INSERT INTO public.venue_members (venue_id, user_id, email, role)
SELECT v.id, v.venue_id, v.email, 'owner'
FROM public.venues v
ON CONFLICT (venue_id, user_id) DO NOTHING;

/** Ahora contempla tanto al dueño como a los miembros del equipo. */
CREATE OR REPLACE FUNCTION public.current_venue_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT id FROM public.venues WHERE venue_id = auth.uid() LIMIT 1),
        (SELECT venue_id FROM public.venue_members WHERE user_id = auth.uid() LIMIT 1)
    );
$$;

/** Rol del usuario dentro de su local. */
CREATE OR REPLACE FUNCTION public.current_venue_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT 'owner' FROM public.venues WHERE venue_id = auth.uid() LIMIT 1),
        (SELECT role FROM public.venue_members WHERE user_id = auth.uid() LIMIT 1)
    );
$$;

-- ============================================================================
-- 4. INTENCIÓN DE ASISTIR ("voy a ir")
-- Ataca el problema de la sala vacía: antes nadie veía a nadie hasta que
-- alguien más ya había hecho check-in dentro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_event_intents_event ON public.event_intents(event_id);
ALTER TABLE public.event_intents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. GRUPOS
-- Salir de fiesta es una actividad de grupo; ninguna app grande lo resuelve.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.group_members (
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_groups_event ON public.groups(event_id);
CREATE INDEX IF NOT EXISTS idx_group_members_profile ON public.group_members(profile_id);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

/** Grupo del usuario en un evento concreto (como mucho uno). */
CREATE OR REPLACE FUNCTION public.current_group_id(p_event_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT gm.group_id
    FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.profile_id = public.current_profile_id()
      AND g.event_id = p_event_id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = p_group_id AND profile_id = public.current_profile_id()
    );
$$;

-- ============================================================================
-- 6. CHAT EFÍMERO
-- La conversación caduca al terminar el evento salvo que ambos la conserven.
-- Encaja con la premisa del producto y reduce la retención de datos.
-- ============================================================================

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS kept_by_1 BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS kept_by_2 BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_connections_expires ON public.connections(expires_at)
    WHERE expires_at IS NOT NULL;

/** Marca que el usuario quiere conservar la conexión más allá del evento. */
CREATE OR REPLACE FUNCTION public.keep_connection(p_connection_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_conn RECORD;
BEGIN
    SELECT * INTO v_conn FROM public.connections WHERE id = p_connection_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CONNECTION_NOT_FOUND';
    END IF;

    IF v_conn.user_id_1 = v_profile_id THEN
        UPDATE public.connections SET kept_by_1 = TRUE WHERE id = p_connection_id;
    ELSIF v_conn.user_id_2 = v_profile_id THEN
        UPDATE public.connections SET kept_by_2 = TRUE WHERE id = p_connection_id;
    ELSE
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    -- Cuando ambos la conservan, deja de caducar.
    UPDATE public.connections
    SET expires_at = NULL
    WHERE id = p_connection_id AND kept_by_1 AND kept_by_2;

    RETURN TRUE;
END;
$$;

/** Borra conexiones caducadas y sus mensajes. Pensada para pg_cron o un job. */
CREATE OR REPLACE FUNCTION public.purge_expired_connections()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH expired AS (
        DELETE FROM public.connections
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM expired;

    RETURN deleted_count;
END;
$$;

-- Los mensajes se borran en cascada al desaparecer los perfiles, pero no al
-- desaparecer la conexión: los eliminamos explícitamente.
CREATE OR REPLACE FUNCTION public.delete_connection_messages()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    DELETE FROM public.messages m
    WHERE (m.sender_id = OLD.user_id_1 AND m.receiver_id = OLD.user_id_2)
       OR (m.sender_id = OLD.user_id_2 AND m.receiver_id = OLD.user_id_1);
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_connection_deleted ON public.connections;
CREATE TRIGGER on_connection_deleted
    AFTER DELETE ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.delete_connection_messages();

-- El match hereda el evento y la caducidad del swipe que lo generó.
CREATE OR REPLACE FUNCTION public.check_match()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    reverse_swipe RECORD;
    v_end_date TIMESTAMPTZ;
BEGIN
    SELECT * INTO reverse_swipe
    FROM public.swipes s
    WHERE s.swiper_id = NEW.swiped_id
      AND s.swiped_id = NEW.swiper_id
      AND s.swipe_type IN ('like', 'super_like')
    LIMIT 1;

    IF FOUND THEN
        IF NEW.event_id IS NOT NULL THEN
            SELECT e.end_date INTO v_end_date FROM public.events e WHERE e.id = NEW.event_id;
        END IF;

        INSERT INTO public.connections (
            user_id_1, user_id_2, connection_type, event_id, expires_at
        )
        VALUES (
            LEAST(NEW.swiper_id, NEW.swiped_id),
            GREATEST(NEW.swiper_id, NEW.swiped_id),
            CASE WHEN NEW.swipe_type = 'super_like' OR reverse_swipe.swipe_type = 'super_like'
                 THEN 'vybe_check' ELSE 'match' END,
            NEW.event_id,
            -- 24 h de cortesía después del evento para poder seguir hablando.
            CASE WHEN v_end_date IS NOT NULL THEN v_end_date + INTERVAL '24 hours' END
        )
        ON CONFLICT (user_id_1, user_id_2) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 7. MODERACIÓN DE FOTOS
-- Antes cualquiera publicaba al instante en un bucket público.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.moderation_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bucket TEXT NOT NULL,
    path TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'photo',
    status TEXT NOT NULL DEFAULT 'pending',
    score NUMERIC,
    reason TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'moderation_status_check') THEN
        ALTER TABLE public.moderation_queue
            ADD CONSTRAINT moderation_status_check
            CHECK (status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_moderation_status ON public.moderation_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_moderation_profile ON public.moderation_queue(profile_id);
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;

/** Aprueba o rechaza una foto y la publica en el perfil si procede. */
CREATE OR REPLACE FUNCTION public.review_photo(
    p_item_id UUID,
    p_approve BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT * INTO v_item FROM public.moderation_queue WHERE id = p_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND';
    END IF;

    UPDATE public.moderation_queue
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        reason = p_reason,
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_item_id;

    IF p_approve THEN
        UPDATE public.profiles
        SET photos = CASE
                WHEN v_item.url = ANY(photos) THEN photos
                ELSE array_append(photos, v_item.url)
            END,
            avatar = COALESCE(avatar, v_item.url)
        WHERE id = v_item.profile_id;
    END IF;
END;
$$;

-- ============================================================================
-- 8. BOTÓN DE EMERGENCIA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trusted_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.sos_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sos_status_check') THEN
        ALTER TABLE public.sos_alerts
            ADD CONSTRAINT sos_status_check CHECK (status IN ('active', 'resolved', 'cancelled'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sos_active ON public.sos_alerts(status, created_at DESC)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_profile ON public.trusted_contacts(profile_id);

ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. NOTIFICACIONES PUSH
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_profile ON public.push_subscriptions(profile_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS notify_matches BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================================
-- 10. LÍMITES DE USO
-- Sin esto, la anon key permite scriptear miles de swipes o mensajes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

/**
 * Cuenta una acción y devuelve FALSE si se ha superado el límite.
 * La ventana se redondea para poder usar la PK como contador atómico.
 */
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_action TEXT,
    p_max INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_window TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;

    v_window := to_timestamp(floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds);

    INSERT INTO public.rate_limits (profile_id, action, window_start, count)
    VALUES (v_profile_id, p_action, v_window, 1)
    ON CONFLICT (profile_id, action, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
    RETURNING count INTO v_count;

    RETURN v_count <= p_max;
END;
$$;

/** Limpia ventanas antiguas. */
CREATE OR REPLACE FUNCTION public.purge_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.rate_limits WHERE window_start < NOW() - INTERVAL '2 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Aplicación en swipes y mensajes.
CREATE OR REPLACE FUNCTION public.enforce_swipe_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.consume_rate_limit('swipe', 300, 3600) THEN
        RAISE EXCEPTION 'RATE_LIMITED_SWIPES';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_swipe_limit_trigger ON public.swipes;
CREATE TRIGGER enforce_swipe_limit_trigger
    BEFORE INSERT ON public.swipes
    FOR EACH ROW EXECUTE FUNCTION public.enforce_swipe_limit();

CREATE OR REPLACE FUNCTION public.enforce_message_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.consume_rate_limit('message', 200, 3600) THEN
        RAISE EXCEPTION 'RATE_LIMITED_MESSAGES';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_message_limit_trigger ON public.messages;
CREATE TRIGGER enforce_message_limit_trigger
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.enforce_message_limit();

-- ============================================================================
-- 11. CONSENTIMIENTO Y RGPD
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document TEXT NOT NULL,
    version TEXT NOT NULL,
    accepted BOOLEAN NOT NULL DEFAULT TRUE,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, document, version)
);

CREATE INDEX IF NOT EXISTS idx_consents_user ON public.user_consents(user_id);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

/** Solicita el borrado de la cuenta. El borrado duro lo hace la Edge Function. */
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    UPDATE public.profiles
    SET status = 'pending_deletion',
        deletion_requested_at = NOW(),
        is_invisible = TRUE
    WHERE id = v_profile_id;

    -- Desaparece de inmediato del resto de usuarios.
    DELETE FROM public.event_attendance WHERE profile_id = v_profile_id;
    DELETE FROM public.event_intents WHERE profile_id = v_profile_id;
END;
$$;

/** Exporta en JSON todo lo que guardamos del usuario (art. 20 RGPD). */
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_result JSONB;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT jsonb_build_object(
        'exported_at', NOW(),
        'profile', (SELECT to_jsonb(p) - 'user_id' FROM public.profiles p WHERE p.id = v_profile_id),
        'interests', (
            SELECT COALESCE(jsonb_agg(i.slug), '[]'::jsonb)
            FROM public.profile_interests pi
            JOIN public.interests i ON i.id = pi.interest_id
            WHERE pi.profile_id = v_profile_id
        ),
        'attendance', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'event', e.name, 'venue', v.name, 'checked_in_at', ea.checked_in_at)), '[]'::jsonb)
            FROM public.event_attendance ea
            JOIN public.events e ON e.id = ea.event_id
            JOIN public.venues v ON v.id = e.venue_id
            WHERE ea.profile_id = v_profile_id
        ),
        'connections', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'with', p.name, 'type', c.connection_type, 'created_at', c.created_at)), '[]'::jsonb)
            FROM public.connections c
            JOIN public.profiles p
              ON p.id = CASE WHEN c.user_id_1 = v_profile_id THEN c.user_id_2 ELSE c.user_id_1 END
            WHERE c.user_id_1 = v_profile_id OR c.user_id_2 = v_profile_id
        ),
        'messages', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'direction', CASE WHEN m.sender_id = v_profile_id THEN 'sent' ELSE 'received' END,
                'content', m.content, 'created_at', m.created_at) ORDER BY m.created_at), '[]'::jsonb)
            FROM public.messages m
            WHERE m.sender_id = v_profile_id OR m.receiver_id = v_profile_id
        ),
        'consents', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'document', uc.document, 'version', uc.version, 'accepted_at', uc.accepted_at)), '[]'::jsonb)
            FROM public.user_consents uc WHERE uc.user_id = auth.uid()
        ),
        'subscriptions', (
            SELECT COALESCE(jsonb_agg(to_jsonb(ps)), '[]'::jsonb)
            FROM public.premium_subscriptions ps WHERE ps.user_id = v_profile_id
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 12. MODERACIÓN: SUSPENSIÓN DE CUENTAS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.suspend_profile(
    p_profile_id UUID,
    p_days INTEGER DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.profiles
    SET status = 'suspended',
        suspended_until = CASE WHEN p_days IS NULL THEN NULL
                               ELSE NOW() + (p_days || ' days')::interval END,
        suspension_reason = p_reason,
        is_invisible = TRUE
    WHERE id = p_profile_id;

    DELETE FROM public.event_attendance WHERE profile_id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reinstate_profile(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.profiles
    SET status = 'active', suspended_until = NULL,
        suspension_reason = NULL, is_invisible = FALSE
    WHERE id = p_profile_id;
END;
$$;

-- ============================================================================
-- 13. STRIPE
-- ============================================================================

ALTER TABLE public.premium_subscriptions
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_subs_stripe
    ON public.premium_subscriptions(stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_premium(p_profile_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.premium_subscriptions
        WHERE user_id = COALESCE(p_profile_id, public.current_profile_id())
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
    );
$$;

-- ============================================================================
-- 14. TICKETING
-- El campo booking_url existía y no llevaba a ninguna parte.
-- ============================================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS ticket_provider TEXT,
    ADD COLUMN IF NOT EXISTS tickets_available BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.booking_clicks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_clicks_event ON public.booking_clicks(event_id, created_at);
ALTER TABLE public.booking_clicks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 15. ROTACIÓN AUTOMÁTICA DE CÓDIGOS
-- Para que un código filtrado por WhatsApp deje de servir enseguida.
-- ============================================================================

ALTER TABLE public.event_codes
    ADD COLUMN IF NOT EXISTS rotates_every_minutes INTEGER;

/** Genera un código nuevo si el activo ha superado su ventana de rotación. */
CREATE OR REPLACE FUNCTION public.rotate_event_code_if_needed(p_venue_id UUID)
RETURNS TABLE (code TEXT, expires_at TIMESTAMPTZ, rotated BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_current RECORD;
    v_new_code TEXT;
BEGIN
    IF public.current_venue_id() IS DISTINCT FROM p_venue_id THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT * INTO v_current
    FROM public.event_codes ec
    WHERE ec.venue_id = p_venue_id AND ec.active AND ec.expires_at > NOW()
    ORDER BY ec.created_at DESC
    LIMIT 1;

    IF FOUND AND (
        v_current.rotates_every_minutes IS NULL
        OR v_current.created_at > NOW() - (v_current.rotates_every_minutes || ' minutes')::interval
    ) THEN
        RETURN QUERY SELECT v_current.code, v_current.expires_at, FALSE;
        RETURN;
    END IF;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    UPDATE public.event_codes SET active = FALSE WHERE id = v_current.id;

    v_new_code := lpad(floor(random() * 1000000)::text, 6, '0');

    INSERT INTO public.event_codes (
        venue_id, event_id, code, expires_at, active, rotates_every_minutes
    )
    VALUES (
        p_venue_id, v_current.event_id, v_new_code,
        v_current.expires_at, TRUE, v_current.rotates_every_minutes
    );

    RETURN QUERY SELECT v_new_code, v_current.expires_at, TRUE;
END;
$$;

-- ============================================================================
-- 16. ANALÍTICA DE PRODUCTO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    props JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_name_date
    ON public.analytics_events(name, created_at DESC);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 17. DESCUBRIMIENTO CON FILTROS E INTERESES
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_nearby_profiles(UUID, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, UUID);

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
    shared_interests INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_my_interests UUID[];
BEGIN
    SELECT COALESCE(array_agg(pi.interest_id), '{}')
    INTO v_my_interests
    FROM public.profile_interests pi
    WHERE pi.profile_id = p_user_id;

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
        WHERE p.id <> p_user_id
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND p.is_verified = TRUE
          AND p.is_invisible = FALSE
          AND p.status = 'active'
          AND (p.suspended_until IS NULL OR p.suspended_until < NOW())
          AND (p_min_age IS NULL OR p.age >= p_min_age)
          AND (p_max_age IS NULL OR p.age <= p_max_age)
          AND (
              p_event_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.event_attendance ea
                  WHERE ea.event_id = p_event_id
                    AND ea.profile_id = p.id
                    AND ea.last_seen_at > NOW() - INTERVAL '12 hours'
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
        nearby.distance_meters, nearby.is_verified, nearby.interests, nearby.shared_interests
    FROM nearby
    WHERE nearby.distance_meters <= p_radius_meters
    -- Los intereses en común pesan más que la distancia pura.
    ORDER BY nearby.shared_interests DESC, nearby.distance_meters ASC
    LIMIT 50;
END;
$$;

-- ============================================================================
-- 18. QUIÉN TE HA DADO LIKE (función Premium que estaba vendida sin implementar)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_likes_received()
RETURNS TABLE (
    id UUID,
    name TEXT,
    age INTEGER,
    bio TEXT,
    photos TEXT[],
    avatar TEXT,
    swipe_type TEXT,
    event_name TEXT,
    liked_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT
        p.id, p.name, p.age, p.bio, p.photos, p.avatar,
        s.swipe_type, e.name, s.created_at
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.swiper_id
    LEFT JOIN public.events e ON e.id = s.event_id
    WHERE s.swiped_id = v_profile_id
      AND s.swipe_type IN ('like', 'super_like')
      AND p.status = 'active'
      AND p.is_verified = TRUE
      -- Si ya hay conexión, no es un "like pendiente".
      AND NOT public.are_connected(v_profile_id, s.swiper_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes mine
          WHERE mine.swiper_id = v_profile_id AND mine.swiped_id = s.swiper_id
      )
    ORDER BY s.created_at DESC
    LIMIT 50;
END;
$$;

-- ============================================================================
-- 19. REPUTACIÓN E HISTORIAL
-- La confianza es el cuello de botella de este tipo de apps.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_profile_reputation(p_profile_id UUID)
RETURNS TABLE (
    events_attended BIGINT,
    connections_made BIGINT,
    reports_received BIGINT,
    member_since TIMESTAMPTZ,
    is_verified BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.profile_id = p_profile_id),
        (SELECT COUNT(*) FROM public.connections c
          WHERE c.user_id_1 = p_profile_id OR c.user_id_2 = p_profile_id),
        (SELECT COUNT(*) FROM public.reports r
          WHERE r.reported_id = p_profile_id AND r.status = 'resolved'),
        (SELECT p.created_at FROM public.profiles p WHERE p.id = p_profile_id),
        (SELECT p.is_verified FROM public.profiles p WHERE p.id = p_profile_id);
$$;

/** Historial de eventos del propio usuario. */
CREATE OR REPLACE FUNCTION public.get_my_event_history()
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    venue_name TEXT,
    start_date TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    connections_made BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        e.id, e.name, v.name, e.start_date, ea.checked_in_at,
        (SELECT COUNT(*) FROM public.connections c
          WHERE c.event_id = e.id
            AND (c.user_id_1 = ea.profile_id OR c.user_id_2 = ea.profile_id))
    FROM public.event_attendance ea
    JOIN public.events e ON e.id = ea.event_id
    JOIN public.venues v ON v.id = e.venue_id
    WHERE ea.profile_id = public.current_profile_id()
    ORDER BY ea.checked_in_at DESC
    LIMIT 100;
$$;

-- ============================================================================
-- 20. EMBUDO Y MÉTRICAS DEL LOCAL
-- Un local paga por saber a qué hora se llena, no por cuatro contadores.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_event_funnel(p_event_id UUID)
RETURNS TABLE (
    intents BIGINT,
    check_ins BIGINT,
    active_swipers BIGINT,
    swipes BIGINT,
    matches BIGINT,
    booking_clicks BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = p_event_id),
        (SELECT COUNT(DISTINCT s.swiper_id) FROM public.swipes s WHERE s.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.swipes s WHERE s.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = p_event_id),
        (SELECT COUNT(*) FROM public.booking_clicks bc WHERE bc.event_id = p_event_id);
$$;

/** Check-ins por hora: la curva que dice a qué hora se llena el local. */
CREATE OR REPLACE FUNCTION public.get_event_hourly(p_event_id UUID)
RETURNS TABLE (hour TIMESTAMPTZ, check_ins BIGINT, matches BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH bounds AS (
        SELECT date_trunc('hour', e.start_date) AS from_ts,
               date_trunc('hour', LEAST(e.end_date, NOW())) AS to_ts
        FROM public.events e WHERE e.id = p_event_id
    ),
    series AS (
        SELECT generate_series(b.from_ts, GREATEST(b.to_ts, b.from_ts), INTERVAL '1 hour') AS hour
        FROM bounds b
    )
    SELECT
        s.hour,
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.checked_in_at >= s.hour
            AND ea.checked_in_at < s.hour + INTERVAL '1 hour'),
        (SELECT COUNT(*) FROM public.connections c
          WHERE c.event_id = p_event_id
            AND c.created_at >= s.hour
            AND c.created_at < s.hour + INTERVAL '1 hour')
    FROM series s
    ORDER BY s.hour;
$$;

/** Resumen por evento para comparar y exportar a CSV. */
CREATE OR REPLACE FUNCTION public.get_venue_events_summary(
    p_venue_id UUID,
    p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    intents BIGINT,
    check_ins BIGINT,
    swipes BIGINT,
    matches BIGINT,
    booking_clicks BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        e.id, e.name, e.start_date, e.end_date,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = e.id),
        (SELECT COUNT(*) FROM public.swipes s WHERE s.event_id = e.id),
        (SELECT COUNT(*) FROM public.connections c WHERE c.event_id = e.id),
        (SELECT COUNT(*) FROM public.booking_clicks bc WHERE bc.event_id = e.id)
    FROM public.events e
    WHERE e.venue_id = p_venue_id
      AND (p_since IS NULL OR e.start_date >= p_since)
    ORDER BY e.start_date DESC;
$$;

-- ============================================================================
-- 21. CONTADORES PÚBLICOS DE EVENTO (sala vacía)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_events_activity(p_event_ids UUID[])
RETURNS TABLE (event_id UUID, going BIGINT, inside BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        e.id,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = e.id AND ea.last_seen_at > NOW() - INTERVAL '3 hours')
    FROM public.events e
    WHERE e.id = ANY(p_event_ids);
$$;

-- ============================================================================
-- 22. GRUPOS: crear, unirse y emparejar
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

CREATE OR REPLACE FUNCTION public.join_group(p_join_code TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_group RECORD;
BEGIN
    SELECT * INTO v_group FROM public.groups WHERE join_code = upper(btrim(p_join_code));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'GROUP_NOT_FOUND';
    END IF;

    -- Sólo se puede entrar en un grupo del evento en el que estás.
    IF NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = v_group.event_id AND ea.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    IF (SELECT COUNT(*) FROM public.group_members WHERE group_id = v_group.id) >= 8 THEN
        RAISE EXCEPTION 'GROUP_FULL';
    END IF;

    INSERT INTO public.group_members (group_id, profile_id)
    VALUES (v_group.id, v_profile_id)
    ON CONFLICT DO NOTHING;

    RETURN v_group.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    DELETE FROM public.group_members
    WHERE group_id = p_group_id AND profile_id = v_profile_id;

    -- Un grupo sin miembros se elimina.
    DELETE FROM public.groups g
    WHERE g.id = p_group_id
      AND NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = g.id);
END;
$$;

/** Otros grupos presentes en el mismo evento. */
CREATE OR REPLACE FUNCTION public.get_event_groups(p_event_id UUID)
RETURNS TABLE (
    group_id UUID,
    name TEXT,
    member_count BIGINT,
    avatars TEXT[],
    is_mine BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        g.id,
        g.name,
        (SELECT COUNT(*) FROM public.group_members gm WHERE gm.group_id = g.id),
        COALESCE((
            SELECT array_agg(COALESCE(p.avatar, p.photos[1]))
            FROM public.group_members gm
            JOIN public.profiles p ON p.id = gm.profile_id
            WHERE gm.group_id = g.id
        ), '{}'),
        g.id = public.current_group_id(p_event_id)
    FROM public.groups g
    WHERE g.event_id = p_event_id
    ORDER BY g.created_at DESC
    LIMIT 50;
$$;

-- ============================================================================
-- 23. POLICIES DE LAS TABLAS NUEVAS
-- ============================================================================

-- ---------- interests (catálogo, lectura para autenticados) ----------
DROP POLICY IF EXISTS "Interests are readable" ON public.interests;
CREATE POLICY "Interests are readable"
    ON public.interests FOR SELECT TO authenticated USING (TRUE);

-- ---------- profile_interests ----------
DROP POLICY IF EXISTS "Users manage own interests" ON public.profile_interests;
DROP POLICY IF EXISTS "Users view own interests" ON public.profile_interests;

CREATE POLICY "Users view own interests"
    ON public.profile_interests FOR SELECT TO authenticated
    USING (profile_id = public.current_profile_id());

CREATE POLICY "Users manage own interests"
    ON public.profile_interests FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

-- ---------- venue_members ----------
DROP POLICY IF EXISTS "Venue team can view members" ON public.venue_members;
DROP POLICY IF EXISTS "Venue owner can manage members" ON public.venue_members;

CREATE POLICY "Venue team can view members"
    ON public.venue_members FOR SELECT TO authenticated
    USING (venue_id = public.current_venue_id() OR public.is_admin());

CREATE POLICY "Venue owner can manage members"
    ON public.venue_members FOR ALL TO authenticated
    USING (venue_id = public.current_venue_id() AND public.current_venue_role() = 'owner')
    WITH CHECK (venue_id = public.current_venue_id() AND public.current_venue_role() = 'owner');

-- ---------- event_intents ----------
DROP POLICY IF EXISTS "Users manage own intents" ON public.event_intents;
DROP POLICY IF EXISTS "Venues see intents of own events" ON public.event_intents;

CREATE POLICY "Users manage own intents"
    ON public.event_intents FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "Venues see intents of own events"
    ON public.event_intents FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_intents.event_id AND e.venue_id = public.current_venue_id()
    ));

-- ---------- groups / group_members ----------
DROP POLICY IF EXISTS "Groups visible to event attendees" ON public.groups;
DROP POLICY IF EXISTS "Group members visible to group" ON public.group_members;

CREATE POLICY "Groups visible to event attendees"
    ON public.groups FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = groups.event_id AND ea.profile_id = public.current_profile_id()
    ));

CREATE POLICY "Group members visible to group"
    ON public.group_members FOR SELECT TO authenticated
    USING (public.is_group_member(group_id));

-- ---------- moderation_queue ----------
DROP POLICY IF EXISTS "Users view own moderation items" ON public.moderation_queue;
DROP POLICY IF EXISTS "Users create own moderation items" ON public.moderation_queue;
DROP POLICY IF EXISTS "Admins manage moderation queue" ON public.moderation_queue;

CREATE POLICY "Users view own moderation items"
    ON public.moderation_queue FOR SELECT TO authenticated
    USING (profile_id = public.current_profile_id());

CREATE POLICY "Users create own moderation items"
    ON public.moderation_queue FOR INSERT TO authenticated
    WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "Admins manage moderation queue"
    ON public.moderation_queue FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- trusted_contacts / sos_alerts ----------
DROP POLICY IF EXISTS "Users manage own contacts" ON public.trusted_contacts;
DROP POLICY IF EXISTS "Users manage own alerts" ON public.sos_alerts;
DROP POLICY IF EXISTS "Admins view alerts" ON public.sos_alerts;

CREATE POLICY "Users manage own contacts"
    ON public.trusted_contacts FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "Users manage own alerts"
    ON public.sos_alerts FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "Admins view alerts"
    ON public.sos_alerts FOR SELECT TO authenticated
    USING (public.is_admin());

-- ---------- push_subscriptions ----------
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
    ON public.push_subscriptions FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

-- ---------- rate_limits (sólo el servidor escribe) ----------
DROP POLICY IF EXISTS "Users view own rate limits" ON public.rate_limits;
CREATE POLICY "Users view own rate limits"
    ON public.rate_limits FOR SELECT TO authenticated
    USING (profile_id = public.current_profile_id());

-- ---------- user_consents ----------
DROP POLICY IF EXISTS "Users manage own consents" ON public.user_consents;
CREATE POLICY "Users manage own consents"
    ON public.user_consents FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------- booking_clicks ----------
DROP POLICY IF EXISTS "Users register own booking clicks" ON public.booking_clicks;
DROP POLICY IF EXISTS "Venues view own booking clicks" ON public.booking_clicks;

CREATE POLICY "Users register own booking clicks"
    ON public.booking_clicks FOR INSERT TO authenticated
    WITH CHECK (profile_id IS NULL OR profile_id = public.current_profile_id());

CREATE POLICY "Venues view own booking clicks"
    ON public.booking_clicks FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = booking_clicks.event_id AND e.venue_id = public.current_venue_id()
    ));

-- ---------- analytics_events ----------
DROP POLICY IF EXISTS "Users insert own analytics" ON public.analytics_events;
DROP POLICY IF EXISTS "Admins read analytics" ON public.analytics_events;

CREATE POLICY "Users insert own analytics"
    ON public.analytics_events FOR INSERT TO authenticated
    WITH CHECK (profile_id IS NULL OR profile_id = public.current_profile_id());

CREATE POLICY "Admins read analytics"
    ON public.analytics_events FOR SELECT TO authenticated
    USING (public.is_admin());

-- ============================================================================
-- 24. PERMISOS
-- ============================================================================

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.is_profile_active(uuid)',
        'public.current_venue_role()',
        'public.current_group_id(uuid)',
        'public.is_group_member(uuid)',
        'public.keep_connection(uuid)',
        'public.review_photo(uuid, boolean, text)',
        'public.consume_rate_limit(text, integer, integer)',
        'public.request_account_deletion()',
        'public.export_my_data()',
        'public.suspend_profile(uuid, integer, text)',
        'public.reinstate_profile(uuid)',
        'public.is_premium(uuid)',
        'public.rotate_event_code_if_needed(uuid)',
        'public.get_likes_received()',
        'public.get_profile_reputation(uuid)',
        'public.get_my_event_history()',
        'public.get_event_funnel(uuid)',
        'public.get_event_hourly(uuid)',
        'public.get_venue_events_summary(uuid, timestamptz)',
        'public.get_events_activity(uuid[])',
        'public.create_group(uuid, text)',
        'public.join_group(text)',
        'public.leave_group(uuid)',
        'public.get_event_groups(uuid)',
        'public.get_nearby_profiles(uuid, double precision, double precision, integer, uuid, integer, integer, text[])'
    ]
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END LOOP;
END $$;

-- Las funciones de purga sólo las ejecuta el servidor (cron / service role).
REVOKE ALL ON FUNCTION public.purge_expired_connections() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_rate_limits() FROM PUBLIC;

-- ============================================================================
-- 25. CIERRE DEL ACCESO ANÓNIMO
-- La 006 ya lo hace, pero esta migración crea tablas y secuencias nuevas
-- (analytics_events usa BIGSERIAL) que hay que cerrar igual.
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ============================================================================
-- 26. COMENTARIOS
-- ============================================================================

COMMENT ON TABLE public.event_intents IS 'Intención de asistir. Permite mostrar actividad antes de que nadie haya entrado.';
COMMENT ON TABLE public.moderation_queue IS 'Cola de revisión de fotos. Nada se publica en el perfil sin aprobarse.';
COMMENT ON TABLE public.rate_limits IS 'Contador por ventana. Lo aplican triggers en swipes y messages.';
COMMENT ON FUNCTION public.export_my_data IS 'Exportación de datos personales (art. 20 RGPD).';
COMMENT ON FUNCTION public.keep_connection IS 'Conserva una conexión más allá del evento cuando ambas partes lo piden.';


-- ============================================================================
-- COMPROBACIONES (ejecútalas después, deberían devolver todo correcto)
-- ============================================================================

-- 1. ¿Se ha roto la recursión infinita de profiles?
--    Antes devolvía 42P17. Ahora debe responder sin error.
SELECT count(*) AS perfiles FROM public.profiles;

-- 2. ¿Existen las tablas nuevas? Deben salir 12 filas.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('event_attendance','event_intents','interests','profile_interests',
                     'venue_members','groups','group_members','moderation_queue',
                     'trusted_contacts','sos_alerts','push_subscriptions','rate_limits')
ORDER BY table_name;

-- 3. ¿Se migró la tabla event_attendance antigua?
--    Debe existir event_attendance_legacy con sus filas originales.
SELECT
  (SELECT count(*) FROM public.event_attendance)        AS filas_nuevas,
  (SELECT count(*) FROM public.event_attendance_legacy) AS filas_antiguas;

-- 4. ¿Existen las funciones clave? Deben salir 6 filas.
SELECT proname FROM pg_proc
WHERE proname IN ('redeem_event_code','current_profile_id','is_admin',
                  'consume_rate_limit','export_my_data','get_event_funnel')
ORDER BY proname;

-- 5. ¿Queda alguna tabla legible sin autenticar? Debe devolver 0 filas.
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public';

-- 6. ¿Alguna tabla sin RLS? Debe devolver 0 filas.
SELECT c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
