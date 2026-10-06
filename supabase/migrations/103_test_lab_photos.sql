-- ============================================================================
-- 103 · Aurora Sessions recupera las fotos de sus perfiles de prueba
-- ============================================================================
-- Cuando Aurora se cerró por error (1 de octubre de 2026, véase la 099), además
-- de los me gusta, `purge_ended_event_photos()` le quitó la foto de la noche a
-- sus 50 perfiles de prueba. El tablón sólo enseña a quien tiene esa foto, así
-- que una cuenta nueva no veía a nadie. Se les devuelve (es su primera foto de
-- perfil, un enlace externo) y el borrado de fotos ya no toca salas de pruebas.
-- ============================================================================

UPDATE public.event_attendance ea
SET photo_url = p.photos[1],
    photo_taken_at = COALESCE(ea.photo_taken_at, NOW())
FROM public.profiles p, public.events e
WHERE p.id = ea.profile_id
  AND e.id = ea.event_id
  AND e.test_lab
  AND p.email LIKE '%@seed.vybe.test'
  AND ea.photo_url IS NULL
  AND cardinality(p.photos) > 0;

CREATE OR REPLACE FUNCTION public.purge_ended_event_photos(p_limit integer DEFAULT 200)
 RETURNS TABLE(path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH caducadas AS (
        SELECT ea.event_id, ea.profile_id, ea.photo_url
        FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        WHERE ea.photo_url IS NOT NULL
          AND e.end_date < NOW()
          -- Las salas de pruebas nunca pierden sus fotos (103).
          AND NOT COALESCE(e.test_lab, FALSE)
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
$function$;
