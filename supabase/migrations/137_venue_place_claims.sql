-- 137: un negocio que se da de alta se queda con las fiestas de su sala.
--
-- Las fiestas que crea administración, Funout y el escáner cuelgan del negocio
-- de la casa (Fiestea, `is_platform`) y llevan la sala en `place_name`. Si Fitz
-- se registra, no tiene que volver a crear las fiestas que ya están: elige su
-- sala en el alta, queda una solicitud y, cuando administración la aprueba,
-- esas fiestas pasan a ser suyas (organizador, ajustes y datos).
--
--   · `search_house_places`: autocompletado del nombre en el alta (sin sesión).
--   · `venue_place_claims`: la solicitud; se crea sola al insertar el negocio,
--     con la sala elegida (`claimed_place` en los metadatos del alta) o, si no
--     eligió, con la que se llame exactamente igual que el negocio.
--   · `admin_pending_place_claims` / `admin_decide_place_claim`: administración.
--   · Las fiestas que lleguen después de esa sala van ya al negocio.

CREATE TABLE IF NOT EXISTS public.venue_place_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    place_key TEXT NOT NULL,
    place_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by UUID,
    events_moved INTEGER
);

-- Una sala sólo puede ser de un negocio; un negocio, una solicitud abierta.
CREATE UNIQUE INDEX IF NOT EXISTS venue_place_claims_one_owner
    ON public.venue_place_claims (place_key) WHERE status = 'approved';
CREATE UNIQUE INDEX IF NOT EXISTS venue_place_claims_one_pending
    ON public.venue_place_claims (venue_id) WHERE status = 'pending';

ALTER TABLE public.venue_place_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venue_place_claims FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.venue_place_claims;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.venue_place_claims
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- Para las búsquedas por sala en las fiestas de la casa.
CREATE INDEX IF NOT EXISTS events_place_key_idx
    ON public.events (public.venue_search_key(place_name));

