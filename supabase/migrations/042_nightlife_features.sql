-- =============================================================================
-- 042 · Noche en directo: termómetro, Lista Vybe, sorteos, retos, canciones,
--       tarjeta de sellos, «¿dónde seguimos?», informe semanal y cierre de puerta
-- =============================================================================
--
-- Todo lo que hace que un local quiera Vybe y que la gente elija los locales con
-- Vybe, montado sobre lo que ya había: la asistencia verificada por GPS y QR
-- (`event_attendance`), las promociones y sus vales (`promotions`,
-- `promotion_redemptions`, que se validan en barra con
-- `validate_promotion_ticket`) y los avisos push (`push_webhook`, 039).
--
-- Los premios (sorteos, tarjeta de sellos) son promociones de tipo `prize`: no
-- se piden, se reciben, y el vale sale en «Entradas» y se valida en barra igual
-- que cualquier otro. Los retos son promociones de tipo `challenge`: el vale
-- sólo se entrega si el servidor comprueba que se ha cumplido.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Eventos: puerta, termómetro, sellos y canciones
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS entry_closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stamps_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS song_requests_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS queue_level TEXT,
    ADD COLUMN IF NOT EXISTS queue_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS now_playing TEXT,
    ADD COLUMN IF NOT EXISTS now_playing_at TIMESTAMPTZ;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_queue_level_check;
ALTER TABLE public.events ADD CONSTRAINT events_queue_level_check
    CHECK (queue_level IS NULL OR queue_level IN ('none', 'short', 'long'));
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_now_playing_length;
ALTER TABLE public.events ADD CONSTRAINT events_now_playing_length
    CHECK (now_playing IS NULL OR char_length(now_playing) <= 80);

-- Cerrar la puerta: nadie nuevo entra con ningún código, pero quien ya está
-- dentro sigue (puede volver a escanear sin problema).
CREATE OR REPLACE FUNCTION public.set_event_entry(p_event_id UUID, p_open BOOLEAN)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closed TIMESTAMPTZ;
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.events
    SET entry_closed_at = CASE WHEN p_open THEN NULL ELSE NOW() END
    WHERE id = p_event_id
    RETURNING entry_closed_at INTO v_closed;

    RETURN v_closed;
END;
$$;

