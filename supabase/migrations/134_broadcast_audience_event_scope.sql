-- Avisos a «Dijeron que venían» y «Nunca han venido» de un evento concreto o
-- de todos los del negocio.
--
-- El evento es el `event_id` del aviso (el mismo que decide su enlace). Para
-- estos dos públicos, `event_id` nulo significa «todos los eventos».
--
-- · no_show («Dijeron que venían»):
--     - de un evento: marcaron «voy a ir» en él; si ya ha empezado, sólo los
--       que no han entrado. Antes de que empiece sirve de recordatorio.
--     - de todos: lo mismo con cualquier evento del negocio.
-- · never_came («Nunca han venido»), siempre entre los seguidores:
--     - de un evento: no estuvieron en ese evento.
--     - de todos: no han estado en ninguno (como hasta ahora).
--
-- Antes «Dijeron que venían» exigía un evento ya empezado
-- (NO_SHOW_NEEDS_STARTED_EVENT) y «Nunca han venido» ignoraba el evento.

CREATE OR REPLACE FUNCTION public.audience_members(p_venue_id uuid, p_audience text, p_event_id uuid)
RETURNS TABLE(profile_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT p.id
    FROM public.profiles p
    WHERE p.status = 'active'
      AND p.notify_events
      AND CASE p_audience
          WHEN 'followers' THEN EXISTS (
              SELECT 1 FROM public.venue_followers f WHERE f.venue_id = p_venue_id AND f.profile_id = p.id)
          WHEN 'regulars' THEN (
              SELECT COUNT(DISTINCT ea.event_id) FROM public.event_attendance ea
              JOIN public.events e ON e.id = ea.event_id
              WHERE e.venue_id = p_venue_id AND ea.profile_id = p.id AND NOT COALESCE(e.test_lab, FALSE)) >= 3
          WHEN 'no_show' THEN EXISTS (
              SELECT 1
              FROM public.event_intents i
              JOIN public.events e ON e.id = i.event_id
              WHERE i.profile_id = p.id
                AND e.venue_id = p_venue_id
                AND NOT COALESCE(e.test_lab, FALSE)
                AND (p_event_id IS NULL OR e.id = p_event_id)
                AND NOT (e.start_date < NOW() AND EXISTS (
                    SELECT 1 FROM public.event_attendance ea
                    WHERE ea.event_id = e.id AND ea.profile_id = p.id)))
          WHEN 'never_came' THEN EXISTS (
                  SELECT 1 FROM public.venue_followers f WHERE f.venue_id = p_venue_id AND f.profile_id = p.id)
              AND NOT EXISTS (SELECT 1 FROM public.event_attendance ea
                              JOIN public.events e ON e.id = ea.event_id
                              WHERE e.venue_id = p_venue_id AND ea.profile_id = p.id
                                AND (p_event_id IS NULL OR e.id = p_event_id))
          ELSE FALSE
      END;
$function$;

REVOKE ALL ON FUNCTION public.audience_members(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audience_members(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.queue_audience_broadcast(p_audience text, p_title text, p_body text, p_event_id uuid DEFAULT NULL::uuid, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID := public.current_venue_id();
    v_id UUID;
    v_recientes INTEGER;
    v_programados INTEGER;
BEGIN
    IF p_audience = 'inside' THEN
        RETURN public.queue_broadcast(p_title, p_body, p_event_id, NULL, p_scheduled_at);
    END IF;
    IF p_audience NOT IN ('followers', 'regulars', 'no_show', 'never_came') THEN
        RAISE EXCEPTION 'INVALID_AUDIENCE';
    END IF;
    IF v_venue IS NULL OR COALESCE(public.current_venue_role(), '') NOT IN ('owner') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT COALESCE(public.venue_has_feature(v_venue, 'segmented_broadcasts'), FALSE) THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    IF p_event_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND venue_id = v_venue) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF btrim(COALESCE(p_title, '')) = '' OR btrim(COALESCE(p_body, '')) = '' THEN
        RAISE EXCEPTION 'EMPTY_MESSAGE';
    END IF;
    IF p_scheduled_at IS NOT NULL AND p_scheduled_at < NOW() - INTERVAL '2 minutes' THEN
        RAISE EXCEPTION 'SCHEDULE_IN_PAST';
    END IF;

    -- Que un local no pueda bombardear a sus seguidores: 5 avisos de público al día.
    SELECT COUNT(*) INTO v_recientes FROM public.broadcasts
    WHERE venue_id = v_venue AND audience <> 'inside' AND created_at > NOW() - INTERVAL '24 hours';
    IF v_recientes >= 5 THEN
        RAISE EXCEPTION 'AUDIENCE_DAILY_LIMIT';
    END IF;

    IF p_scheduled_at IS NOT NULL THEN
        SELECT COUNT(*) INTO v_programados FROM public.broadcasts
        WHERE venue_id = v_venue AND status = 'pending' AND scheduled_at IS NOT NULL;
        IF v_programados >= public.venue_scheduled_broadcast_limit(v_venue) THEN
            RAISE EXCEPTION 'SCHEDULE_LIMIT';
        END IF;
    END IF;

    INSERT INTO public.broadcasts (event_id, venue_id, created_by, title, body, url, scheduled_at, audience)
    VALUES (
        p_event_id, v_venue, auth.uid(), btrim(p_title), btrim(p_body),
        CASE WHEN p_event_id IS NOT NULL THEN '/event/' || p_event_id ELSE '/local/' || v_venue END,
        p_scheduled_at, p_audience
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_audience_broadcast(text, text, text, uuid, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_audience_broadcast(text, text, text, uuid, timestamp with time zone) TO authenticated, service_role;
