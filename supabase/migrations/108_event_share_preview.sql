-- 108: vista previa de los enlaces de una fiesta (WhatsApp, Telegram, iMessage…).
--
-- Quien recibe el enlace `app.fiestea.es/event/<id>` no tiene sesión, y el
-- robot que pinta la tarjeta tampoco. Vercel le sirve una página con las
-- etiquetas Open Graph de la fiesta (`api/share-event.ts`) y el cartel en JPG
-- (`api/share-image.ts`), y las dos leen sólo esto: lo mismo que enseña la
-- tarjeta de la fiesta en la app, nada de aforo, ventas ni personas.

CREATE OR REPLACE FUNCTION public.get_event_share(p_event_id UUID)
RETURNS TABLE (
  name TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  poster_url TEXT,
  place TEXT,
  city TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.name,
         e.start_date,
         e.end_date,
         e.poster_url,
         COALESCE(NULLIF(btrim(e.place_name), ''), v.name),
         COALESCE(NULLIF(btrim(e.city), ''), v.city)
    FROM events e
    JOIN venues v ON v.id = e.venue_id
   WHERE e.id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_share(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_share(UUID) TO anon, authenticated, service_role;
