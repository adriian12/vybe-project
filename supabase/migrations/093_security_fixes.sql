-- ============================================================================
-- 093 · Arreglos de seguridad de la revisión de código
-- ============================================================================
-- Cada bloque lleva el identificador del hallazgo al que responde.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C-01 · get_nearby_profiles aceptaba la identidad del que llama y se saltaba
-- todas las comprobaciones de privacidad si `p_event_id` venía a NULL.
--
-- Dos cambios:
--   1. La identidad sale de `current_profile_id()`. `p_user_id` se mantiene en
--      la firma para no romper al cliente, pero se IGNORA: antes se podía
--      pasar el id de otra persona y heredar sus filtros y sus bloqueos.
--   2. El tablón es siempre de una fiesta. Sin `p_event_id` no había ni
--      comprobación de foto, ni corte de invitados, ni `swipe_enabled`, ni
--      coincidencia en el evento: devolvía perfiles verificados de todo el
--      país, y con `distance_meters` se trilateraban sus coordenadas de casa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nearby_profiles(p_user_id uuid, p_latitude double precision, p_longitude double precision, p_radius_meters integer DEFAULT 5000, p_event_id uuid DEFAULT NULL::uuid, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_interest_slugs text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, name text, age integer, bio text, photos text[], avatar text, distance_meters double precision, is_verified boolean, interests text[], shared_interests integer, gender text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_me UUID;
    v_my_interests UUID[];
    v_my_gender TEXT;
    v_my_wants TEXT;
    v_i_have_photo BOOLEAN;
    v_sin_distancia BOOLEAN := FALSE;
    v_lab BOOLEAN := FALSE;
BEGIN
    -- Quien pregunta es quien tiene la sesión, no quien diga el parámetro.
    v_me := public.current_profile_id();
    IF v_me IS NULL THEN
        RETURN;
    END IF;

    -- El tablón es de una fiesta concreta. Sin fiesta no hay nada que enseñar.
    IF p_event_id IS NULL THEN
        RETURN;
    END IF;

    -- Una cuenta de invitado no ve el tablón en ninguna fiesta.
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_me AND p.account_type = 'guest') THEN
        RETURN;
    END IF;

    -- Quien no ha puesto su foto de esta noche no ve el tablón. Se devuelve
    -- vacío en lugar de un error: la pantalla ya sabe pedir la foto.
    SELECT ea.photo_url IS NOT NULL
    INTO v_i_have_photo
    FROM public.event_attendance ea
    WHERE ea.event_id = p_event_id AND ea.profile_id = v_me
      AND ea.left_at IS NULL
      AND COALESCE(ea.mode, 'vyber') = 'vyber';

    IF NOT COALESCE(v_i_have_photo, FALSE) THEN
        RETURN;
    END IF;

    -- El negocio decide si en su fiesta se conoce gente (migración 081).
    IF EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND NOT e.swipe_enabled) THEN
        RETURN;
    END IF;

    SELECT NOT e.requires_location INTO v_sin_distancia
    FROM public.events e WHERE e.id = p_event_id;
    v_sin_distancia := COALESCE(v_sin_distancia, FALSE);
    v_lab := public.is_test_lab_event(p_event_id);

    SELECT COALESCE(array_agg(pi.interest_id), '{}')
    INTO v_my_interests
    FROM public.profile_interests pi
    WHERE pi.profile_id = v_me;

    SELECT pr.gender, pr.wants INTO v_my_gender, v_my_wants
    FROM public.profiles pr WHERE pr.id = v_me;

    RETURN QUERY
    WITH nearby AS (
        SELECT
            p.id,
            p.name,
            p.age,
            p.bio,
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
                AND pi.interest_id = ANY(v_my_interests)) AS shared_interests,
            (b.profile_id IS NOT NULL) AS boosted,
            (v_lab AND p.email LIKE '%@seed.vybe.test') AS de_prueba
        FROM public.profiles p
        LEFT JOIN public.event_attendance ea
               ON ea.profile_id = p.id AND ea.event_id = p_event_id
        LEFT JOIN public.profile_boosts b
               ON b.profile_id = p.id
              AND b.event_id = p_event_id
              AND b.expires_at > NOW()
        WHERE p.id <> v_me
          AND (v_sin_distancia OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL))
          AND p.is_verified = TRUE
          AND p.account_type = 'vyber'
          AND NOT (p.is_invisible AND public.is_premium(p.id))
          AND p.status = 'active'
          AND (p.suspended_until IS NULL OR p.suspended_until < NOW())
          AND (p_min_age IS NULL OR p.age >= p_min_age)
          AND (p_max_age IS NULL OR p.age <= p_max_age)
          AND public.wants_gender(v_my_wants, p.gender)
          AND ((v_lab AND p.email LIKE '%@seed.vybe.test') OR public.wants_gender(p.wants, v_my_gender))
          AND EXISTS (
              SELECT 1 FROM public.event_attendance a
              WHERE a.event_id = p_event_id
                AND a.profile_id = p.id
                AND a.left_at IS NULL
                AND COALESCE(a.mode, 'vyber') = 'vyber'
                AND ((v_lab AND p.email LIKE '%@seed.vybe.test')
                     OR a.last_seen_at > NOW() - INTERVAL '12 hours')
                AND a.photo_url IS NOT NULL
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
              SELECT 1 FROM public.blocks b2
              WHERE (b2.blocker_id = v_me AND b2.blocked_id = p.id)
                 OR (b2.blocker_id = p.id AND b2.blocked_id = v_me)
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.swipes s
              WHERE s.swiper_id = v_me
                AND s.swiped_id = p.id
                AND (s.event_id = p_event_id OR s.event_id IS NULL)
          )
    )
    SELECT
        nearby.id, nearby.name, nearby.age, nearby.bio, nearby.photos, nearby.avatar,
        nearby.distance_meters, nearby.is_verified, nearby.interests,
        nearby.shared_interests, nearby.gender
    FROM nearby
    WHERE v_sin_distancia OR nearby.distance_meters <= p_radius_meters
    ORDER BY
        nearby.boosted DESC,
        nearby.shared_interests DESC,
        nearby.distance_meters ASC NULLS LAST
    LIMIT 60;
