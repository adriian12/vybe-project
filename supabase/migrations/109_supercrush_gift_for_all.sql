-- 109: el supercrush de regalo de cada fiesta es para todos los fiesteros.
--
-- Hasta ahora (migración 062) sólo Premium tenía uno incluido por fiesta.
-- Ahora quien entra como fiester@ en una fiesta tiene uno de regalo para esa
-- fiesta:
--   · se gasta antes que los comprados, que siguen intactos;
--   · si no se usa, se pierde al terminar la fiesta o al salir: no se suma
--     al saldo (`delta` 0, `reason` 'included');
--   · es uno por persona y fiesta: salir y volver a entrar no da otro, porque
--     cuenta la fila 'included' de ese evento, no la entrada.

CREATE OR REPLACE FUNCTION public.charge_supercrush()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.swipe_type <> 'super_like' THEN
        RETURN NEW;
    END IF;
    -- Sólo lo que manda la propia persona. Los de las salas de pruebas los
    -- inserta el servidor en nombre de perfiles del seed y no se cobran.
    IF public.current_profile_id() IS NULL OR NEW.swiper_id <> public.current_profile_id() THEN
        RETURN NEW;
    END IF;
    IF NEW.event_id IS NULL THEN
        RAISE EXCEPTION 'EVENT_REQUIRED';
    END IF;

    -- Dos toques a la vez no pueden gastar el mismo supercrush.
    PERFORM pg_advisory_xact_lock(hashtextextended('supercrush:' || NEW.swiper_id::text, 0));

    IF NOT EXISTS (
           SELECT 1 FROM public.supercrush_ledger l
           WHERE l.profile_id = NEW.swiper_id AND l.event_id = NEW.event_id AND l.reason = 'included'
       ) THEN
        INSERT INTO public.supercrush_ledger (profile_id, delta, reason, event_id, swiped_id)
        VALUES (NEW.swiper_id, 0, 'included', NEW.event_id, NEW.swiped_id);
        RETURN NEW;
    END IF;

    IF public.supercrush_balance(NEW.swiper_id) < 1 THEN
        RAISE EXCEPTION 'NO_SUPERCRUSH';
    END IF;

    INSERT INTO public.supercrush_ledger (profile_id, delta, reason, event_id, swiped_id)
    VALUES (NEW.swiper_id, -1, 'spent', NEW.event_id, NEW.swiped_id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_supercrush()
RETURNS TABLE (balance INTEGER, included_available BOOLEAN, event_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_event UUID;
BEGIN
    IF v_profile IS NULL THEN
        RETURN;
    END IF;
    v_event := public.active_event_of(v_profile);
    RETURN QUERY SELECT
        public.supercrush_balance(v_profile),
        v_event IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM public.supercrush_ledger l
                WHERE l.profile_id = v_profile AND l.event_id = v_event AND l.reason = 'included'
            ),
        v_event;
END;
$$;
