-- ============================================================================
-- 129 · Recordatorio de la fiesta
-- ============================================================================
-- Un aviso push antes de que abra una fiesta a la que vas: con entrada, en una
-- lista de invitados o con «voy a ir». Da igual que la cuenta sea Premium o
-- no. Cada persona elige cuánto antes en Perfil (por defecto, dos horas; 0 lo
-- apaga) y sale una sola vez por fiesta (`event_push_log`, tipo `reminder`).
--
-- La columna es privada: no entra en el `GRANT SELECT (…)` de `profiles`. A la
-- propia fila llega por `get_my_profile()` y se cambia con el UPDATE de
-- siempre.
--
-- `pending_event_pushes` devuelve además `pass` ('ticket', 'list' o NULL):
-- con entrada el aviso abre Entradas; si no, la ficha.
-- ============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS event_reminder_minutes SMALLINT NOT NULL DEFAULT 120;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_event_reminder_minutes_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_event_reminder_minutes_check
    CHECK (event_reminder_minutes IN (0, 60, 120, 240));

ALTER TABLE public.event_push_log DROP CONSTRAINT IF EXISTS event_push_log_kind_check;
ALTER TABLE public.event_push_log
    ADD CONSTRAINT event_push_log_kind_check
    CHECK (kind IN ('doors_open', 'filling_up', 'ending_soon', 'broadcast', 'likes_expiring', 'reminder'));

-- Cambia lo que devuelve (`pass`): hay que borrarla antes.
DROP FUNCTION IF EXISTS public.pending_event_pushes();

CREATE FUNCTION public.pending_event_pushes()
 RETURNS TABLE(profile_id uuid, event_id uuid, kind text, event_name text, venue_name text, inside bigint, vybes bigint, locale text, vibe_level text, entry_enabled boolean, pass text)
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
          AND ea.left_at IS NULL
          AND ea.expelled_at IS NULL
          AND p.notify_events
          AND p.status = 'active'
    )
    -- El evento acaba de abrir.
    SELECT c.profile_id, c.event_id, 'doors_open', c.event_name, c.venue_name,
           c.inside, 0::BIGINT, c.locale, c.vibe_level, c.entry_enabled, NULL::TEXT
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
           c.inside, 0::BIGINT, c.locale, c.vibe_level, c.entry_enabled, NULL::TEXT
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
           0::BIGINT, d.vybes, d.locale, NULL::TEXT, TRUE, NULL::TEXT
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
           r.likes, 0::BIGINT, r.locale, NULL::TEXT, TRUE, NULL::TEXT
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
    )

    UNION ALL

    -- Recordatorio (129): la fiesta abre dentro del margen que eligió cada
    -- uno. Una fila por persona y fiesta, con lo mejor que tenga: entrada,
    -- lista o «voy a ir». `inside` lleva los minutos que faltan.
    (SELECT DISTINCT ON (x.profile_id, x.event_id)
           x.profile_id, x.event_id, 'reminder', x.event_name, x.venue_name,
           x.minutos, 0::BIGINT, x.locale, NULL::TEXT, x.entry_enabled, x.pass
    FROM (
        SELECT q.profile_id, e.id AS event_id, e.name AS event_name, v.name AS venue_name,
               CEIL(EXTRACT(EPOCH FROM (e.start_date - NOW())) / 60)::BIGINT AS minutos,
               p.locale, e.entry_enabled, q.pass, q.prio
        FROM public.events e
        JOIN public.venues v ON v.id = e.venue_id
        JOIN (
            SELECT t.profile_id, t.event_id, 'ticket'::TEXT AS pass, 1 AS prio
            FROM public.tickets t WHERE t.status = 'valid'
            UNION ALL
            SELECT g.profile_id, g.event_id, 'list', 2
            FROM public.guest_list_entries g WHERE g.profile_id IS NOT NULL
            UNION ALL
            SELECT ei.profile_id, ei.event_id, NULL, 3
            FROM public.event_intents ei
        ) q ON q.event_id = e.id
        JOIN public.profiles p ON p.id = q.profile_id
        -- 240 es el margen más largo: sólo se miran las fiestas de las
        -- próximas cuatro horas.
        WHERE e.start_date > NOW()
          AND e.start_date <= NOW() + INTERVAL '240 minutes'
          AND p.event_reminder_minutes > 0
          AND e.start_date <= NOW() + make_interval(mins => p.event_reminder_minutes)
          AND p.notify_events
          AND p.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM public.event_push_log lg
              WHERE lg.event_id = e.id AND lg.profile_id = q.profile_id
                AND lg.kind = 'reminder'
          )
    ) x
    ORDER BY x.profile_id, x.event_id, x.prio);
$function$;

REVOKE ALL ON FUNCTION public.pending_event_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_event_pushes() TO service_role;
