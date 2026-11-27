-- 150 · Cómo se entra a una fiesta: con QR o código, o sólo con la ubicación.
--
-- · Fiestas de Fiestea: siempre por ubicación (como desde la 101): estando en el
--   sitio y pulsando «Entrar» se llega al tablón, sin QR.
-- · Negocios: eligen en «Ajustes de la fiesta». Por defecto, QR o código (lo de
--   siempre); con «Sólo ubicación» la ficha ofrece el mismo botón que en las
--   fiestas de Fiestea. Para eso la fiesta necesita coordenadas.
-- · Por ubicación siempre se comprueba la distancia, aunque la fiesta no tenga
--   `requires_location`.

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS entry_method TEXT NOT NULL DEFAULT 'code';

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_entry_method_check;
ALTER TABLE public.events
    ADD CONSTRAINT events_entry_method_check CHECK (entry_method IN ('code', 'location'));

UPDATE public.events e
SET entry_method = 'location'
FROM public.venues v
WHERE v.id = e.venue_id AND v.is_platform AND e.entry_method <> 'location';

-- Las de Fiestea: por ubicación siempre; Flechazo y entrada, si hay dónde.
CREATE OR REPLACE FUNCTION public.platform_events_swipe_off()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.is_platform) THEN
        NEW.entry_method := 'location';
        NEW.entry_enabled := NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL;
        NEW.swipe_enabled := NEW.entry_enabled;
    END IF;
    RETURN NEW;
END;
$function$;

-- Entrar por ubicación: las de Fiestea y las de negocios que lo eligen.
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
    IF NOT FOUND OR NOT (v_venue.is_platform OR v_event.entry_method = 'location') THEN
        -- El negocio ha elegido que se entre con su QR o su código.
        RAISE EXCEPTION 'CODE_REQUIRED';
    END IF;
    -- Con la entrada apagada no se entra de ninguna forma (111).
    IF NOT COALESCE(v_event.entry_enabled, TRUE) THEN
        RAISE EXCEPTION 'ENTRY_DISABLED';
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

    -- Sin QR, la ubicación es la única prueba de que estás allí: siempre se mira.
    v_radius := COALESCE(v_venue.event_radius, 300);
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

    UPDATE public.profiles SET latitude = p_latitude, longitude = p_longitude WHERE id = v_profile_id;

    RETURN QUERY SELECT
        v_event.id, v_event.name, v_venue.id, v_venue.name, v_venue.type, v_radius,
        v_event.start_date, v_event.end_date, v_distance;
END;
$function$;

REVOKE ALL ON FUNCTION public.enter_platform_event_inner(uuid, double precision, double precision, double precision, boolean) FROM PUBLIC, anon, authenticated;

-- Ajustes de la fiesta: ahora también cómo se entra.
DROP FUNCTION IF EXISTS public.set_event_live_settings(uuid, boolean, boolean, boolean, boolean);
CREATE OR REPLACE FUNCTION public.set_event_live_settings(
    p_event_id uuid,
    p_swipe boolean,
    p_headcount boolean,
    p_gender boolean,
    p_entry boolean DEFAULT NULL::boolean,
    p_entry_method text DEFAULT NULL::text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Son decisiones del negocio: propietario o administración.
    IF NOT COALESCE(
        public.is_admin()
        OR (COALESCE(public.current_venue_role(), '') = 'owner'
            AND EXISTS (SELECT 1 FROM public.events e
                        WHERE e.id = p_event_id AND e.venue_id = public.current_venue_id())),
        FALSE
    ) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF p_entry_method IS NOT NULL AND p_entry_method NOT IN ('code', 'location') THEN
        RAISE EXCEPTION 'INVALID_ENTRY_METHOD';
    END IF;
    -- Sólo por ubicación hace falta saber dónde es la fiesta.
    IF p_entry_method = 'location' AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event_id AND (e.latitude IS NULL OR e.longitude IS NULL)
    ) THEN
        RAISE EXCEPTION 'EVENT_WITHOUT_LOCATION';
    END IF;

    UPDATE public.events
    SET entry_enabled = COALESCE(p_entry, entry_enabled),
        swipe_enabled = COALESCE(p_swipe, swipe_enabled),
        show_headcount = COALESCE(p_headcount, show_headcount),
        show_gender_split = COALESCE(p_gender, show_gender_split),
        entry_method = COALESCE(p_entry_method, entry_method)
    WHERE id = p_event_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_event_live_settings(uuid, boolean, boolean, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_live_settings(uuid, boolean, boolean, boolean, boolean, text) TO authenticated, service_role;

-- Si a una fiesta de Fiestea le llegan las coordenadas después (edición o
-- escáner), se enciende la entrada por ubicación y el Flechazo; si las pierde,
-- se apagan. Sólo al cambiar la ubicación: no pisa lo que se toque a mano.
CREATE OR REPLACE FUNCTION public.platform_events_location_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF (NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL)
       IS DISTINCT FROM (OLD.latitude IS NOT NULL AND OLD.longitude IS NOT NULL)
       AND EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.is_platform) THEN
        NEW.entry_method := 'location';
        NEW.entry_enabled := NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL;
        NEW.swipe_enabled := NEW.entry_enabled;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_events_location_changed() FROM PUBLIC, anon, authenticated;

-- Antes que `events_swipe_needs_entry` (van por orden alfabético).
DROP TRIGGER IF EXISTS events_platform_location_changed ON public.events;
CREATE TRIGGER events_platform_location_changed
    BEFORE UPDATE OF latitude, longitude ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.platform_events_location_changed();