END;
$function$;

-- ---------------------------------------------------------------------------
-- C-06 (parcial) · `shares_active_event()` se quedó sin actualizar cuando
-- migraciones posteriores añadieron `left_at` (046), el modo invitado (055/058)
-- y el modo invisible (025): sólo cruzaba por `event_id` con la fiesta sin
-- terminar. Quien se iba de la fiesta, pasaba a cuenta de invitado o pagaba el
-- modo invisible seguía dando TRUE, y con eso la política de `profiles`
-- entregaba su fila entera.
--
-- OJO: esto cierra esas tres clases, pero la política sigue siendo de fila
-- completa, así que quien SÍ comparte fiesta ahora mismo continúa pudiendo leer
-- teléfono, correo y coordenadas. Eso exige privilegios por columna y rehacer
-- las lecturas del propietario y del panel de administración; va aparte.
-- ---------------------------------------------------------------------------
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
        JOIN public.profiles pb ON pb.id = p_profile_b
        WHERE a.profile_id = p_profile_a
          AND b.profile_id = p_profile_b
          AND e.end_date > NOW()
          -- Los dos siguen dentro.
          AND a.left_at IS NULL
          AND b.left_at IS NULL
          -- Y los dos están como vyber, no como invitados.
          AND COALESCE(a.mode, 'vyber') = 'vyber'
          AND COALESCE(b.mode, 'vyber') = 'vyber'
          AND pb.account_type = 'vyber'
          -- El modo invisible de pago también vale aquí.
          AND NOT (pb.is_invisible AND public.is_premium(pb.id))
    );
$$;

-- ---------------------------------------------------------------------------
-- A-01 · El geofence de `redeem_event_code` sólo se comprobaba si el cliente
-- mandaba coordenadas, y son NULL por defecto: omitiéndolas se entraba en la
-- fiesta desde cualquier parte del mundo con sólo saber el código.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiestea_require_location(
    p_requires BOOLEAN,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION
) RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
    IF p_requires AND (p_latitude IS NULL OR p_longitude IS NULL) THEN
        RAISE EXCEPTION 'LOCATION_REQUIRED';
    END IF;
END;
$$;

DO $$
DECLARE
    v_src TEXT;
    v_new TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'redeem_event_code'
    LIMIT 1;

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'redeem_event_code no existe: revisa el orden de las migraciones';
    END IF;

    -- Sin coordenadas no se entra en una fiesta que las exige.
    v_new := replace(
        v_src,
        'IF v_event.requires_location AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN',
        'PERFORM public.fiestea_require_location(v_event.requires_location, p_latitude, p_longitude);'
        || E'\n    IF v_event.requires_location AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN'
    );

    IF v_new = v_src THEN
        RAISE EXCEPTION 'No se encontró el bloque del geofence en redeem_event_code';
    END IF;

    EXECUTE v_new;
END;
$$;

-- ---------------------------------------------------------------------------
-- A-03 · `protect_profile_fields()` fijaba `role`, `is_verified` y compañía
-- pero no `account_type`, y la política de UPDATE de `profiles` es de fila
-- completa: un PATCH directo se saltaba todos los controles de
-- `set_account_type()` (límite de cambios al mes, perfil completo) y no dejaba
-- fila de auditoría.
--
-- Sigue siendo SECURITY INVOKER, como desde la migración 045: con SECURITY
-- DEFINER `current_user` sería su propietario, la primera condición se
-- cumpliría siempre y el disparador no protegería nada (cualquiera podría
-- ponerse `role = 'admin'`).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon')
       OR auth.uid() IS NULL
       OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    NEW.role              := OLD.role;
    NEW.is_verified       := OLD.is_verified;
    NEW.face_verified     := OLD.face_verified;
    NEW.phone_verified    := OLD.phone_verified;
    NEW.status            := OLD.status;
    NEW.suspended_until   := OLD.suspended_until;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.staff_only        := OLD.staff_only;
    -- Sólo lo cambia `set_account_type()`, que es SECURITY DEFINER y comprueba
    -- el límite de cambios y que el perfil esté completo.
    NEW.account_type      := OLD.account_type;

    IF NEW.photos IS DISTINCT FROM OLD.photos
       AND NOT (NEW.photos <@ COALESCE(OLD.photos, '{}'::text[])) THEN
        NEW.photos := OLD.photos;
    END IF;

    IF NEW.avatar IS DISTINCT FROM OLD.avatar
       AND NEW.avatar IS NOT NULL
       AND NOT (NEW.avatar = ANY (COALESCE(NEW.photos, '{}'::text[]))) THEN
        NEW.avatar := OLD.avatar;
    END IF;

    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- C-05 · `events.booking_url` lo escribe cualquier cuenta de local y no tenía
