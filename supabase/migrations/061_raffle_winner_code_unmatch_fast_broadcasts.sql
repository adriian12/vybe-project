-- =============================================================================
-- 061 · Sorteos con ID de ganador · Deshacer match · Avisos del local al momento
-- =============================================================================
-- 1. Sorteos: el ganador se muestra con su nombre completo (antes sólo la
--    primera palabra: «ha ganado Alba», y puede haber muchas Alba) y un código
--    único («VY-4F2A9C») que el ganador enseña en la barra y el local comprueba
--    en su panel.
-- 2. Deshacer un vybe match: borra la conversación y la conexión, y deja un
--    «no» para que no vuelva a salir en el tablón ni se rehaga el match solo.
-- 3. Los avisos del local sin hora programada salen al momento: antes
--    esperaban a la siguiente pasada del programador (hasta 5 minutos). Y el
--    programador pasa cada minuto, para que los programados salgan a su hora.
-- =============================================================================

-- ------------------------------------------------------------------ sorteos
ALTER TABLE public.event_raffles
    ADD COLUMN IF NOT EXISTS winner_code TEXT;

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

    SELECT ea.profile_id INTO v_winner
    FROM public.event_attendance ea
    JOIN public.profiles p ON p.id = ea.profile_id
    WHERE ea.event_id = v_raffle.event_id
      AND ea.last_seen_at > NOW() - INTERVAL '90 minutes'
      AND ea.left_at IS NULL
      AND COALESCE(ea.mode, 'vyber') = 'vyber'
      AND p.account_type = 'vyber'
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
    SET status = 'drawn',
        winner_profile_id = v_winner,
        promotion_id = v_promo,
        drawn_at = NOW(),
        -- Seis caracteres sin letras que se confundan (0/O, 1/I).
        winner_code = 'VY-' || translate(upper(substr(md5(random()::text || p_raffle_id::text), 1, 6)), '01', 'XZ')
    WHERE id = p_raffle_id;

    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'RAFFLE_DRAWN', 'table', 'raffles', 'record', jsonb_build_object('id', p_raffle_id)
    ));

    RETURN v_winner;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_event_raffles(uuid);
CREATE FUNCTION public.get_event_raffles(p_event_id uuid)
 RETURNS TABLE(id uuid, prize text, description text, draw_at timestamp with time zone, status text, winner_name text, is_me boolean, ticket_code text, drawn_at timestamp with time zone, winner_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
        -- Nombre completo: con la primera palabra sola salían «Alba» repetidas.
        btrim(w.name),
        r.winner_profile_id IS NOT NULL AND r.winner_profile_id = v_profile,
        CASE WHEN r.winner_profile_id = v_profile THEN
            (SELECT rr.ticket_code FROM public.promotion_redemptions rr
             WHERE rr.promotion_id = r.promotion_id AND rr.profile_id = v_profile LIMIT 1)
        END,
        r.drawn_at,
        -- El código lo ven el ganador (para enseñarlo) y el local (para
        -- comprobarlo); el resto, sólo el nombre.
        CASE WHEN v_venue OR r.winner_profile_id = v_profile THEN r.winner_code END
    FROM public.event_raffles r
    LEFT JOIN public.profiles w ON w.id = r.winner_profile_id
    WHERE r.event_id = p_event_id
      AND (v_venue OR r.status IN ('scheduled', 'drawn'))
    ORDER BY COALESCE(r.draw_at, r.created_at);
END;
$function$;

-- ------------------------------------------------------------ deshacer match
CREATE OR REPLACE FUNCTION public.unmatch(p_other UUID)
RETURNS VOID
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

    DELETE FROM public.messages m
    WHERE (m.sender_id = v_me AND m.receiver_id = p_other)
       OR (m.sender_id = p_other AND m.receiver_id = v_me);

    DELETE FROM public.connections c
    WHERE (c.user_id_1 = LEAST(v_me, p_other) AND c.user_id_2 = GREATEST(v_me, p_other));

    -- Un «no» de quien deshace: así no vuelve a salir en su tablón ni el match
    -- se rehace solo con el like que ya había.
    DELETE FROM public.swipes s WHERE s.swiper_id = v_me AND s.swiped_id = p_other;
    INSERT INTO public.swipes (swiper_id, swiped_id, swipe_type)
    VALUES (v_me, p_other, 'dislike');
END;
$$;

-- ---------------------------------------------------- avisos al momento
CREATE OR REPLACE FUNCTION public.broadcast_send_now()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'pending' AND NEW.scheduled_at IS NULL THEN
        PERFORM public.trigger_event_notifications();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcasts_send_now ON public.broadcasts;
CREATE TRIGGER broadcasts_send_now
    AFTER INSERT ON public.broadcasts
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_send_now();

-- El programador, cada minuto: los avisos programados salen a su hora.
DO $$
BEGIN
    PERFORM cron.unschedule('vybe-notificaciones');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
SELECT cron.schedule('vybe-notificaciones', '* * * * *', 'SELECT public.trigger_event_notifications()');

REVOKE ALL ON FUNCTION public.get_event_raffles(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_raffles(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.unmatch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmatch(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.broadcast_send_now() FROM PUBLIC, anon, authenticated;
