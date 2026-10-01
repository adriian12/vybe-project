-- 064: sorteos con lista de participantes.
--
--   · Se ve cuánta gente participa, y el número cambia mientras entra gente.
--   · «Cerrar» congela la lista: quien llegue después ya no entra en el sorteo.
--   · «Reiniciar» devuelve un sorteo ya hecho a su estado inicial (el vale del
--     ganador se anula) para volver a sortearlo.

ALTER TABLE public.event_raffles
    ADD COLUMN IF NOT EXISTS entries_closed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.event_raffles.entries_closed_at IS
    'Desde esta hora no entra nadie más: participan los que ya estaban dentro.';

-- Quién participa: quien está dentro como vyber y sigue dando señales. Si la
-- lista está cerrada, los que estaban dentro cuando se cerró.
CREATE OR REPLACE FUNCTION public.raffle_participants(p_raffle_id UUID)
RETURNS TABLE (profile_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ea.profile_id
    FROM public.event_raffles r
    JOIN public.event_attendance ea ON ea.event_id = r.event_id
    JOIN public.profiles p ON p.id = ea.profile_id
    WHERE r.id = p_raffle_id
      AND ea.left_at IS NULL
      AND COALESCE(ea.mode, 'vyber') = 'vyber'
      AND p.account_type = 'vyber'
      AND p.status = 'active'
      AND ea.last_seen_at > COALESCE(r.entries_closed_at, NOW()) - INTERVAL '90 minutes'
      AND (r.entries_closed_at IS NULL OR ea.checked_in_at <= r.entries_closed_at)
      AND NOT EXISTS (
          SELECT 1 FROM public.event_raffles o
          WHERE o.event_id = r.event_id
            AND o.id <> r.id
            AND o.winner_profile_id = ea.profile_id
      );
$$;

CREATE OR REPLACE FUNCTION public.raffle_participant_count(p_raffle_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER FROM public.raffle_participants(p_raffle_id);
$$;

-- Cerrar (o volver a abrir) la lista. Sólo el local del evento.
CREATE OR REPLACE FUNCTION public.set_raffle_entries(p_raffle_id UUID, p_closed BOOLEAN)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
BEGIN
    SELECT event_id INTO v_event FROM public.event_raffles WHERE id = p_raffle_id;
    IF v_event IS NULL THEN
        RAISE EXCEPTION 'RAFFLE_NOT_FOUND';
    END IF;
    IF NOT COALESCE(public.can_read_event_metrics(v_event), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.event_raffles
    SET entries_closed_at = CASE WHEN p_closed THEN NOW() ELSE NULL END
    WHERE id = p_raffle_id;

    RETURN (SELECT entries_closed_at FROM public.event_raffles WHERE id = p_raffle_id);
END;
$$;

-- Reiniciar: vuelve a «programado», borra ganador y anula su vale.
CREATE OR REPLACE FUNCTION public.reset_raffle(p_raffle_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_raffle public.event_raffles%ROWTYPE;
BEGIN
    SELECT * INTO v_raffle FROM public.event_raffles WHERE id = p_raffle_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'RAFFLE_NOT_FOUND';
    END IF;
    IF NOT COALESCE(public.can_read_event_metrics(v_raffle.event_id), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    -- El vale del ganador anterior deja de valer: si ya lo canjeó en barra, se
    -- queda como está (no se puede devolver una copa).
    IF v_raffle.promotion_id IS NOT NULL THEN
        DELETE FROM public.promotion_redemptions
        WHERE promotion_id = v_raffle.promotion_id AND validated_at IS NULL;
        UPDATE public.promotions SET active = FALSE WHERE id = v_raffle.promotion_id;
    END IF;

    UPDATE public.event_raffles
    SET status = 'scheduled',
        winner_profile_id = NULL,
        winner_code = NULL,
        promotion_id = NULL,
        drawn_at = NULL,
        entries_closed_at = NULL
    WHERE id = p_raffle_id;

    RETURN TRUE;
END;
$$;

-- El sorteo se hace entre los participantes de la lista (cerrada o no).
CREATE OR REPLACE FUNCTION public.perform_raffle_draw(p_raffle_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_raffle public.event_raffles%ROWTYPE;
    v_winner UUID;
    v_promo UUID;
BEGIN
    SELECT * INTO v_raffle FROM public.event_raffles WHERE id = p_raffle_id FOR UPDATE;
    IF NOT FOUND OR v_raffle.status <> 'scheduled' THEN
        RETURN NULL;
    END IF;

    SELECT rp.profile_id INTO v_winner
    FROM public.raffle_participants(p_raffle_id) rp
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
    SET status = 'drawn',
        winner_profile_id = v_winner,
        promotion_id = v_promo,
        drawn_at = NOW(),
        winner_code = 'VY-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 6))
    WHERE id = p_raffle_id;

    RETURN v_winner;
END;
$function$;

-- La lista de sorteos añade participantes y si está cerrada.
DROP FUNCTION IF EXISTS public.get_event_raffles(uuid);
CREATE FUNCTION public.get_event_raffles(p_event_id uuid)
RETURNS TABLE(
    id uuid,
    prize text,
    description text,
    draw_at timestamp with time zone,
    status text,
    winner_name text,
    is_me boolean,
    ticket_code text,
    drawn_at timestamp with time zone,
    winner_code text,
    participants integer,
    entries_closed_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_venue BOOLEAN := COALESCE(public.can_read_event_metrics(p_event_id), FALSE);
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

REVOKE ALL ON FUNCTION public.raffle_participants(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.raffle_participant_count(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_raffle_entries(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_raffle(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_event_raffles(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.raffle_participants(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.raffle_participant_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_raffle_entries(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_raffle(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_raffles(uuid) TO authenticated, service_role;
