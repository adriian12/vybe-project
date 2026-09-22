-- =============================================================================
-- 060 · «Como invitado ves la fiesta; como Vyber la juegas»
-- =============================================================================
-- El invitado entra, ve las ofertas y canjea vales. Lo que es *participar* en
-- la noche queda para Vyber: sorteos, retos, tarjeta de sellos y votar la
-- canción. Se comprueba en las tablas (disparadores), no en cada función, para
-- que ninguna puerta lateral lo salte.
--
-- También: pasar la cuenta a Vyber estando dentro de una fiesta te pone en
-- modo Vyber en esa fiesta (la app pedirá la foto del momento).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_guest_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT p.account_type = 'guest' FROM public.profiles p WHERE p.id = p_profile_id), FALSE);
$$;

-- ---------------------------------------------------------------- canciones
CREATE OR REPLACE FUNCTION public.vyber_only_song_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.is_guest_profile(NEW.created_by) THEN
        RAISE EXCEPTION 'VYBER_ONLY';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_requests_vyber_only ON public.song_requests;
CREATE TRIGGER song_requests_vyber_only
    BEFORE INSERT ON public.song_requests
    FOR EACH ROW EXECUTE FUNCTION public.vyber_only_song_request();

CREATE OR REPLACE FUNCTION public.vyber_only_song_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.is_guest_profile(NEW.profile_id) THEN
        RAISE EXCEPTION 'VYBER_ONLY';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS song_votes_vyber_only ON public.song_votes;
CREATE TRIGGER song_votes_vyber_only
    BEFORE INSERT ON public.song_votes
    FOR EACH ROW EXECUTE FUNCTION public.vyber_only_song_vote();

-- ------------------------------------------- retos, sellos y premios (vales)
-- Las ofertas normales siguen abiertas al invitado; los retos (`challenge`) y
-- los premios (`prize`: sorteos y tarjeta de sellos) no.
CREATE OR REPLACE FUNCTION public.vyber_only_prizes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.is_guest_profile(NEW.profile_id) AND EXISTS (
        SELECT 1 FROM public.promotions pr
        WHERE pr.id = NEW.promotion_id AND pr.kind IN ('challenge', 'prize')
    ) THEN
        RAISE EXCEPTION 'VYBER_ONLY';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promotion_redemptions_vyber_only ON public.promotion_redemptions;
CREATE TRIGGER promotion_redemptions_vyber_only
    BEFORE INSERT ON public.promotion_redemptions
    FOR EACH ROW EXECUTE FUNCTION public.vyber_only_prizes();

-- ------------------------------------------------------------------ sorteos
-- El sorteo se hace sólo entre los Vyber que siguen dentro.
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
    SET status = 'drawn', winner_profile_id = v_winner, promotion_id = v_promo, drawn_at = NOW()
    WHERE id = p_raffle_id;

    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'RAFFLE_DRAWN', 'table', 'raffles', 'record', jsonb_build_object('id', p_raffle_id)
    ));

    RETURN v_winner;
END;
$function$;

-- --------------------------------- pasar a Vyber dentro de una fiesta en curso
CREATE OR REPLACE FUNCTION public.account_type_sync_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.account_type = 'vyber' AND OLD.account_type = 'guest' THEN
        UPDATE public.event_attendance ea
        SET mode = 'vyber'
        FROM public.events e
        WHERE e.id = ea.event_id
          AND ea.profile_id = NEW.id
          AND ea.left_at IS NULL
          AND e.end_date > NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_account_type_sync ON public.profiles;
CREATE TRIGGER profiles_account_type_sync
    AFTER UPDATE OF account_type ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.account_type_sync_attendance();

REVOKE ALL ON FUNCTION public.is_guest_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_guest_profile(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.vyber_only_song_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vyber_only_song_vote() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vyber_only_prizes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_type_sync_attendance() FROM PUBLIC, anon, authenticated;
