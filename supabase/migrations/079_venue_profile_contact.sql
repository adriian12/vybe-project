-- La ficha pública del negocio enseña su logo y cómo contactarle (perfil del
-- negocio, migración 077).

DROP FUNCTION IF EXISTS public.get_venue_profile(UUID);

CREATE FUNCTION public.get_venue_profile(p_venue_id UUID)
RETURNS TABLE(
    id UUID, name TEXT, type TEXT, city TEXT, region TEXT, address TEXT, latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION, description TEXT, opening_hours JSONB, followers BIGINT, i_follow BOOLEAN,
    subscribed BOOLEAN, logo_url TEXT, phone TEXT, contact_email TEXT, website TEXT, instagram TEXT
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
        v.logo_url, v.phone, v.contact_email, v.website, v.instagram
    FROM public.venues v
    WHERE v.id = p_venue_id AND v.is_verified;
$$;

REVOKE ALL ON FUNCTION public.get_venue_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_profile(UUID) TO authenticated, service_role;
