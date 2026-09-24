-- 072: roles del equipo (Propietarios, Seguridad, RRPP y Camareros), eventos
-- creados por la plataforma y arreglo de `admin_create_event`.
--
-- Roles:
--   · Propietarios: cuenta (venue_members.role = 'owner'). Todo el panel.
--   · Seguridad: cuenta ('security') o enlace de una noche, sin cuenta.
--   · Camareros: enlace de una noche, sin cuenta.
--   · RRPP: enlace personal fijo, sin cuenta y revocable.
--   El antiguo «personal» pasa a Seguridad y «marketing» a Propietario.
--
-- Los enlaces (`venue_team_links`) se abren en `/equipo/<token>` y hablan con la
-- Edge Function `team-access`, que llama a `team_link_action()` con el SHA-256
-- del token. Esa función fija el local y el papel del enlace en dos ajustes de
-- la transacción (`vybe.team_venue`, `vybe.team_role`) y `current_venue_id()` /
-- `current_venue_role()` los leen sólo cuando no hay sesión (`auth.uid()` NULL).
-- Así las funciones del panel (aforo, listas, entradas, vales, alertas) sirven
-- tal cual para el enlace, y `team_link_action()` decide qué acciones tiene
-- cada papel y las ata al evento del enlace. El cliente no puede fijar esos
-- ajustes: PostgREST no expone `set_config`.

-- ---------------------------------------------------------------------------
-- 1. Papeles de las cuentas
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_members DROP CONSTRAINT IF EXISTS venue_members_role_check;
UPDATE public.venue_members SET role = 'security' WHERE role = 'staff';
UPDATE public.venue_members SET role = 'owner' WHERE role = 'marketing';
ALTER TABLE public.venue_members
    ADD CONSTRAINT venue_members_role_check CHECK (role IN ('owner', 'security'));

