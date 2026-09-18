-- =============================================================================
-- 041 · Permisos de métricas que no se saltan con NULL
-- =============================================================================
--
-- `can_read_venue_metrics()` devolvía NULL, no FALSE, cuando quien llama no
-- tiene local: `current_venue_id() = p_venue_id` con NULL a la izquierda es NULL.
-- Todas las funciones lo usan como `IF NOT public.can_read_…() THEN RAISE`, y
-- `NOT NULL` es NULL, así que el IF no saltaba: cualquier usuario con sesión
-- podía leer el aforo, el embudo o la demografía de cualquier evento (y, con la
-- 040, contar). Se apareció al probar el contador sin sesión de local.
--
-- Arreglado en la raíz, así vale para todas las que dependen de ella.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_read_venue_metrics(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        p_venue_id IS NOT NULL
        AND (public.current_venue_id() = p_venue_id OR public.is_admin()),
        FALSE
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_event_metrics(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        public.can_read_venue_metrics(
            (SELECT e.venue_id FROM public.events e WHERE e.id = p_event_id)
        ),
        FALSE
    );
$$;

CREATE OR REPLACE FUNCTION public.can_count_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        public.is_admin()
        OR (public.can_read_event_metrics(p_event_id)
            AND public.current_venue_role() IN ('owner', 'staff')),
        FALSE
    );
$$;
