-- 116: los enlaces de Fourvenues, siempre al micrositio del local.
--
-- Funout trae las entradas de Fourvenues a nombre de un RRPP
-- (`/es/alejandro-aguilo-pareja/events/<evento>`) y cada sincronización las
-- vuelve a meter así. La migración 113 sólo evitaba pisar las ya corregidas, y
-- las corregidas a mano (comprobando la organización en Fourvenues) eran todas
-- de fiestas pasadas: las 50 que quedaban por venir seguían con el RRPP.
--
-- El final del enlace identifica el evento y Fourvenues lo enseña bajo
-- cualquier micrositio, así que basta con cambiar el tramo del canal por el del
-- local de la fiesta (`place_name`). Sin pedir nada a Fourvenues, que bloquea a
-- los robots. Si la sala no está en la tabla, el enlace no se toca.

CREATE TABLE IF NOT EXISTS public.fourvenues_microsites (
    -- `venue_search_key()` del nombre de la sala tal como llega en la fiesta.
    place_key TEXT PRIMARY KEY,
    slug TEXT NOT NULL
);

ALTER TABLE public.fourvenues_microsites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fourvenues_microsites FROM anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.fourvenues_microsites;
CREATE TRIGGER a_api_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fourvenues_microsites
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

INSERT INTO public.fourvenues_microsites (place_key, slug) VALUES
    ('fitz', 'fitz-mallorca'),
    ('fitz mallorca', 'fitz-mallorca'),
    ('amok', 'discoteca-amok-mallorca@amok'),
    ('amok mallorca', 'discoteca-amok-mallorca@amok'),
    ('discoteca amok', 'discoteca-amok-mallorca@amok'),
    ('over', 'over-club'),
    ('over club', 'over-club'),
    ('selva', 'selva'),
    ('selva club', 'selva'),
    ('palma events', 'palma-events'),
    ('bcm', 'bcm-mallorca'),
    ('bcm mallorca', 'bcm-mallorca'),
    ('salao', 'enredo-club'),
    ('enredo', 'enredo-club'),
    ('enredo club', 'enredo-club'),
    ('wave', 'sala-wave-club'),
    ('wave club', 'sala-wave-club'),
    ('sala wave club', 'sala-wave-club'),
    ('boomerang', 'boomerang'),
    ('boomerang club', 'boomerang')
ON CONFLICT (place_key) DO UPDATE SET slug = EXCLUDED.slug;

/**
 * El enlace de Fourvenues con el canal del local en vez del de un RRPP.
 * Acepta `site.fourvenues.com/es/<canal>/events/<evento>` y
 * `www.fourvenues.com/<canal>/events/<evento>`; cualquier otro enlace, o una
 * sala sin micrositio conocido, vuelve igual.
 */
CREATE OR REPLACE FUNCTION public.fourvenues_venue_link(p_url TEXT, p_place TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_partes TEXT[];
    v_slug TEXT;
BEGIN
    IF p_url IS NULL OR p_place IS NULL THEN
        RETURN p_url;
    END IF;
    v_partes := regexp_match(
        p_url, '^https?://(?:www|site)\.fourvenues\.com/(?:[a-z]{2}/)?([^/?#]+)/events/([^/?#]+)', 'i');
    IF v_partes IS NULL THEN
        RETURN p_url;
    END IF;
    SELECT m.slug INTO v_slug
    FROM public.fourvenues_microsites m
    WHERE m.place_key = public.venue_search_key(p_place);
    IF v_slug IS NULL OR lower(v_partes[1]) = lower(v_slug) THEN
        RETURN p_url;
    END IF;
    RETURN 'https://site.fourvenues.com/es/' || v_slug || '/events/' || v_partes[2];
END;
$$;

CREATE OR REPLACE FUNCTION public.events_fourvenues_venue_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.booking_url := public.fourvenues_venue_link(NEW.booking_url, NEW.place_name);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_fourvenues_venue_link ON public.events;
CREATE TRIGGER events_fourvenues_venue_link
    BEFORE INSERT OR UPDATE OF booking_url, place_name ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.events_fourvenues_venue_link();

REVOKE ALL ON FUNCTION public.fourvenues_venue_link(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fourvenues_venue_link(TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.events_fourvenues_venue_link() FROM PUBLIC, anon, authenticated;

-- Las que ya están creadas.
UPDATE public.events e
SET booking_url = public.fourvenues_venue_link(e.booking_url, e.place_name)
WHERE e.booking_url ILIKE '%fourvenues.com/%/events/%'
  AND public.fourvenues_venue_link(e.booking_url, e.place_name) IS DISTINCT FROM e.booking_url;
