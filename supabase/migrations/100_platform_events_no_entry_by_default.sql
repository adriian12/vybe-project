-- ============================================================================
-- 100 · Fiestas de Fiestea: sin swipe (ni botón de entrar) por defecto
-- ============================================================================
-- Las fiestas que crea administración o que vienen de Funout son del local de
-- la casa (`venues.is_platform`). Allí no hay un negocio que ponga el QR ni el
-- código en la puerta, así que la ficha no debe invitar a «Entrar ahora».
--
--   · Por defecto nacen con el swipe apagado: la ficha sólo ofrece «Voy a ir».
--   · Si administración enciende el swipe desde «Editar fiesta», la ficha
--     ofrece «Estoy aquí», que entra por ubicación sin código
--     (`enter_platform_event`, como hasta ahora).
--   · Las que ya existían pasan a swipe apagado; administración lo enciende en
--     las que quiera.
-- ============================================================================

UPDATE public.events e
SET swipe_enabled = FALSE
FROM public.venues v
WHERE v.id = e.venue_id
  AND v.is_platform
  AND e.swipe_enabled;

CREATE OR REPLACE FUNCTION public.platform_events_swipe_off()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.is_platform) THEN
        NEW.swipe_enabled := FALSE;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_events_swipe_off() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS events_platform_swipe_off ON public.events;
CREATE TRIGGER events_platform_swipe_off
    BEFORE INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.platform_events_swipe_off();
