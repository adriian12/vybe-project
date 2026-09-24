-- 067: una alerta de emergencia sólo llega al local si quien la manda ha entrado
-- en esa fiesta.
--
-- Desde la 066 el local ve las alertas de sus eventos al momento y con sonido.
-- La policy de `sos_alerts` sólo comprueba que la alerta sea de quien la
-- inserta, así que cualquiera podía poner el `event_id` de una fiesta ajena y
-- hacer sonar el panel de otro local. Si no hay check-in en ese evento, la
-- alerta se guarda sin evento: sigue llegando a sus contactos de confianza y a
-- administración, pero no al local.

CREATE OR REPLACE FUNCTION public.sos_alerts_check_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = NEW.event_id AND ea.profile_id = NEW.profile_id
    ) THEN
        NEW.event_id := NULL;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sos_alerts_check_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sos_alerts_check_event ON public.sos_alerts;
CREATE TRIGGER sos_alerts_check_event
    BEFORE INSERT OR UPDATE OF event_id ON public.sos_alerts
    FOR EACH ROW EXECUTE FUNCTION public.sos_alerts_check_event();