CREATE OR REPLACE FUNCTION public.current_venue_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN NULLIF(current_setting('vybe.team_venue', TRUE), '')::UUID
        ELSE COALESCE(
            (SELECT id FROM public.venues WHERE venue_id = auth.uid() LIMIT 1),
            (SELECT venue_id FROM public.venue_members WHERE user_id = auth.uid() LIMIT 1)
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.current_venue_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN NULLIF(current_setting('vybe.team_role', TRUE), '')
        ELSE COALESCE(
            (SELECT 'owner' FROM public.venues WHERE venue_id = auth.uid() LIMIT 1),
            (SELECT role FROM public.venue_members WHERE user_id = auth.uid() LIMIT 1)
        )
    END;
$$;

-- Las funciones que miraban 'staff' o 'marketing'. Se reescriben a partir de
-- su definición actual para no copiar cuerpos largos que no cambian.
DO $$
DECLARE
    r RECORD;
    v_def TEXT;
BEGIN
    FOR r IN
        SELECT p.oid, p.proname FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN ('can_count_event', 'can_handle_sos', 'get_venue_sos_alerts',
                            'validate_event_ticket', 'set_event_stamps', 'queue_audience_broadcast',
                            'set_venue_avg_spend', 'set_venue_stamp_card')
    LOOP
        v_def := pg_get_functiondef(r.oid);
        IF r.proname IN ('can_handle_sos', 'get_venue_sos_alerts') THEN
            v_def := replace(v_def, '(''owner'', ''staff'')', '(''owner'', ''security'', ''waiter'')');
        ELSE
            v_def := replace(v_def, '(''owner'', ''staff'')', '(''owner'', ''security'')');
        END IF;
        v_def := replace(v_def, '(''owner'', ''marketing'')', '(''owner'')');
        EXECUTE v_def;
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Enlaces del equipo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_team_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('security', 'waiter', 'promoter')),
    label TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
    token TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    -- Seguridad y Camareros: una noche. RRPP: sin evento, dura hasta revocarlo.
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    commission_type TEXT CHECK (commission_type IN ('per_person', 'percent')),
    commission_value NUMERIC(8, 2) CHECK (commission_value IS NULL OR commission_value >= 0),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((role = 'promoter') = (event_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_team_links_venue ON public.venue_team_links(venue_id);
ALTER TABLE public.venue_team_links ENABLE ROW LEVEL SECURITY;

-- La lista y el código de cada RRPP en cada evento.
ALTER TABLE public.guest_lists
    ADD COLUMN IF NOT EXISTS team_link_id UUID REFERENCES public.venue_team_links(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_lists_team_link
    ON public.guest_lists(event_id, team_link_id) WHERE team_link_id IS NOT NULL;
ALTER TABLE public.event_codes
    ADD COLUMN IF NOT EXISTS team_link_id UUID REFERENCES public.venue_team_links(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_team_link(
    p_role TEXT,
    p_label TEXT,
    p_event_id UUID DEFAULT NULL,
    p_commission_type TEXT DEFAULT NULL,
    p_commission_value NUMERIC DEFAULT NULL
)
RETURNS TABLE(id UUID, token TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_venue UUID := public.current_venue_id();
    v_end TIMESTAMPTZ;
    v_token TEXT;
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL OR v_venue IS NULL OR public.current_venue_role() IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_role NOT IN ('security', 'waiter', 'promoter') THEN
        RAISE EXCEPTION 'INVALID_ROLE';
    END IF;
    IF char_length(btrim(COALESCE(p_label, ''))) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION 'NAME_REQUIRED';
    END IF;
    IF (SELECT COUNT(*) FROM public.venue_team_links l
        WHERE l.venue_id = v_venue AND l.revoked_at IS NULL
          AND (l.expires_at IS NULL OR l.expires_at > NOW())) >= 60 THEN
        RAISE EXCEPTION 'TOO_MANY_LINKS';
    END IF;

    IF p_role = 'promoter' THEN
        p_event_id := NULL;
    ELSE
        SELECT e.end_date INTO v_end FROM public.events e WHERE e.id = p_event_id AND e.venue_id = v_venue;
        IF v_end IS NULL THEN
            RAISE EXCEPTION 'EVENT_NOT_FOUND';
        END IF;
        IF v_end <= NOW() THEN
            RAISE EXCEPTION 'EVENT_ENDED';
        END IF;
    END IF;

    -- La comisión es de Business y sólo tiene sentido para RRPP.
    IF p_role <> 'promoter' OR p_commission_type IS NULL
       OR NOT public.venue_has_feature('promoter_commissions', v_venue) THEN
        p_commission_type := NULL;
        p_commission_value := NULL;
    ELSIF p_commission_type NOT IN ('per_person', 'percent')
       OR p_commission_value IS NULL OR p_commission_value < 0
       OR (p_commission_type = 'percent' AND p_commission_value > 100) THEN
        RAISE EXCEPTION 'INVALID_COMMISSION';
    END IF;

    v_token := translate(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+/', '-_');

    INSERT INTO public.venue_team_links (
        venue_id, role, label, token, token_hash, event_id, commission_type, commission_value,
        expires_at, created_by
    )
    VALUES (
        v_venue, p_role, btrim(p_label), v_token, encode(extensions.digest(v_token, 'sha256'), 'hex'),
        p_event_id, p_commission_type, p_commission_value,
        CASE WHEN v_end IS NULL THEN NULL ELSE v_end + INTERVAL '2 hours' END, auth.uid()
    )
    RETURNING venue_team_links.id INTO v_id;

    RETURN QUERY SELECT v_id, v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_team_links()
RETURNS TABLE(
    id UUID, role TEXT, label TEXT, token TEXT, event_id UUID, event_name TEXT, event_start TIMESTAMPTZ,
    commission_type TEXT, commission_value NUMERIC, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF auth.uid() IS NULL OR v_venue IS NULL OR public.current_venue_role() IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    -- Los vivos y, de los que ya no valen, los de la última semana.
    RETURN QUERY
    SELECT l.id, l.role, l.label, l.token, l.event_id, e.name, e.start_date,
           l.commission_type, l.commission_value, l.expires_at, l.revoked_at, l.last_used_at, l.created_at
    FROM public.venue_team_links l
    LEFT JOIN public.events e ON e.id = l.event_id
    WHERE l.venue_id = v_venue
      AND COALESCE(l.revoked_at, l.expires_at, 'infinity'::TIMESTAMPTZ) > NOW() - INTERVAL '7 days'
    ORDER BY (l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > NOW())) DESC,
             l.created_at DESC
    LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_team_link(p_link_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.current_venue_role() IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    UPDATE public.venue_team_links SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE id = p_link_id AND venue_id = public.current_venue_id();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'LINK_NOT_FOUND';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lo que puede hacer cada enlace
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.team_link_action(p_token_hash TEXT, p_action TEXT, p_args JSONB DEFAULT '{}'::JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    l public.venue_team_links%ROWTYPE;
    e public.events%ROWTYPE;
    v_venue_name TEXT;
    v_id UUID;
    v_list UUID;
    v_code TEXT;
    v_n INTEGER;
    v_name TEXT;
    v_res JSONB;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT * INTO l FROM public.venue_team_links t WHERE t.token_hash = p_token_hash;
    IF NOT FOUND OR l.revoked_at IS NOT NULL OR (l.expires_at IS NOT NULL AND l.expires_at <= NOW()) THEN
        RAISE EXCEPTION 'INVALID_LINK';
    END IF;

    UPDATE public.venue_team_links SET last_used_at = NOW()
    WHERE id = l.id AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '1 minute');

    PERFORM set_config('vybe.team_venue', l.venue_id::TEXT, TRUE);
    PERFORM set_config('vybe.team_role', l.role, TRUE);

    SELECT v.name INTO v_venue_name FROM public.venues v WHERE v.id = l.venue_id;
    IF l.event_id IS NOT NULL THEN
        SELECT * INTO e FROM public.events ev WHERE ev.id = l.event_id;
    END IF;

    -- ------------------------------------------------------------ todos
    IF p_action = 'state' THEN
        RETURN jsonb_build_object(
            'role', l.role,
            'label', l.label,
            'venueName', v_venue_name,
            'expiresAt', l.expires_at,
            'event', CASE WHEN l.event_id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', e.id, 'name', e.name, 'start', e.start_date, 'end', e.end_date,
                'entryClosedAt', e.entry_closed_at, 'capacity', e.max_capacity) END,
            'features', jsonb_build_object(
                'tickets', public.venue_has_feature('ticket_sales', l.venue_id),
                'codes', public.venue_has_feature('promoter_codes', l.venue_id),
                'commissions', public.venue_has_feature('promoter_commissions', l.venue_id))
        );
    END IF;

    -- --------------------------------------------- alertas (seguridad y barra)
    IF l.role IN ('security', 'waiter') THEN
        IF p_action = 'sos' THEN
            RETURN COALESCE((
                SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
                FROM public.get_venue_sos_alerts() s WHERE s.event_id = l.event_id
            ), '[]'::JSONB);
        ELSIF p_action IN ('sos_ack', 'sos_resolve') THEN
            v_id := (p_args->>'alertId')::UUID;
            IF NOT EXISTS (SELECT 1 FROM public.sos_alerts a WHERE a.id = v_id AND a.event_id = l.event_id) THEN
                RAISE EXCEPTION 'ALERT_NOT_FOUND';
            END IF;
            IF p_action = 'sos_ack' THEN
                PERFORM public.acknowledge_sos_alert(v_id);
            ELSE
                PERFORM public.resolve_sos_alert(v_id);
            END IF;
            RETURN '{}'::JSONB;
        END IF;
    END IF;

    -- ------------------------------------------------------------ seguridad
    IF l.role = 'security' THEN
        CASE p_action
        WHEN 'occupancy' THEN
            SELECT to_jsonb(o) INTO v_res FROM public.get_event_occupancy(l.event_id) o;
            RETURN COALESCE(v_res, '{}'::JSONB);
        WHEN 'count' THEN
            IF (p_args ? 'delta') = (p_args ? 'total') THEN
                RAISE EXCEPTION 'INVALID_DELTA';
            END IF;
            v_n := public.apply_event_headcount(
                l.event_id, (p_args->>'delta')::INTEGER, (p_args->>'total')::INTEGER, 'link', NULL);
            RETURN jsonb_build_object('total', v_n);
        WHEN 'guests' THEN
            RETURN jsonb_build_object(
                'lists', COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM public.get_guest_lists(l.event_id) g), '[]'::JSONB),
                'entries', COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM public.get_guest_list_entries(l.event_id) g), '[]'::JSONB)
            );
        WHEN 'admit' THEN
            v_id := (p_args->>'entryId')::UUID;
            IF NOT EXISTS (SELECT 1 FROM public.guest_list_entries ge WHERE ge.id = v_id AND ge.event_id = l.event_id) THEN
                RAISE EXCEPTION 'ENTRY_NOT_FOUND';
            END IF;
            SELECT to_jsonb(a) INTO v_res FROM public.admit_guests(v_id, (p_args->>'count')::INTEGER) a;
            RETURN v_res;
        WHEN 'ticket' THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.tickets tk
                WHERE upper(tk.code) = upper(btrim(p_args->>'code')) AND tk.event_id = l.event_id
            ) THEN
                RAISE EXCEPTION 'TICKET_NOT_FOUND';
            END IF;
            SELECT to_jsonb(x) INTO v_res FROM public.validate_event_ticket(p_args->>'code') x;
            RETURN v_res;
        WHEN 'entry' THEN
            RETURN jsonb_build_object('entryClosedAt',
                public.set_event_entry(l.event_id, COALESCE((p_args->>'open')::BOOLEAN, TRUE)));
        WHEN 'reports' THEN
            RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.get_venue_reports(l.event_id) r), '[]'::JSONB);
        WHEN 'revoke' THEN
            PERFORM public.revoke_event_checkin(l.event_id, (p_args->>'profileId')::UUID);
            RETURN '{}'::JSONB;
        ELSE
            RAISE EXCEPTION 'INVALID_ACTION';
        END CASE;
    END IF;

    -- ------------------------------------------------------------ camareros
    IF l.role = 'waiter' THEN
        CASE p_action
        WHEN 'voucher' THEN
            SELECT to_jsonb(x) INTO v_res FROM public.validate_promotion_ticket(p_args->>'code') x;
            RETURN v_res;
        WHEN 'offers' THEN
            RETURN jsonb_build_object(
                'offers', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', p.id, 'title', p.title, 'description', p.description, 'kind', p.kind,
                        'endsAt', p.ends_at,
                        'claimed', (SELECT COUNT(*) FROM public.promotion_redemptions r WHERE r.promotion_id = p.id),
                        'validated', (SELECT COUNT(*) FROM public.promotion_redemptions r
                                      WHERE r.promotion_id = p.id AND r.validated_at IS NOT NULL)
                    ) ORDER BY p.created_at)
                    FROM public.promotions p
                    WHERE p.venue_id = l.venue_id AND p.active
                      AND (p.event_id IS NULL OR p.event_id = l.event_id)
                      AND (p.ends_at IS NULL OR p.ends_at > NOW())
                ), '[]'::JSONB),
                'raffles', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', rf.id, 'prize', rf.prize, 'status', rf.status, 'drawAt', rf.draw_at,
                        'winnerName', pr.name, 'winnerCode', rf.winner_code
                    ) ORDER BY rf.draw_at)
                    FROM public.event_raffles rf
                    LEFT JOIN public.profiles pr ON pr.id = rf.winner_profile_id
                    WHERE rf.event_id = l.event_id
                ), '[]'::JSONB)
            );
        ELSE
            RAISE EXCEPTION 'INVALID_ACTION';
        END CASE;
    END IF;

    -- ------------------------------------------------------------------ RRPP
    IF l.role = 'promoter' THEN
        IF p_action = 'events' THEN
            RETURN COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', ev.id, 'name', ev.name, 'start', ev.start_date, 'end', ev.end_date,
                    'posterUrl', ev.poster_url,
                    'people', COALESCE((SELECT SUM(ge.companions + 1) FROM public.guest_list_entries ge
                                        JOIN public.guest_lists gl ON gl.id = ge.list_id
                                        WHERE gl.team_link_id = l.id AND gl.event_id = ev.id), 0),
                    'admitted', COALESCE((SELECT SUM(ge.admitted) FROM public.guest_list_entries ge
                                          JOIN public.guest_lists gl ON gl.id = ge.list_id
                                          WHERE gl.team_link_id = l.id AND gl.event_id = ev.id), 0),
                    'checkIns', (SELECT COUNT(*) FROM public.event_attendance ea
                                 JOIN public.event_codes ec ON ec.id = ea.code_id
                                 WHERE ec.team_link_id = l.id AND ec.event_id = ev.id)
                ) ORDER BY ev.start_date)
                FROM public.events ev
                WHERE ev.venue_id = l.venue_id
                  AND ev.end_date > NOW() - INTERVAL '30 days'
                  AND ev.start_date < NOW() + INTERVAL '90 days'
            ), '[]'::JSONB);
        END IF;

        v_id := (p_args->>'eventId')::UUID;
        SELECT * INTO e FROM public.events ev WHERE ev.id = v_id AND ev.venue_id = l.venue_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'EVENT_NOT_FOUND';
        END IF;
        SELECT gl.id INTO v_list FROM public.guest_lists gl WHERE gl.team_link_id = l.id AND gl.event_id = e.id;

        IF p_action = 'event' THEN
            -- La lista y el código se crean la primera vez que la RRPP abre la fiesta.
            IF e.end_date > NOW() THEN
                IF v_list IS NULL THEN
                    INSERT INTO public.guest_lists (event_id, venue_id, name, kind, team_link_id)
                    VALUES (e.id, l.venue_id, l.label, 'promoter', l.id)
                    RETURNING id INTO v_list;
                END IF;

                IF public.venue_has_feature('promoter_codes', l.venue_id) AND NOT EXISTS (
                    SELECT 1 FROM public.event_codes ec WHERE ec.team_link_id = l.id AND ec.event_id = e.id
                ) THEN
                    FOR i IN 1..10 LOOP
                        v_code := upper(substring(md5(random()::TEXT) FROM 1 FOR 6));
                        BEGIN
                            INSERT INTO public.event_codes (
                                venue_id, event_id, code, expires_at, active, kind, label, promoter_name,
                                commission_type, commission_value, team_link_id
                            )
                            VALUES (l.venue_id, e.id, v_code, e.end_date, TRUE, 'promoter', l.label, l.label,
                                    l.commission_type, l.commission_value, l.id);
                            EXIT;
                        EXCEPTION WHEN unique_violation THEN
                            CONTINUE;
                        END;
                    END LOOP;
                END IF;
            END IF;

            RETURN jsonb_build_object(
                'event', jsonb_build_object('id', e.id, 'name', e.name, 'start', e.start_date, 'end', e.end_date,
                                            'posterUrl', e.poster_url),
                'listOpen', v_list IS NOT NULL AND e.end_date > NOW(),
                'entries', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', ge.id, 'name', ge.name, 'companions', ge.companions, 'admitted', ge.admitted,
                        'createdAt', ge.created_at) ORDER BY ge.created_at DESC)
                    FROM public.guest_list_entries ge WHERE ge.list_id = v_list
                ), '[]'::JSONB),
                'code', (SELECT jsonb_build_object('code', ec.code, 'active', ec.active)
                         FROM public.event_codes ec WHERE ec.team_link_id = l.id AND ec.event_id = e.id
                         ORDER BY ec.created_at LIMIT 1),
                'checkIns', (SELECT COUNT(*) FROM public.event_attendance ea
                             JOIN public.event_codes ec ON ec.id = ea.code_id
                             WHERE ec.team_link_id = l.id AND ec.event_id = e.id),
                'commission', CASE WHEN public.venue_has_feature('promoter_commissions', l.venue_id) THEN (
                    SELECT jsonb_build_object(
                        'type', c.commission_type, 'value', c.commission_value, 'checkIns', c.ins,
                        'revenueCents', c.revenue,
                        'amountCents', CASE c.commission_type
                            WHEN 'per_person' THEN ROUND(c.commission_value * 100 * c.ins)
                            WHEN 'percent' THEN ROUND(c.revenue * c.commission_value / 100)
                            ELSE 0 END,
                        'paidAt', c.paid_at)
                    FROM (
                        SELECT ec.commission_type, ec.commission_value, pp.paid_at,
                               (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.code_id = ec.id) AS ins,
                               COALESCE((SELECT SUM(o.amount_cents) FROM public.ticket_orders o
                                         WHERE o.event_id = e.id AND o.status = 'paid'
                                           AND o.profile_id IN (SELECT ea.profile_id FROM public.event_attendance ea
                                                                WHERE ea.code_id = ec.id)), 0) AS revenue
                        FROM public.event_codes ec
                        LEFT JOIN public.promoter_payouts pp ON pp.code_id = ec.id
                        WHERE ec.team_link_id = l.id AND ec.event_id = e.id AND ec.commission_type IS NOT NULL
                        ORDER BY ec.created_at LIMIT 1
                    ) c
                ) END
            );
        END IF;

        IF v_list IS NULL OR e.end_date <= NOW() THEN
            RAISE EXCEPTION 'GUEST_LIST_CLOSED';
        END IF;

        IF p_action = 'save_entry' THEN
            v_name := btrim(COALESCE(p_args->>'name', ''));
            v_n := COALESCE((p_args->>'companions')::INTEGER, 0);
            IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
                RAISE EXCEPTION 'NAME_REQUIRED';
            END IF;
            IF v_n NOT BETWEEN 0 AND 50 THEN
                RAISE EXCEPTION 'INVALID_COMPANIONS';
            END IF;

            IF NULLIF(p_args->>'entryId', '') IS NULL THEN
                INSERT INTO public.guest_list_entries (list_id, event_id, name, companions)
                VALUES (v_list, e.id, v_name, v_n);
            ELSE
                UPDATE public.guest_list_entries ge
                SET name = v_name, companions = v_n, updated_at = NOW()
                WHERE ge.id = (p_args->>'entryId')::UUID AND ge.list_id = v_list;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'ENTRY_NOT_FOUND';
                END IF;
            END IF;
            RETURN '{}'::JSONB;
        ELSIF p_action = 'delete_entry' THEN
            -- Quien ya ha entrado se queda: es lo que cobra la RRPP.
            DELETE FROM public.guest_list_entries ge
            WHERE ge.id = (p_args->>'entryId')::UUID AND ge.list_id = v_list AND ge.admitted = 0;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'ENTRY_LOCKED';
            END IF;
            RETURN '{}'::JSONB;
        END IF;

        RAISE EXCEPTION 'INVALID_ACTION';
    END IF;

    RAISE EXCEPTION 'INVALID_ACTION';
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_link(TEXT, TEXT, UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_team_links() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_team_link(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_link_action(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_link(TEXT, TEXT, UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_team_links() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_team_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_link_action(TEXT, TEXT, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Eventos de la plataforma
-- ---------------------------------------------------------------------------
-- `admin_create_event` (065) escribía `events.city` y `events.region`, que no
-- existían: crear una fiesta desde administración fallaba siempre.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS region TEXT;

-- El local de la casa: sus fiestas salen con «Evento creado por Fiestea».
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_platform BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.protect_venue_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        NEW.is_platform := FALSE;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS venues_protect_insert ON public.venues;
CREATE TRIGGER venues_protect_insert BEFORE INSERT ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.protect_venue_insert();

CREATE OR REPLACE FUNCTION public.protect_venue_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    NEW.is_verified         := OLD.is_verified;
    NEW.verification_status := OLD.verification_status;

    -- El radio decide hasta dónde llega la geocerca del evento. Lo fija el tipo
    -- de local al darse de alta; cambiarlo a voluntad permitiría hacer que
    -- «estar dentro» significara media isla.
    NEW.event_radius := OLD.event_radius;

    -- Una vez aprobado, el nombre y el NIF quedan fijos: si no, se podría
    -- verificar una identidad y operar con otra.
    IF COALESCE(OLD.is_verified, FALSE) THEN
        NEW.name   := OLD.name;
        NEW.tax_id := OLD.tax_id;
    END IF;

    -- Stripe Connect: sólo lo escribe la Edge Function (service_role). Si no,
    -- un local podría apuntar sus ventas a otra cuenta o darse cobros activos.
    NEW.stripe_account_id        := OLD.stripe_account_id;
    NEW.stripe_charges_enabled   := OLD.stripe_charges_enabled;
    NEW.stripe_payouts_enabled   := OLD.stripe_payouts_enabled;
    NEW.stripe_details_submitted := OLD.stripe_details_submitted;
    NEW.stripe_requirements      := OLD.stripe_requirements;
    NEW.stripe_updated_at        := OLD.stripe_updated_at;

    -- La comisión de la plataforma la fija administración.
    NEW.platform_fee_percent := OLD.platform_fee_percent;

    -- Sólo el local de la casa firma como la plataforma (migración 072).
    NEW.is_platform := OLD.is_platform;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_house_venue()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_owner UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT id INTO v_id FROM public.venues WHERE is_platform ORDER BY created_at LIMIT 1;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    SELECT p.user_id INTO v_owner FROM public.profiles p WHERE p.user_id = auth.uid();

    INSERT INTO public.venues (venue_id, name, email, type, verification_status, is_verified, city, is_platform)
    VALUES (v_owner, 'Fiestea', COALESCE((SELECT email FROM auth.users WHERE id = v_owner), 'hola@fiestea.es'),
            'local', 'approved', TRUE, 'España', TRUE)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- El local de la casa no sale en la lista de locales de administración: ya es
-- la opción por defecto del selector de «Nueva fiesta».
CREATE OR REPLACE FUNCTION public.admin_list_venues(p_search TEXT DEFAULT NULL)
RETURNS TABLE(
    venue_id UUID, name TEXT, email TEXT, city TEXT, type TEXT, is_verified BOOLEAN,
    verification_status TEXT, created_at TIMESTAMPTZ, plan TEXT, plan_status TEXT,
    plan_expires_at TIMESTAMPTZ, events_total BIGINT, events_upcoming BIGINT, members BIGINT,
    followers BIGINT, phone TEXT, address TEXT, tax_id TEXT, plan_cancel_at_period_end BOOLEAN,
    plan_renews BOOLEAN, platform_fee_percent NUMERIC, stripe_connected BOOLEAN,
    stripe_charges_enabled BOOLEAN, stripe_payouts_enabled BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_q TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT
        v.id, v.name, v.email, v.city, v.type, v.is_verified, v.verification_status, v.created_at,
        COALESCE(s.plan, 'free'), COALESCE(s.status, 'none'), s.expires_at,
        (SELECT COUNT(*) FROM public.events e WHERE e.venue_id = v.id),
        (SELECT COUNT(*) FROM public.events e WHERE e.venue_id = v.id AND e.end_date > NOW()),
        (SELECT COUNT(*) FROM public.venue_members m WHERE m.venue_id = v.id),
        (SELECT COUNT(*) FROM public.venue_followers f WHERE f.venue_id = v.id),
        v.phone, v.address, v.tax_id,
        COALESCE(s.cancel_at_period_end, FALSE),
        COALESCE(s.stripe_subscription_id IS NOT NULL AND NOT COALESCE(s.cancel_at_period_end, FALSE), FALSE),
        v.platform_fee_percent,
        v.stripe_account_id IS NOT NULL, v.stripe_charges_enabled, v.stripe_payouts_enabled
    FROM public.venues v
    LEFT JOIN LATERAL (
        SELECT vs.plan, vs.status, vs.expires_at, vs.cancel_at_period_end, vs.stripe_subscription_id
        FROM public.venue_subscriptions vs
        WHERE vs.venue_id = v.id
        ORDER BY vs.started_at DESC NULLS LAST
        LIMIT 1
    ) s ON TRUE
    WHERE NOT v.is_platform
      AND (v_q IS NULL OR v.name ILIKE '%' || v_q || '%' OR v.email ILIKE '%' || v_q || '%'
           OR v.city ILIKE '%' || v_q || '%')
    ORDER BY v.created_at DESC;
END;
$$;
