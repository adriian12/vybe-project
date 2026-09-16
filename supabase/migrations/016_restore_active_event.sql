-- ============================================================================
-- 016 — Recuperar el evento en curso, y guardar la foto de esa noche
--
-- El evento activo se guardaba sólo en `localStorage`, así que cerrar sesión
-- —o abrir la aplicación en otro teléfono— te dejaba fuera de una fiesta en la
-- que seguías estando. La fuente de verdad es el check-in, que vive en el
-- servidor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_active_event()
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    venue_id UUID,
    venue_name TEXT,
    venue_type TEXT,
    event_radius INTEGER,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    photo_url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        e.id, e.name, v.id, v.name, v.type,
        COALESCE(v.event_radius, 50),
        e.start_date, e.end_date, ea.checked_in_at,
        COALESCE(e.latitude, v.latitude),
        COALESCE(e.longitude, v.longitude),
        ea.photo_url
    FROM public.event_attendance ea
    JOIN public.events e ON e.id = ea.event_id
    JOIN public.venues v ON v.id = e.venue_id
    WHERE ea.profile_id = public.current_profile_id()
      AND e.end_date > NOW()
    ORDER BY ea.last_seen_at DESC
    LIMIT 1;
$$;

/** Guarda la foto que la persona se hace al entrar al evento. */
CREATE OR REPLACE FUNCTION public.set_event_photo(p_event_id UUID, p_photo_url TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    UPDATE public.event_attendance
    SET photo_url = p_photo_url, photo_taken_at = NOW()
    WHERE event_id = p_event_id AND profile_id = v_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;
END;
$$;

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('get_my_active_event', 'set_event_photo')
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

COMMENT ON FUNCTION public.get_my_active_event IS
    'Evento en el que sigue estando el usuario. Permite recuperar la sesión de fiesta tras cerrar sesión o cambiar de dispositivo.';
