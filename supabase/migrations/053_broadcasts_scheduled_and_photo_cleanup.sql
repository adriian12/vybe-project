-- =============================================================================
-- 053 · Avisos programados · La foto dura lo que la fiesta · Match +1 h
-- =============================================================================
-- 1. El local puede programar un aviso para una hora concreta («Cerramos en 15
--    minutos…»). Uno programado en el plan Gratis y hasta 20 en Pro y Business.
--    Los inmediatos no cambian: salen en la siguiente pasada del programador.
-- 2. La foto con la que entras a una fiesta se borra al salir y cuando la
--    fiesta termina: es de esa noche y no tiene por qué sobrevivirla.
-- 3. Un vybe match dura una hora después del final del evento (antes 24 h),
--    salvo que alguien lo guarde con Premium (`expires_at IS NULL`). Y una
--    conexión caducada deja de valer en el momento, no cuando pasa la purga.
-- 4. «Vybe Test Night» queda como sala de pruebas con el código LAB777, sin
--    ubicación y para cualquier cuenta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Avisos programados
-- ---------------------------------------------------------------------------
ALTER TABLE public.broadcasts
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE public.broadcasts ADD CONSTRAINT broadcasts_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_broadcasts_pending
    ON public.broadcasts(status, scheduled_at);

/** Cuántos avisos programados puede tener a la vez un local. */
CREATE OR REPLACE FUNCTION public.venue_scheduled_broadcast_limit(p_venue_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE WHEN public.venue_plan(p_venue_id) = 'free' THEN 1 ELSE 20 END;
$$;

CREATE OR REPLACE FUNCTION public.queue_broadcast(
    p_title text,
    p_body text,
    p_event_id uuid DEFAULT NULL::uuid,
    p_url text DEFAULT NULL::text,
    p_scheduled_at timestamptz DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue_id UUID := public.current_venue_id();
    v_event_venue UUID;
    v_event_end TIMESTAMPTZ;
    v_id UUID;
    v_programados INTEGER;
    v_limite INTEGER;
BEGIN
    IF p_event_id IS NULL THEN
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'NOT_AUTHORIZED';
        END IF;
    ELSE
        SELECT e.venue_id, e.end_date INTO v_event_venue, v_event_end
        FROM public.events e WHERE e.id = p_event_id;

        IF v_event_venue IS NULL THEN
            RAISE EXCEPTION 'EVENT_NOT_FOUND';
        END IF;

        IF NOT public.is_admin() AND v_event_venue IS DISTINCT FROM v_venue_id THEN
            RAISE EXCEPTION 'NOT_AUTHORIZED';
        END IF;
    END IF;

    IF btrim(p_title) = '' OR btrim(p_body) = '' THEN
        RAISE EXCEPTION 'EMPTY_MESSAGE';
    END IF;

    IF p_scheduled_at IS NOT NULL THEN
        IF p_scheduled_at < NOW() - INTERVAL '2 minutes' THEN
            RAISE EXCEPTION 'SCHEDULE_IN_PAST';
        END IF;

        -- Después de la fiesta no queda nadie dentro a quien avisar.
        IF v_event_end IS NOT NULL AND p_scheduled_at > v_event_end THEN
            RAISE EXCEPTION 'SCHEDULE_AFTER_EVENT';
        END IF;

        IF v_event_venue IS NOT NULL THEN
            SELECT COUNT(*) INTO v_programados
            FROM public.broadcasts b
            WHERE b.venue_id = v_event_venue
              AND b.status = 'pending'
              AND b.scheduled_at IS NOT NULL;

            v_limite := public.venue_scheduled_broadcast_limit(v_event_venue);
            IF v_programados >= v_limite THEN
                RAISE EXCEPTION 'SCHEDULE_LIMIT';
            END IF;
        END IF;
    END IF;

    INSERT INTO public.broadcasts (event_id, venue_id, created_by, title, body, url, scheduled_at)
    VALUES (p_event_id, v_event_venue, auth.uid(), btrim(p_title), btrim(p_body), p_url, p_scheduled_at)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

/** Cancela un aviso programado que todavía no ha salido. */
CREATE OR REPLACE FUNCTION public.cancel_broadcast(p_broadcast_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue_id UUID := public.current_venue_id();
    v_owner UUID;
BEGIN
    SELECT b.venue_id INTO v_owner FROM public.broadcasts b WHERE b.id = p_broadcast_id;
    IF v_owner IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.is_admin() AND v_owner IS DISTINCT FROM v_venue_id THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.broadcasts
    SET status = 'cancelled'
    WHERE id = p_broadcast_id AND status = 'pending';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. La foto de la noche dura lo que la noche
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_event(p_event_id UUID)
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

    -- La foto con la que entraste se va contigo.
    UPDATE public.event_attendance
    SET left_at = NOW(),
        photo_url = NULL,
        photo_taken_at = NULL
    WHERE event_id = p_event_id AND profile_id = v_profile_id;

    DELETE FROM public.swipes s
    WHERE s.swiper_id = v_profile_id
      AND s.event_id = p_event_id
      AND s.swipe_type IN ('like', 'super_like')
      AND NOT public.are_connected(v_profile_id, s.swiped_id);
END;
$$;

/**
 * Quita las fotos de las fiestas que ya han terminado y devuelve sus ficheros
 * para que `notify-events` los borre de Storage. Sólo `service_role`.
 */
CREATE OR REPLACE FUNCTION public.purge_ended_event_photos(p_limit INTEGER DEFAULT 200)
RETURNS TABLE(path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH caducadas AS (
        SELECT ea.event_id, ea.profile_id, ea.photo_url
        FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        WHERE ea.photo_url IS NOT NULL
          AND e.end_date < NOW()
        LIMIT GREATEST(p_limit, 1)
    ), limpiadas AS (
        UPDATE public.event_attendance ea
        SET photo_url = NULL, photo_taken_at = NULL
        FROM caducadas c
        WHERE ea.event_id = c.event_id AND ea.profile_id = c.profile_id
        RETURNING c.photo_url
    )
    SELECT split_part(l.photo_url, '/event-photos/', 2)
    FROM limpiadas l
    WHERE l.photo_url LIKE '%/event-photos/%';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. El match dura una hora más que la fiesta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            -- Una hora después del final: lo que dura recoger el abrigo. Con
            -- Premium se puede guardar y entonces `expires_at` pasa a NULL.
            CASE WHEN v_end_date IS NOT NULL THEN v_end_date + INTERVAL '1 hour' END
        )
        ON CONFLICT (user_id_1, user_id_2) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;

-- Una conexión caducada deja de valer al momento, no cuando pasa la purga.
CREATE OR REPLACE FUNCTION public.are_connected(p_profile_a uuid, p_profile_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.connections
        WHERE ((user_id_1 = p_profile_a AND user_id_2 = p_profile_b)
            OR (user_id_1 = p_profile_b AND user_id_2 = p_profile_a))
          AND (expires_at IS NULL OR expires_at > NOW())
    );
$function$;

-- Las que ya existen y aún no han caducado se ajustan al mismo criterio.
UPDATE public.connections c
SET expires_at = e.end_date + INTERVAL '1 hour'
FROM public.events e
WHERE e.id = c.event_id
  AND c.expires_at IS NOT NULL
  AND c.expires_at > NOW()
  AND c.expires_at <> e.end_date + INTERVAL '1 hour';

-- ---------------------------------------------------------------------------
-- 4. «Vybe Test Night»: sala de pruebas con LAB777
-- ---------------------------------------------------------------------------
UPDATE public.events e
SET requires_location = FALSE,
    test_lab = TRUE,
    start_date = LEAST(e.start_date, NOW() - INTERVAL '1 hour'),
    end_date = GREATEST(e.end_date, TIMESTAMPTZ '2030-12-31 23:00:00+00')
WHERE e.name = 'Vybe Test Night';

UPDATE public.event_codes c
SET active = TRUE, expires_at = e.end_date
FROM public.events e
WHERE c.event_id = e.id
  AND e.name = 'Vybe Test Night'
  AND c.code = 'LAB777';

INSERT INTO public.event_codes (venue_id, event_id, code, expires_at, active, kind, label)
SELECT e.venue_id, e.id, 'LAB777', e.end_date, TRUE, 'general', 'Sala de pruebas'
FROM public.events e
WHERE e.name = 'Vybe Test Night'
  AND NOT EXISTS (SELECT 1 FROM public.event_codes c WHERE c.code = 'LAB777');

UPDATE public.event_attendance ea
SET last_seen_at = e.end_date, left_at = NULL
FROM public.events e, public.profiles p
WHERE e.id = ea.event_id
  AND p.id = ea.profile_id
  AND e.name = 'Vybe Test Night'
  AND p.email LIKE '%@seed.vybe.test';

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.queue_broadcast(TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_broadcast(TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_broadcast(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_broadcast(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.venue_scheduled_broadcast_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venue_scheduled_broadcast_limit(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.purge_ended_event_photos(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_ended_event_photos(INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.leave_event(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_event(UUID) TO authenticated;
