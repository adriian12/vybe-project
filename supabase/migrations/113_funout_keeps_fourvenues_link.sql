-- ============================================================================
-- 113 · Funout no pisa el enlace de Fourvenues corregido a mano
-- ============================================================================
-- Funout trae los enlaces de entradas de Fourvenues a nombre de un RRPP
-- («/es/alejandro-aguilo-pareja/events/…»). Administración los cambia por el
-- del micrositio de la discoteca («/es/fitz-mallorca/events/…»), y la
-- sincronización diaria los volvía a dejar como estaban.
--
-- Ahora, si la fiesta ya tiene un enlace de Fourvenues al MISMO evento (lo
-- que va detrás de «/events/» es igual), se conserva. Si Funout cambia de
-- evento o de web, se actualiza como siempre.
-- ============================================================================

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
        booking_url = CASE
            WHEN public.events.booking_url ILIKE '%fourvenues.com/%/events/%'
             AND EXCLUDED.booking_url ILIKE '%fourvenues.com/%/events/%'
             AND split_part(split_part(public.events.booking_url, '/events/', 2), '?', 1)
               = split_part(split_part(EXCLUDED.booking_url, '/events/', 2), '?', 1)
            THEN public.events.booking_url
            ELSE COALESCE(EXCLUDED.booking_url, public.events.booking_url)
        END,
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
