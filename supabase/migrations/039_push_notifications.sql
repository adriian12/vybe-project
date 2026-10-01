-- =============================================================================
-- 039 · Avisos push de mensajes, matches y final de evento
-- =============================================================================
--
-- `send-push` sabía convertir una fila nueva de `messages` o de `connections`
-- en un aviso, pero nada se la mandaba: el «Database Webhook» que describía su
-- comentario nunca se creó. Resultado: ni el mensaje ni el vybe match avisaban
-- a quien tenía la app cerrada.
--
-- Aquí se hace con disparadores que llaman a la función por `pg_net`, igual que
-- el programador de `trigger_event_notifications()` y con los mismos secretos
-- de Vault (`push_hook_secret` y `functions_url`). `net.http_post` sólo encola
-- la petición: el INSERT no espera a Firebase ni falla si Firebase falla.
--
-- Además, un aviso nuevo de evento: `ending_soon`, media hora antes del cierre,
-- para quien está dentro. Es cuando hay que escribir a los vybes de la noche y
-- pulsar «Conservar», porque las conversaciones caducan 24 h después.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Llamada a send-push
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_webhook(p_body JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret TEXT;
    v_url TEXT;
BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'push_hook_secret';

    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'functions_url';

    -- Sin configuración no hay aviso, pero el mensaje o el match se guardan.
    IF v_secret IS NULL OR v_url IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := v_url || '/send-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', v_secret
        ),
        body := p_body
    );
EXCEPTION WHEN OTHERS THEN
    -- Un aviso que no sale nunca puede tumbar el INSERT que lo provoca.
    RAISE WARNING 'push_webhook: %', SQLERRM;
END;
$$;

-- Sólo la base de datos la llama. Con permiso de ejecución, cualquiera con la
-- anon key podría mandar avisos a quien quisiera.
REVOKE ALL ON FUNCTION public.push_webhook(JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mensaje nuevo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'INSERT',
        'table', 'messages',
        'record', jsonb_build_object(
            'id', NEW.id,
            'sender_id', NEW.sender_id,
            'receiver_id', NEW.receiver_id,
            'content', LEFT(NEW.content, 200)
        )
    ));
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.push_on_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_on_message ON public.messages;
CREATE TRIGGER push_on_message
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.push_on_message();

-- ---------------------------------------------------------------------------
-- Vybe match
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_on_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'INSERT',
        'table', 'connections',
        'record', jsonb_build_object(
            'id', NEW.id,
            'user_id_1', NEW.user_id_1,
            'user_id_2', NEW.user_id_2,
            'connection_type', NEW.connection_type,
            'event_id', NEW.event_id
        )
    ));
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.push_on_connection() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_on_connection ON public.connections;
CREATE TRIGGER push_on_connection
    AFTER INSERT ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.push_on_connection();

-- ---------------------------------------------------------------------------
-- Avisos de evento: el nuevo `ending_soon`
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_push_log DROP CONSTRAINT IF EXISTS event_push_log_kind_check;
ALTER TABLE public.event_push_log
    ADD CONSTRAINT event_push_log_kind_check
    CHECK (kind IN ('doors_open', 'filling_up', 'ending_soon', 'broadcast'));

-- Cambia lo que devuelve (idioma y vybes de la noche), así que hay que borrarla.
DROP FUNCTION IF EXISTS public.pending_event_pushes();

CREATE FUNCTION public.pending_event_pushes()
RETURNS TABLE (
    profile_id UUID,
    event_id UUID,
    kind TEXT,
    event_name TEXT,
    venue_name TEXT,
    inside BIGINT,
    vybes BIGINT,
    locale TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH candidatos AS (
        SELECT
            ei.profile_id,
            e.id AS event_id,
            e.name AS event_name,
            v.name AS venue_name,
            e.start_date,
            p.locale,
            (SELECT COUNT(*) FROM public.event_attendance ea
              WHERE ea.event_id = e.id
                AND ea.last_seen_at > NOW() - INTERVAL '2 hours') AS inside
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
        -- Quien ha entrado y sigue por allí (la app da señales cada pocos
        -- minutos mientras está abierta; tres horas cubren el móvil en el
        -- bolsillo).
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
          -- Un evento de menos de una hora no necesita cuenta atrás.
          AND e.start_date <= NOW() - INTERVAL '30 minutes'
          AND ea.last_seen_at > NOW() - INTERVAL '3 hours'
          AND p.notify_events
          AND p.status = 'active'
    )
    -- El evento acaba de abrir.
    SELECT c.profile_id, c.event_id, 'doors_open', c.event_name, c.venue_name,
           c.inside, 0::BIGINT, c.locale
    FROM candidatos c
    WHERE c.start_date > NOW() - INTERVAL '90 minutes'
      AND NOT EXISTS (
          SELECT 1 FROM public.event_push_log l
          WHERE l.event_id = c.event_id AND l.profile_id = c.profile_id
            AND l.kind = 'doors_open'
      )

    UNION ALL

    -- Ya hay gente dentro y esta persona sigue fuera.
    SELECT c.profile_id, c.event_id, 'filling_up', c.event_name, c.venue_name,
           c.inside, 0::BIGINT, c.locale
    FROM candidatos c
    WHERE c.inside >= public.filling_up_threshold()
      AND c.start_date <= NOW() - INTERVAL '30 minutes'
      AND NOT EXISTS (
          SELECT 1 FROM public.event_push_log l
          WHERE l.event_id = c.event_id AND l.profile_id = c.profile_id
            AND l.kind = 'filling_up'
      )

    UNION ALL

    -- Queda media hora.
    SELECT d.profile_id, d.event_id, 'ending_soon', d.event_name, d.venue_name,
           0::BIGINT, d.vybes, d.locale
    FROM dentro d
    WHERE NOT EXISTS (
        SELECT 1 FROM public.event_push_log l
        WHERE l.event_id = d.event_id AND l.profile_id = d.profile_id
          AND l.kind = 'ending_soon'
    );
$$;

REVOKE ALL ON FUNCTION public.pending_event_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_event_pushes() TO service_role;
