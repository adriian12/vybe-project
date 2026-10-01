-- ============================================================================
-- 037 · Solicitudes de locales desde la landing
--
-- La landing pública tiene un formulario para que una discoteca, un bar o un
-- festival pida que le enseñemos Vybe. Cada envío queda aquí y administración
-- lo gestiona desde /admin/dashboard → Solicitudes.
--
-- Nadie escribe en esta tabla desde el navegador: el formulario llama a la
-- Edge Function `venue-lead`, que valida, limita envíos por IP, inserta con
-- service role y avisa por correo. Por eso no hay policy de INSERT y `anon` no
-- tiene ningún permiso. Leer y cambiar el estado es sólo de administración.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.venue_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_name TEXT NOT NULL CHECK (char_length(venue_name) BETWEEN 2 AND 120),
    city TEXT NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
    venue_type TEXT CHECK (venue_type IS NULL OR venue_type IN ('discoteca', 'bar', 'festival', 'club', 'beach_club', 'otro')),
    contact TEXT NOT NULL CHECK (char_length(contact) BETWEEN 5 AND 160),
    message TEXT CHECK (message IS NULL OR char_length(message) <= 1000),
    locale TEXT,
    source TEXT NOT NULL DEFAULT 'landing',
    -- Hash de la IP con sal: basta para limitar envíos y no guarda la IP.
    ip_hash TEXT,
    consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'discarded')),
    handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    handled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS venue_leads_created_at_idx ON public.venue_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS venue_leads_ip_hash_idx ON public.venue_leads (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS venue_leads_status_idx ON public.venue_leads (status);

ALTER TABLE public.venue_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_leads_admin_select ON public.venue_leads;
CREATE POLICY venue_leads_admin_select ON public.venue_leads
    FOR SELECT TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS venue_leads_admin_update ON public.venue_leads;
CREATE POLICY venue_leads_admin_update ON public.venue_leads
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

REVOKE ALL ON public.venue_leads FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (status, handled_by, handled_at) ON public.venue_leads TO authenticated;

-- Quién y cuándo la gestionó lo pone la base de datos, no el navegador.
CREATE OR REPLACE FUNCTION public.venue_leads_stamp_handler()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.handled_by := auth.uid();
        NEW.handled_at := NOW();
    ELSE
        NEW.handled_by := OLD.handled_by;
        NEW.handled_at := OLD.handled_at;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.venue_leads_stamp_handler() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS venue_leads_stamp_handler ON public.venue_leads;
CREATE TRIGGER venue_leads_stamp_handler
    BEFORE UPDATE ON public.venue_leads
    FOR EACH ROW EXECUTE FUNCTION public.venue_leads_stamp_handler();

COMMENT ON TABLE public.venue_leads IS
    'Solicitudes de locales enviadas desde la landing. Las inserta la Edge Function venue-lead; sólo administración las lee.';
