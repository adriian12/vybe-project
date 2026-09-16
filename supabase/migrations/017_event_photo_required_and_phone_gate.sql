-- ============================================================================
-- 017 — La foto del evento es obligatoria para salir en el tablón, y el
--       teléfono para pedir ayuda o denunciar
--
-- La foto de esta noche es lo que hace útil el tablón: se reconoce a alguien
-- por la ropa que lleva ahora, no por una foto de hace un año. Si se permitiera
-- caer en la del perfil, la promesa se rompe.
--
-- El teléfono, en cambio, no se exige al registrarse: cobrar un SMS a cada alta
-- encarece el embudo sin necesidad. Se pide donde de verdad importa que detrás
-- haya alguien localizable, que es al pedir ayuda y al denunciar.
--
-- La versión definitiva de `get_nearby_profiles()` está en la 018, que además
-- esconde el tablón a quien no ha puesto su foto. Aquí se deja la primera
-- mitad del cambio para que la historia quede legible.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.require_verified_phone()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_verified BOOLEAN;
BEGIN
    -- Sin sesión la escritura viene del servidor, que ya tiene permiso.
    IF v_profile_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(phone_verified, FALSE) INTO v_verified
    FROM public.profiles WHERE id = v_profile_id;

    IF NOT v_verified THEN
        RAISE EXCEPTION 'PHONE_NOT_VERIFIED';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_phone_for_sos ON public.sos_alerts;
CREATE TRIGGER require_phone_for_sos
    BEFORE INSERT ON public.sos_alerts
    FOR EACH ROW EXECUTE FUNCTION public.require_verified_phone();

DROP TRIGGER IF EXISTS require_phone_for_reports ON public.reports;
CREATE TRIGGER require_phone_for_reports
    BEFORE INSERT ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.require_verified_phone();

COMMENT ON FUNCTION public.require_verified_phone IS
    'Exige teléfono verificado para pedir ayuda y para denunciar: son las dos acciones donde hace falta que detrás haya alguien localizable.';
