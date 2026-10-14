-- ============================================================================
-- 104 · Entradas de otras plataformas (Fourvenues y similares)
-- ============================================================================
-- Quien compró su entrada fuera de Fiestea sube el PDF en «Entradas» y la app
-- lo lee en el propio móvil: el QR, el evento, la fecha, el titular… Aquí se
-- guarda sólo lo necesario para enseñarla con el formato de Fiestea. Ni el
-- PDF, ni el correo, ni el teléfono del PDF.
--
-- La puerta la sigue validando la plataforma que la vendió: Fiestea guarda el
-- contenido exacto del QR y lo vuelve a pintar igual, sin comprobar nada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL DEFAULT public.current_profile_id()
        REFERENCES public.profiles(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'other' CHECK (source IN ('fourvenues', 'other')),
    -- Contenido exacto del QR (lo que escanea la puerta) y el código que se lee.
    qr_text TEXT NOT NULL CHECK (char_length(qr_text) BETWEEN 1 AND 2000),
    code TEXT CHECK (char_length(code) <= 64),
    event_name TEXT CHECK (char_length(event_name) <= 200),
    organizer TEXT CHECK (char_length(organizer) <= 200),
    kind TEXT CHECK (char_length(kind) <= 60),
    ticket_type TEXT CHECK (char_length(ticket_type) <= 120),
    details TEXT CHECK (char_length(details) <= 2000),
    price_cents INTEGER CHECK (price_cents >= 0),
    people INTEGER CHECK (people BETWEEN 1 AND 100),
    holder_name TEXT CHECK (char_length(holder_name) <= 120),
    address TEXT CHECK (char_length(address) <= 300),
    starts_at TIMESTAMPTZ,
    -- «Cierre» o la hora de fin tal como venga en la entrada.
    ends_label TEXT CHECK (char_length(ends_label) <= 40),
    -- Si se reconoce la fiesta en Fiestea, su ficha (cartel, mapa…).
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La misma entrada no se añade dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS external_tickets_unique
    ON public.external_tickets (profile_id, qr_text);
CREATE INDEX IF NOT EXISTS external_tickets_profile
    ON public.external_tickets (profile_id, starts_at);

ALTER TABLE public.external_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_tickets TO authenticated;

-- Cada persona, sólo las suyas.
DROP POLICY IF EXISTS "Own external tickets" ON public.external_tickets;
CREATE POLICY "Own external tickets"
    ON public.external_tickets FOR ALL TO authenticated
    USING (profile_id = public.current_profile_id())
    WITH CHECK (profile_id = public.current_profile_id());

-- Como todas las tablas de `public` (092).
DROP TRIGGER IF EXISTS a_api_rate_guard ON public.external_tickets;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.external_tickets
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- ---------------------------------------------------------------------------
-- «Descargar mis datos» (art. 20 RGPD) incluye también estas entradas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_result JSONB;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT jsonb_build_object(
        'exported_at', NOW(),
        'profile', (SELECT to_jsonb(p) - 'user_id' FROM public.profiles p WHERE p.id = v_profile_id),
        'interests', (
            SELECT COALESCE(jsonb_agg(i.slug), '[]'::jsonb)
            FROM public.profile_interests pi
            JOIN public.interests i ON i.id = pi.interest_id
            WHERE pi.profile_id = v_profile_id
        ),
        'attendance', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'event', e.name, 'venue', v.name, 'checked_in_at', ea.checked_in_at)), '[]'::jsonb)
            FROM public.event_attendance ea
            JOIN public.events e ON e.id = ea.event_id
            JOIN public.venues v ON v.id = e.venue_id
            WHERE ea.profile_id = v_profile_id
        ),
        'connections', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'with', p.name, 'type', c.connection_type, 'created_at', c.created_at)), '[]'::jsonb)
            FROM public.connections c
            JOIN public.profiles p
              ON p.id = CASE WHEN c.user_id_1 = v_profile_id THEN c.user_id_2 ELSE c.user_id_1 END
            WHERE c.user_id_1 = v_profile_id OR c.user_id_2 = v_profile_id
        ),
        'messages', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'direction', CASE WHEN m.sender_id = v_profile_id THEN 'sent' ELSE 'received' END,
                'content', m.content, 'created_at', m.created_at) ORDER BY m.created_at), '[]'::jsonb)
            FROM public.messages m
            WHERE m.sender_id = v_profile_id OR m.receiver_id = v_profile_id
        ),
        'consents', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'document', uc.document, 'version', uc.version, 'accepted_at', uc.accepted_at)), '[]'::jsonb)
            FROM public.user_consents uc WHERE uc.user_id = auth.uid()
        ),
        'subscriptions', (
            SELECT COALESCE(jsonb_agg(to_jsonb(ps)), '[]'::jsonb)
            FROM public.premium_subscriptions ps WHERE ps.user_id = v_profile_id
        ),
        'external_tickets', (
            SELECT COALESCE(jsonb_agg(to_jsonb(xt) - 'profile_id' ORDER BY xt.created_at), '[]'::jsonb)
            FROM public.external_tickets xt WHERE xt.profile_id = v_profile_id
        )
    ) INTO v_result;

    RETURN v_result;
END;
$function$;
