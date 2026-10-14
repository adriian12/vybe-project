-- ============================================================================
-- 105 · Line-up de los eventos
-- ============================================================================
-- Quién actúa en la fiesta: nombre, hora (opcional) e Instagram (opcional).
-- Lo escribe el negocio al crear el evento; en las fiestas importadas de
-- Funout llegan los nombres, que antes se metían como texto en la
-- descripción («Line-up: A, B»).
--
--   [{ "name": "DJ Martin K.", "time": "01:30 – 03:00", "instagram": "martink" }]
-- ============================================================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lineup JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.valid_lineup(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
    SELECT jsonb_typeof(p) = 'array'
       AND jsonb_array_length(p) <= 30
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p) a
           WHERE jsonb_typeof(a) <> 'object'
              OR jsonb_typeof(a -> 'name') IS DISTINCT FROM 'string'
              OR char_length(btrim(a ->> 'name')) NOT BETWEEN 1 AND 80
              OR (a ? 'time' AND jsonb_typeof(a -> 'time') <> 'null'
                  AND (jsonb_typeof(a -> 'time') <> 'string' OR char_length(a ->> 'time') > 20))
              OR (a ? 'instagram' AND jsonb_typeof(a -> 'instagram') <> 'null'
                  AND (jsonb_typeof(a -> 'instagram') <> 'string' OR (a ->> 'instagram') !~ '^[A-Za-z0-9._]{1,30}$'))
       );
$$;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_lineup_valid;
ALTER TABLE public.events ADD CONSTRAINT events_lineup_valid CHECK (public.valid_lineup(lineup));

-- ---------------------------------------------------------------------------
-- Fiestas ya importadas de Funout: del texto de la descripción al line-up.
-- ---------------------------------------------------------------------------
UPDATE public.events e
SET lineup = (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', left(btrim(n), 80))), '[]'::jsonb)
              FROM unnest(f.lineup) n WHERE btrim(n) <> ''),
    description = CASE WHEN e.description = 'Line-up: ' || array_to_string(f.lineup, ', ') THEN NULL ELSE e.description END
FROM public.funout_events f
WHERE f.imported_event_id = e.id
  AND cardinality(f.lineup) > 0
  AND e.lineup = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Importación de Funout: el line-up va a su campo. Al refrescar sólo se rellena
