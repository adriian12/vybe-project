-- 123: el tipo de sitio de cada fiesta: discoteca, terraza o al aire libre.
--
-- El filtro «Tipo de negocio» del mapa usaba el tipo del negocio y casi todas
-- las fiestas son de Fiestea (Funout, escáner), cuyo tipo es «local»: no
-- filtraba nada. Ahora cada fiesta lleva `place_type`, deducido del nombre de
-- la sala, de la fiesta y del tipo del negocio, y se pone solo al crearla si
-- no viene. Se puede corregir a mano.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS place_type TEXT
    CHECK (place_type IN ('discoteca', 'terraza', 'aire_libre'));

/**
 * Lo que parece una fiesta. Manda el nombre de la sala; del nombre de la
 * fiesta sólo «festival» u «open air» (un «Sunset» en el nombre no hace
 * terraza a una discoteca).
 */
CREATE OR REPLACE FUNCTION public.guess_place_type(p_place TEXT, p_name TEXT, p_venue_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_venue_type = 'festival'
          OR public.venue_search_key(p_place) ~ '(festival|open air|aire libre|recinto|parque|park\M|outdoor|explanada|estadio)'
          OR public.venue_search_key(p_name) ~ '(festival|open air|aire libre)'
            THEN 'aire_libre'
        WHEN public.venue_search_key(p_place) ~ '(terraza|terrace|rooftop|roof top|azotea|beach|playa|chiringuito|piscina|pool\M|jardin|garden)'
            THEN 'terraza'
        ELSE 'discoteca'
    END;
$$;

CREATE OR REPLACE FUNCTION public.events_set_place_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.place_type IS NULL THEN
        NEW.place_type := public.guess_place_type(
            NEW.place_name, NEW.name,
            (SELECT v.type FROM public.venues v WHERE v.id = NEW.venue_id));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_set_place_type ON public.events;
CREATE TRIGGER events_set_place_type
    BEFORE INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.events_set_place_type();

REVOKE ALL ON FUNCTION public.events_set_place_type() FROM PUBLIC, anon, authenticated;

-- Las que ya están creadas.
UPDATE public.events e
SET place_type = public.guess_place_type(e.place_name, e.name, v.type)
FROM public.venues v
WHERE v.id = e.venue_id;
