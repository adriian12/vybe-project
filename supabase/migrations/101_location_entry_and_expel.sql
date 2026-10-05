-- ============================================================================
-- 101 · Entrar por ubicación, expulsar tras una denuncia
-- ============================================================================
-- Fiestas de Fiestea (sin negocio, sin QR en la puerta):
--   · Con ubicación, el Flechazo viene encendido y la ficha ofrece «Entrar al
--     evento»: se entra estando dentro del radio (`enter_platform_event`).
--
-- Al entrar (también con código):
--   · Precisión mínima: con una ubicación peor de ±100 m se pide repetir
--     (`LOCATION_IMPRECISE`).
--   · Ubicación simulada (Android la marca como «mock») → `LOCATION_MOCKED`.
--   · Como mucho 10 intentos cada 10 minutos por persona (`TOO_MANY_ATTEMPTS`).
--   · Quien ha sido expulsado de la fiesta no vuelve a entrar (`EXPELLED`).
--
-- Mientras estás dentro, el latido (cada 5 min) comprueba la ubicación: si te
-- has alejado mucho del sitio, o es simulada, sales del tablón.
--
-- Denuncias:
--   · Se guardan con la fiesta en la que está la persona denunciada.
--   · Avisan al momento (push) al propietario y a Seguridad del negocio; en las
--     fiestas de Fiestea, a administración.
--   · «Expulsar» (`expel_from_event`, el antiguo «Retirar acceso») saca a la
--     persona del tablón, le quita la foto de la noche y los me gusta sin
--     crush, marca la denuncia como resuelta y le impide volver a entrar.
-- ============================================================================

ALTER TABLE public.event_attendance
    ADD COLUMN IF NOT EXISTS expelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.reports
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reports_event_id_idx ON public.reports (event_id) WHERE event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Denuncias: con su fiesta, y aviso al momento.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reports_set_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.event_id IS NULL THEN
        NEW.event_id := public.active_event_of(NEW.reported_id);
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reports_set_event ON public.reports;
CREATE TRIGGER reports_set_event
    BEFORE INSERT ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.reports_set_event();

CREATE OR REPLACE FUNCTION public.push_on_report()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.event_id IS NOT NULL THEN
        PERFORM public.push_webhook(jsonb_build_object(
            'type', 'REPORT', 'table', 'reports', 'record', jsonb_build_object('id', NEW.id)
        ));
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS push_on_report ON public.reports;
CREATE TRIGGER push_on_report
    AFTER INSERT ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.push_on_report();

REVOKE ALL ON FUNCTION public.reports_set_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_on_report() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expulsar: propietario, Seguridad (con cuenta o con enlace) y administración.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expel_from_event(p_event_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.event_attendance
    SET left_at = COALESCE(left_at, NOW()),
        expelled_at = NOW(),
        expelled_by = auth.uid(),
        photo_url = NULL
    WHERE event_id = p_event_id AND profile_id = p_profile_id;

    IF NOT FOUND THEN
        -- No había entrado: se deja anotado igual, para que no pueda entrar.
        INSERT INTO public.event_attendance (event_id, profile_id, left_at, expelled_at, expelled_by)
        VALUES (p_event_id, p_profile_id, NOW(), NOW(), auth.uid())
        ON CONFLICT (event_id, profile_id) DO NOTHING;
    END IF;

    -- Como al salir: sus me gusta de esta noche sin crush desaparecen.
    DELETE FROM public.swipes s
    WHERE s.swiper_id = p_profile_id
      AND s.event_id = p_event_id
      AND s.swipe_type IN ('like', 'super_like')
      AND NOT public.are_connected(p_profile_id, s.swiped_id);

    UPDATE public.reports
    SET status = 'resolved', reviewed_at = NOW(), reviewed_by = auth.uid()
    WHERE reported_id = p_profile_id AND event_id = p_event_id AND status = 'pending';

    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'EXPELLED', 'table', 'event_attendance',
        'record', jsonb_build_object('event_id', p_event_id, 'profile_id', p_profile_id)
    ));
