-- Eventos de Funout (funout.es), con su permiso: sólo los datos (nombre, sala,
-- día y hora, dirección, ubicación, estilo, dress code, cartel y enlace de
-- entradas). Ni sus textos ni su diseño.
--
--   1. La Edge Function `funout-sync` lee su API cada hora (pg_cron
--      `fiestea-funout`, con `CRON_SECRET`) y guarda cada evento en
--      `funout_events`, sin duplicar: la clave es el id de Funout.
--   2. Administración ve en Eventos → FUNOUT los que aún no han empezado,
--      marca los que quiere y «Añadir a FIESTEA» los crea como fiestas del
--      local de la casa (`admin_import_funout`).
--   3. Las ya añadidas se actualizan solas en cada pasada: fechas, cartel,
--      sala y enlace de compra (`funout_refresh_imported`).
--
-- Además: los eventos llevan su propio lugar (`place_name`, `address`), que
-- hasta ahora salía siempre del local, y administración puede editar las
-- fiestas que crea (`admin_update_event`).

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS place_name TEXT CHECK (place_name IS NULL OR char_length(place_name) <= 120),
    ADD COLUMN IF NOT EXISTS address TEXT CHECK (address IS NULL OR char_length(address) <= 240),
    ADD COLUMN IF NOT EXISTS external_source TEXT,
    ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS events_external_uidx
    ON public.events (external_source, external_id)
    WHERE external_id IS NOT NULL;

