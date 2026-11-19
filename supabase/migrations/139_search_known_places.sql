-- Salas que ya salen en alguna fiesta, para el buscador de ubicación al crear una
-- fiesta (administración y negocios): con «gremi» se elige «Es Gremi» y se usa su
-- punto en el mapa, la dirección y la ciudad de siempre, sin volver a buscarlas.
--
-- Agrupa por venue_search_key (migración 137: sin tildes, espacios ni mayúsculas),
-- así «Es gremi» y «Es Gremi» son la misma sala. De cada una devuelve lo que más se
-- repite (nombre, punto, dirección, ciudad) entre sus fiestas con punto en el mapa.

CREATE OR REPLACE FUNCTION public.search_known_places(p_query TEXT)
RETURNS TABLE (
    place_name TEXT,
    address TEXT,
    city TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    events INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_q TEXT := public.venue_search_key(p_query);
BEGIN
    -- Sólo quien crea fiestas: administración o alguien con negocio.
    IF auth.uid() IS NULL OR NOT COALESCE(
        public.is_admin() OR EXISTS (SELECT 1 FROM public.venues v WHERE v.venue_id = auth.uid()),
        FALSE
    ) THEN
        RETURN;
    END IF;
    IF length(v_q) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH f AS (
        SELECT e.place_name, e.address, e.city, e.latitude, e.longitude,
               public.venue_search_key(e.place_name) AS k
          FROM public.events e
         WHERE e.place_name IS NOT NULL
           AND e.latitude IS NOT NULL
           AND e.longitude IS NOT NULL
           AND public.venue_search_key(e.place_name) LIKE '%' || v_q || '%'
    ),
    punto AS (
        -- El punto más repetido de cada sala (el nombre, la dirección y la ciudad, también).
        SELECT k,
               mode() WITHIN GROUP (ORDER BY f.latitude::TEXT || ',' || f.longitude::TEXT) AS p,
               mode() WITHIN GROUP (ORDER BY f.place_name) AS nombre,
               mode() WITHIN GROUP (ORDER BY f.address) AS dir,
               mode() WITHIN GROUP (ORDER BY f.city) AS ciudad,
               COUNT(*)::INTEGER AS n,
               bool_or(f.k LIKE v_q || '%') AS empieza
          FROM f
         GROUP BY k
    )
    SELECT punto.nombre::TEXT, punto.dir::TEXT, punto.ciudad::TEXT,
           split_part(punto.p, ',', 1)::DOUBLE PRECISION,
           split_part(punto.p, ',', 2)::DOUBLE PRECISION,
           punto.n
      FROM punto
     ORDER BY punto.empieza DESC, punto.n DESC
     LIMIT 6;
END;
$$;

REVOKE ALL ON FUNCTION public.search_known_places(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_known_places(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_known_places(TEXT) TO authenticated;
