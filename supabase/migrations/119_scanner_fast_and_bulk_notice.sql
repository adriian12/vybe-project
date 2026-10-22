-- 119: el escáner, rápido y sin una avalancha de avisos.
--
-- 1. `admin_list_scanned` tardaba 10,7 s con ~1.000 fiestas escaneadas y 600
--    en Fiestea (por cada escaneada recorría todas las fiestas calculando
--    `venue_search_key` y `scan_night`), y la base de datos corta a los 8 s a
--    `authenticated`: el panel decía «no hay resultados». Ahora las claves de
--    las fiestas se calculan una vez y se cruzan con un hash.
-- 2. Importar cientos de fiestas en una sola llamada también pasaba de 8 s. El
--    panel las manda ahora por tandas.
-- 3. Cada fiesta nueva avisaba a los seguidores del local (Fiestea): al añadir
--    50 desde el escáner llegaban 50 avisos. Con `p_quiet` las tandas no
--    avisan una a una y, al acabar, `admin_announce_new_events` manda uno solo
--    («Fiestea ha añadido varias fiestas nuevas»), que abre el mapa.

-- --------------------------------------------------------------- 1. listado
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
    WITH escaneadas AS (
        SELECT s.*, public.venue_search_key(s.title) AS clave, public.scan_night(s.start_at) AS noche
        FROM public.scanned_events s
        WHERE COALESCE(s.end_at, s.start_at + INTERVAL '6 hours') > NOW()
    ),
    -- Una fiesta por nombre y noche, sólo de las que pueden coincidir.
    existentes AS (
        SELECT DISTINCT ON (k.clave, k.noche) k.clave, k.noche, k.id
        FROM (
            SELECT e.id, public.venue_search_key(e.name) AS clave, public.scan_night(e.start_date) AS noche
            FROM public.events e
            WHERE e.start_date > NOW() - INTERVAL '2 days'
        ) k
        ORDER BY k.clave, k.noche, k.id
    )
    SELECT s.id, s.source, s.city, s.title, s.start_at, s.end_at, s.place_name, s.address,
           s.latitude, s.longitude, s.image_url, s.ticket_url, s.genres, s.lineup, s.price,
           s.min_age, s.synced_at, s.imported_event_id,
           COALESCE(s.imported_event_id, x.id)
    FROM escaneadas s
    LEFT JOIN existentes x ON x.clave = s.clave AND x.noche = s.noche
    ORDER BY s.start_at, s.city, s.title;
END;
$$;

-- ------------------------------------------------- 2 y 3. avisos de fiestas
CREATE OR REPLACE FUNCTION public.push_on_event_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Importación en bloque desde el escáner: se avisa una vez al final.
    IF current_setting('vybe.quiet_events', TRUE) = 'on' THEN
        RETURN NEW;
    END IF;
    IF NEW.start_date > NOW()
       AND EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.is_verified)
       AND EXISTS (SELECT 1 FROM public.venue_followers f WHERE f.venue_id = NEW.venue_id) THEN
        PERFORM public.queue_followers_notice(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_import_scanned(JSONB);

CREATE OR REPLACE FUNCTION public.admin_import_scanned(p_groups JSONB, p_quiet BOOLEAN DEFAULT FALSE)
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

    IF p_quiet THEN
        PERFORM set_config('vybe.quiet_events', 'on', TRUE);
    END IF;

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

    IF p_quiet THEN
        PERFORM set_config('vybe.quiet_events', 'off', TRUE);
    END IF;
    RETURN v_n;
END;
$$;

/** Un solo aviso a los seguidores de Fiestea tras una importación en bloque. */
CREATE OR REPLACE FUNCTION public.admin_announce_new_events(p_count INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF COALESCE(p_count, 0) < 1 THEN
        RETURN;
    END IF;
    v_venue := public.admin_house_venue();
    IF NOT EXISTS (SELECT 1 FROM public.venue_followers f WHERE f.venue_id = v_venue) THEN
        RETURN;
    END IF;
    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'EVENTS_BULK', 'table', 'venue_events',
        'record', jsonb_build_object('venue_id', v_venue, 'count', p_count)
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_import_scanned(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_scanned(JSONB, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_announce_new_events(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_announce_new_events(INTEGER) TO authenticated;
