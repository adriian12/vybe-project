-- Redes sociales del negocio y calendario de su ficha.
--
-- El negocio pone en «Negocio» su Instagram (ya existía, migración 077), X,
-- YouTube y TikTok, y la ficha pública enseña un botón por cada una. Se guarda
-- sólo el usuario (o la ruta del canal en YouTube): la app limpia «@x» y los
-- enlaces antes de guardar y arma la URL al pintar.
--
-- La ficha tiene ahora un calendario de fiestas por meses, así que
-- get_venue_events_public devuelve hasta 100 próximas en vez de 20.

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS social_x TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS social_youtube TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS social_tiktok TEXT;

ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_social_x_check;
ALTER TABLE public.venues ADD CONSTRAINT venues_social_x_check
    CHECK (social_x IS NULL OR social_x ~ '^[A-Za-z0-9_]{1,15}$');
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_social_youtube_check;
ALTER TABLE public.venues ADD CONSTRAINT venues_social_youtube_check
    CHECK (social_youtube IS NULL OR social_youtube ~ '^(@[A-Za-z0-9._-]{3,30}|channel/UC[A-Za-z0-9_-]{22})$');
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_social_tiktok_check;
ALTER TABLE public.venues ADD CONSTRAINT venues_social_tiktok_check
    CHECK (social_tiktok IS NULL OR social_tiktok ~ '^[A-Za-z0-9._]{2,24}$');

-- Las columnas de venues se leen una a una (migración 094).
GRANT SELECT (social_x, social_youtube, social_tiktok) ON public.venues TO authenticated;

DROP FUNCTION IF EXISTS public.get_venue_profile(UUID);

CREATE FUNCTION public.get_venue_profile(p_venue_id UUID)
RETURNS TABLE(
    id UUID, name TEXT, type TEXT, city TEXT, region TEXT, address TEXT, latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION, description TEXT, opening_hours JSONB, followers BIGINT, i_follow BOOLEAN,
    subscribed BOOLEAN, logo_url TEXT, phone TEXT, contact_email TEXT, website TEXT, instagram TEXT,
    social_x TEXT, social_youtube TEXT, social_tiktok TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        v.id, v.name, v.type, v.city, v.region, v.address, v.latitude, v.longitude,
        v.description, v.opening_hours,
        (SELECT COUNT(*) FROM public.venue_followers f WHERE f.venue_id = v.id),
        EXISTS (SELECT 1 FROM public.venue_followers f
                WHERE f.venue_id = v.id AND f.profile_id = public.current_profile_id()),
        public.venue_plan(v.id) IN ('pro', 'business'),
        v.logo_url, v.phone, v.contact_email, v.website, v.instagram,
        v.social_x, v.social_youtube, v.social_tiktok
    FROM public.venues v
    WHERE v.id = p_venue_id AND v.is_verified;
$$;

REVOKE ALL ON FUNCTION public.get_venue_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_profile(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_venue_events_public(p_venue_id uuid)
RETURNS TABLE(id uuid, name text, start_date timestamp with time zone, end_date timestamp with time zone,
              poster_url text, price numeric, theme text, featured boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    (SELECT e.id, e.name, e.start_date, e.end_date, e.poster_url, e.price, e.theme,
            COALESCE(e.featured_until > NOW(), FALSE)
     FROM public.events e JOIN public.venues v ON v.id = e.venue_id AND v.is_verified
     WHERE e.venue_id = p_venue_id AND e.end_date > NOW()
     ORDER BY e.start_date
     LIMIT 100)
    UNION ALL
    (SELECT e.id, e.name, e.start_date, e.end_date, e.poster_url, e.price, e.theme, FALSE
     FROM public.events e JOIN public.venues v ON v.id = e.venue_id AND v.is_verified
     WHERE e.venue_id = p_venue_id AND e.end_date <= NOW()
     ORDER BY e.start_date DESC
     LIMIT 8);
$$;