-- --------------------------------------------------------------- staging
CREATE TABLE IF NOT EXISTS public.funout_events (
    funout_id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    place_name TEXT,
    address TEXT,
    city TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    image_url TEXT,
    ticket_url TEXT,
    source_url TEXT,
    theme TEXT,
    genres TEXT[] NOT NULL DEFAULT '{}',
    dress_code TEXT,
    is_free BOOLEAN NOT NULL DEFAULT FALSE,
    lineup TEXT[] NOT NULL DEFAULT '{}',
    event_type TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    imported_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS funout_events_start_idx ON public.funout_events (start_at);

-- Coordenadas por sala: Funout sólo las trae en algunas; las demás se buscan
-- una vez por dirección (OpenStreetMap) y se guardan aquí.
CREATE TABLE IF NOT EXISTS public.funout_places (
    place_key TEXT PRIMARY KEY,
    name TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    geocoded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.funout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funout_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funout: sólo administración lee" ON public.funout_events;
CREATE POLICY "funout: sólo administración lee" ON public.funout_events
    FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.funout_events, public.funout_places FROM anon, authenticated;
GRANT SELECT ON public.funout_events TO authenticated;

-- ------------------------------------------------------ lista para el panel
CREATE OR REPLACE FUNCTION public.admin_list_funout()
RETURNS TABLE(
    funout_id BIGINT, title TEXT, start_at TIMESTAMPTZ, end_at TIMESTAMPTZ, place_name TEXT,
    address TEXT, city TEXT, has_location BOOLEAN, image_url TEXT, ticket_url TEXT, theme TEXT,
    genres TEXT[], dress_code TEXT, is_free BOOLEAN, lineup TEXT[], imported_event_id UUID,
    synced_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN QUERY
    SELECT f.funout_id, f.title, f.start_at, f.end_at, f.place_name, f.address, f.city,
           f.latitude IS NOT NULL AND f.longitude IS NOT NULL, f.image_url, f.ticket_url, f.theme,
           f.genres, f.dress_code, f.is_free, f.lineup,
           -- Si la fiesta creada se borró, vuelve a salir como no añadida.
           (SELECT e.id FROM public.events e WHERE e.id = f.imported_event_id),
           f.synced_at
    FROM public.funout_events f
    WHERE f.start_at > NOW()
    ORDER BY f.start_at, f.title;
END;
$$;

-- --------------------------------------- de Funout a una fiesta de Fiestea
-- Copia los datos de una fila de funout_events a su fiesta (nueva o la que ya
-- tenía). Sólo la usan admin_import_funout y funout_refresh_imported.
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
        name = EXCLUDED.name,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        latitude = COALESCE(EXCLUDED.latitude, public.events.latitude),
        longitude = COALESCE(EXCLUDED.longitude, public.events.longitude),
        requires_location = COALESCE(EXCLUDED.latitude, public.events.latitude) IS NOT NULL,
        booking_url = EXCLUDED.booking_url,
        poster_url = COALESCE(EXCLUDED.poster_url, public.events.poster_url),
        place_name = EXCLUDED.place_name,
        address = COALESCE(EXCLUDED.address, public.events.address),
        city = COALESCE(EXCLUDED.city, public.events.city),
        updated_at = NOW()
    RETURNING id INTO v_id;

    UPDATE public.funout_events SET imported_event_id = v_id WHERE funout_id = p_funout_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_import_funout(p_ids BIGINT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
    v_id BIGINT;
    v_n INTEGER := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    v_venue := public.admin_house_venue();
    FOREACH v_id IN ARRAY COALESCE(p_ids, '{}') LOOP
        IF public.funout_upsert_event(v_id, v_venue) IS NOT NULL THEN
            v_n := v_n + 1;
        END IF;
    END LOOP;
    RETURN v_n;
END;
$$;

-- En cada pasada del sincronizador: las ya añadidas se ponen al día.
CREATE OR REPLACE FUNCTION public.funout_refresh_imported()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    v_n INTEGER := 0;
BEGIN
    FOR r IN
        SELECT f.funout_id, e.venue_id
        FROM public.funout_events f
        JOIN public.events e ON e.id = f.imported_event_id
        WHERE e.end_date > NOW()
    LOOP
        PERFORM public.funout_upsert_event(r.funout_id, r.venue_id);
        v_n := v_n + 1;
    END LOOP;
    RETURN v_n;
END;
$$;

-- ------------------------------------------- editar las fiestas de la casa
CREATE OR REPLACE FUNCTION public.admin_update_event(
    p_event_id UUID,
    p_name TEXT,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_description TEXT,
    p_city TEXT,
    p_price NUMERIC,
    p_capacity INTEGER,
    p_theme TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_place_name TEXT,
    p_address TEXT,
    p_dress_code TEXT,
    p_booking_url TEXT,
    p_poster_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        updated_at = NOW()
    WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND';
    END IF;
END;
$$;

-- -------------------------------------------------------------- programador
-- Llama cada hora a `funout-sync` con el secreto de Vault `funout_cron_secret`
-- (el mismo valor que el `CRON_SECRET` de la función).
CREATE OR REPLACE FUNCTION public.trigger_funout_sync()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret TEXT;
    v_url TEXT;
BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'funout_cron_secret';
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'functions_url';
    IF v_secret IS NULL OR v_url IS NULL THEN
        RAISE WARNING 'Sin funout_cron_secret o functions_url en Vault: no se sincroniza Funout.';
        RETURN;
    END IF;
    PERFORM net.http_post(
        url := v_url || '/funout-sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
END;
$$;

DO $$
BEGIN
    PERFORM cron.unschedule('fiestea-funout') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiestea-funout');
    PERFORM cron.schedule('fiestea-funout', '7 * * * *', 'SELECT public.trigger_funout_sync()');
END $$;

-- ---------------------------------------------------------------- permisos
REVOKE ALL ON FUNCTION public.admin_list_funout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_funout() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_import_funout(BIGINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_funout(BIGINT[]) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_update_event(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, NUMERIC, INTEGER, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_event(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, NUMERIC, INTEGER, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.funout_upsert_event(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.funout_upsert_event(BIGINT, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.funout_refresh_imported() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.funout_refresh_imported() TO service_role;
REVOKE ALL ON FUNCTION public.trigger_funout_sync() FROM PUBLIC, anon, authenticated;
