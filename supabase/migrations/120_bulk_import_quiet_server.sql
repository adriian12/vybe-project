-- 120: el silencio de las importaciones en bloque, también sin el panel nuevo.
--
-- El 22-10-2026 se añadieron 529 fiestas de Barcelona con el panel abierto
-- desde antes de publicar la 119: mandaba todo en una llamada y sin p_quiet,
-- y llegaron 527 avisos. Ahora, si una sola llamada trae más de 3 fiestas,
-- el servidor no avisa una a una y manda él el aviso único al acabar. El
-- panel nuevo (tandas de 40 con p_quiet) sigue mandándolo una vez al final.

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
    -- Un panel sin actualizar manda todo en una llamada y sin p_quiet: con
    -- más de 3 fiestas, el silencio y el aviso único los pone el servidor.
    v_auto BOOLEAN := NOT COALESCE(p_quiet, FALSE) AND jsonb_array_length(COALESCE(p_groups, '[]'::jsonb)) > 3;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    v_venue := public.admin_house_venue();

    IF p_quiet OR v_auto THEN
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

    IF p_quiet OR v_auto THEN
        PERFORM set_config('vybe.quiet_events', 'off', TRUE);
    END IF;
    IF v_auto AND v_n > 0 THEN
        PERFORM public.admin_announce_new_events(v_n);
    END IF;
    RETURN v_n;
END;
$$;
