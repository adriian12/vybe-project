-- =============================================================================
-- 055 · Modo invitado
-- =============================================================================
-- Al entrar en una fiesta se elige cómo entrar:
--
--   · **Vyber**: como hasta ahora. Foto del momento, sales en el tablón y
--     puedes deslizar.
--   · **Invitado**: sin foto. Ve las ofertas, los sorteos y los avisos del
--     local, pero **no ve el tablón ni aparece en él**. Hay quien sale a tomar
--     algo y no quiere salir en ninguna lista.
--
-- Se puede cambiar de modo durante la noche. Al pasar a invitado se borra la
-- foto de esa noche y los likes que no llegaron a match, igual que al salir.
--
-- `mode` es NULL mientras no se ha elegido: así la app sabe que tiene que
-- preguntar. Quien ya estaba dentro antes de este cambio se queda como vyber.
-- =============================================================================

ALTER TABLE public.event_attendance
    ADD COLUMN IF NOT EXISTS mode TEXT;

ALTER TABLE public.event_attendance DROP CONSTRAINT IF EXISTS event_attendance_mode_check;
ALTER TABLE public.event_attendance ADD CONSTRAINT event_attendance_mode_check
    CHECK (mode IS NULL OR mode IN ('vyber', 'guest'));

-- Quien ya tiene foto estaba en el tablón: es un vyber.
UPDATE public.event_attendance SET mode = 'vyber' WHERE mode IS NULL AND photo_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_event_mode(p_event_id UUID, p_mode TEXT)
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
    IF p_mode NOT IN ('vyber', 'guest') THEN
        RAISE EXCEPTION 'INVALID_MODE';
    END IF;

    UPDATE public.event_attendance
    SET mode = p_mode,
        -- Como invitado no se sale en el tablón: la foto de esta noche se va.
        photo_url = CASE WHEN p_mode = 'guest' THEN NULL ELSE photo_url END,
        photo_taken_at = CASE WHEN p_mode = 'guest' THEN NULL ELSE photo_taken_at END
    WHERE event_id = p_event_id AND profile_id = v_profile_id AND left_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    -- Y los likes de esta fiesta que no llegaron a match tampoco tienen sentido.
    IF p_mode = 'guest' THEN
        DELETE FROM public.swipes s
        WHERE s.swiper_id = v_profile_id
          AND s.event_id = p_event_id
          AND s.swipe_type IN ('like', 'super_like')
          AND NOT public.are_connected(v_profile_id, s.swiped_id);
    END IF;
END;
$$;

-- El evento activo dice en qué modo estás (NULL: todavía no lo has elegido).
DROP FUNCTION IF EXISTS public.get_my_active_event();
CREATE FUNCTION public.get_my_active_event()
 RETURNS TABLE(event_id uuid, event_name text, venue_id uuid, venue_name text, venue_type text, event_radius integer, start_date timestamp with time zone, end_date timestamp with time zone, checked_in_at timestamp with time zone, latitude double precision, longitude double precision, photo_url text, mode text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        e.id, e.name, v.id, v.name, v.type,
        COALESCE(v.event_radius, 50),
        e.start_date, e.end_date, ea.checked_in_at,
        COALESCE(e.latitude, v.latitude),
        COALESCE(e.longitude, v.longitude),
        ea.photo_url,
        ea.mode
    FROM public.event_attendance ea
    JOIN public.events e ON e.id = ea.event_id
    JOIN public.venues v ON v.id = e.venue_id
    WHERE ea.profile_id = public.current_profile_id()
      AND ea.left_at IS NULL
      AND e.end_date > NOW()
    ORDER BY ea.last_seen_at DESC
    LIMIT 1;
$function$;

-- La foto sólo la guarda quien entra como vyber.
CREATE OR REPLACE FUNCTION public.set_event_photo(p_event_id uuid, p_photo_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.moderation_queue mq
        WHERE mq.profile_id = v_profile_id
          AND mq.url = p_photo_url
          AND mq.kind = 'event_photo'
          AND mq.status = 'approved'
    ) THEN
        RAISE EXCEPTION 'PHOTO_NOT_APPROVED';
    END IF;

    UPDATE public.event_attendance
    SET photo_url = p_photo_url, photo_taken_at = NOW(), mode = 'vyber'
    WHERE event_id = p_event_id AND profile_id = v_profile_id AND left_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_event_mode(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_mode(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_active_event() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_active_event() TO authenticated;
REVOKE ALL ON FUNCTION public.set_event_photo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_photo(UUID, TEXT) TO authenticated;