-- ------------------------------------------------------------ autocompletado
CREATE OR REPLACE FUNCTION public.search_house_places(p_query TEXT)
RETURNS TABLE (place_name TEXT, city TEXT, upcoming INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_q TEXT := public.venue_search_key(p_query);
BEGIN
    IF length(v_q) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT mode() WITHIN GROUP (ORDER BY e.place_name)::TEXT,
           mode() WITHIN GROUP (ORDER BY e.city)::TEXT,
           COUNT(*)::INTEGER
      FROM public.events e
      JOIN public.venues v ON v.id = e.venue_id AND v.is_platform
     WHERE e.place_name IS NOT NULL
       AND COALESCE(e.end_date, e.start_date) > NOW()
       AND public.venue_search_key(e.place_name) LIKE '%' || v_q || '%'
       AND NOT EXISTS (
           SELECT 1 FROM public.venue_place_claims c
            WHERE c.status = 'approved' AND c.place_key = public.venue_search_key(e.place_name))
     GROUP BY public.venue_search_key(e.place_name)
     ORDER BY bool_or(public.venue_search_key(e.place_name) LIKE v_q || '%') DESC, COUNT(*) DESC
     LIMIT 6;
END;
$$;

REVOKE ALL ON FUNCTION public.search_house_places(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_house_places(TEXT) TO anon, authenticated;

-- ------------------------------------------------- solicitud al crear negocio
CREATE OR REPLACE FUNCTION public.venue_claim_place_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wanted TEXT;
    v_key TEXT;
    v_name TEXT;
BEGIN
    IF NEW.is_platform THEN
        RETURN NULL;
    END IF;

    SELECT NULLIF(btrim(u.raw_user_meta_data->>'claimed_place'), '') INTO v_wanted
      FROM auth.users u WHERE u.id = NEW.venue_id;

    v_key := public.venue_search_key(COALESCE(v_wanted, NEW.name));
    IF v_key = '' THEN
        RETURN NULL;
    END IF;

    SELECT mode() WITHIN GROUP (ORDER BY e.place_name) INTO v_name
      FROM public.events e
      JOIN public.venues v ON v.id = e.venue_id AND v.is_platform
     WHERE public.venue_search_key(e.place_name) = v_key;

    IF v_name IS NULL OR EXISTS (
        SELECT 1 FROM public.venue_place_claims c WHERE c.status = 'approved' AND c.place_key = v_key
    ) THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.venue_place_claims (venue_id, place_key, place_name)
    VALUES (NEW.id, v_key, v_name)
    ON CONFLICT DO NOTHING;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.venue_claim_place_on_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS venues_claim_place ON public.venues;
CREATE TRIGGER venues_claim_place
    AFTER INSERT ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.venue_claim_place_on_insert();

-- ------------------------------------------------------------ administración
CREATE OR REPLACE FUNCTION public.admin_pending_place_claims()
RETURNS TABLE (
    claim_id UUID,
    venue_id UUID,
    place_name TEXT,
    upcoming INTEGER,
    total INTEGER
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
    SELECT c.id, c.venue_id, c.place_name,
           COUNT(e.id) FILTER (WHERE COALESCE(e.end_date, e.start_date) > NOW())::INTEGER,
           COUNT(e.id)::INTEGER
      FROM public.venue_place_claims c
      LEFT JOIN public.venues h ON h.is_platform
      LEFT JOIN public.events e
        ON e.venue_id = h.id AND public.venue_search_key(e.place_name) = c.place_key
     WHERE c.status = 'pending'
     GROUP BY c.id, c.venue_id, c.place_name, c.created_at
     ORDER BY c.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pending_place_claims() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pending_place_claims() TO authenticated;

-- Aprobar pasa al negocio todas las fiestas de la sala (también las pasadas,
-- que son su historial); devuelve cuántas.
CREATE OR REPLACE FUNCTION public.admin_decide_place_claim(p_claim_id UUID, p_approve BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_claim public.venue_place_claims%ROWTYPE;
    v_moved INTEGER := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT * INTO v_claim FROM public.venue_place_claims WHERE id = p_claim_id FOR UPDATE;
    IF NOT FOUND OR v_claim.status <> 'pending' THEN
        RAISE EXCEPTION 'CLAIM_NOT_PENDING';
    END IF;

    IF COALESCE(p_approve, FALSE) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.venues WHERE id = v_claim.venue_id AND verification_status = 'approved'
        ) THEN
            RAISE EXCEPTION 'VENUE_NOT_APPROVED';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.venue_place_claims
             WHERE status = 'approved' AND place_key = v_claim.place_key
        ) THEN
            RAISE EXCEPTION 'PLACE_ALREADY_CLAIMED';
        END IF;

        UPDATE public.events e
           SET venue_id = v_claim.venue_id
          FROM public.venues h
         WHERE h.is_platform
           AND e.venue_id = h.id
           AND public.venue_search_key(e.place_name) = v_claim.place_key;
        GET DIAGNOSTICS v_moved = ROW_COUNT;
    END IF;

    UPDATE public.venue_place_claims
       SET status = CASE WHEN COALESCE(p_approve, FALSE) THEN 'approved' ELSE 'rejected' END,
           decided_at = NOW(),
           decided_by = auth.uid(),
           events_moved = v_moved
     WHERE id = p_claim_id;

    RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_decide_place_claim(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_place_claim(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------- lo que llegue después va al negocio
-- Funout, el escáner o administración siguen creando en el negocio de la casa;
-- si la sala ya tiene dueño, la fiesta nace suya. Se llama «a_…» para correr
-- antes que los demás disparadores de inserción (límite de plan, swipe de las
-- fiestas de la plataforma).
CREATE OR REPLACE FUNCTION public.events_route_claimed_place()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner UUID;
BEGIN
    IF NEW.place_name IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.is_platform) THEN
        RETURN NEW;
    END IF;

    SELECT c.venue_id INTO v_owner
      FROM public.venue_place_claims c
     WHERE c.status = 'approved' AND c.place_key = public.venue_search_key(NEW.place_name);

    IF v_owner IS NOT NULL THEN
        NEW.venue_id := v_owner;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.events_route_claimed_place() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_events_route_claimed_place ON public.events;
CREATE TRIGGER a_events_route_claimed_place
    BEFORE INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.events_route_claimed_place();