-- ninguna comprobación: `<input type="url">` acepta `javascript:…` y React lo
-- renderiza igual. Se limpia lo que haya y se cierra con un CHECK.
-- ---------------------------------------------------------------------------
UPDATE public.events
   SET booking_url = NULL
 WHERE booking_url IS NOT NULL
   AND booking_url !~* '^https?://';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_booking_url_scheme_check;
ALTER TABLE public.events
    ADD CONSTRAINT events_booking_url_scheme_check
    CHECK (booking_url IS NULL OR booking_url ~* '^https?://');

-- ---------------------------------------------------------------------------
-- A-04 · El contador por IP tomaba la PRIMERA entrada de `x-forwarded-for`,
-- que es la que manda el cliente: rotándola se estrenaba cubo en cada
-- petición. Los proxies añaden al final, así que la de confianza es la última.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiestea_client_ip()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        NULLIF(trim(current_setting('request.headers', TRUE)::jsonb->>'cf-connecting-ip'), ''),
        NULLIF(trim((string_to_array(
            COALESCE(current_setting('request.headers', TRUE)::jsonb->>'x-forwarded-for', ''), ','
        ))[array_length(string_to_array(
            COALESCE(current_setting('request.headers', TRUE)::jsonb->>'x-forwarded-for', ''), ','
        ), 1)]), '')
    );
$$;

-- ---------------------------------------------------------------------------
-- M-05 · `save_native_push_token` y `remove_native_push_token` se llaman desde
-- el cliente y están en los tipos generados, pero no existían en ninguna
-- migración: sobre una base construida desde `supabase/migrations/` el token
-- nunca se guardaba, el error sólo iba a la consola y la interfaz decía que
-- las notificaciones estaban activadas. `push_subscriptions` tampoco tenía las
-- columnas que `send-push` ya lee.
-- ---------------------------------------------------------------------------
-- OJO: estas funciones ya existían en producción (se crearon a mano). Este
-- bloque las deja en el repositorio con el MISMO comportamiento que tienen allí:
-- el token va tal cual en `endpoint` y en `native_token`, y el modelo en
-- `device_model`. Guardarlo como `native:<token>` duplicaría cada móvil que ya
-- tenía los avisos activados.
ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS native_token TEXT,
    ADD COLUMN IF NOT EXISTS device_model TEXT;

CREATE INDEX IF NOT EXISTS idx_push_native_token
    ON public.push_subscriptions(native_token)
    WHERE native_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_native_push_token(
    p_token TEXT,
    p_platform TEXT,
    p_device_model TEXT DEFAULT NULL
) RETURNS VOID
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

    IF p_platform NOT IN ('android', 'ios') THEN
        RAISE EXCEPTION 'INVALID_PLATFORM';
    END IF;

    INSERT INTO public.push_subscriptions (
        profile_id, endpoint, native_token, platform, device_model, last_used_at
    )
    VALUES (v_profile_id, p_token, p_token, p_platform, p_device_model, NOW())
    ON CONFLICT (endpoint) DO UPDATE
        SET profile_id = EXCLUDED.profile_id,
            native_token = EXCLUDED.native_token,
            platform = EXCLUDED.platform,
            device_model = EXCLUDED.device_model,
            last_used_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_native_push_token(p_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.push_subscriptions
    WHERE native_token = p_token
      AND profile_id = public.current_profile_id();
$$;

REVOKE ALL ON FUNCTION public.save_native_push_token(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_native_push_token(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_native_push_token(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_native_push_token(TEXT) TO authenticated;

-- Y la guardia de la base de datos pasa a usarla.
DO $$
DECLARE
    v_src TEXT;
    v_new TEXT;
    v_old TEXT := 'v_ip := NULLIF(trim(split_part(
                COALESCE(current_setting(''request.headers'', TRUE)::jsonb->>''x-forwarded-for'', ''''), '','', 1)), '''');';
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'api_rate_guard'
    LIMIT 1;

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'api_rate_guard no existe: revisa el orden de las migraciones';
    END IF;

    v_new := replace(v_src, v_old, 'v_ip := public.fiestea_client_ip();');

    IF v_new = v_src THEN
        RAISE EXCEPTION 'No se encontró la lectura de x-forwarded-for en api_rate_guard';
    END IF;

    EXECUTE v_new;
END;
$$;
