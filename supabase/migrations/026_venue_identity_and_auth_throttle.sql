-- ============================================================================
-- 026. Identidad fiscal del local y freno para el correo de la cuenta
-- ============================================================================
--
-- Dos cosas que hacían falta para lo mismo: que dar de alta un local signifique
-- algo y que darlo de alta no se pueda automatizar.
--
-- 1. TITULARIDAD DEL LOCAL
--
--    Pedir «documentación que acredite la titularidad» y marcarla como
--    opcional era teatro: cualquiera se registraba sin subir nada. Y un PDF
--    suelto tampoco prueba gran cosa, porque se falsifica en cinco minutos.
--
--    Lo que sí se puede contrastar contra un registro público es el CIF/NIF, y
--    además hace falta igualmente para facturarle el plan. Se pide junto con la
--    dirección del establecimiento, que es lo que permite comprobar que el
--    local existe donde dice y llamar al teléfono que publica.
--
--    El NIF se guarda en mayúsculas y sin espacios para que dos locales no
--    puedan colarse con «b12345678» y «B-12345678».
--
-- 2. FRENO DEL CORREO DE LA CUENTA
--
--    `consume_rate_limit()` cuenta por `profile_id`, así que no sirve para
--    nada que ocurra antes de existir la cuenta. El alta y el reenvío del
--    correo de verificación son justo eso, y sin freno se pueden usar para
--    mandar correo a terceros en nombre de Vybe.
--
--    Este contador va por una clave de texto libre (el correo, la IP) y sólo
--    lo puede usar `service_role`: lo llama la Edge Function, nunca el
--    navegador.
-- ============================================================================

-- ============================================================================
-- 1. IDENTIDAD DEL LOCAL
-- ============================================================================

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS tax_id TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN public.venues.tax_id IS
    'CIF/NIF del titular. Se contrasta a mano contra el registro público antes de aprobar el local.';
COMMENT ON COLUMN public.venues.address IS
    'Dirección del establecimiento, para comprobar que existe donde dice.';

-- Sin UNIQUE: una misma empresa puede tener varios locales dados de alta, y
-- bloquear el segundo por repetir el NIF sería un fallo, no una protección.
CREATE INDEX IF NOT EXISTS idx_venues_tax_id ON public.venues(tax_id)
    WHERE tax_id IS NOT NULL;

/**
 * Normaliza el NIF antes de guardarlo.
 *
 * Se hace en la base de datos y no en el formulario porque el formulario no es
 * el único camino: el alta también entra por la Edge Function.
 */
CREATE OR REPLACE FUNCTION public.normalize_venue_tax_id()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
    IF NEW.tax_id IS NOT NULL THEN
        NEW.tax_id := NULLIF(UPPER(REGEXP_REPLACE(NEW.tax_id, '[^A-Za-z0-9]', '', 'g')), '');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_normalize_tax_id ON public.venues;
CREATE TRIGGER venues_normalize_tax_id
    BEFORE INSERT OR UPDATE OF tax_id ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.normalize_venue_tax_id();

-- ============================================================================
-- 2. ALTA: el trigger guarda también NIF y dirección
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_account_type TEXT := COALESCE(NEW.raw_user_meta_data->>'account_type', 'user');
BEGIN
    IF v_account_type = 'venue' THEN
        INSERT INTO public.venues (venue_id, name, email, type, phone, tax_id, address)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'venue_name', split_part(NEW.email, '@', 1)),
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'venue_type', 'local'),
            NEW.raw_user_meta_data->>'phone',
            NULLIF(NEW.raw_user_meta_data->>'tax_id', ''),
            NULLIF(NEW.raw_user_meta_data->>'address', '')
        )
        ON CONFLICT (venue_id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (user_id, name, email, age, phone, gender, wants)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
            NEW.email,
            GREATEST(18, COALESCE((NEW.raw_user_meta_data->>'age')::INTEGER, 18)),
            NEW.raw_user_meta_data->>'phone',
            CASE WHEN NEW.raw_user_meta_data->>'gender' IN ('man', 'woman')
                 THEN NEW.raw_user_meta_data->>'gender' END,
            CASE WHEN NEW.raw_user_meta_data->>'wants' IN ('men', 'women', 'all')
                 THEN NEW.raw_user_meta_data->>'wants' ELSE 'all' END
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. FRENO ANÓNIMO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auth_throttle (
    key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);

ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;

-- Sin policies a propósito: con RLS activo y ninguna policy, nadie que no sea
-- `service_role` puede leer ni escribir la tabla.

CREATE INDEX IF NOT EXISTS idx_auth_throttle_window
    ON public.auth_throttle(window_start);

/**
 * Cuenta un intento y devuelve FALSE cuando se pasa del límite.
 *
 * La ventana se redondea al múltiplo del periodo para poder usar la clave
 * primaria como contador atómico: dos peticiones simultáneas no pueden saltarse
 * el límite entre las dos.
 */
CREATE OR REPLACE FUNCTION public.consume_anon_rate_limit(
    p_key TEXT,
    p_max INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_window TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    IF p_key IS NULL OR p_key = '' THEN
        RETURN TRUE;
    END IF;

    v_window := to_timestamp(
        floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds
    );

    INSERT INTO public.auth_throttle (key, window_start, count)
    VALUES (p_key, v_window, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = public.auth_throttle.count + 1
    RETURNING count INTO v_count;

    RETURN v_count <= p_max;
END;
$$;

-- Sólo el servidor. Si el navegador pudiera llamarla, podría gastar el cupo de
-- otra persona llamándola con su correo.
REVOKE ALL ON FUNCTION public.consume_anon_rate_limit(TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_anon_rate_limit(TEXT, INTEGER, INTEGER)
    TO service_role;

/** Limpia ventanas antiguas; la llama el mismo cron que purga las demás. */
CREATE OR REPLACE FUNCTION public.purge_auth_throttle()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.auth_throttle WHERE window_start < NOW() - INTERVAL '1 day';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_auth_throttle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_auth_throttle() TO service_role;

COMMENT ON FUNCTION public.consume_anon_rate_limit IS
    'Límite de uso para lo que ocurre antes de existir la cuenta (alta, reenvío del correo). Clave libre: correo o IP. Sólo service_role.';