END;
$function$;

REVOKE ALL ON FUNCTION public.expel_from_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expel_from_event(uuid, uuid) TO authenticated, service_role;

-- El antiguo «Retirar acceso» (panel y enlace de Seguridad) ahora expulsa.
CREATE OR REPLACE FUNCTION public.revoke_event_checkin(p_event_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.expel_from_event(p_event_id, p_profile_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Denuncias que ve el negocio: las de su fiesta, y si ya está expulsado.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_venue_reports(uuid);
CREATE FUNCTION public.get_venue_reports(p_event_id uuid)
 RETURNS TABLE(report_id uuid, reported_profile_id uuid, reported_name text, reported_photo text, report_type text, description text, created_at timestamp with time zone, reports_total bigint, expelled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT (public.can_read_event_metrics(p_event_id) OR public.can_count_event(p_event_id)) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT r.id, p.id, p.name, COALESCE(ea.photo_url, p.avatar),
           r.report_type, r.description, r.created_at,
           (SELECT COUNT(*) FROM public.reports r2 WHERE r2.reported_id = p.id),
           ea.expelled_at IS NOT NULL
    FROM public.reports r
    JOIN public.profiles p ON p.id = r.reported_id
    JOIN public.event_attendance ea
      ON ea.profile_id = p.id AND ea.event_id = p_event_id
    WHERE (r.event_id = p_event_id OR (r.event_id IS NULL AND r.created_at > NOW() - INTERVAL '24 hours'))
    ORDER BY (ea.expelled_at IS NOT NULL), r.created_at DESC
    LIMIT 100;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_venue_reports(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_reports(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Entrar a una fiesta de Fiestea por ubicación.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enter_platform_event(uuid, double precision, double precision);
CREATE OR REPLACE FUNCTION public.enter_platform_event_inner(p_event_id uuid, p_latitude double precision, p_longitude double precision, p_accuracy double precision DEFAULT NULL::double precision, p_mocked boolean DEFAULT false)
 RETURNS TABLE(event_id uuid, event_name text, venue_id uuid, venue_name text, venue_type text, event_radius integer, start_date timestamp with time zone, end_date timestamp with time zone, distance_meters double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_event RECORD;
    v_venue RECORD;
    v_distance DOUBLE PRECISION;
    v_radius INTEGER;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;
    -- Android marca la ubicación simulada («mock»): no vale para entrar.
    IF COALESCE(p_mocked, FALSE) THEN
        RAISE EXCEPTION 'LOCATION_MOCKED';
    END IF;

    SELECT * INTO v_event FROM public.events e WHERE e.id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_EVENT';
    END IF;

    SELECT * INTO v_venue FROM public.venues v WHERE v.id = v_event.venue_id;
    IF NOT FOUND OR NOT v_venue.is_platform THEN
        -- Las fiestas de un negocio se entran con su código.
        RAISE EXCEPTION 'CODE_REQUIRED';
    END IF;

    IF v_event.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    -- Se puede entrar desde una hora antes de que empiece.
    IF v_event.start_date > NOW() + INTERVAL '1 hour' THEN
        RAISE EXCEPTION 'EVENT_NOT_STARTED';
    END IF;

    -- Expulsado de esta fiesta tras una denuncia: no vuelve a entrar (101).
    IF EXISTS (
        SELECT 1 FROM public.event_attendance a
        WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id AND a.expelled_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'EXPELLED';
    END IF;
    IF v_event.entry_closed_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.event_attendance a
        WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'ENTRY_CLOSED';
    END IF;

    v_radius := COALESCE(v_venue.event_radius, 300);
    IF v_event.requires_location THEN
        IF p_latitude IS NULL OR p_longitude IS NULL THEN
            RAISE EXCEPTION 'LOCATION_REQUIRED';
        END IF;
        -- Con una ubicación peor de ±100 m no se sabe si estás dentro (101).
        IF p_accuracy IS NOT NULL AND p_accuracy > 100 THEN
            RAISE EXCEPTION 'LOCATION_IMPRECISE';
        END IF;
        IF v_event.latitude IS NULL OR v_event.longitude IS NULL THEN
            RAISE EXCEPTION 'EVENT_WITHOUT_LOCATION';
        END IF;
        v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
        IF v_distance > v_radius THEN
            RAISE EXCEPTION 'TOO_FAR';
        END IF;
    END IF;

    INSERT INTO public.event_attendance AS ea (event_id, profile_id, latitude, longitude, mode)
    VALUES (
        v_event.id, v_profile_id, p_latitude, p_longitude,
        (SELECT CASE WHEN p.account_type = 'guest' THEN 'guest' END FROM public.profiles p WHERE p.id = v_profile_id)
    )
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            left_at = NULL,
            mode = COALESCE(EXCLUDED.mode, ea.mode),
            latitude = COALESCE(EXCLUDED.latitude, ea.latitude),
            longitude = COALESCE(EXCLUDED.longitude, ea.longitude);

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles SET latitude = p_latitude, longitude = p_longitude WHERE id = v_profile_id;
    END IF;

    RETURN QUERY SELECT
        v_event.id, v_event.name, v_venue.id, v_venue.name, v_venue.type, v_radius,
        v_event.start_date, v_event.end_date, v_distance;
END;
$function$;

REVOKE ALL ON FUNCTION public.enter_platform_event_inner(uuid, double precision, double precision, double precision, boolean) FROM PUBLIC, anon, authenticated;

-- La función pública cuenta el intento y llama a la de verdad dentro de un
-- bloque que captura el error: así un intento fallido también cuenta (si se
-- lanzara el error, la transacción se desharía con el contador incluido). El
-- error vuelve en `error_code`.
CREATE FUNCTION public.enter_platform_event(p_event_id uuid, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision, p_mocked boolean DEFAULT false)
 RETURNS TABLE(event_id uuid, event_name text, venue_id uuid, venue_name text, venue_type text, event_radius integer, start_date timestamp with time zone, end_date timestamp with time zone, distance_meters double precision, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_error TEXT;
BEGIN
    -- Como mucho 10 intentos cada 10 minutos por persona.
    IF v_profile_id IS NOT NULL
       AND NOT public.consume_anon_rate_limit('entry:' || v_profile_id::TEXT, 10, 600) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::timestamptz, NULL::timestamptz, NULL::double precision, 'TOO_MANY_ATTEMPTS'::TEXT;
        RETURN;
    END IF;

    BEGIN
        RETURN QUERY SELECT i.*, NULL::TEXT FROM public.enter_platform_event_inner(p_event_id, p_latitude, p_longitude, p_accuracy, p_mocked) i;
    EXCEPTION WHEN others THEN
        v_error := SQLERRM;
    END;

    IF v_error IS NOT NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::timestamptz, NULL::timestamptz, NULL::double precision, v_error;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.enter_platform_event(uuid, double precision, double precision, double precision, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enter_platform_event(uuid, double precision, double precision, double precision, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Entrar con código: las mismas comprobaciones de ubicación y expulsión.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.redeem_event_code(text, double precision, double precision);
CREATE OR REPLACE FUNCTION public.redeem_event_code_inner(p_code text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision, p_mocked boolean DEFAULT false)
 RETURNS TABLE(event_id uuid, event_name text, venue_id uuid, venue_name text, venue_type text, event_radius integer, start_date timestamp with time zone, end_date timestamp with time zone, distance_meters double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Android marca la ubicación simulada («mock»): no vale para entrar.
    IF COALESCE(p_mocked, FALSE) THEN
        RAISE EXCEPTION 'LOCATION_MOCKED';
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

    -- Las listas cerradas tienen aforo propio: cuando se agota, se agota.
    IF v_code.max_uses IS NOT NULL AND v_code.uses >= v_code.max_uses THEN
        RAISE EXCEPTION 'CODE_EXHAUSTED';
    END IF;

    SELECT * INTO v_venue FROM public.venues WHERE id = v_code.venue_id;
    IF NOT FOUND OR v_venue.is_verified = FALSE THEN
        RAISE EXCEPTION 'VENUE_NOT_VERIFIED';
    END IF;

    IF v_code.event_id IS NOT NULL THEN
        SELECT * INTO v_event FROM public.events WHERE id = v_code.event_id;
    ELSE
        SELECT * INTO v_event
        FROM public.events e
        WHERE e.venue_id = v_code.venue_id AND e.end_date > NOW()
        ORDER BY e.start_date ASC
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_EVENT';
    END IF;

    IF v_event.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;

    -- Expulsado de esta fiesta tras una denuncia: no vuelve a entrar (101).
    IF EXISTS (
        SELECT 1 FROM public.event_attendance a
        WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id AND a.expelled_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'EXPELLED';
    END IF;
    -- Puerta cerrada: sólo vuelve a entrar quien ya estaba dentro.
    IF v_event.entry_closed_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.event_attendance a
        WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'ENTRY_CLOSED';
    END IF;

    v_distance := NULL;
    PERFORM public.fiestea_require_location(v_event.requires_location, p_latitude, p_longitude);
    IF v_event.requires_location AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        -- Con una ubicación peor de ±100 m no se sabe si estás dentro (101).
        IF p_accuracy IS NOT NULL AND p_accuracy > 100 THEN
            RAISE EXCEPTION 'LOCATION_IMPRECISE';
        END IF;
        IF v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
        ELSIF v_venue.latitude IS NOT NULL AND v_venue.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_venue.latitude, v_venue.longitude);
        END IF;

        IF v_distance IS NOT NULL AND v_distance > COALESCE(v_venue.event_radius, 50) THEN
            RAISE EXCEPTION 'TOO_FAR';
        END IF;
    END IF;

    -- Una cuenta de invitado entra siempre como invitada: no se le pregunta.
    INSERT INTO public.event_attendance AS ea (
        event_id, profile_id, latitude, longitude, code_id, mode
    )
    VALUES (
        v_event.id, v_profile_id, p_latitude, p_longitude, v_code.id,
        (SELECT CASE WHEN p.account_type = 'guest' THEN 'guest' END FROM public.profiles p WHERE p.id = v_profile_id)
    )
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            -- Volver a entrar con el código borra la salida.
            left_at = NULL,
            mode = COALESCE(EXCLUDED.mode, ea.mode),
            latitude = COALESCE(EXCLUDED.latitude, ea.latitude),
            longitude = COALESCE(EXCLUDED.longitude, ea.longitude),
            -- La atribución es del primer código con el que entró: si vuelve a
            -- canjear otro, el RRPP que lo trajo no cambia.
            code_id = COALESCE(ea.code_id, EXCLUDED.code_id);

    -- El contador sólo sube en el primer canje de esta persona con este código.
    UPDATE public.event_codes
    SET uses = uses + 1
    WHERE id = v_code.id
      AND EXISTS (
          SELECT 1 FROM public.event_attendance a
          WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
            AND a.code_id = v_code.id AND a.checked_in_at > NOW() - INTERVAL '5 seconds'
      );

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles
        SET latitude = p_latitude, longitude = p_longitude
        WHERE id = v_profile_id;
    END IF;

    RETURN QUERY SELECT
        v_event.id, v_event.name, v_venue.id, v_venue.name, v_venue.type,
        COALESCE(v_venue.event_radius, 50),
        v_event.start_date, v_event.end_date, v_distance;
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_event_code_inner(text, double precision, double precision, double precision, boolean) FROM PUBLIC, anon, authenticated;

-- La función pública cuenta el intento y llama a la de verdad dentro de un
-- bloque que captura el error: así un intento fallido también cuenta (si se
-- lanzara el error, la transacción se desharía con el contador incluido). El
-- error vuelve en `error_code`.
CREATE FUNCTION public.redeem_event_code(p_code text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision, p_mocked boolean DEFAULT false)
 RETURNS TABLE(event_id uuid, event_name text, venue_id uuid, venue_name text, venue_type text, event_radius integer, start_date timestamp with time zone, end_date timestamp with time zone, distance_meters double precision, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_error TEXT;
BEGIN
    -- Como mucho 10 intentos cada 10 minutos por persona.
    IF v_profile_id IS NOT NULL
       AND NOT public.consume_anon_rate_limit('entry:' || v_profile_id::TEXT, 10, 600) THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::timestamptz, NULL::timestamptz, NULL::double precision, 'TOO_MANY_ATTEMPTS'::TEXT;
        RETURN;
    END IF;

    BEGIN
        RETURN QUERY SELECT i.*, NULL::TEXT FROM public.redeem_event_code_inner(p_code, p_latitude, p_longitude, p_accuracy, p_mocked) i;
    EXCEPTION WHEN others THEN
        v_error := SQLERRM;
    END;

    IF v_error IS NOT NULL THEN
        RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::integer, NULL::timestamptz, NULL::timestamptz, NULL::double precision, v_error;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_event_code(text, double precision, double precision, double precision, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_event_code(text, double precision, double precision, double precision, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Latido: sigue contando como presente; si te has ido lejos o la ubicación es
-- simulada, sales del tablón. Devuelve 'ok', 'left' o 'expelled'.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.heartbeat_event_attendance(uuid, double precision, double precision);
CREATE FUNCTION public.heartbeat_event_attendance(
    p_event_id uuid,
    p_latitude double precision DEFAULT NULL,
    p_longitude double precision DEFAULT NULL,
    p_accuracy double precision DEFAULT NULL,
    p_mocked boolean DEFAULT FALSE
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_att public.event_attendance%ROWTYPE;
    v_event public.events%ROWTYPE;
    v_radius INTEGER;
    v_distance DOUBLE PRECISION;
BEGIN
    IF v_profile_id IS NULL THEN RETURN 'ok'; END IF;

    SELECT * INTO v_att FROM public.event_attendance
    WHERE event_id = p_event_id AND profile_id = v_profile_id;
    IF NOT FOUND THEN RETURN 'left'; END IF;
    IF v_att.expelled_at IS NOT NULL THEN RETURN 'expelled'; END IF;
    IF v_att.left_at IS NOT NULL THEN RETURN 'left'; END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;

    -- Ubicación simulada, o muy lejos con una ubicación fiable: fuera del
    -- tablón. Con margen (radio + 500 m): el GPS dentro de un local baila.
    IF v_event.requires_location AND NOT COALESCE(v_event.test_lab, FALSE) THEN
        IF COALESCE(p_mocked, FALSE) THEN
            UPDATE public.event_attendance SET left_at = NOW()
            WHERE event_id = p_event_id AND profile_id = v_profile_id;
            RETURN 'left';
        END IF;
        IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL
           AND COALESCE(p_accuracy, 0) <= 200
           AND v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
            SELECT COALESCE(v.event_radius, 300) INTO v_radius FROM public.venues v WHERE v.id = v_event.venue_id;
            v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
            IF v_distance > v_radius + 500 THEN
                UPDATE public.event_attendance SET left_at = NOW()
                WHERE event_id = p_event_id AND profile_id = v_profile_id;
                RETURN 'left';
            END IF;
        END IF;
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
    RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.heartbeat_event_attendance(uuid, double precision, double precision, double precision, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_event_attendance(uuid, double precision, double precision, double precision, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fiestas de Fiestea: con ubicación, Flechazo encendido (se entra por GPS).
-- Sin ubicación no hay forma de comprobar que estás allí: apagado.
-- ---------------------------------------------------------------------------
UPDATE public.events e
SET swipe_enabled = (e.latitude IS NOT NULL AND e.longitude IS NOT NULL)
FROM public.venues v
WHERE v.id = e.venue_id AND v.is_platform;

CREATE OR REPLACE FUNCTION public.platform_events_swipe_off()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.is_platform) THEN
        NEW.swipe_enabled := NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$function$;
