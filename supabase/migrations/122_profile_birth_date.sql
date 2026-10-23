-- 122: fecha de nacimiento en el perfil del fiester@.
--
-- Al comprar una entrada el formulario se rellenaba con los datos de la cuenta
-- menos la fecha de nacimiento, que la puerta necesita para la edad mínima.
-- Ahora se pide al completar el perfil (en lugar de la edad) y se cambia
-- desde el perfil. La edad (`age`) sale de ella y se recalcula cada noche.
--
-- La fecha es privada: no se añade al `GRANT SELECT (…)` de `profiles`, así
-- que nadie la lee de otra persona. A la propia llega por `get_my_profile()`
-- (devuelve la fila entera) y se guarda con `set_my_birth_date()`.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

/** Guarda tu fecha de nacimiento y pone tu edad. Devuelve la edad. */
CREATE OR REPLACE FUNCTION public.set_my_birth_date(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := public.current_profile_id();
    v_edad INTEGER;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_date IS NULL OR p_date < DATE '1920-01-01' OR p_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'INVALID_BIRTH_DATE';
    END IF;
    v_edad := date_part('year', age(CURRENT_DATE, p_date))::INTEGER;
    -- Fiestea es sólo para mayores de edad.
    IF v_edad < 18 THEN
        RAISE EXCEPTION 'UNDERAGE';
    END IF;

    PERFORM set_config('vybe.birth_date_ok', 'on', TRUE);
    UPDATE public.profiles SET birth_date = p_date, age = v_edad WHERE id = v_me;
    PERFORM set_config('vybe.birth_date_ok', 'off', TRUE);
    RETURN v_edad;
END;
$$;

/** La edad de quien cumple años: se recalcula de madrugada. */
CREATE OR REPLACE FUNCTION public.refresh_ages_from_birth()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    UPDATE public.profiles
    SET age = date_part('year', age(CURRENT_DATE, birth_date))::INTEGER
    WHERE birth_date IS NOT NULL
      AND age IS DISTINCT FROM date_part('year', age(CURRENT_DATE, birth_date))::INTEGER;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_birth_date(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birth_date(DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.refresh_ages_from_birth() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    PERFORM cron.unschedule('fiestea-edades')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiestea-edades');
    PERFORM cron.schedule('fiestea-edades', '15 3 * * *', 'SELECT public.refresh_ages_from_birth()');
END $$;

-- Sólo `set_my_birth_date` cambia la fecha (comprueba que es mayor de edad):
-- `authenticated` puede actualizar su fila de `profiles` y, sin esto, la
-- podría cambiar directamente.
CREATE OR REPLACE FUNCTION public.protect_birth_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.birth_date IS DISTINCT FROM OLD.birth_date
       AND current_user IN ('authenticated', 'anon')
       AND COALESCE(current_setting('vybe.birth_date_ok', TRUE), '') <> 'on' THEN
        RAISE EXCEPTION 'USE_SET_MY_BIRTH_DATE';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_birth_date ON public.profiles;
CREATE TRIGGER profiles_protect_birth_date
    BEFORE UPDATE OF birth_date ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_birth_date();
