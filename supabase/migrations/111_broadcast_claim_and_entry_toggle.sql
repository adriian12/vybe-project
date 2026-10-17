-- ============================================================================
-- 111 · Novedades sin repetir y «Entrar al evento» opcional
-- ============================================================================
-- Novedades (avisos generales):
--   · El programador llama a `notify-events` cada minuto y `pg_net` cortaba a
--     los 5 s. Una novedad de administración va a todo el mundo, una persona
--     detrás de otra: la función moría antes de marcarla como enviada y la
--     siguiente pasada la volvía a mandar desde el principio.
--   · Ahora cada pasada se queda los avisos antes de enviarlos
--     (`claim_broadcasts`: `pending` → `sending`), así que un aviso sale una
--     vez aunque la función muera a medias. Los que se quedan en `sending` más
--     de media hora pasan a `failed`, no se reintentan.
--   · `broadcast_recipients` sólo devuelve a quien tiene algún dispositivo: a
--     los demás no hay a dónde mandar nada.
--   · La llamada del programador espera hasta 2 minutos.
--
-- «Entrar al evento» (`events.entry_enabled`):
--   · Encendido (lo normal), la ficha ofrece «Voy a ir» y, cuando el evento
--     empieza o queda poco, «Entrar ahora».
--   · Apagado, sólo «Voy a ir» (y las entradas si las hay): nadie entra con
--     QR, código ni ubicación, y el swipe se apaga con él, porque sin entrar
--     nadie sale en el tablón.
--   · Los avisos «ha empezado» y «se está llenando» siguen llegando a quien
--     dijo «voy a ir»; sin entrada, abren la ficha y no la pantalla de entrar.
--   · Las fiestas de Fiestea nacen como hasta ahora (con ubicación, entrada y
--     swipe encendidos; sin ella, apagados) y administración puede encender o
--     apagar cualquiera de sus ajustes. Allí se entra por ubicación.
-- ============================================================================

-- ------------------------------------------------------------ novedades
ALTER TABLE public.broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE public.broadcasts ADD CONSTRAINT broadcasts_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));

-- Las que se estaban repitiendo: ya han llegado (varias veces).
UPDATE public.broadcasts
SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), recipients = COALESCE(recipients, 0)
WHERE status = 'pending'
  AND scheduled_at IS NULL
  AND created_at < NOW() - INTERVAL '10 minutes';

