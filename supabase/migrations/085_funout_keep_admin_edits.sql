-- Al poner al día una fiesta ya añadida desde Funout sólo se cambia lo que
-- Funout manda de verdad: fechas, cartel y enlace de compra (y la ubicación si
-- aún no tenía). El nombre, la sala, la dirección, el precio y lo demás, una
-- vez añadida, son de administración: antes cada pasada pisaba sus ediciones.

CREATE OR REPLACE FUNCTION public.funout_upsert_event(p_funout_id BIGINT, p_venue_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    f public.funout_events%ROWTYPE;
    v_id UUID;
    v_desc TEXT;
BEGIN
    SELECT * INTO f FROM public.funout_events WHERE funout_id = p_funout_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_desc := CASE WHEN cardinality(f.lineup) > 0 THEN 'Line-up: ' || array_to_string(f.lineup, ', ') END;

    INSERT INTO public.events (
        venue_id, name, description, start_date, end_date, latitude, longitude, theme, dress_code,
        price, booking_url, poster_url, city, region, place_name, address, requires_location,
        external_source, external_id
    ) VALUES (
        p_venue_id, left(f.title, 120), v_desc, f.start_at, f.end_at, f.latitude, f.longitude, f.theme,
        f.dress_code, CASE WHEN f.is_free THEN 0 END, f.ticket_url, f.image_url, f.city, 'Illes Balears',
        f.place_name, f.address, f.latitude IS NOT NULL AND f.longitude IS NOT NULL,
        'funout', f.funout_id::TEXT
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
        updated_at = NOW()
    RETURNING id INTO v_id;

    UPDATE public.funout_events SET imported_event_id = v_id WHERE funout_id = p_funout_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.funout_upsert_event(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.funout_upsert_event(BIGINT, UUID) TO service_role;
