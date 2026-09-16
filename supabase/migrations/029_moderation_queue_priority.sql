-- ============================================================================
-- 029. La cola de moderación, por urgencia
-- ============================================================================
-- Se revisaba por orden de llegada. Pero no es lo mismo una foto de perfil
-- subida ayer por la tarde que la foto de esta noche de alguien que está de pie
-- en la puerta de una discoteca esperando para entrar al tablón: la primera
-- puede esperar a mañana y la segunda no puede esperar diez minutos.
--
-- Esta función devuelve la misma cola ordenada por lo que de verdad urge, y de
-- paso trae el tipo y el nombre del evento para que quien revisa entienda qué
-- está mirando.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pending_moderation(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    id UUID,
    profile_id UUID,
    profile_name TEXT,
    url TEXT,
    kind TEXT,
    score DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    event_name TEXT,
    urgent BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
        m.score,
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
$$;

REVOKE ALL ON FUNCTION public.get_pending_moderation(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_moderation(INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_pending_moderation IS
    'Cola de moderación ordenada por urgencia: primero quien está dentro de un evento en marcha esperando a entrar al tablón.';
