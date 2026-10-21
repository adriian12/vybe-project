-- ============================================================================
-- 114 · Escáner de fiestas (Barcelona, Madrid y Alicante)
-- ============================================================================
-- Administración → Eventos → ESCÁNER, al lado de FUNOUT.
--
--   · `scan-sync` (Edge Function) lee Xceed y Resident Advisor de las tres
--     ciudades y guarda cada fiesta en `scanned_events`, sin duplicar, por
--     su web y su id en esa web.
--   · `admin_list_scanned()` las devuelve con `existing_event_id`: la fiesta
--     de Fiestea que ya se llama igual y es la misma noche (etiqueta
--     «Repetida»), o la que se creó al añadirla.
--   · El panel junta las que son la misma fiesta en varias webs (misma noche
--     y mismo nombre, o misma sala y hora parecida) y deja elegir el enlace
--     de entradas.
--   · `admin_import_scanned(p_groups)` crea una fiesta por grupo en el local
--     de la casa, con los datos de todas las webs (el primero que haya de
--     cada campo, el line-up y los géneros juntos) y el enlace elegido.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scanned_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL CHECK (source IN ('xceed', 'ra', 'fourvenues')),
    source_id TEXT NOT NULL,
    city TEXT NOT NULL,
    title TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    place_name TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    image_url TEXT,
    ticket_url TEXT NOT NULL,
    genres TEXT[] NOT NULL DEFAULT '{}',
    lineup TEXT[] NOT NULL DEFAULT '{}',
    price NUMERIC,
    min_age INTEGER,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    imported_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS scanned_events_start_idx ON public.scanned_events (start_at);

-- Sólo se usa por las funciones de abajo y por `scan-sync` (service role).
ALTER TABLE public.scanned_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scanned_events FROM anon, authenticated;