-- Lo que la puerta cuenta del ambiente: la cola y lo que suena.
CREATE OR REPLACE FUNCTION public.set_event_live_info(
    p_event_id UUID,
    p_queue_level TEXT DEFAULT NULL,
    p_now_playing TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF p_queue_level IS NOT NULL AND p_queue_level NOT IN ('none', 'short', 'long') THEN
        RAISE EXCEPTION 'INVALID_QUEUE';
    END IF;

    UPDATE public.events
    SET queue_level = COALESCE(p_queue_level, queue_level),
        queue_updated_at = CASE WHEN p_queue_level IS NOT NULL THEN NOW() ELSE queue_updated_at END,
        now_playing = CASE WHEN p_now_playing IS NOT NULL THEN NULLIF(btrim(left(p_now_playing, 80)), '') ELSE now_playing END,
        now_playing_at = CASE WHEN p_now_playing IS NOT NULL THEN NOW() ELSE now_playing_at END
    WHERE id = p_event_id;
END;
$$;

-- El canje del código, igual que antes, más la puerta cerrada.
CREATE OR REPLACE FUNCTION public.redeem_event_code(
    p_code TEXT,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE(event_id UUID, event_name TEXT, venue_id UUID, venue_name TEXT, venue_type TEXT,
              event_radius INTEGER, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, distance_meters DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
    v_profile_id UUID;
    v_code RECORD;
    v_event RECORD;
    v_venue RECORD;
    v_distance DOUBLE PRECISION;
BEGIN
    v_profile_id := public.current_profile_id();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_code
    FROM public.event_codes ec
    WHERE upper(ec.code) = upper(btrim(p_code))
      AND ec.active = TRUE
      AND ec.expires_at > NOW()
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_CODE';
    END IF;

    -- Las listas cerradas tienen aforo propio: cuando se agota, se agota.
    IF v_code.max_uses IS NOT NULL AND v_code.uses >= v_code.max_uses THEN
        RAISE EXCEPTION 'CODE_EXHAUSTED';
    END IF;

    SELECT * INTO v_venue FROM public.venues WHERE id = v_code.venue_id;
    IF NOT FOUND OR v_venue.is_verified = FALSE THEN
        RAISE EXCEPTION 'VENUE_NOT_VERIFIED';
    END IF;

    IF v_code.event_id IS NOT NULL THEN
        SELECT * INTO v_event FROM public.events WHERE id = v_code.event_id;
    ELSE
        SELECT * INTO v_event
        FROM public.events e
        WHERE e.venue_id = v_code.venue_id AND e.end_date > NOW()
        ORDER BY e.start_date ASC
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_EVENT';
    END IF;

    IF v_event.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;

    -- Puerta cerrada: sólo vuelve a entrar quien ya estaba dentro.
    IF v_event.entry_closed_at IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.event_attendance a
        WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'ENTRY_CLOSED';
    END IF;

    v_distance := NULL;
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        IF v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
        ELSIF v_venue.latitude IS NOT NULL AND v_venue.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_venue.latitude, v_venue.longitude);
        END IF;

        IF v_distance IS NOT NULL AND v_distance > COALESCE(v_venue.event_radius, 50) THEN
            RAISE EXCEPTION 'TOO_FAR';
        END IF;
    END IF;

    INSERT INTO public.event_attendance AS ea (
        event_id, profile_id, latitude, longitude, code_id
    )
    VALUES (v_event.id, v_profile_id, p_latitude, p_longitude, v_code.id)
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            latitude = COALESCE(EXCLUDED.latitude, ea.latitude),
            longitude = COALESCE(EXCLUDED.longitude, ea.longitude),
            -- La atribución es del primer código con el que entró: si vuelve a
            -- canjear otro, el RRPP que lo trajo no cambia.
            code_id = COALESCE(ea.code_id, EXCLUDED.code_id);

    -- El contador sólo sube en el primer canje de esta persona con este código.
    UPDATE public.event_codes
    SET uses = uses + 1
    WHERE id = v_code.id
      AND EXISTS (
          SELECT 1 FROM public.event_attendance a
          WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
            AND a.code_id = v_code.id AND a.checked_in_at > NOW() - INTERVAL '5 seconds'
      );

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles
        SET latitude = p_latitude, longitude = p_longitude
        WHERE id = v_profile_id;
    END IF;

    RETURN QUERY SELECT
        v_event.id, v_event.name, v_venue.id, v_venue.name, v_venue.type,
        COALESCE(v_venue.event_radius, 50),
        v_event.start_date, v_event.end_date, v_distance;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Termómetro en vivo (lo que ve el público)
-- ---------------------------------------------------------------------------
-- Si se llena o se vacía: con el total de la puerta si está al día (frente al
-- de hace media hora); si no, por las llegadas con Vybe de la última media hora.
CREATE OR REPLACE FUNCTION public.event_trend(p_event_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now INTEGER;
    v_before INTEGER;
    v_capacity INTEGER;
    v_step NUMERIC;
    v_arrivals BIGINT;
BEGIN
    SELECT f.total INTO v_now FROM public.fresh_headcount(p_event_id) f;

    IF v_now IS NOT NULL THEN
        SELECT l.total INTO v_before
        FROM public.event_headcount_log l
        WHERE l.event_id = p_event_id AND l.at <= NOW() - INTERVAL '30 minutes'
        ORDER BY l.at DESC LIMIT 1;

        IF v_before IS NULL THEN
            SELECT l.total INTO v_before
            FROM public.event_headcount_log l
            WHERE l.event_id = p_event_id
            ORDER BY l.at ASC LIMIT 1;
        END IF;

        SELECT e.max_capacity INTO v_capacity FROM public.events e WHERE e.id = p_event_id;
        v_step := GREATEST(5, COALESCE(v_capacity, 0) * 0.03);

        IF v_now - COALESCE(v_before, v_now) >= v_step THEN RETURN 'up'; END IF;
        IF COALESCE(v_before, v_now) - v_now >= v_step THEN RETURN 'down'; END IF;
        RETURN 'steady';
    END IF;

    SELECT COUNT(*) INTO v_arrivals FROM public.event_attendance ea
    WHERE ea.event_id = p_event_id AND ea.checked_in_at > NOW() - INTERVAL '30 minutes';

    IF v_arrivals >= 3 THEN RETURN 'up'; END IF;
    RETURN NULL;
END;
$$;

-- Proporción de mujeres entre la gente con Vybe dentro, redondeada a decenas y
-- sólo con diez o más personas con género indicado: con menos señalaría a
-- alguien concreto.
CREATE OR REPLACE FUNCTION public.event_women_share(p_event_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE WHEN COUNT(*) >= 10
                THEN (ROUND(COUNT(*) FILTER (WHERE p.gender = 'woman')::NUMERIC / COUNT(*) * 10) * 10)::INTEGER
           END
    FROM public.event_attendance ea
    JOIN public.profiles p ON p.id = ea.profile_id
    WHERE ea.event_id = p_event_id
      AND ea.last_seen_at > NOW() - INTERVAL '2 hours'
      AND p.gender IN ('woman', 'man');
$$;

DROP FUNCTION IF EXISTS public.get_events_activity(UUID[]);

CREATE FUNCTION public.get_events_activity(p_event_ids UUID[])
RETURNS TABLE (
    event_id UUID,
    going BIGINT,
    inside BIGINT,
    vibe_level TEXT,
    vibe_at TIMESTAMPTZ,
    friends_going BIGINT,
    trend TEXT,
    women_share INTEGER,
    queue_level TEXT,
    now_playing TEXT,
    entry_closed BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH yo AS (SELECT public.current_profile_id() AS id)
    SELECT
        e.id,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        app.inside,
        CASE WHEN f.total IS NOT NULL
             THEN public.vibe_level_for(GREATEST(f.total, app.inside), e.max_capacity) END,
        f.updated_at,
        (SELECT COUNT(*)
         FROM public.event_intents ei
         JOIN public.connections c
           ON c.expires_at IS NULL
          AND ((c.user_id_1 = yo.id AND c.user_id_2 = ei.profile_id)
            OR (c.user_id_2 = yo.id AND c.user_id_1 = ei.profile_id))
         WHERE ei.event_id = e.id),
        CASE WHEN e.start_date <= NOW() AND e.end_date > NOW() THEN public.event_trend(e.id) END,
        CASE WHEN e.start_date <= NOW() AND e.end_date > NOW() THEN public.event_women_share(e.id) END,
        CASE WHEN e.queue_updated_at > NOW() - INTERVAL '45 minutes' AND e.end_date > NOW()
             THEN e.queue_level END,
        CASE WHEN e.now_playing_at > NOW() - INTERVAL '30 minutes' AND e.end_date > NOW()
             THEN e.now_playing END,
        e.entry_closed_at IS NOT NULL
    FROM public.events e
    CROSS JOIN yo
    CROSS JOIN LATERAL (SELECT public.vybe_inside(e.id) AS inside) app
    LEFT JOIN LATERAL public.fresh_headcount(e.id) f ON TRUE
    WHERE e.id = ANY(p_event_ids);
$$;

-- ---------------------------------------------------------------------------
-- 3. Lista Vybe: quién ha dicho que va (para el local)
-- ---------------------------------------------------------------------------
-- Nombre de pila, edad, foto y si ya ha llegado. Al marcar «voy a ir» la app
-- avisa de que el local verá esto.
CREATE OR REPLACE FUNCTION public.get_event_intent_list(p_event_id UUID)
RETURNS TABLE (
    profile_id UUID,
    first_name TEXT,
    age INTEGER,
    gender TEXT,
    avatar TEXT,
    marked_at TIMESTAMPTZ,
    arrived BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        split_part(btrim(p.name), ' ', 1),
        p.age,
        p.gender,
        COALESCE(p.avatar, p.photos[1]),
        ei.created_at,
        EXISTS (SELECT 1 FROM public.event_attendance ea
                WHERE ea.event_id = p_event_id AND ea.profile_id = p.id)
    FROM public.event_intents ei
    JOIN public.profiles p ON p.id = ei.profile_id
    WHERE ei.event_id = p_event_id
      AND p.status = 'active'
    ORDER BY ei.created_at DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Promociones: premios y retos
-- ---------------------------------------------------------------------------
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_kind_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_kind_check
    CHECK (kind IN ('offer', 'voucher', 'ticket', 'prize', 'challenge'));

ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS template_key TEXT,
    ADD COLUMN IF NOT EXISTS challenge_type TEXT,
    ADD COLUMN IF NOT EXISTS challenge_target INTEGER,
    ADD COLUMN IF NOT EXISTS challenge_deadline TIMESTAMPTZ;

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_challenge_type_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_challenge_type_check
    CHECK (challenge_type IS NULL
           OR challenge_type IN ('early_bird', 'matches', 'group', 'stay_until', 'first_visit'));

CREATE INDEX IF NOT EXISTS idx_promotions_event_template ON public.promotions (event_id, template_key);

-- Los premios no son una promoción que el local «vende»: sorteos y sellos
-- funcionan en todos los planes.
CREATE OR REPLACE FUNCTION public.enforce_promotions_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.current_venue_id() IS NULL OR NEW.kind = 'prize' THEN
        RETURN NEW;
    END IF;

    IF NOT public.venue_has_feature('promotions', NEW.venue_id) THEN
        RAISE EXCEPTION 'PLAN_UPGRADE_REQUIRED';
    END IF;

    RETURN NEW;
END;
$$;

-- Cuánto le falta a una persona para cumplir un reto.
CREATE OR REPLACE FUNCTION public.challenge_progress(p_promotion_id UUID, p_profile_id UUID)
RETURNS TABLE (progress INTEGER, target INTEGER, done BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_promo public.promotions%ROWTYPE;
    v_att public.event_attendance%ROWTYPE;
    v_count INTEGER;
    v_target INTEGER;
    v_venue UUID;
BEGIN
    SELECT * INTO v_promo FROM public.promotions WHERE id = p_promotion_id;
    IF NOT FOUND OR v_promo.kind <> 'challenge' THEN
        RETURN QUERY SELECT 0, 1, FALSE;
        RETURN;
    END IF;

    SELECT * INTO v_att FROM public.event_attendance
    WHERE event_id = v_promo.event_id AND profile_id = p_profile_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, GREATEST(COALESCE(v_promo.challenge_target, 1), 1), FALSE;
        RETURN;
    END IF;

    v_target := GREATEST(COALESCE(v_promo.challenge_target, 1), 1);

    IF v_promo.challenge_type = 'early_bird' THEN
        v_count := CASE WHEN v_att.checked_in_at <= COALESCE(v_promo.challenge_deadline, v_att.checked_in_at)
                        THEN 1 ELSE 0 END;
        RETURN QUERY SELECT v_count, 1, v_count >= 1;

    ELSIF v_promo.challenge_type = 'matches' THEN
        SELECT COUNT(*) INTO v_count FROM public.connections c
        WHERE c.event_id = v_promo.event_id
          AND (c.user_id_1 = p_profile_id OR c.user_id_2 = p_profile_id);
        RETURN QUERY SELECT LEAST(v_count, v_target), v_target, v_count >= v_target;

    ELSIF v_promo.challenge_type = 'group' THEN
        SELECT COALESCE(MAX(dentro), 0) INTO v_count FROM (
            SELECT COUNT(*) FILTER (WHERE ea.profile_id IS NOT NULL) AS dentro
            FROM public.group_members gm
            JOIN public.groups g ON g.id = gm.group_id AND g.event_id = v_promo.event_id
            JOIN public.group_members todos ON todos.group_id = g.id
            LEFT JOIN public.event_attendance ea
                   ON ea.event_id = v_promo.event_id AND ea.profile_id = todos.profile_id
            WHERE gm.profile_id = p_profile_id
            GROUP BY g.id
        ) grupos;
        RETURN QUERY SELECT LEAST(v_count, v_target), v_target, v_count >= v_target;

    ELSIF v_promo.challenge_type = 'stay_until' THEN
        v_count := CASE WHEN v_promo.challenge_deadline IS NOT NULL
                          AND NOW() >= v_promo.challenge_deadline
                          AND v_att.last_seen_at >= v_promo.challenge_deadline - INTERVAL '20 minutes'
                        THEN 1 ELSE 0 END;
        RETURN QUERY SELECT v_count, 1, v_count >= 1;

    ELSIF v_promo.challenge_type = 'first_visit' THEN
        SELECT e.venue_id INTO v_venue FROM public.events e WHERE e.id = v_promo.event_id;
        v_count := CASE WHEN NOT EXISTS (
            SELECT 1 FROM public.event_attendance a
            JOIN public.events e ON e.id = a.event_id
            WHERE a.profile_id = p_profile_id
              AND e.venue_id = v_venue
              AND a.event_id <> v_promo.event_id
              AND a.checked_in_at < v_att.checked_in_at
        ) THEN 1 ELSE 0 END;
        RETURN QUERY SELECT v_count, 1, v_count >= 1;

    ELSE
        RETURN QUERY SELECT 0, v_target, FALSE;
    END IF;
END;
$$;

-- Pedir un vale: los premios no se piden y los retos hay que cumplirlos.
CREATE OR REPLACE FUNCTION public.claim_promotion(p_promotion_id UUID)
RETURNS TABLE(ticket_code TEXT, title TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    IF NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = v_promo.event_id
          AND ea.profile_id = v_profile_id
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    ) THEN
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

-- Vale con código corto único; lo usan los retos, los sorteos y los sellos.
CREATE OR REPLACE FUNCTION public.issue_prize_ticket(p_promotion_id UUID, p_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
BEGIN
    FOR i IN 1..10 LOOP
        v_code := upper(substring(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 8));
        BEGIN
            INSERT INTO public.promotion_redemptions (promotion_id, profile_id, ticket_code)
            VALUES (p_promotion_id, p_profile_id, v_code);
            RETURN v_code;
        EXCEPTION WHEN unique_violation THEN
            CONTINUE;
        END;
    END LOOP;

    RAISE EXCEPTION 'CODE_GENERATION_FAILED';
END;
$$;

-- Retos del evento con el progreso de quien pregunta.
CREATE OR REPLACE FUNCTION public.get_event_challenges(p_event_id UUID)
RETURNS TABLE (
    promotion_id UUID,
    title TEXT,
    description TEXT,
    challenge_type TEXT,
    progress INTEGER,
    target INTEGER,
    done BOOLEAN,
    ticket_code TEXT,
    validated BOOLEAN,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    deadline TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
BEGIN
    IF v_profile IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        pr.id, pr.title, pr.description, pr.challenge_type,
        cp.progress, cp.target, cp.done,
        r.ticket_code, r.validated_at IS NOT NULL,
        pr.starts_at, pr.ends_at, pr.challenge_deadline
    FROM public.promotions pr
    CROSS JOIN LATERAL public.challenge_progress(pr.id, v_profile) cp
    LEFT JOIN LATERAL (
        SELECT rr.ticket_code, rr.validated_at FROM public.promotion_redemptions rr
        WHERE rr.promotion_id = pr.id AND rr.profile_id = v_profile
        ORDER BY rr.claimed_at DESC LIMIT 1
    ) r ON TRUE
    WHERE pr.event_id = p_event_id
      AND pr.kind = 'challenge'
      AND pr.active
      AND (pr.starts_at IS NULL OR pr.starts_at <= NOW())
      AND (pr.ends_at IS NULL OR pr.ends_at > NOW() OR r.ticket_code IS NOT NULL)
    ORDER BY cp.done DESC, pr.created_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Sorteo en directo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_raffles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    prize TEXT NOT NULL CHECK (char_length(prize) BETWEEN 2 AND 80),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 200),
    draw_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'drawn', 'cancelled', 'no_participants')),
    winner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
    drawn_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raffles_event ON public.event_raffles (event_id);
CREATE INDEX IF NOT EXISTS idx_raffles_due ON public.event_raffles (draw_at) WHERE status = 'scheduled';
ALTER TABLE public.event_raffles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_raffles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_raffle(
    p_event_id UUID,
    p_prize TEXT,
    p_description TEXT DEFAULT NULL,
    p_draw_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
    v_end TIMESTAMPTZ;
    v_id UUID;
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.venue_id, e.end_date INTO v_venue, v_end FROM public.events e WHERE e.id = p_event_id;
    IF v_end < NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    IF p_draw_at IS NOT NULL AND p_draw_at > v_end THEN
        RAISE EXCEPTION 'DRAW_AFTER_END';
    END IF;

    INSERT INTO public.event_raffles (event_id, venue_id, prize, description, draw_at, created_by)
    VALUES (p_event_id, v_venue, btrim(p_prize), NULLIF(btrim(p_description), ''), p_draw_at, auth.uid())
    RETURNING id INTO v_id;

    -- Aviso a quien está dentro: para participar hay que seguir dentro.
    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'RAFFLE_CREATED', 'table', 'raffles', 'record', jsonb_build_object('id', v_id)
    ));

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_raffle(p_raffle_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
BEGIN
    SELECT r.event_id INTO v_event FROM public.event_raffles r WHERE r.id = p_raffle_id;
    IF v_event IS NULL OR NOT public.can_read_event_metrics(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.event_raffles SET status = 'cancelled'
    WHERE id = p_raffle_id AND status = 'scheduled';
END;
$$;

-- El sorteo en sí: entre quien sigue dentro (señales en la última hora y media),
-- sin repetir ganador en la misma noche. El premio es un vale de tipo `prize`.
CREATE OR REPLACE FUNCTION public.perform_raffle_draw(p_raffle_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_raffle public.event_raffles%ROWTYPE;
    v_winner UUID;
    v_promo UUID;
BEGIN
    SELECT * INTO v_raffle FROM public.event_raffles WHERE id = p_raffle_id FOR UPDATE;
    IF NOT FOUND OR v_raffle.status <> 'scheduled' THEN
        RETURN NULL;
    END IF;

    SELECT ea.profile_id INTO v_winner
    FROM public.event_attendance ea
    JOIN public.profiles p ON p.id = ea.profile_id
    WHERE ea.event_id = v_raffle.event_id
      AND ea.last_seen_at > NOW() - INTERVAL '90 minutes'
      AND p.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM public.event_raffles o
          WHERE o.event_id = v_raffle.event_id AND o.winner_profile_id = ea.profile_id
      )
    ORDER BY random()
    LIMIT 1;

    IF v_winner IS NULL THEN
        UPDATE public.event_raffles SET status = 'no_participants', drawn_at = NOW() WHERE id = p_raffle_id;
        RETURN NULL;
    END IF;

    INSERT INTO public.promotions (event_id, venue_id, title, description, kind, max_redemptions, max_per_person, active)
    VALUES (v_raffle.event_id, v_raffle.venue_id, v_raffle.prize, v_raffle.description, 'prize', 1, 1, TRUE)
    RETURNING id INTO v_promo;

    PERFORM public.issue_prize_ticket(v_promo, v_winner);

    UPDATE public.event_raffles
    SET status = 'drawn', winner_profile_id = v_winner, promotion_id = v_promo, drawn_at = NOW()
    WHERE id = p_raffle_id;

    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'RAFFLE_DRAWN', 'table', 'raffles', 'record', jsonb_build_object('id', p_raffle_id)
    ));

    RETURN v_winner;
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_raffle(p_raffle_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
    v_winner UUID;
BEGIN
    SELECT r.event_id INTO v_event FROM public.event_raffles r WHERE r.id = p_raffle_id;
    IF v_event IS NULL OR NOT public.can_read_event_metrics(v_event) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    v_winner := public.perform_raffle_draw(p_raffle_id);
    IF v_winner IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN (SELECT split_part(btrim(p.name), ' ', 1) FROM public.profiles p WHERE p.id = v_winner);
END;
$$;

-- Los programados, cada minuto.
CREATE OR REPLACE FUNCTION public.run_due_raffles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_count INTEGER := 0;
BEGIN
    FOR v_id IN
        SELECT r.id FROM public.event_raffles r
        WHERE r.status = 'scheduled' AND r.draw_at IS NOT NULL AND r.draw_at <= NOW()
        ORDER BY r.draw_at
        LIMIT 50
    LOOP
        PERFORM public.perform_raffle_draw(v_id);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- Sorteos del evento: el local los ve todos; quien está dentro, los suyos con
-- el ganador (sólo el nombre de pila) y su vale si le ha tocado.
CREATE OR REPLACE FUNCTION public.get_event_raffles(p_event_id UUID)
RETURNS TABLE (
    id UUID,
    prize TEXT,
    description TEXT,
    draw_at TIMESTAMPTZ,
    status TEXT,
    winner_name TEXT,
    is_me BOOLEAN,
    ticket_code TEXT,
    drawn_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_venue BOOLEAN := public.can_read_event_metrics(p_event_id);
BEGIN
    IF NOT v_venue AND (v_profile IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    )) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.id, r.prize, r.description, r.draw_at, r.status,
        split_part(btrim(w.name), ' ', 1),
        r.winner_profile_id IS NOT NULL AND r.winner_profile_id = v_profile,
        CASE WHEN r.winner_profile_id = v_profile THEN
            (SELECT rr.ticket_code FROM public.promotion_redemptions rr
             WHERE rr.promotion_id = r.promotion_id AND rr.profile_id = v_profile LIMIT 1)
        END,
        r.drawn_at
    FROM public.event_raffles r
    LEFT JOIN public.profiles w ON w.id = r.winner_profile_id
    WHERE r.event_id = p_event_id
      AND (v_venue OR r.status IN ('scheduled', 'drawn'))
    ORDER BY COALESCE(r.draw_at, r.created_at);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Vota la próxima canción
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.song_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    artist TEXT CHECK (artist IS NULL OR char_length(artist) <= 120),
    deezer_id BIGINT,
    cover_url TEXT,
    normalized TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    played_at TIMESTAMPTZ,
    UNIQUE (event_id, normalized)
);

CREATE TABLE IF NOT EXISTS public.song_votes (
    request_id UUID NOT NULL REFERENCES public.song_requests(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (request_id, profile_id)
);

ALTER TABLE public.song_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.song_requests, public.song_votes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_song(p_title TEXT, p_artist TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT btrim(regexp_replace(
        lower(translate(coalesce(p_title, '') || ' ' || coalesce(p_artist, ''),
                        'áéíóúàèìòùäëïöüâêîôûñç', 'aeiouaeiouaeiouaeiounc')),
        '[^a-z0-9]+', ' ', 'g'));
$$;

-- Pedir una canción: si ya la pidió alguien, cuenta como voto. Tres peticiones
-- nuevas por persona y noche como mucho.
CREATE OR REPLACE FUNCTION public.request_song(
    p_event_id UUID,
    p_title TEXT,
    p_artist TEXT DEFAULT NULL,
    p_deezer_id BIGINT DEFAULT NULL,
    p_cover_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_norm TEXT := public.normalize_song(p_title, p_artist);
    v_id UUID;
BEGIN
    IF v_profile IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    ) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.song_requests_enabled) THEN
        RAISE EXCEPTION 'SONGS_DISABLED';
    END IF;

    IF v_norm = '' THEN
        RAISE EXCEPTION 'INVALID_SONG';
    END IF;

    SELECT s.id INTO v_id FROM public.song_requests s
    WHERE s.event_id = p_event_id AND s.normalized = v_norm;

    IF v_id IS NULL THEN
        IF (SELECT COUNT(*) FROM public.song_requests s
            WHERE s.event_id = p_event_id AND s.created_by = v_profile) >= 3 THEN
            RAISE EXCEPTION 'TOO_MANY_SONGS';
        END IF;

        INSERT INTO public.song_requests (event_id, title, artist, deezer_id, cover_url, normalized, created_by)
        VALUES (p_event_id, btrim(left(p_title, 120)), NULLIF(btrim(left(p_artist, 120)), ''),
                p_deezer_id, NULLIF(p_cover_url, ''), v_norm, v_profile)
        RETURNING id INTO v_id;
    END IF;

    INSERT INTO public.song_votes (request_id, profile_id) VALUES (v_id, v_profile)
    ON CONFLICT DO NOTHING;

    RETURN v_id;
END;
$$;

-- Votar o quitar el voto.
CREATE OR REPLACE FUNCTION public.toggle_song_vote(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_event UUID;
BEGIN
    SELECT s.event_id INTO v_event FROM public.song_requests s WHERE s.id = p_request_id;
    IF v_event IS NULL OR v_profile IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = v_event AND ea.profile_id = v_profile
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    ) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    IF EXISTS (SELECT 1 FROM public.song_votes v WHERE v.request_id = p_request_id AND v.profile_id = v_profile) THEN
        DELETE FROM public.song_votes WHERE request_id = p_request_id AND profile_id = v_profile;
        RETURN FALSE;
    END IF;

    INSERT INTO public.song_votes (request_id, profile_id) VALUES (p_request_id, v_profile);
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_song_ranking(p_event_id UUID)
RETURNS TABLE (
    id UUID,
    title TEXT,
    artist TEXT,
    cover_url TEXT,
    votes BIGINT,
    my_vote BOOLEAN,
    mine BOOLEAN,
    played_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_venue BOOLEAN := public.can_read_event_metrics(p_event_id);
BEGIN
    IF NOT v_venue AND (v_profile IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    )) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.id, s.title, s.artist, s.cover_url,
        (SELECT COUNT(*) FROM public.song_votes v WHERE v.request_id = s.id),
        EXISTS (SELECT 1 FROM public.song_votes v WHERE v.request_id = s.id AND v.profile_id = v_profile),
        s.created_by = v_profile,
        s.played_at
    FROM public.song_requests s
    WHERE s.event_id = p_event_id
    ORDER BY (s.played_at IS NOT NULL), 5 DESC, s.created_at
    LIMIT 100;
END;
$$;

-- El DJ la marca como puesta: sale de la lista y pasa a «suena ahora».
CREATE OR REPLACE FUNCTION public.mark_song_played(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_song public.song_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_song FROM public.song_requests WHERE id = p_request_id;
    IF NOT FOUND OR NOT public.can_count_event(v_song.event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.song_requests SET played_at = NOW() WHERE id = p_request_id;
    UPDATE public.events
    SET now_playing = left(v_song.title || COALESCE(' · ' || v_song.artist, ''), 80),
        now_playing_at = NOW()
    WHERE id = v_song.event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_event_songs(p_event_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_count_event(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    UPDATE public.events SET song_requests_enabled = p_enabled WHERE id = p_event_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Tarjeta de sellos por local
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_stamp_cards (
    venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    stamps_required INTEGER NOT NULL DEFAULT 5 CHECK (stamps_required BETWEEN 2 AND 20),
    reward_title TEXT NOT NULL DEFAULT 'Copa gratis' CHECK (char_length(reward_title) BETWEEN 2 AND 60),
    reward_description TEXT CHECK (reward_description IS NULL OR char_length(reward_description) <= 200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stamp_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    stamps_used INTEGER NOT NULL,
    promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
    ticket_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stamp_rewards_owner ON public.stamp_rewards (venue_id, profile_id);
ALTER TABLE public.venue_stamp_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.venue_stamp_cards, public.stamp_rewards FROM anon, authenticated;

-- Sellos de una persona en un local: una noche con check-in en un evento con
-- sellos, menos los que ya canjeó.
CREATE OR REPLACE FUNCTION public.stamps_of(p_venue_id UUID, p_profile_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT GREATEST(
        (SELECT COUNT(DISTINCT ea.event_id)::INTEGER
         FROM public.event_attendance ea
         JOIN public.events e ON e.id = ea.event_id
         WHERE ea.profile_id = p_profile_id AND e.venue_id = p_venue_id AND e.stamps_enabled)
        - COALESCE((SELECT SUM(sr.stamps_used)::INTEGER FROM public.stamp_rewards sr
                    WHERE sr.venue_id = p_venue_id AND sr.profile_id = p_profile_id), 0),
        0);
$$;

-- La tarjeta, vista desde un evento en el que estás o al que vas.
CREATE OR REPLACE FUNCTION public.get_my_stamp_card(p_event_id UUID)
RETURNS TABLE (
    venue_id UUID,
    venue_name TEXT,
    enabled BOOLEAN,
    event_counts BOOLEAN,
    stamps INTEGER,
    stamps_required INTEGER,
    reward_title TEXT,
    reward_description TEXT,
    can_claim BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_event public.events%ROWTYPE;
    v_card public.venue_stamp_cards%ROWTYPE;
    v_stamps INTEGER;
    v_inside BOOLEAN;
BEGIN
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND OR v_profile IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_card FROM public.venue_stamp_cards WHERE venue_stamp_cards.venue_id = v_event.venue_id;
    IF NOT FOUND OR NOT v_card.enabled THEN
        RETURN;
    END IF;

    v_stamps := public.stamps_of(v_event.venue_id, v_profile);
    v_inside := EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    );

    RETURN QUERY
    SELECT v_event.venue_id, v.name, TRUE, v_event.stamps_enabled,
           v_stamps, v_card.stamps_required, v_card.reward_title, v_card.reward_description,
           v_inside AND v_stamps >= v_card.stamps_required
    FROM public.venues v WHERE v.id = v_event.venue_id;
END;
$$;

-- Canjear la tarjeta llena dentro de un evento del local: sale un vale.
CREATE OR REPLACE FUNCTION public.claim_stamp_reward(p_event_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_event public.events%ROWTYPE;
    v_card public.venue_stamp_cards%ROWTYPE;
    v_promo UUID;
    v_code TEXT;
BEGIN
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND OR v_profile IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    ) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    SELECT * INTO v_card FROM public.venue_stamp_cards WHERE venue_stamp_cards.venue_id = v_event.venue_id FOR UPDATE;
    IF NOT FOUND OR NOT v_card.enabled THEN
        RAISE EXCEPTION 'STAMPS_DISABLED';
    END IF;

    IF public.stamps_of(v_event.venue_id, v_profile) < v_card.stamps_required THEN
        RAISE EXCEPTION 'NOT_ENOUGH_STAMPS';
    END IF;

    -- Un premio de tarjeta por evento, compartido por todos los que canjean.
    SELECT pr.id INTO v_promo FROM public.promotions pr
    WHERE pr.event_id = p_event_id AND pr.kind = 'prize' AND pr.template_key = 'stamp_card'
    LIMIT 1;

    IF v_promo IS NULL THEN
        INSERT INTO public.promotions (event_id, venue_id, title, description, kind, max_per_person, active, template_key)
        VALUES (p_event_id, v_event.venue_id, v_card.reward_title, v_card.reward_description, 'prize', 1000, TRUE, 'stamp_card')
        RETURNING id INTO v_promo;
    END IF;

    v_code := public.issue_prize_ticket(v_promo, v_profile);

    INSERT INTO public.stamp_rewards (venue_id, profile_id, event_id, stamps_used, promotion_id, ticket_code)
    VALUES (v_event.venue_id, v_profile, p_event_id, v_card.stamps_required, v_promo, v_code);

    RETURN v_code;
END;
$$;

-- Configuración para el local (propietario y marketing).
CREATE OR REPLACE FUNCTION public.get_venue_stamp_card()
RETURNS TABLE (
    enabled BOOLEAN,
    stamps_required INTEGER,
    reward_title TEXT,
    reward_description TEXT,
    completed BIGINT,
    collectors BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(c.enabled, FALSE),
        COALESCE(c.stamps_required, 5),
        COALESCE(c.reward_title, 'Copa gratis'),
        c.reward_description,
        (SELECT COUNT(*) FROM public.stamp_rewards sr WHERE sr.venue_id = v_venue),
        (SELECT COUNT(DISTINCT ea.profile_id) FROM public.event_attendance ea
         JOIN public.events e ON e.id = ea.event_id
         WHERE e.venue_id = v_venue AND e.stamps_enabled)
    FROM (SELECT 1) uno
    LEFT JOIN public.venue_stamp_cards c ON c.venue_id = v_venue;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_venue_stamp_card(
    p_enabled BOOLEAN,
    p_stamps_required INTEGER,
    p_reward_title TEXT,
    p_reward_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL OR COALESCE(public.current_venue_role(), '') NOT IN ('owner', 'marketing') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    INSERT INTO public.venue_stamp_cards (venue_id, enabled, stamps_required, reward_title, reward_description, updated_at)
    VALUES (v_venue, p_enabled, p_stamps_required, btrim(p_reward_title), NULLIF(btrim(p_reward_description), ''), NOW())
    ON CONFLICT (venue_id) DO UPDATE
        SET enabled = EXCLUDED.enabled,
            stamps_required = EXCLUDED.stamps_required,
            reward_title = EXCLUDED.reward_title,
            reward_description = EXCLUDED.reward_description,
            updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_event_stamps(p_event_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id)
       OR COALESCE(public.current_venue_role(), '') NOT IN ('owner', 'marketing') AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    UPDATE public.events SET stamps_enabled = p_enabled WHERE id = p_event_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. ¿Dónde seguimos?
-- ---------------------------------------------------------------------------
-- Fiestas en marcha a esa hora o que empiezan poco después, primero las de
-- locales con suscripción a Vybe y luego por cercanía.
CREATE OR REPLACE FUNCTION public.get_next_parties(
    p_after TIMESTAMPTZ,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL,
    p_exclude_event UUID DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    venue_id UUID,
    venue_name TEXT,
    venue_type TEXT,
    city TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    poster_url TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    subscribed BOOLEAN,
    vibe_level TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        e.id, e.name, v.id, v.name, v.type, v.city, e.start_date, e.end_date, e.poster_url,
        COALESCE(e.latitude, v.latitude), COALESCE(e.longitude, v.longitude),
        CASE WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL
                  AND COALESCE(e.latitude, v.latitude) IS NOT NULL
             THEN public.get_distance(p_latitude, p_longitude,
                                      COALESCE(e.latitude, v.latitude), COALESCE(e.longitude, v.longitude))
        END AS distancia,
        public.venue_plan(v.id) IN ('pro', 'business') AS suscrito,
        (SELECT public.vibe_level_for(GREATEST(f.total, public.vybe_inside(e.id)), e.max_capacity)
         FROM public.fresh_headcount(e.id) f)
    FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    WHERE v.is_verified
      AND e.end_date > p_after + INTERVAL '30 minutes'
      AND e.start_date <= p_after + INTERVAL '2 hours'
      AND (p_exclude_event IS NULL OR e.id <> p_exclude_event)
    ORDER BY suscrito DESC, distancia NULLS LAST, e.start_date
    LIMIT 30;
$$;

-- ---------------------------------------------------------------------------
-- 9. Informe semanal del local
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seen_at TIMESTAMPTZ,
    UNIQUE (venue_id, week_start)
);

ALTER TABLE public.venue_weekly_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.venue_weekly_reports FROM anon, authenticated;

-- Semana de lunes a domingo, en hora de Madrid.
CREATE OR REPLACE FUNCTION public.build_weekly_report(p_venue_id UUID, p_week_start DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_from TIMESTAMPTZ := (p_week_start::TIMESTAMP AT TIME ZONE 'Europe/Madrid');
    v_to TIMESTAMPTZ := ((p_week_start + 7)::TIMESTAMP AT TIME ZONE 'Europe/Madrid');
    v_prev_from TIMESTAMPTZ := ((p_week_start - 7)::TIMESTAMP AT TIME ZONE 'Europe/Madrid');
    v_type TEXT;
    v_result JSONB;
BEGIN
    SELECT v.type INTO v_type FROM public.venues v WHERE v.id = p_venue_id;

    WITH ev AS (
        SELECT e.* FROM public.events e
        WHERE e.venue_id = p_venue_id AND e.start_date >= v_from AND e.start_date < v_to
    ),
    att AS (
        SELECT ea.* FROM public.event_attendance ea JOIN ev ON ev.id = ea.event_id
    ),
    prev_att AS (
        SELECT ea.* FROM public.event_attendance ea
        JOIN public.events e ON e.id = ea.event_id
        WHERE e.venue_id = p_venue_id AND e.start_date >= v_prev_from AND e.start_date < v_from
    ),
    repetidores AS (
        SELECT DISTINCT att.profile_id FROM att
        WHERE EXISTS (
            SELECT 1 FROM public.event_attendance a2
            JOIN public.events e2 ON e2.id = a2.event_id
            WHERE a2.profile_id = att.profile_id AND e2.venue_id = p_venue_id AND e2.start_date < v_from
        )
    ),
    hora_pico AS (
        SELECT EXTRACT(HOUR FROM att.checked_in_at AT TIME ZONE 'Europe/Madrid')::INTEGER AS hora, COUNT(*) n
        FROM att GROUP BY 1 ORDER BY n DESC LIMIT 1
    ),
    mejor AS (
        SELECT ev.name, COUNT(att.id) n FROM ev LEFT JOIN att ON att.event_id = ev.id
        GROUP BY ev.id, ev.name ORDER BY n DESC LIMIT 1
    ),
    codigo AS (
        SELECT COALESCE(ec.promoter_name, ec.label, ec.code) AS nombre, COUNT(*) n
        FROM att JOIN public.event_codes ec ON ec.id = att.code_id
        WHERE ec.kind <> 'general'
        GROUP BY 1 ORDER BY n DESC LIMIT 1
    ),
    comparables AS (
        -- Media de entradas por evento en locales del mismo tipo esa semana
        -- (sin nombres). Sólo si hay al menos tres locales para comparar.
        SELECT AVG(n)::NUMERIC AS media, COUNT(DISTINCT venue) AS locales FROM (
            SELECT e.venue_id AS venue, e.id, COUNT(ea.id) n
            FROM public.events e
            JOIN public.venues v ON v.id = e.venue_id AND v.type = v_type AND v.is_verified
            LEFT JOIN public.event_attendance ea ON ea.event_id = e.id
            WHERE e.start_date >= v_from AND e.start_date < v_to
            GROUP BY e.venue_id, e.id
        ) x
    )
    SELECT jsonb_build_object(
        'from', v_from,
        'to', v_to,
        'events', (SELECT COUNT(*) FROM ev),
        'check_ins', (SELECT COUNT(*) FROM att),
        'check_ins_prev', (SELECT COUNT(*) FROM prev_att),
        'unique_people', (SELECT COUNT(DISTINCT profile_id) FROM att),
        'returning_people', (SELECT COUNT(*) FROM repetidores),
        'intents', (SELECT COUNT(*) FROM public.event_intents ei JOIN ev ON ev.id = ei.event_id),
        'intents_arrived', (SELECT COUNT(*) FROM public.event_intents ei JOIN ev ON ev.id = ei.event_id
                            WHERE EXISTS (SELECT 1 FROM att WHERE att.event_id = ei.event_id AND att.profile_id = ei.profile_id)),
        'matches', (SELECT COUNT(*) FROM public.connections c JOIN ev ON ev.id = c.event_id),
        'peak_hour', (SELECT hora FROM hora_pico),
        'best_event', (SELECT name FROM mejor WHERE n > 0),
        'best_event_check_ins', (SELECT n FROM mejor),
        'top_code', (SELECT nombre FROM codigo),
        'top_code_check_ins', (SELECT n FROM codigo),
        'headcount_peak', (SELECT MAX(l.total) FROM public.event_headcount_log l JOIN ev ON ev.id = l.event_id),
        'promos_claimed', (SELECT COUNT(*) FROM public.promotion_redemptions r
                           JOIN public.promotions pr ON pr.id = r.promotion_id JOIN ev ON ev.id = pr.event_id),
        'promos_validated', (SELECT COUNT(*) FROM public.promotion_redemptions r
                             JOIN public.promotions pr ON pr.id = r.promotion_id JOIN ev ON ev.id = pr.event_id
                             WHERE r.validated_at IS NOT NULL),
        'raffles', (SELECT COUNT(*) FROM public.event_raffles r JOIN ev ON ev.id = r.event_id WHERE r.status = 'drawn'),
        'stamp_cards_completed', (SELECT COUNT(*) FROM public.stamp_rewards sr
                                  WHERE sr.venue_id = p_venue_id AND sr.created_at >= v_from AND sr.created_at < v_to),
        'songs_requested', (SELECT COUNT(*) FROM public.song_requests s JOIN ev ON ev.id = s.event_id),
        'benchmark_check_ins_per_event', (SELECT CASE WHEN locales >= 3 THEN ROUND(media, 1) END FROM comparables)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_weekly_report(p_venue_id UUID, p_week_start DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.venue_weekly_reports (venue_id, week_start, data)
    VALUES (p_venue_id, p_week_start, public.build_weekly_report(p_venue_id, p_week_start))
    ON CONFLICT (venue_id, week_start) DO UPDATE SET data = EXCLUDED.data, created_at = NOW()
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Lunes de la semana pasada (Madrid).
CREATE OR REPLACE FUNCTION public.last_week_start()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT (date_trunc('week', (NOW() AT TIME ZONE 'Europe/Madrid')) - INTERVAL '7 days')::DATE;
$$;

-- El programador, cada lunes: un informe por local verificado.
CREATE OR REPLACE FUNCTION public.generate_weekly_reports()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
    v_count INTEGER := 0;
BEGIN
    FOR v_venue IN SELECT v.id FROM public.venues v WHERE v.is_verified LOOP
        PERFORM public.generate_weekly_report(v_venue, public.last_week_start());
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$;

-- Los informes del local. Si falta el de la semana pasada (un local recién
-- verificado, o el primer lunes tras esta migración), se hace en el momento.
CREATE OR REPLACE FUNCTION public.get_weekly_reports(p_limit INTEGER DEFAULT 8)
RETURNS TABLE (id UUID, week_start DATE, data JSONB, created_at TIMESTAMPTZ, seen_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.venue_weekly_reports r
                   WHERE r.venue_id = v_venue AND r.week_start = public.last_week_start()) THEN
        PERFORM public.generate_weekly_report(v_venue, public.last_week_start());
    END IF;

    RETURN QUERY
    SELECT r.id, r.week_start, r.data, r.created_at, r.seen_at
    FROM public.venue_weekly_reports r
    WHERE r.venue_id = v_venue
    ORDER BY r.week_start DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 52);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_weekly_report_seen(p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.venue_weekly_reports
    SET seen_at = COALESCE(seen_at, NOW())
    WHERE id = p_report_id AND venue_id = public.current_venue_id();
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Programador
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('vybe-sorteos', 'vybe-informe-semanal');
    PERFORM cron.schedule('vybe-sorteos', '* * * * *', 'SELECT public.run_due_raffles()');
    -- Lunes a las 05:00 UTC (07:00 en Madrid en verano, 06:00 en invierno).
    PERFORM cron.schedule('vybe-informe-semanal', '0 5 * * 1', 'SELECT public.generate_weekly_reports()');
END $$;

-- ---------------------------------------------------------------------------
-- 11. Permisos
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.set_event_entry(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_live_info(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.event_trend(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.event_women_share(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_events_activity(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_intent_list(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.challenge_progress(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_prize_ticket(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_event_challenges(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_raffle(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_raffle(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.perform_raffle_draw(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.draw_raffle(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_due_raffles() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_event_raffles(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalize_song(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_song(UUID, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_song_vote(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_song_ranking(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_song_played(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_songs(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stamps_of(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_stamp_card(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_stamp_reward(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_venue_stamp_card() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_venue_stamp_card(BOOLEAN, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_event_stamps(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_parties(TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.build_weekly_report(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_weekly_report(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_weekly_reports() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.last_week_start() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_weekly_reports(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_weekly_report_seen(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_event_entry(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_live_info(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_events_activity(UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_intent_list(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_challenges(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_raffle(UUID, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_raffle(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.draw_raffle(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_raffles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_song(UUID, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_song_vote(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_song_ranking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_song_played(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_songs(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_stamp_card(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stamp_reward(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_stamp_card() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_venue_stamp_card(BOOLEAN, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_event_stamps(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_parties(TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_reports(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_weekly_report_seen(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_promotion(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_event_code(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
