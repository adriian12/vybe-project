-- URL legibles para las fiestas: /event/<sala>/<fiesta>
-- («/event/amok-mallorca/el-tardeo-reggaeton-viejo») en vez del UUID.
--
-- · `place_slug`: la sala (`place_name`) o, si no hay, el local.
-- · `slug`: el nombre de la fiesta. Si la sala ya tiene otra con el mismo
--   (las que se repiten cada semana), se le añade el día («-9-noviembre») y,
--   si aún choca, un número.
-- · Se fijan al crear la fiesta y no cambian: un enlace ya compartido no se
--   rompe aunque luego se corrija el nombre. Los enlaces con el UUID siguen
--   funcionando.
-- · «access» y «live» son rutas de la app (/event/:id/access, /live): nunca
--   pueden ser el slug.

CREATE OR REPLACE FUNCTION public.fiestea_slug(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(left(btrim(regexp_replace(lower(translate(COALESCE(p_text, ''),
           'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ·''’',
           'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
         '[^a-z0-9]+', '-', 'g'), '-'), 60), '-');
$$;

REVOKE ALL ON FUNCTION public.fiestea_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiestea_slug(TEXT) TO service_role;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS place_slug TEXT,
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Un slug libre para la fiesta `p_id` en la sala `p_place_slug`.
CREATE OR REPLACE FUNCTION public.event_free_slug(p_id UUID, p_place_slug TEXT, p_name TEXT, p_start TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    base TEXT := COALESCE(NULLIF(public.fiestea_slug(p_name), ''), 'fiesta');
    candidato TEXT := base;
    n INT := 2;
    meses TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio',
                          'agosto','septiembre','octubre','noviembre','diciembre'];
    dia TIMESTAMP := p_start AT TIME ZONE 'Europe/Madrid';
BEGIN
    IF candidato IN ('access', 'live') OR EXISTS (
        SELECT 1 FROM events WHERE place_slug = p_place_slug AND slug = candidato AND id <> p_id
    ) THEN
        base := left(base, 44) || '-' || extract(day FROM dia)::INT || '-' || meses[extract(month FROM dia)::INT];
        candidato := base;
        WHILE EXISTS (SELECT 1 FROM events WHERE place_slug = p_place_slug AND slug = candidato AND id <> p_id) LOOP
            candidato := base || '-' || n;
            n := n + 1;
        END LOOP;
    END IF;
    RETURN candidato;
END;
$$;

REVOKE ALL ON FUNCTION public.event_free_slug(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_free_slug(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- Al crear la fiesta se calculan; después no se tocan (ni desde la app).
CREATE OR REPLACE FUNCTION public.events_set_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.slug IS NOT NULL THEN
        NEW.place_slug := OLD.place_slug;
        NEW.slug := OLD.slug;
        RETURN NEW;
    END IF;

    NEW.place_slug := COALESCE(NULLIF(public.fiestea_slug(COALESCE(
        NULLIF(btrim(NEW.place_name), ''),
        (SELECT v.name FROM venues v WHERE v.id = NEW.venue_id))), ''), 'fiestea');
    NEW.slug := public.event_free_slug(NEW.id, NEW.place_slug, NEW.name, NEW.start_date);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_set_slug ON public.events;
CREATE TRIGGER events_set_slug
    BEFORE INSERT OR UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.events_set_slug();

-- Las que ya existen, de la más antigua a la más nueva (la primera se queda el
-- nombre limpio). Sin disparadores: no es un cambio de la fiesta, no debe
-- tocar `updated_at` ni mandar avisos.
SET LOCAL session_replication_role = replica;
DO $$
DECLARE
    r RECORD;
    sala TEXT;
BEGIN
    FOR r IN
        SELECT e.id, e.name, e.start_date, COALESCE(NULLIF(btrim(e.place_name), ''), v.name) AS lugar
          FROM events e JOIN venues v ON v.id = e.venue_id
         WHERE e.slug IS NULL
         ORDER BY e.start_date, e.id
    LOOP
        sala := COALESCE(NULLIF(public.fiestea_slug(r.lugar), ''), 'fiestea');
        UPDATE events
           SET place_slug = sala,
               slug = public.event_free_slug(r.id, sala, r.name, r.start_date)
         WHERE id = r.id;
    END LOOP;
END;
$$;
SET LOCAL session_replication_role = origin;

CREATE UNIQUE INDEX IF NOT EXISTS events_place_slug_slug_key ON public.events (place_slug, slug);

-- La app y la vista previa de los enlaces: de /event/<sala>/<fiesta> al id.
-- Que una fiesta exista no es secreto (su ficha pública se ve sin cuenta).
CREATE OR REPLACE FUNCTION public.get_event_id_by_slug(p_place_slug TEXT, p_slug TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM events WHERE place_slug = lower(p_place_slug) AND slug = lower(p_slug);
$$;

REVOKE ALL ON FUNCTION public.get_event_id_by_slug(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_id_by_slug(TEXT, TEXT) TO anon, authenticated, service_role;
