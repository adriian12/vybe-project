-- ============================================================================
-- 020 — Promociones y vales, aviso de emergencia al local y moderación de su
--       propia puerta
-- ============================================================================

-- ============================================================================
-- 1. PROMOCIONES
--
-- Un local pierde margen en las horas valle: gente dentro que no consume. Una
-- promoción visible sólo para quien ha hecho check-in mueve ese consumo, y el
-- canje deja constancia de cuánto ha movido.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL DEFAULT 'offer',
    /** Ventana en la que se puede canjear. Fuera de ella no se muestra. */
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    /** Límite total y por persona. NULL es sin límite. */
    max_redemptions INTEGER,
    max_per_person INTEGER NOT NULL DEFAULT 1,
    /** Sólo para quien tiene Premium, si el local lo quiere así. */
    premium_only BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotions_kind_check') THEN
        ALTER TABLE public.promotions
            ADD CONSTRAINT promotions_kind_check CHECK (kind IN ('offer', 'voucher', 'ticket'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_promotions_event ON public.promotions(event_id, active);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.promotion_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    /** Código corto que la persona enseña en barra. */
    ticket_code TEXT NOT NULL UNIQUE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    /** Cuándo lo validó el personal. Hasta entonces está sin usar. */
    validated_at TIMESTAMPTZ,
    validated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_redemptions_promotion
    ON public.promotion_redemptions(promotion_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_profile
    ON public.promotion_redemptions(profile_id);
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

-- ---------- Policies ----------
DROP POLICY IF EXISTS "Attendees see active promotions" ON public.promotions;
DROP POLICY IF EXISTS "Venue manages own promotions" ON public.promotions;

-- Sólo se ven estando dentro: es lo que hace que abrir la app en el local
-- tenga sentido, y evita que la competencia copie la oferta desde casa.
CREATE POLICY "Attendees see active promotions"
    ON public.promotions FOR SELECT TO authenticated
    USING (
        active
        AND EXISTS (
            SELECT 1 FROM public.event_attendance ea
            WHERE ea.event_id = promotions.event_id
              AND ea.profile_id = public.current_profile_id()
              AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
        )
    );

CREATE POLICY "Venue manages own promotions"
    ON public.promotions FOR ALL TO authenticated
    USING (venue_id = public.current_venue_id() OR public.is_admin())
    WITH CHECK (venue_id = public.current_venue_id());

DROP POLICY IF EXISTS "Users see own redemptions" ON public.promotion_redemptions;
DROP POLICY IF EXISTS "Venue sees redemptions of own promotions" ON public.promotion_redemptions;

CREATE POLICY "Users see own redemptions"
    ON public.promotion_redemptions FOR SELECT TO authenticated
    USING (profile_id = public.current_profile_id());

CREATE POLICY "Venue sees redemptions of own promotions"
    ON public.promotion_redemptions FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.promotions pr
        WHERE pr.id = promotion_redemptions.promotion_id
          AND pr.venue_id = public.current_venue_id()
    ));

/**
 * Reclama una promoción y devuelve el código que se enseña en barra.
 *
 * Los límites se comprueban aquí y no en el cliente: el vale vale dinero.
 */
CREATE OR REPLACE FUNCTION public.claim_promotion(p_promotion_id UUID)
RETURNS TABLE (ticket_code TEXT, title TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_promo RECORD;
    v_taken INTEGER;
    v_mine INTEGER;
    v_code TEXT;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_promo FROM public.promotions WHERE id = p_promotion_id;
    IF NOT FOUND OR NOT v_promo.active THEN
        RAISE EXCEPTION 'PROMOTION_NOT_FOUND';
    END IF;

    IF v_promo.starts_at IS NOT NULL AND NOW() < v_promo.starts_at THEN
        RAISE EXCEPTION 'PROMOTION_NOT_STARTED';
    END IF;

    IF v_promo.ends_at IS NOT NULL AND NOW() > v_promo.ends_at THEN
        RAISE EXCEPTION 'PROMOTION_ENDED';
    END IF;

    -- Hay que estar dentro del evento.
    IF NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = v_promo.event_id
          AND ea.profile_id = v_profile_id
          AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
    ) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    IF v_promo.premium_only AND NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    IF v_promo.max_redemptions IS NOT NULL THEN
        SELECT COUNT(*) INTO v_taken
        FROM public.promotion_redemptions r WHERE r.promotion_id = p_promotion_id;

        IF v_taken >= v_promo.max_redemptions THEN
            RAISE EXCEPTION 'PROMOTION_EXHAUSTED';
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_mine
    FROM public.promotion_redemptions r
    WHERE r.promotion_id = p_promotion_id AND r.profile_id = v_profile_id;

    IF v_mine >= v_promo.max_per_person THEN
        RAISE EXCEPTION 'ALREADY_CLAIMED';
    END IF;

    FOR i IN 1..10 LOOP
        v_code := upper(substring(md5(random()::text) FROM 1 FOR 8));
        BEGIN
            INSERT INTO public.promotion_redemptions (promotion_id, profile_id, ticket_code)
            VALUES (p_promotion_id, v_profile_id, v_code);

            RETURN QUERY SELECT v_code, v_promo.title;
            RETURN;
        EXCEPTION WHEN unique_violation THEN
            CONTINUE;
        END;
    END LOOP;

    RAISE EXCEPTION 'CODE_GENERATION_FAILED';
END;
$$;

/** El personal valida el vale en barra. Un vale sólo se puede usar una vez. */
CREATE OR REPLACE FUNCTION public.validate_promotion_ticket(p_ticket_code TEXT)
RETURNS TABLE (
    title TEXT,
    holder_name TEXT,
    claimed_at TIMESTAMPTZ,
    already_used BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_venue_id UUID := public.current_venue_id();
    v_row RECORD;
BEGIN
    IF v_venue_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT r.*, pr.title AS promo_title, pr.venue_id AS promo_venue, p.name AS profile_name
    INTO v_row
    FROM public.promotion_redemptions r
    JOIN public.promotions pr ON pr.id = r.promotion_id
    JOIN public.profiles p ON p.id = r.profile_id
    WHERE upper(r.ticket_code) = upper(btrim(p_ticket_code));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND';
    END IF;

    IF v_row.promo_venue IS DISTINCT FROM v_venue_id THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF v_row.validated_at IS NOT NULL THEN
        RETURN QUERY SELECT v_row.promo_title, v_row.profile_name, v_row.claimed_at, TRUE;
        RETURN;
    END IF;

    UPDATE public.promotion_redemptions
    SET validated_at = NOW(), validated_by = auth.uid()
    WHERE id = v_row.id;

    RETURN QUERY SELECT v_row.promo_title, v_row.profile_name, v_row.claimed_at, FALSE;
END;
$$;

/** Resultado de cada promoción: cuántos vales se dieron y cuántos se usaron. */
CREATE OR REPLACE FUNCTION public.get_promotion_stats(p_event_id UUID)
RETURNS TABLE (
    promotion_id UUID,
    title TEXT,
    kind TEXT,
    claimed BIGINT,
    validated BIGINT,
    max_redemptions INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT pr.id, pr.title, pr.kind,
           COUNT(r.id),
           COUNT(r.id) FILTER (WHERE r.validated_at IS NOT NULL),
           pr.max_redemptions
    FROM public.promotions pr
    LEFT JOIN public.promotion_redemptions r ON r.promotion_id = pr.id
    WHERE pr.event_id = p_event_id
    GROUP BY pr.id, pr.title, pr.kind, pr.max_redemptions
    ORDER BY COUNT(r.id) DESC;
END;
$$;

-- ============================================================================
-- 2. AVISO DE EMERGENCIA AL LOCAL
--
-- Si alguien pide ayuda dentro del local, el equipo del local se enteraba al
-- día siguiente o nunca. Aquí puede verlo y actuar, sin acceder a más datos
-- personales de los necesarios para encontrar a la persona.
-- ============================================================================

ALTER TABLE public.sos_alerts
    ADD COLUMN IF NOT EXISTS venue_notified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS handled_by UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;

/** Alertas abiertas en los eventos del local que hay en sesión. */
CREATE OR REPLACE FUNCTION public.get_venue_sos_alerts()
RETURNS TABLE (
    id UUID,
    profile_name TEXT,
    profile_photo TEXT,
    event_name TEXT,
    note TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    handled_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_venue_id UUID := public.current_venue_id();
BEGIN
    IF v_venue_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT s.id, p.name, COALESCE(ea.photo_url, p.avatar), e.name, s.note,
           s.latitude, s.longitude, s.created_at, s.handled_at
    FROM public.sos_alerts s
    JOIN public.profiles p ON p.id = s.profile_id
    JOIN public.events e ON e.id = s.event_id
    LEFT JOIN public.event_attendance ea
           ON ea.event_id = s.event_id AND ea.profile_id = s.profile_id
    WHERE e.venue_id = v_venue_id
      AND s.status = 'active'
      AND s.created_at > NOW() - INTERVAL '12 hours'
    ORDER BY s.created_at DESC;
END;
$$;

/** El equipo del local marca que se está atendiendo. */
CREATE OR REPLACE FUNCTION public.acknowledge_sos_alert(p_alert_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_venue_id UUID := public.current_venue_id();
BEGIN
    IF v_venue_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    UPDATE public.sos_alerts s
    SET handled_at = NOW(), handled_by = auth.uid()
    WHERE s.id = p_alert_id
      AND EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = s.event_id AND e.venue_id = v_venue_id
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ALERT_NOT_FOUND';
    END IF;
END;
$$;

-- ============================================================================
-- 3. MODERACIÓN DE LA PROPIA PUERTA
-- ============================================================================

/**
 * El local retira el acceso de alguien a su evento.
 *
 * No suspende la cuenta —eso es cosa de administración— sino que le saca de
 * este evento: desaparece del tablón y tiene que volver a canjear un código,
 * que es exactamente lo que hace el portero cuando echa a alguien.
 */
CREATE OR REPLACE FUNCTION public.revoke_event_checkin(p_event_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_venue_id UUID := public.current_venue_id();
BEGIN
    IF v_venue_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = p_event_id AND e.venue_id = v_venue_id
    ) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    DELETE FROM public.event_attendance
    WHERE event_id = p_event_id AND profile_id = p_profile_id;
END;
$$;

/** Denuncias de personas que están en los eventos del local. */
CREATE OR REPLACE FUNCTION public.get_venue_reports(p_event_id UUID)
RETURNS TABLE (
    report_id UUID,
    reported_profile_id UUID,
    reported_name TEXT,
    reported_photo TEXT,
    report_type TEXT,
    description TEXT,
    created_at TIMESTAMPTZ,
    reports_total BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT r.id, p.id, p.name, COALESCE(ea.photo_url, p.avatar),
           r.report_type, r.description, r.created_at,
           (SELECT COUNT(*) FROM public.reports r2 WHERE r2.reported_id = p.id)
    FROM public.reports r
    JOIN public.profiles p ON p.id = r.reported_id
    JOIN public.event_attendance ea
      ON ea.profile_id = p.id AND ea.event_id = p_event_id
    WHERE r.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY r.created_at DESC
    LIMIT 100;
END;
$$;

-- ============================================================================
-- 4. PERMISOS
-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN (
              'claim_promotion', 'validate_promotion_ticket', 'get_promotion_stats',
              'get_venue_sos_alerts', 'acknowledge_sos_alert', 'revoke_event_checkin',
              'get_venue_reports'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT SELECT ON public.promotion_redemptions TO authenticated;
REVOKE ALL ON public.promotions FROM anon;
REVOKE ALL ON public.promotion_redemptions FROM anon;

COMMENT ON TABLE public.promotions IS
    'Ofertas y vales visibles sólo para quien ha hecho check-in en el evento.';
COMMENT ON FUNCTION public.revoke_event_checkin IS
    'Saca a alguien del evento sin suspender su cuenta: el equivalente a que el portero le invite a salir.';