CREATE OR REPLACE FUNCTION public.claim_broadcasts(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (id UUID, title TEXT, body TEXT, url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.broadcasts b
    SET status = 'failed'
    WHERE b.status = 'sending'
      AND COALESCE(b.scheduled_at, b.created_at) < NOW() - INTERVAL '30 minutes';

    RETURN QUERY
    UPDATE public.broadcasts b
    SET status = 'sending'
    WHERE b.id IN (
        SELECT c.id FROM public.broadcasts c
        WHERE c.status = 'pending'
          AND (c.scheduled_at IS NULL OR c.scheduled_at <= NOW())
        ORDER BY c.created_at
        LIMIT GREATEST(COALESCE(p_limit, 10), 1)
        FOR UPDATE SKIP LOCKED
    )
    RETURNING b.id, b.title, b.body, b.url;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_broadcasts(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broadcasts(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.broadcast_recipients(p_broadcast_id uuid)
 RETURNS TABLE(profile_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    b public.broadcasts%ROWTYPE;
BEGIN
    SELECT * INTO b FROM public.broadcasts WHERE id = p_broadcast_id AND status IN ('pending', 'sending');
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF b.audience IS DISTINCT FROM 'inside' THEN
        RETURN QUERY
        SELECT m.profile_id FROM public.audience_members(b.venue_id, b.audience, b.event_id) m
        WHERE EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.profile_id = m.profile_id);
        RETURN;
    END IF;

    RETURN QUERY
    SELECT p.id
    FROM public.profiles p
    WHERE p.status = 'active'
      AND p.notify_events
      AND EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.profile_id = p.id)
      AND (
          b.event_id IS NULL
          OR EXISTS (
              SELECT 1 FROM public.event_attendance ea
              WHERE ea.event_id = b.event_id
                AND ea.profile_id = p.id
                AND ea.left_at IS NULL
                AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
          )
      );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_event_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_secret TEXT;
    v_url TEXT;
BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'push_hook_secret';

    IF v_secret IS NULL THEN
        -- Un aviso en el registro y nada más: que falte el secreto no debe
        -- llenar de errores el programador cada cinco minutos.
        RAISE WARNING 'Sin push_hook_secret en Vault: no se envían notificaciones.';
        RETURN;
    END IF;

    -- La URL se deduce del propio proyecto para que la tarea siga valiendo si
    -- se restaura en otro.
    SELECT COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_url'),
        'https://' || current_setting('app.settings.project_ref', TRUE) || '.supabase.co/functions/v1'
    ) INTO v_url;

    IF v_url IS NULL OR v_url LIKE 'https://.%' THEN
        RAISE WARNING 'No se pudo determinar la URL de las funciones.';
        RETURN;
    END IF;

    -- Con los 5 s por defecto, una novedad a todo el mundo no terminaba.
    PERFORM net.http_post(
        url := v_url || '/notify-events',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', v_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
    );
END;
$function$;

-- ------------------------------------------------------ entrar al evento
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS entry_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Fiestas de Fiestea: hasta ahora el swipe hacía también de «se puede entrar».
UPDATE public.events e
SET entry_enabled = e.swipe_enabled
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
        NEW.entry_enabled := NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL;
        NEW.swipe_enabled := NEW.entry_enabled;
    END IF;
    RETURN NEW;
END;
$function$;

-- Sin entrada no hay swipe. Corre después de `events_platform_swipe_off`
-- (los disparadores van por orden alfabético).
CREATE OR REPLACE FUNCTION public.events_swipe_needs_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT NEW.entry_enabled THEN
        NEW.swipe_enabled := FALSE;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.events_swipe_needs_entry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS events_swipe_needs_entry ON public.events;
CREATE TRIGGER events_swipe_needs_entry
    BEFORE INSERT OR UPDATE OF entry_enabled, swipe_enabled ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.events_swipe_needs_entry();

-- Entrar (código, QR o ubicación) es poner una asistencia sin `left_at`. Las
-- de expulsar llevan `left_at` y no se tocan; el latido no cambia `left_at`.
CREATE OR REPLACE FUNCTION public.event_attendance_needs_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.left_at IS NULL
       AND (TG_OP = 'INSERT' OR OLD.left_at IS NOT NULL)
       AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = NEW.event_id AND NOT e.entry_enabled) THEN
        RAISE EXCEPTION 'ENTRY_DISABLED';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.event_attendance_needs_entry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS event_attendance_needs_entry ON public.event_attendance;
CREATE TRIGGER event_attendance_needs_entry
    BEFORE INSERT OR UPDATE OF left_at ON public.event_attendance
    FOR EACH ROW EXECUTE FUNCTION public.event_attendance_needs_entry();

-- Ajustes: con la entrada. `p_entry` va al final y con valor por defecto para
-- que las versiones de la app que ya están instaladas sigan funcionando.
DROP FUNCTION IF EXISTS public.set_event_live_settings(UUID, BOOLEAN, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION public.set_event_live_settings(
    p_event_id UUID,
    p_swipe BOOLEAN,
    p_headcount BOOLEAN,
    p_gender BOOLEAN,
    p_entry BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    UPDATE public.events
    SET entry_enabled = COALESCE(p_entry, entry_enabled),
        swipe_enabled = COALESCE(p_swipe, swipe_enabled),
        show_headcount = COALESCE(p_headcount, show_headcount),
        show_gender_split = COALESCE(p_gender, show_gender_split)
    WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_live_settings(UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_live_settings(UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- Los avisos llevan si se puede entrar: sin entrada abren la ficha.
DROP FUNCTION IF EXISTS public.pending_event_pushes();

CREATE FUNCTION public.pending_event_pushes()
 RETURNS TABLE(profile_id uuid, event_id uuid, kind text, event_name text, venue_name text, inside bigint, vybes bigint, locale text, vibe_level text, entry_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH candidatos AS (
        SELECT
            ei.profile_id,
            e.id AS event_id,
            e.name AS event_name,
            v.name AS venue_name,
            e.start_date,
            e.entry_enabled,
            p.locale,
            public.vybe_inside(e.id) AS inside,
            (SELECT public.vibe_level_for(GREATEST(f.total, public.vybe_inside(e.id)), e.max_capacity)
             FROM public.fresh_headcount(e.id) f) AS vibe_level
        FROM public.event_intents ei
        JOIN public.events e ON e.id = ei.event_id
        JOIN public.venues v ON v.id = e.venue_id
        JOIN public.profiles p ON p.id = ei.profile_id
        WHERE e.start_date <= NOW()
          AND e.end_date > NOW()
          AND p.notify_events
          AND p.status = 'active'
          -- Quien ya está dentro no necesita que le digan que entre.
          AND NOT EXISTS (
              SELECT 1 FROM public.event_attendance ea
              WHERE ea.event_id = e.id AND ea.profile_id = ei.profile_id
          )
    ),
    dentro AS (
        SELECT
            ea.profile_id,
            e.id AS event_id,
            e.name AS event_name,
            v.name AS venue_name,
            p.locale,
            (SELECT COUNT(*) FROM public.connections c
              WHERE c.event_id = e.id
                AND (c.user_id_1 = ea.profile_id OR c.user_id_2 = ea.profile_id)) AS vybes
        FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        JOIN public.venues v ON v.id = e.venue_id
        JOIN public.profiles p ON p.id = ea.profile_id
        WHERE e.end_date > NOW()
          AND e.end_date <= NOW() + INTERVAL '30 minutes'
          AND e.start_date <= NOW() - INTERVAL '30 minutes'
          AND ea.last_seen_at > NOW() - INTERVAL '3 hours'
          AND p.notify_events
          AND p.status = 'active'
    )
    -- El evento acaba de abrir.
    SELECT c.profile_id, c.event_id, 'doors_open', c.event_name, c.venue_name,
           c.inside, 0::BIGINT, c.locale, c.vibe_level, c.entry_enabled
    FROM candidatos c
    WHERE c.start_date > NOW() - INTERVAL '90 minutes'
      AND NOT EXISTS (
          SELECT 1 FROM public.event_push_log l
          WHERE l.event_id = c.event_id AND l.profile_id = c.profile_id
            AND l.kind = 'doors_open'
      )

    UNION ALL

    -- Se está llenando: por el ambiente que da el local o, si no cuenta, por la
    -- gente con Vybe.
    SELECT c.profile_id, c.event_id, 'filling_up', c.event_name, c.venue_name,
           c.inside, 0::BIGINT, c.locale, c.vibe_level, c.entry_enabled
    FROM candidatos c
    WHERE c.start_date <= NOW() - INTERVAL '30 minutes'
      AND (c.vibe_level IN ('lively', 'almost_full', 'full')
           OR (c.vibe_level IS NULL AND c.inside >= public.filling_up_threshold()))
      AND NOT EXISTS (
          SELECT 1 FROM public.event_push_log l
          WHERE l.event_id = c.event_id AND l.profile_id = c.profile_id
            AND l.kind = 'filling_up'
      )

    UNION ALL

    -- Queda media hora.
    SELECT d.profile_id, d.event_id, 'ending_soon', d.event_name, d.venue_name,
           0::BIGINT, d.vybes, d.locale, NULL::TEXT, TRUE
    FROM dentro d
    WHERE NOT EXISTS (
        SELECT 1 FROM public.event_push_log l
        WHERE l.event_id = d.event_id AND l.profile_id = d.profile_id
          AND l.kind = 'ending_soon'
    )

    UNION ALL

    -- Queda una hora: los me gusta sin responder de esta fiesta desaparecen al
    -- terminar (098). `inside` lleva cuántos son, con el filtro «Quiero ver».
    SELECT r.profile_id, r.event_id, 'likes_expiring', r.event_name, r.venue_name,
           r.likes, 0::BIGINT, r.locale, NULL::TEXT, TRUE
    FROM (
        SELECT s.swiped_id AS profile_id, e.id AS event_id, e.name AS event_name,
               v.name AS venue_name, p.locale, COUNT(*) AS likes
        FROM public.swipes s
        JOIN public.events e ON e.id = s.event_id
        JOIN public.venues v ON v.id = e.venue_id
        JOIN public.profiles p ON p.id = s.swiped_id
        JOIN public.profiles l ON l.id = s.swiper_id
        WHERE s.swipe_type IN ('like', 'super_like')
          AND e.end_date > NOW()
          AND e.end_date <= NOW() + INTERVAL '60 minutes'
          AND p.status = 'active'
          AND p.notify_events
          AND l.status = 'active'
          AND l.is_verified = TRUE
          AND public.wants_gender(COALESCE(p.wants, 'all'), l.gender)
          AND NOT public.are_connected(s.swiped_id, s.swiper_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.swipes mine
              WHERE mine.swiper_id = s.swiped_id AND mine.swiped_id = s.swiper_id
          )
        GROUP BY s.swiped_id, e.id, e.name, v.name, p.locale
    ) r
    WHERE NOT EXISTS (
        SELECT 1 FROM public.event_push_log lg
        WHERE lg.event_id = r.event_id AND lg.profile_id = r.profile_id
          AND lg.kind = 'likes_expiring'
    );
$function$;

REVOKE ALL ON FUNCTION public.pending_event_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_event_pushes() TO service_role;
