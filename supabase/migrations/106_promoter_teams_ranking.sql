-- ============================================================================
-- 106 · Equipos de RRPP y ranking
-- ============================================================================
-- El propietario crea equipos (#EquipoRosa, #NightBosses…) y mete en ellos a
-- sus RRPP (los enlaces fijos de `venue_team_links`, rol `promoter`). Un RRPP
-- puede estar en varios equipos.
--
-- `get_promoter_ranking` da, por RRPP y para un periodo, unos eventos y un
-- equipo:
--   · apuntados: la gente de su lista (cada apunte más sus acompañantes);
--   · entran:    los admitidos en la puerta desde su lista, más quien hizo
--                check-in en la app con su código (sin contar dos veces a quien
--                estaba en su lista y ya entró por ella);
--   · recaudado, comisión y pagado: igual que `get_promoter_settlement`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.venue_promoter_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    color TEXT NOT NULL DEFAULT 'yellow'
        CHECK (color IN ('yellow', 'pink', 'violet', 'blue', 'green', 'orange', 'red', 'gray')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_promoter_teams_name
    ON public.venue_promoter_teams (venue_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.venue_promoter_team_members (
    team_id UUID NOT NULL REFERENCES public.venue_promoter_teams(id) ON DELETE CASCADE,
    link_id UUID NOT NULL REFERENCES public.venue_team_links(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, link_id)
);
CREATE INDEX IF NOT EXISTS venue_promoter_team_members_link ON public.venue_promoter_team_members (link_id);

-- Sólo por las funciones de abajo.
ALTER TABLE public.venue_promoter_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_promoter_team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.venue_promoter_teams, public.venue_promoter_team_members FROM PUBLIC, anon, authenticated;

-- Como todas las tablas de `public` (092).
DROP TRIGGER IF EXISTS a_api_rate_guard ON public.venue_promoter_teams;
CREATE TRIGGER a_api_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON public.venue_promoter_teams
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();
DROP TRIGGER IF EXISTS a_api_rate_guard ON public.venue_promoter_team_members;
CREATE TRIGGER a_api_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON public.venue_promoter_team_members
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- ---------------------------------------------------------------------------
-- El negocio del propietario que llama, o error.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_venue_or_raise()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF auth.uid() IS NULL OR v_venue IS NULL OR public.current_venue_role() IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN v_venue;
END;
$$;

-- ---------------------------------------------------------------------------
-- Equipos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_promoter_teams()
RETURNS TABLE (id UUID, name TEXT, color TEXT, link_ids UUID[])
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
    v_venue UUID := public.owner_venue_or_raise();
BEGIN
    RETURN QUERY
    SELECT t.id, t.name, t.color,
           COALESCE((SELECT array_agg(m.link_id) FROM public.venue_promoter_team_members m WHERE m.team_id = t.id), '{}')
    FROM public.venue_promoter_teams t
    WHERE t.venue_id = v_venue
    ORDER BY lower(t.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_promoter_team(p_id UUID, p_name TEXT, p_color TEXT DEFAULT 'yellow')
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_venue UUID := public.owner_venue_or_raise();
    v_id UUID;
BEGIN
    IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION 'NAME_REQUIRED';
    END IF;
    BEGIN
        IF p_id IS NULL THEN
            IF (SELECT COUNT(*) FROM public.venue_promoter_teams WHERE venue_id = v_venue) >= 30 THEN
                RAISE EXCEPTION 'TOO_MANY_TEAMS';
            END IF;
            INSERT INTO public.venue_promoter_teams (venue_id, name, color)
            VALUES (v_venue, btrim(p_name), COALESCE(p_color, 'yellow'))
            RETURNING id INTO v_id;
        ELSE
            UPDATE public.venue_promoter_teams
            SET name = btrim(p_name), color = COALESCE(p_color, color)
            WHERE id = p_id AND venue_id = v_venue
            RETURNING id INTO v_id;
            IF v_id IS NULL THEN
                RAISE EXCEPTION 'TEAM_NOT_FOUND';
            END IF;
        END IF;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'TEAM_EXISTS';
    END;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_promoter_team(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_venue UUID := public.owner_venue_or_raise();
BEGIN
    DELETE FROM public.venue_promoter_teams WHERE id = p_id AND venue_id = v_venue;
END;
$$;

/** Los equipos de un RRPP: sustituye los que tuviera. */
CREATE OR REPLACE FUNCTION public.set_promoter_teams(p_link_id UUID, p_team_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_venue UUID := public.owner_venue_or_raise();
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.venue_team_links l
        WHERE l.id = p_link_id AND l.venue_id = v_venue AND l.role = 'promoter'
    ) THEN
        RAISE EXCEPTION 'LINK_NOT_FOUND';
    END IF;
    DELETE FROM public.venue_promoter_team_members WHERE link_id = p_link_id;
    INSERT INTO public.venue_promoter_team_members (team_id, link_id)
    SELECT t.id, p_link_id
    FROM public.venue_promoter_teams t
    WHERE t.venue_id = v_venue AND t.id = ANY (COALESCE(p_team_ids, '{}'));
END;
$$;

-- ---------------------------------------------------------------------------
-- Ranking
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_promoter_ranking(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_event_ids UUID[] DEFAULT NULL,
    p_team_id UUID DEFAULT NULL)
RETURNS TABLE (
    link_id UUID, name TEXT, team_ids UUID[], events INTEGER, listed INTEGER, entered INTEGER,
    revenue_cents BIGINT, commission_cents BIGINT, paid_cents BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
    v_venue UUID := public.owner_venue_or_raise();
BEGIN
    RETURN QUERY
    WITH ev AS (
        SELECT e.id FROM public.events e
        WHERE e.venue_id = v_venue
          AND (p_from IS NULL OR e.start_date >= p_from)
          AND (p_to IS NULL OR e.start_date < p_to)
          AND (p_event_ids IS NULL OR e.id = ANY (p_event_ids))
    ),
    -- Códigos de RRPP de esos eventos. Los de un enlace fijo comparten el
    -- enlace; los antiguos, creados a mano, se agrupan por el nombre.
    codes AS (
        SELECT ec.id AS code_id, ec.event_id, ec.team_link_id AS lid,
               COALESCE(ec.team_link_id::TEXT, 'n:' || lower(btrim(COALESCE(ec.promoter_name, ec.label, ec.code)))) AS who,
               COALESCE(l.label, ec.promoter_name, ec.label, ec.code) AS nombre,
               ec.commission_type AS ctype, ec.commission_value AS cvalue
        FROM public.event_codes ec
        LEFT JOIN public.venue_team_links l ON l.id = ec.team_link_id
        WHERE ec.event_id IN (SELECT id FROM ev) AND ec.kind IN ('promoter', 'guest_list')
    ),
    lists AS (
        SELECT gl.id AS list_id, gl.event_id, gl.team_link_id AS lid, gl.team_link_id::TEXT AS who, l.label AS nombre
        FROM public.guest_lists gl
        JOIN public.venue_team_links l ON l.id = gl.team_link_id
        WHERE gl.event_id IN (SELECT id FROM ev)
    ),
    entries AS (
        SELECT li.who, li.event_id, en.profile_id, (1 + en.companions) AS people, en.admitted
        FROM public.guest_list_entries en
        JOIN lists li ON li.list_id = en.list_id
    ),
    checkins AS (
        SELECT c.who, c.event_id, ea.profile_id
        FROM codes c
        JOIN public.event_attendance ea ON ea.code_id = c.code_id
    ),
    per_code AS (
        SELECT c.who, c.ctype, c.cvalue,
               (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.code_id = c.code_id)::BIGINT AS ins,
               COALESCE((
                   SELECT SUM(o.amount_cents) FROM public.ticket_orders o
                   WHERE o.event_id = c.event_id AND o.status = 'paid'
                     AND o.profile_id IN (SELECT ea.profile_id FROM public.event_attendance ea WHERE ea.code_id = c.code_id)
               ), 0)::BIGINT AS revenue,
               COALESCE((SELECT pp.amount_cents FROM public.promoter_payouts pp WHERE pp.code_id = c.code_id), 0)::BIGINT AS paid
        FROM codes c
    ),
    -- Todos los RRPP: los que tienen actividad y los enlaces fijos vivos sin ella.
    quien AS (
        SELECT x.who, (array_agg(x.lid) FILTER (WHERE x.lid IS NOT NULL))[1] AS lid, max(x.nombre) AS nombre
        FROM (
            SELECT who, lid, nombre FROM codes
            UNION ALL SELECT who, lid, nombre FROM lists
            UNION ALL
            SELECT l.id::TEXT, l.id, l.label FROM public.venue_team_links l
            WHERE l.venue_id = v_venue AND l.role = 'promoter' AND l.revoked_at IS NULL
        ) x
        GROUP BY x.who
    )
    SELECT q.lid,
           q.nombre,
           COALESCE((SELECT array_agg(m.team_id) FROM public.venue_promoter_team_members m WHERE m.link_id = q.lid), '{}'),
           (SELECT COUNT(DISTINCT y.event_id) FROM (
                SELECT event_id FROM codes WHERE codes.who = q.who
                UNION SELECT event_id FROM lists WHERE lists.who = q.who) y)::INTEGER,
           COALESCE((SELECT SUM(e.people) FROM entries e WHERE e.who = q.who), 0)::INTEGER,
           (COALESCE((SELECT SUM(e.admitted) FROM entries e WHERE e.who = q.who), 0)
            + (SELECT COUNT(*) FROM checkins ci
               WHERE ci.who = q.who
                 AND NOT EXISTS (
                     SELECT 1 FROM entries e
                     WHERE e.who = q.who AND e.event_id = ci.event_id
                       AND e.profile_id = ci.profile_id AND e.admitted > 0)))::INTEGER,
           COALESCE((SELECT SUM(pc.revenue) FROM per_code pc WHERE pc.who = q.who), 0)::BIGINT,
           COALESCE((SELECT SUM(CASE pc.ctype
                                    WHEN 'per_person' THEN ROUND(pc.cvalue * 100 * pc.ins)
                                    WHEN 'percent' THEN ROUND(pc.revenue * pc.cvalue / 100)
                                    ELSE 0 END)
                     FROM per_code pc WHERE pc.who = q.who), 0)::BIGINT,
           COALESCE((SELECT SUM(pc.paid) FROM per_code pc WHERE pc.who = q.who), 0)::BIGINT
    FROM quien q
    WHERE p_team_id IS NULL
       OR EXISTS (SELECT 1 FROM public.venue_promoter_team_members m WHERE m.team_id = p_team_id AND m.link_id = q.lid)
    ORDER BY 6 DESC, 5 DESC, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_venue_or_raise() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_promoter_teams() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_promoter_team(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_promoter_team(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_promoter_teams(UUID, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_promoter_ranking(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promoter_teams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_promoter_team(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_promoter_team(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_promoter_teams(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_promoter_ranking(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID) TO authenticated;