-- si sigue vacío, para no pisar lo que haya corregido administración.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.funout_upsert_event(p_funout_id bigint, p_venue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    f public.funout_events%ROWTYPE;
    v_id UUID;
    v_lineup JSONB;
BEGIN
    SELECT * INTO f FROM public.funout_events WHERE funout_id = p_funout_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', left(btrim(n), 80))), '[]'::jsonb)
    INTO v_lineup
    FROM (SELECT n FROM unnest(COALESCE(f.lineup, '{}')) n WHERE btrim(n) <> '' LIMIT 30) s;

    INSERT INTO public.events (
        venue_id, name, description, start_date, end_date, latitude, longitude, theme, dress_code,
        price, booking_url, poster_url, city, region, place_name, address, requires_location,
        external_source, external_id, lineup
    ) VALUES (
        p_venue_id, left(f.title, 120), NULL, f.start_at, f.end_at, f.latitude, f.longitude, f.theme,
        f.dress_code, CASE WHEN f.is_free THEN 0 END, f.ticket_url, f.image_url, f.city, 'Illes Balears',
        f.place_name, f.address, f.latitude IS NOT NULL AND f.longitude IS NOT NULL,
        'funout', f.funout_id::TEXT, v_lineup
    )
    ON CONFLICT (external_source, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        booking_url = COALESCE(EXCLUDED.booking_url, public.events.booking_url),
        poster_url = COALESCE(EXCLUDED.poster_url, public.events.poster_url),
        latitude = COALESCE(public.events.latitude, EXCLUDED.latitude),
        longitude = COALESCE(public.events.longitude, EXCLUDED.longitude),
        requires_location = COALESCE(public.events.latitude, EXCLUDED.latitude) IS NOT NULL,
        lineup = CASE WHEN public.events.lineup = '[]'::jsonb THEN EXCLUDED.lineup ELSE public.events.lineup END,
        updated_at = NOW()
    RETURNING id INTO v_id;

    UPDATE public.funout_events SET imported_event_id = v_id WHERE funout_id = p_funout_id;
    RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Administración: crear y editar fiestas con su line-up. Se sustituyen las
-- firmas anteriores (dos versiones con el mismo nombre confunden a PostgREST).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_event(text, timestamptz, timestamptz, uuid, text, text, text, double precision, double precision, numeric, integer, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_create_event(
    p_name text, p_start timestamptz, p_end timestamptz, p_venue_id uuid DEFAULT NULL,
    p_description text DEFAULT NULL, p_city text DEFAULT NULL, p_region text DEFAULT NULL,
    p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL,
    p_price numeric DEFAULT NULL, p_capacity integer DEFAULT NULL, p_theme text DEFAULT NULL,
    p_requires_location boolean DEFAULT false, p_lineup jsonb DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        latitude, longitude, price, max_capacity, theme, requires_location, lineup
    )
    VALUES (
        v_venue, TRIM(p_name), NULLIF(TRIM(COALESCE(p_description, '')), ''), p_start, p_end,
        NULLIF(TRIM(COALESCE(p_city, '')), ''), NULLIF(TRIM(COALESCE(p_region, '')), ''),
        p_latitude, p_longitude, p_price, p_capacity,
        NULLIF(TRIM(COALESCE(p_theme, '')), ''), COALESCE(p_requires_location, FALSE),
        COALESCE(p_lineup, '[]'::jsonb)
    )
    RETURNING id INTO v_event;

    RETURN v_event;
END;
$function$;

DROP FUNCTION IF EXISTS public.admin_update_event(uuid, text, timestamptz, timestamptz, text, text, numeric, integer, text, double precision, double precision, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.admin_update_event(
    p_event_id uuid, p_name text, p_start timestamptz, p_end timestamptz, p_description text,
    p_city text, p_price numeric, p_capacity integer, p_theme text, p_latitude double precision,
    p_longitude double precision, p_place_name text, p_address text, p_dress_code text,
    p_booking_url text, p_poster_url text, p_lineup jsonb DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_end <= p_start THEN
        RAISE EXCEPTION 'INVALID_DATES';
    END IF;
    UPDATE public.events
    SET name = left(btrim(p_name), 120),
        start_date = p_start,
        end_date = p_end,
        description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        city = NULLIF(btrim(COALESCE(p_city, '')), ''),
        price = p_price,
        max_capacity = p_capacity,
        theme = NULLIF(btrim(COALESCE(p_theme, '')), ''),
        latitude = p_latitude,
        longitude = p_longitude,
        requires_location = p_latitude IS NOT NULL AND p_longitude IS NOT NULL,
        place_name = NULLIF(btrim(COALESCE(p_place_name, '')), ''),
        address = NULLIF(btrim(COALESCE(p_address, '')), ''),
        dress_code = NULLIF(btrim(COALESCE(p_dress_code, '')), ''),
        booking_url = NULLIF(btrim(COALESCE(p_booking_url, '')), ''),
        poster_url = NULLIF(btrim(COALESCE(p_poster_url, '')), ''),
        lineup = COALESCE(p_lineup, lineup),
        updated_at = NOW()
    WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_event(text, timestamptz, timestamptz, uuid, text, text, text, double precision, double precision, numeric, integer, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_event(text, timestamptz, timestamptz, uuid, text, text, text, double precision, double precision, numeric, integer, text, boolean, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_update_event(uuid, text, timestamptz, timestamptz, text, text, numeric, integer, text, double precision, double precision, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_event(uuid, text, timestamptz, timestamptz, text, text, numeric, integer, text, double precision, double precision, text, text, text, text, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.funout_upsert_event(bigint, uuid) FROM PUBLIC, anon, authenticated;
