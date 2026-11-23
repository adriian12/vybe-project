-- get_pending_moderation() devuelve score como double precision, pero la columna
-- moderation_queue.score es numeric: Postgres rechazaba la consulta (42804,
-- "Returned type numeric does not match expected type double precision in column 6")
-- y el panel de administración no podía cargar la cola de fotos pendientes.
-- Mismo cuerpo que en 029, con el cast explícito.
CREATE OR REPLACE FUNCTION public.get_pending_moderation(p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid, profile_id uuid, profile_name text, url text, kind text, score double precision,
              created_at timestamp with time zone, event_name text, urgent boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN';
    END IF;

    RETURN QUERY
    WITH en_marcha AS (
        -- A quién estamos haciendo esperar ahora mismo: dentro de un evento
        -- vivo y visto hace menos de dos horas.
        SELECT ea.profile_id, e.name AS event_name
        FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        WHERE e.start_date <= NOW()
          AND e.end_date > NOW()
          AND ea.last_seen_at > NOW() - INTERVAL '2 hours'
    )
    SELECT
        m.id,
        m.profile_id,
        p.name,
        m.url,
        m.kind,
        m.score::double precision,
        m.created_at,
        v.event_name,
        v.profile_id IS NOT NULL AS urgent
    FROM public.moderation_queue m
    JOIN public.profiles p ON p.id = m.profile_id
    LEFT JOIN en_marcha v ON v.profile_id = m.profile_id
    WHERE m.status = 'pending'
    ORDER BY
        -- Primero quien está esperando en la puerta.
        (v.profile_id IS NOT NULL) DESC,
        -- Dentro de eso, la verificación facial y la foto del evento antes que
        -- una foto de perfil, que no bloquea nada.
        CASE m.kind
            WHEN 'face_verification' THEN 0
            WHEN 'event_photo' THEN 1
            ELSE 2
        END,
        m.created_at
    LIMIT GREATEST(p_limit, 1);
END;
$function$;
