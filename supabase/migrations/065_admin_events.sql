-- 065: eventos creados por administración.
--
-- Fiestas que no son de ningún local (una verbena, una fiesta de pueblo, un
-- festival) para que la gente las vea en la app. Cuelgan de un local propio
-- llamado «Fiestea», porque cada evento necesita un local en la base de datos.

-- El local de la casa: se crea la primera vez que hace falta, a nombre de quien
-- administra.
CREATE OR REPLACE FUNCTION public.admin_house_venue()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_owner UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT id INTO v_id FROM public.venues WHERE name = 'Fiestea' ORDER BY created_at LIMIT 1;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    SELECT p.user_id INTO v_owner FROM public.profiles p WHERE p.user_id = auth.uid();

    INSERT INTO public.venues (venue_id, name, email, type, verification_status, is_verified, city)
    VALUES (v_owner, 'Fiestea', COALESCE((SELECT email FROM auth.users WHERE id = v_owner), 'hola@fiestea.es'),
            'local', 'approved', TRUE, 'España')
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Crear un evento desde administración: en el local que se diga o, si no se
-- dice ninguno, en el de la casa.
CREATE OR REPLACE FUNCTION public.admin_create_event(
    p_name TEXT,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_venue_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_region TEXT DEFAULT NULL,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL,
    p_price NUMERIC DEFAULT NULL,
    p_capacity INTEGER DEFAULT NULL,
    p_theme TEXT DEFAULT NULL,
    p_requires_location BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
    v_event UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF COALESCE(TRIM(p_name), '') = '' THEN
        RAISE EXCEPTION 'NAME_REQUIRED';
    END IF;
    IF p_end <= p_start THEN
        RAISE EXCEPTION 'BAD_DATES';
    END IF;

    v_venue := COALESCE(p_venue_id, public.admin_house_venue());

    INSERT INTO public.events (
        venue_id, name, description, start_date, end_date, city, region,
        latitude, longitude, price, max_capacity, theme, requires_location
    )
    VALUES (
        v_venue, TRIM(p_name), NULLIF(TRIM(COALESCE(p_description, '')), ''), p_start, p_end,
        NULLIF(TRIM(COALESCE(p_city, '')), ''), NULLIF(TRIM(COALESCE(p_region, '')), ''),
        p_latitude, p_longitude, p_price, p_capacity,
        NULLIF(TRIM(COALESCE(p_theme, '')), ''), COALESCE(p_requires_location, FALSE)
    )
    RETURNING id INTO v_event;

    RETURN v_event;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_house_venue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_event(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT,
    DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, INTEGER, TEXT, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_house_venue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_event(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT,
    DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, INTEGER, TEXT, BOOLEAN) TO authenticated, service_role;
