-- ============================================================================
-- 112 · Las salas de pruebas no vuelven a pedir ubicación al guardarlas
-- ============================================================================
-- `admin_update_event()` (105) calcula `requires_location` con las coordenadas
-- del formulario. Al guardar «Aurora Sessions» desde administración, la sala
-- de pruebas volvió a exigir estar en el local y el código 394410 dejó de
-- funcionar desde fuera de Palma, también para la cuenta de revisión de Apple.
--
-- `keep_test_lab_open()` (099) ya protegía la fecha de fin de las salas de
-- pruebas; ahora también las deja sin ubicación, la cambie quien la cambie.
-- Para que una sala vuelva a pedirla, se quita antes `test_lab`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.keep_test_lab_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    -- El formulario de editar fiestas pone el fin el mismo día del inicio: en
    -- una sala de pruebas que dura años, eso la cerraría sin querer.
    IF COALESCE(OLD.test_lab, FALSE) AND COALESCE(NEW.test_lab, FALSE)
       AND NEW.end_date < NOW() AND OLD.end_date >= NOW() THEN
        NEW.end_date := OLD.end_date;
    END IF;
    -- Una sala de pruebas se usa desde cualquier sitio (044).
    IF COALESCE(OLD.test_lab, FALSE) AND COALESCE(NEW.test_lab, FALSE) THEN
        NEW.requires_location := FALSE;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS events_keep_test_lab_open ON public.events;
CREATE TRIGGER events_keep_test_lab_open
    BEFORE UPDATE OF end_date, requires_location ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.keep_test_lab_open();

UPDATE public.events
SET requires_location = FALSE
WHERE test_lab AND requires_location;

-- Aurora tenía además la entrada cerrada a mano desde el 16-10-2026
-- (`set_event_entry_open`, 042): se reabre. No se bloquea el botón, para poder
-- seguir probando el cierre de puerta en una sala de pruebas.
UPDATE public.events
SET entry_closed_at = NULL
WHERE id = 'd26f7152-9583-4a95-a7e4-d28cfbf09538' AND test_lab;
