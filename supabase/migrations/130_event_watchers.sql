-- ============================================================================
-- 130 · «Avisarme»: últimas entradas
-- ============================================================================
-- Fase 3 del plan del fiester@. Corazón «Avisarme» en la ficha de una fiesta
-- (`event_watchers`, con `toggle_event_watch()`) y aviso push cuando a un tipo
-- de entrada le queda el 15 % o menos. Lo reciben quien pulsó «Avisarme» y los
-- seguidores del local, salvo que ya tengan entrada; una vez por fiesta
-- (`event_push_log`, tipo `last_tickets`).
--
-- Interruptor «Entradas y precios» en Perfil: `profiles.notify_tickets`
-- (privada, fuera del `GRANT SELECT`, como `event_reminder_minutes`).
--
-- El aviso de bajada de precio o de tramo nuevo depende de los tramos de
-- precio del plan del negocio (fase 1), que aún no existen.
-- ============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS notify_tickets BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.event_watchers (
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_event_watchers_profile ON public.event_watchers(profile_id);

ALTER TABLE public.event_watchers ENABLE ROW LEVEL SECURITY;

-- Cada uno ve los suyos; se escriben sólo con la RPC.
DROP POLICY IF EXISTS event_watchers_select_own ON public.event_watchers;
CREATE POLICY event_watchers_select_own ON public.event_watchers
    FOR SELECT TO authenticated
    USING (profile_id = public.current_profile_id());

REVOKE ALL ON public.event_watchers FROM PUBLIC, anon;
GRANT SELECT ON public.event_watchers TO authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.event_watchers;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR DELETE OR UPDATE ON public.event_watchers
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- Pone o quita «Avisarme». Devuelve cómo queda.
CREATE OR REPLACE FUNCTION public.toggle_event_watch(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := public.current_profile_id();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF EXISTS (SELECT 1 FROM public.event_watchers WHERE event_id = p_event_id AND profile_id = v_me) THEN
        DELETE FROM public.event_watchers WHERE event_id = p_event_id AND profile_id = v_me;
        RETURN FALSE;
    END IF;

    IF NOT COALESCE((SELECT e.end_date > NOW() FROM public.events e WHERE e.id = p_event_id), FALSE) THEN
        RAISE EXCEPTION 'EVENT_NOT_AVAILABLE';
    END IF;

    INSERT INTO public.event_watchers (event_id, profile_id) VALUES (p_event_id, v_me)
    ON CONFLICT DO NOTHING;
    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_event_watch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_event_watch(UUID) TO authenticated;

ALTER TABLE public.event_push_log DROP CONSTRAINT IF EXISTS event_push_log_kind_check;
ALTER TABLE public.event_push_log
    ADD CONSTRAINT event_push_log_kind_check
    CHECK (kind IN ('doors_open', 'filling_up', 'ending_soon', 'broadcast', 'likes_expiring', 'reminder', 'last_tickets'));

CREATE OR REPLACE FUNCTION public.pending_event_pushes()
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
    ORDER BY x.profile_id, x.event_id, x.prio)

    UNION ALL

    -- Últimas entradas (130): a un tipo de entrada a la venta le queda el 15 %
    -- o menos. A quien pulsó «Avisarme» y a los seguidores del local, si no
    -- tienen ya entrada. Una vez por fiesta. `inside` lleva cuántas quedan.
    -- Como mucho 500 por pasada: el resto sale en la siguiente (cada minuto).
    (SELECT DISTINCT ON (w.profile_id, w.event_id)
           w.profile_id, w.event_id, 'last_tickets', w.event_name, w.venue_name,
           w.quedan, 0::BIGINT, w.locale, NULL::TEXT, w.entry_enabled, NULL::TEXT
    FROM (
        SELECT q.profile_id, a.event_id, a.event_name, a.venue_name, a.quedan,
               p.locale, a.entry_enabled
        FROM (
            SELECT e.id AS event_id, e.name AS event_name, v.name AS venue_name,
                   e.venue_id, e.entry_enabled,
                   MIN(tt.capacity - public.ticket_type_taken(tt.id))::BIGINT AS quedan
            FROM public.ticket_types tt
            JOIN public.events e ON e.id = tt.event_id
            JOIN public.venues v ON v.id = e.venue_id
            WHERE tt.kind = 'entry'
              AND tt.active
              AND tt.deleted_at IS NULL
              AND tt.capacity >= 20
              AND (tt.sales_start_at IS NULL OR tt.sales_start_at <= NOW())
              AND (tt.sales_end_at IS NULL OR tt.sales_end_at > NOW())
              AND e.end_date > NOW()
              AND NOT COALESCE(e.test_lab, FALSE)
              AND (v.is_verified OR COALESCE(v.is_platform, FALSE))
              AND tt.capacity - public.ticket_type_taken(tt.id) > 0
              AND tt.capacity - public.ticket_type_taken(tt.id) <= CEIL(tt.capacity * 0.15)
            GROUP BY e.id, e.name, v.name, e.venue_id, e.entry_enabled
        ) a
        JOIN (
            SELECT ew.profile_id, ew.event_id, NULL::UUID AS venue_id FROM public.event_watchers ew
            UNION ALL
            SELECT vf.profile_id, NULL::UUID, vf.venue_id FROM public.venue_followers vf
        ) q ON q.event_id = a.event_id OR q.venue_id = a.venue_id
        JOIN public.profiles p ON p.id = q.profile_id
        WHERE p.status = 'active'
          AND p.notify_events
          AND p.notify_tickets
          AND NOT EXISTS (
              SELECT 1 FROM public.tickets t
              WHERE t.event_id = a.event_id AND t.profile_id = q.profile_id AND t.status = 'valid'
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.event_push_log lg
              WHERE lg.event_id = a.event_id AND lg.profile_id = q.profile_id
                AND lg.kind = 'last_tickets'
          )
    ) w
    ORDER BY w.profile_id, w.event_id
    LIMIT 500);
$function$;

REVOKE ALL ON FUNCTION public.pending_event_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_event_pushes() TO service_role;
