-- ============================================================================
-- 127 · «Dentro» es lo mismo que «Volver a la fiesta»
-- ============================================================================
-- La app enseña «Volver a la fiesta» a quien entró, no ha salido ni le han
-- expulsado, mientras la fiesta no termina (`get_my_active_event`). Los
-- sorteos, las promociones y los avisos del local pedían además haber abierto
-- la app hacía poco (90 minutos, 3 o 4 horas). Con el móvil en el bolsillo, un
-- sorteo programado salía «No había nadie dentro» y los avisos no llegaban a
-- gente que seguía en la fiesta.
--
-- `sigue_dentro()` es esa regla, y la usan:
--   · raffle_participants: quién entra en un sorteo (programado o a mano).
--   · broadcast_recipients: los avisos a «los que están dentro».
--   · claim_promotion: canjear una oferta.
--   · get_event_raffles: ver los sorteos de la fiesta.
--   · pending_event_pushes: «la fiesta acaba pronto» y similares.
-- Las estadísticas, el aforo y el tablón siguen mirando la actividad reciente
-- a propósito.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sigue_dentro(p_event_id uuid, p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(EXISTS (
        SELECT 1
        FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        WHERE ea.event_id = p_event_id
          AND ea.profile_id = p_profile_id
          AND ea.left_at IS NULL
          AND ea.expelled_at IS NULL
          AND e.end_date > NOW()
    ), FALSE);
$function$;

REVOKE ALL ON FUNCTION public.sigue_dentro(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.raffle_participants(p_raffle_id uuid)
 RETURNS TABLE(profile_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT ea.profile_id
    FROM public.event_raffles r
    JOIN public.event_attendance ea ON ea.event_id = r.event_id
    JOIN public.events e ON e.id = r.event_id
    JOIN public.profiles p ON p.id = ea.profile_id
    WHERE r.id = p_raffle_id
      AND ea.left_at IS NULL
      AND COALESCE(ea.mode, 'vyber') = 'vyber'
      AND p.account_type = 'vyber'
      AND p.status = 'active'
      -- Dentro como en «Volver a la fiesta»: entró, no ha salido ni le han
      -- expulsado y la fiesta no había terminado. Antes hacía falta haber
      -- abierto la app en la última hora y media, y un sorteo programado con
      -- los móviles en el bolsillo salía «No había nadie dentro».
      AND ea.expelled_at IS NULL
      AND e.end_date > COALESCE(r.entries_closed_at, NOW())
      AND (r.entries_closed_at IS NULL OR ea.checked_in_at <= r.entries_closed_at)
      AND NOT EXISTS (
          SELECT 1 FROM public.event_raffles o
          WHERE o.event_id = r.event_id
            AND o.id <> r.id
            AND o.winner_profile_id = ea.profile_id
      );
$function$;

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
          OR public.sigue_dentro(b.event_id, p.id)
      );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_promotion(p_promotion_id uuid)
 RETURNS TABLE(ticket_code text, title text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_promo RECORD;
    v_taken INTEGER;
    v_mine INTEGER;
    v_code TEXT;
    v_done BOOLEAN;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_promo FROM public.promotions WHERE id = p_promotion_id;
    IF NOT FOUND OR NOT v_promo.active OR v_promo.kind = 'prize' THEN
        RAISE EXCEPTION 'PROMOTION_NOT_FOUND';
    END IF;

    IF v_promo.starts_at IS NOT NULL AND NOW() < v_promo.starts_at THEN
        RAISE EXCEPTION 'PROMOTION_NOT_STARTED';
    END IF;

    IF v_promo.ends_at IS NOT NULL AND NOW() > v_promo.ends_at THEN
        RAISE EXCEPTION 'PROMOTION_ENDED';
    END IF;

    -- Hay que estar dentro del evento.
    IF NOT public.sigue_dentro(v_promo.event_id, v_profile_id) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    IF v_promo.kind = 'challenge' THEN
        SELECT cp.done INTO v_done FROM public.challenge_progress(p_promotion_id, v_profile_id) cp;
        IF NOT COALESCE(v_done, FALSE) THEN
            RAISE EXCEPTION 'CHALLENGE_NOT_DONE';
        END IF;
    END IF;

    IF v_promo.premium_only AND NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    IF v_promo.max_redemptions IS NOT NULL THEN
        SELECT COUNT(*) INTO v_taken
        FROM public.promotion_redemptions r WHERE r.promotion_id = p_promotion_id;

        IF v_taken >= v_promo.max_redemptions THEN
            RAISE EXCEPTION 'PROMOTION_EXHAUSTED';
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_mine
    FROM public.promotion_redemptions r
    WHERE r.promotion_id = p_promotion_id AND r.profile_id = v_profile_id;

    IF v_mine >= v_promo.max_per_person THEN
        RAISE EXCEPTION 'ALREADY_CLAIMED';
    END IF;

    v_code := public.issue_prize_ticket(p_promotion_id, v_profile_id);
    RETURN QUERY SELECT v_code, v_promo.title;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_raffles(p_event_id uuid)
 RETURNS TABLE(id uuid, prize text, description text, draw_at timestamp with time zone, status text, winner_name text, is_me boolean, ticket_code text, drawn_at timestamp with time zone, winner_code text, participants integer, entries_closed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_venue BOOLEAN := COALESCE(public.can_read_event_metrics(p_event_id), FALSE);
BEGIN
    IF NOT v_venue AND (v_profile IS NULL OR NOT public.sigue_dentro(p_event_id, v_profile)) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.id, r.prize, r.description, r.draw_at, r.status,
        btrim(w.name),
        r.winner_profile_id IS NOT NULL AND r.winner_profile_id = v_profile,
        CASE WHEN r.winner_profile_id = v_profile THEN
            (SELECT rr.ticket_code FROM public.promotion_redemptions rr
             WHERE rr.promotion_id = r.promotion_id AND rr.profile_id = v_profile LIMIT 1)
        END,
        r.drawn_at,
        CASE WHEN v_venue OR r.winner_profile_id = v_profile THEN r.winner_code END,
        -- Cuánta gente participa: sólo le interesa al local mientras decide.
        CASE WHEN v_venue AND r.status = 'scheduled' THEN public.raffle_participant_count(r.id) END,
        r.entries_closed_at
    FROM public.event_raffles r
    LEFT JOIN public.profiles w ON w.id = r.winner_profile_id
    WHERE r.event_id = p_event_id
      AND (v_venue OR r.status IN ('scheduled', 'drawn'))
    ORDER BY COALESCE(r.draw_at, r.created_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pending_event_pushes()
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
          AND ea.left_at IS NULL
          AND ea.expelled_at IS NULL
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

