-- 066: alertas de emergencia que se cierran de verdad y llegan al local al momento.
--
-- 1. «Resuelta» no hacía nada. Administración sólo tenía permiso de lectura en
--    `sos_alerts` y el cliente hacía un UPDATE directo: la RLS lo dejaba en cero
--    filas sin dar error, así que la alerta volvía a salir al recargar. El local
--    sólo podía marcarla como vista (`handled_at`) y seguía en su panel 12 horas.
--    Ahora las dos cosas pasan por `resolve_sos_alert()`.
-- 2. El equipo de puerta (propietario y personal) ve las alertas de sus eventos
--    por Realtime, sin esperar a la siguiente consulta, y marketing no las ve.
-- 3. Aviso push al personal del local que tiene la app y a administración.

-- ---------------------------------------------------------------------------
-- Quién atiende las alertas de un evento: administración, o el propietario y
-- el personal del local del evento. Marketing no.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_handle_sos(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        public.is_admin()
        OR (
            public.current_venue_role() IN ('owner', 'staff')
            AND EXISTS (
                SELECT 1 FROM public.events e
                WHERE e.id = p_event_id AND e.venue_id = public.current_venue_id()
            )
        ),
        FALSE
    );
$$;

-- ---------------------------------------------------------------------------
-- Alertas abiertas del local (todas sus fiestas, no sólo la elegida: una
-- emergencia no se filtra por el selector de evento).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_venue_sos_alerts();

CREATE FUNCTION public.get_venue_sos_alerts()
RETURNS TABLE(
    id UUID,
    event_id UUID,
    profile_name TEXT,
    profile_photo TEXT,
    event_name TEXT,
    note TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    handled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue_id UUID := public.current_venue_id();
BEGIN
    IF v_venue_id IS NULL OR COALESCE(public.current_venue_role(), '') NOT IN ('owner', 'staff') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT s.id, s.event_id, p.name, COALESCE(ea.photo_url, p.avatar), e.name, s.note,
           s.latitude, s.longitude, s.created_at, s.handled_at
    FROM public.sos_alerts s
    JOIN public.profiles p ON p.id = s.profile_id
    JOIN public.events e ON e.id = s.event_id
    LEFT JOIN public.event_attendance ea
           ON ea.event_id = s.event_id AND ea.profile_id = s.profile_id
    WHERE e.venue_id = v_venue_id
      AND s.status = 'active'
      AND s.created_at > NOW() - INTERVAL '12 hours'
    ORDER BY s.handled_at IS NOT NULL, s.created_at DESC;
END;
$$;

-- «Voy para allá»: alguien del equipo la ha visto. Sigue abierta.
CREATE OR REPLACE FUNCTION public.acknowledge_sos_alert(p_alert_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
BEGIN
    SELECT event_id INTO v_event FROM public.sos_alerts WHERE id = p_alert_id AND status = 'active';

    IF v_event IS NULL OR NOT public.can_handle_sos(v_event) THEN
        RAISE EXCEPTION 'ALERT_NOT_FOUND';
    END IF;

    UPDATE public.sos_alerts
    SET handled_at = COALESCE(handled_at, NOW()),
        handled_by = COALESCE(handled_by, auth.uid())
    WHERE id = p_alert_id;
END;
$$;

-- «Resuelta»: se cierra y desaparece del panel del local y de administración.
CREATE OR REPLACE FUNCTION public.resolve_sos_alert(p_alert_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event UUID;
    v_status TEXT;
BEGIN
    SELECT event_id, status INTO v_event, v_status FROM public.sos_alerts WHERE id = p_alert_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'ALERT_NOT_FOUND';
    END IF;

    -- Una alerta sin evento sólo la puede cerrar administración.
    IF NOT (public.is_admin() OR (v_event IS NOT NULL AND public.can_handle_sos(v_event))) THEN
        RAISE EXCEPTION 'ALERT_NOT_FOUND';
    END IF;

    -- Ya cerrada (por otra persona del equipo, o cancelada): no es un error.
    IF v_status <> 'active' THEN
        RETURN;
    END IF;

    UPDATE public.sos_alerts
    SET status = 'resolved',
        resolved_at = NOW(),
        handled_at = COALESCE(handled_at, NOW()),
        handled_by = COALESCE(handled_by, auth.uid())
    WHERE id = p_alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.can_handle_sos(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_venue_sos_alerts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acknowledge_sos_alert(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_sos_alert(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_handle_sos(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_venue_sos_alerts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_sos_alert(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_sos_alert(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime: el panel del local se entera al momento. Realtime aplica la RLS a
-- cada suscriptor, así que hace falta una policy de lectura para el equipo.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Venue team views event alerts" ON public.sos_alerts;
CREATE POLICY "Venue team views event alerts"
    ON public.sos_alerts FOR SELECT TO authenticated
    USING (event_id IS NOT NULL AND public.can_handle_sos(event_id));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sos_alerts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Push al personal del local con la app y a administración (`send-push`,
-- tipo SOS). No se puede desactivar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_on_sos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'SOS', 'table', 'sos_alerts', 'record', jsonb_build_object('id', NEW.id)
    ));
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.push_on_sos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_on_sos ON public.sos_alerts;
CREATE TRIGGER push_on_sos
    AFTER INSERT ON public.sos_alerts
    FOR EACH ROW EXECUTE FUNCTION public.push_on_sos();
