-- 110: llegar a la ficha de un negocio.
--
--   · `search_venues`: el buscador del mapa encuentra también negocios, no
--     sólo fiestas.
--   · `get_my_followed_venues`: «Negocios que sigues» en el perfil.
--   · El negocio de la casa (Fiestea, `is_platform`) organiza las fiestas que
--     crea administración y las de Funout; su ficha lleva el logo de Fiestea.
--
-- Las dos funciones sólo devuelven lo que ya enseña la ficha pública
-- (`get_venue_profile`) y sólo de negocios verificados.

CREATE OR REPLACE FUNCTION public.venue_search_key(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT btrim(regexp_replace(
        lower(translate(coalesce(p_text, ''), 'ÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇáéíóúàèìòùäëïöüâêîôûñç',
                                               'aeiouaeiouaeiouaeiounc' || 'aeiouaeiouaeiouaeiounc')),
        '[^a-z0-9]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.search_venues(p_query TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    city TEXT,
    logo_url TEXT,
    upcoming INTEGER,
    is_platform BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_q TEXT := public.venue_search_key(p_query);
BEGIN
    IF public.current_profile_id() IS NULL OR length(v_q) < 2 THEN
        RETURN;
    END IF;
    RETURN QUERY
    SELECT v.id, v.name, v.city, v.logo_url,
           (SELECT COUNT(*)::INTEGER FROM public.events e
             WHERE e.venue_id = v.id AND e.end_date > NOW()),
           COALESCE(v.is_platform, FALSE)
      FROM public.venues v
     WHERE v.is_verified
       AND public.venue_search_key(v.name) LIKE '%' || v_q || '%'
     ORDER BY (public.venue_search_key(v.name) LIKE v_q || '%') DESC,
              (SELECT COUNT(*) FROM public.events e WHERE e.venue_id = v.id AND e.end_date > NOW()) DESC,
              v.name
     LIMIT 8;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_followed_venues()
RETURNS TABLE (
    id UUID,
    name TEXT,
    city TEXT,
    logo_url TEXT,
    upcoming INTEGER,
    next_event_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT v.id, v.name, v.city, v.logo_url,
           (SELECT COUNT(*)::INTEGER FROM public.events e
             WHERE e.venue_id = v.id AND e.end_date > NOW()),
           (SELECT MIN(e.start_date) FROM public.events e
             WHERE e.venue_id = v.id AND e.end_date > NOW())
      FROM public.venue_followers f
      JOIN public.venues v ON v.id = f.venue_id
     WHERE f.profile_id = public.current_profile_id()
       AND v.is_verified
     ORDER BY 6 NULLS LAST, v.name;
$$;

REVOKE ALL ON FUNCTION public.venue_search_key(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_venues(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_followed_venues() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venue_search_key(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_venues(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_followed_venues() TO authenticated, service_role;

-- El negocio de la casa no tenía logo: lleva el de Fiestea.
UPDATE public.venues
   SET logo_url = 'https://fiestea.es/icons/icon-512.png'
 WHERE is_platform AND logo_url IS NULL;
