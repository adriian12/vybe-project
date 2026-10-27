-- 125: la ficha de una fiesta y la compra de entradas, sin cuenta.
--
-- Un enlace como app.fiestea.es/event/<id> abierto en el ordenador llevaba a
-- «Fiestea se vive desde el móvil», y se perdían ventas. Ahora la web enseña
-- la ficha de la fiesta y deja comprar sus entradas sin cuenta: llegan al
-- correo que se pone en el formulario.
--
-- Sólo lo necesario para vender: los datos públicos de la fiesta
-- (`get_public_event`) y lo que ya se enseña en la compra (tipos de entrada y
-- datos legales del vendedor). Nada de quién va ni de quién está dentro.

CREATE OR REPLACE FUNCTION public.get_public_event(p_event_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    poster_url TEXT,
    place_name TEXT,
    address TEXT,
    city TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    lineup JSONB,
    theme TEXT,
    min_age INTEGER,
    dress_code TEXT,
    price NUMERIC,
    booking_url TEXT,
    venue_id UUID,
    venue_name TEXT,
    venue_logo TEXT,
    venue_is_platform BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.id, e.name, e.description, e.start_date, e.end_date, e.poster_url,
           e.place_name, COALESCE(e.address, v.address), COALESCE(e.city, v.city),
           COALESCE(e.latitude, v.latitude), COALESCE(e.longitude, v.longitude),
           to_jsonb(e.lineup), e.theme, e.min_age, e.dress_code, e.price::NUMERIC, e.booking_url,
           v.id, v.name, v.logo_url, COALESCE(v.is_platform, FALSE)
    FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    WHERE e.id = p_event_id
      AND e.end_date > NOW()
      AND (v.is_verified OR v.is_platform);
$$;

REVOKE ALL ON FUNCTION public.get_public_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_event(UUID) TO anon, authenticated;

-- Las entradas a la venta y la ficha de compra, también sin cuenta.
GRANT EXECUTE ON FUNCTION public.get_event_ticket_types(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_checkout(UUID) TO anon;

-- Que PostgREST vea la función nueva sin esperar.
NOTIFY pgrst, 'reload schema';