-- Como todas las tablas de `public` (092).
DROP TRIGGER IF EXISTS a_api_rate_guard ON public.scanned_events;
CREATE TRIGGER a_api_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON public.scanned_events
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- La noche de una fecha en Madrid (lo de antes de las 06:00, a la anterior).
CREATE OR REPLACE FUNCTION public.scan_night(p_at TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT ((p_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '6 hours')::date;
$$;

-- ------------------------------------------------------------------ listar
CREATE OR REPLACE FUNCTION public.admin_list_scanned()
RETURNS TABLE (
    id UUID,
    source TEXT,
    city TEXT,
    title TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    place_name TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    image_url TEXT,
    ticket_url TEXT,
    genres TEXT[],
    lineup TEXT[],
    price NUMERIC,
    min_age INTEGER,
    synced_at TIMESTAMPTZ,
    imported_event_id UUID,
    existing_event_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT s.id, s.source, s.city, s.title, s.start_at, s.end_at, s.place_name, s.address,
           s.latitude, s.longitude, s.image_url, s.ticket_url, s.genres, s.lineup, s.price,
           s.min_age, s.synced_at, s.imported_event_id,
           COALESCE(s.imported_event_id, (
               SELECT e.id FROM public.events e
               WHERE public.venue_search_key(e.name) = public.venue_search_key(s.title)
                 AND public.scan_night(e.start_date) = public.scan_night(s.start_at)
               LIMIT 1
           ))
    FROM public.scanned_events s
    WHERE COALESCE(s.end_at, s.start_at + INTERVAL '6 hours') > NOW()
    ORDER BY s.start_at, s.city, s.title;
END;
$$;

-- ------------------------------------------------------------------ añadir
-- p_groups: [{ "ids": [uuid, ...], "ticket": uuid }, ...]
CREATE OR REPLACE FUNCTION public.admin_import_scanned(p_groups JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
    g JSONB;
    v_ids UUID[];
    v_ticket UUID;
    t public.scanned_events%ROWTYPE;
    v_place TEXT; v_address TEXT; v_lat DOUBLE PRECISION; v_lng DOUBLE PRECISION;
    v_image TEXT; v_end TIMESTAMPTZ; v_price NUMERIC; v_age INTEGER;
    v_genres TEXT[]; v_lineup JSONB;
    v_id UUID;
    v_n INTEGER := 0;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    v_venue := public.admin_house_venue();

    FOR g IN SELECT * FROM jsonb_array_elements(COALESCE(p_groups, '[]'::jsonb)) LOOP
        SELECT array_agg(x::uuid) INTO v_ids FROM jsonb_array_elements_text(g -> 'ids') x;
        v_ticket := NULLIF(g ->> 'ticket', '')::uuid;
        IF v_ids IS NULL OR v_ticket IS NULL OR NOT (v_ticket = ANY (v_ids)) THEN
            CONTINUE;
        END IF;

        SELECT * INTO t FROM public.scanned_events WHERE id = v_ticket;
        IF NOT FOUND OR t.imported_event_id IS NOT NULL THEN
            CONTINUE;
        END IF;

        -- De cada campo, el primero que haya: primero la web elegida, después
        -- Resident Advisor (trae dirección y coordenadas) y después el resto.
        SELECT
            (array_agg(s.place_name ORDER BY s.id = v_ticket DESC, s.source = 'ra' DESC) FILTER (WHERE s.place_name IS NOT NULL))[1],
            (array_agg(s.address ORDER BY s.source = 'ra' DESC, s.id = v_ticket DESC) FILTER (WHERE s.address IS NOT NULL))[1],
            (array_agg(s.latitude ORDER BY s.source = 'ra' DESC) FILTER (WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL))[1],
            (array_agg(s.longitude ORDER BY s.source = 'ra' DESC) FILTER (WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL))[1],
            (array_agg(s.image_url ORDER BY s.id = v_ticket DESC, s.source = 'xceed' DESC) FILTER (WHERE s.image_url IS NOT NULL))[1],
            (array_agg(s.end_at ORDER BY s.id = v_ticket DESC) FILTER (WHERE s.end_at IS NOT NULL))[1],
            (array_agg(s.price ORDER BY s.id = v_ticket DESC) FILTER (WHERE s.price IS NOT NULL))[1],
            (array_agg(s.min_age ORDER BY s.id = v_ticket DESC) FILTER (WHERE s.min_age IS NOT NULL))[1]
        INTO v_place, v_address, v_lat, v_lng, v_image, v_end, v_price, v_age
        FROM public.scanned_events s WHERE s.id = ANY (v_ids);

        SELECT COALESCE(array_agg(DISTINCT gg), '{}') INTO v_genres
        FROM public.scanned_events s, unnest(s.genres) gg WHERE s.id = ANY (v_ids) AND btrim(gg) <> '';

        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', n)), '[]'::jsonb) INTO v_lineup
        FROM (
            SELECT DISTINCT ON (lower(btrim(n))) left(btrim(n), 80) AS n
            FROM public.scanned_events s, unnest(s.lineup) n
            WHERE s.id = ANY (v_ids) AND btrim(n) <> ''
            LIMIT 30
        ) l;

        INSERT INTO public.events (
            venue_id, name, description, start_date, end_date, latitude, longitude, theme,
            price, min_age, booking_url, poster_url, city, region, place_name, address,
            requires_location, external_source, external_id, lineup
        ) VALUES (
            v_venue, left(t.title, 120), NULL, t.start_at,
            COALESCE(v_end, t.start_at + INTERVAL '6 hours'),
            v_lat, v_lng, v_genres[1], v_price, v_age, t.ticket_url, v_image, t.city,
            CASE lower(t.city)
                WHEN 'barcelona' THEN 'Cataluña'
                WHEN 'madrid' THEN 'Comunidad de Madrid'
                WHEN 'alicante' THEN 'Comunitat Valenciana'
            END,
            v_place, v_address, v_lat IS NOT NULL AND v_lng IS NOT NULL,
            'scan', t.source || ':' || t.source_id, v_lineup
        )
        ON CONFLICT (external_source, external_id) WHERE external_id IS NOT NULL DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NOT NULL THEN
            UPDATE public.scanned_events SET imported_event_id = v_id WHERE id = ANY (v_ids);
            v_n := v_n + 1;
        END IF;
    END LOOP;

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_night(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scan_night(TIMESTAMPTZ) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_list_scanned() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_scanned() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_import_scanned(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_scanned(JSONB) TO authenticated;
