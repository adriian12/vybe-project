-- 062: Premium por evento de verdad, supercrush de pago y planes de local.
--
--   1. El móvil ya no puede crearse ni reactivarse Premium. Las policies de
--      INSERT y UPDATE de `premium_subscriptions` dejaban a cualquiera con
--      sesión escribir `status = 'active'`. Ahora sólo escribe el webhook de
--      Stripe (service_role).
--   2. El Premium por evento sólo vale en su evento. `is_premium()` lo daba por
--      bueno en cualquier sitio durante 12 horas. Ahora cuenta si es mensual
--      (o de por vida) o si es del evento en el que está esa persona.
--   3. Supercrush (antes «super like"): saldo por persona en
--      `supercrush_ledger`. Premium incluye uno por evento; los demás se
--      compran a 1 € y valen en cualquier evento. Al crear la cuenta se regala
--      uno.
--   4. Planes de local: Pro deja de tener exportar CSV y la curva de aforo;
--      Business lo tiene todo, también exportar PDF.

-- ---------------------------------------------------------------- 1. Premium
DROP POLICY IF EXISTS "Users can create subscriptions" ON public.premium_subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.premium_subscriptions;

-- Lo que alguien se hubiera activado desde el móvil sin pagar (sin cliente de
-- Stripe y sin ser la suscripción de por vida de administración) se anula.
UPDATE public.premium_subscriptions ps
SET status = 'cancelled'
WHERE ps.status = 'active'
  AND ps.stripe_customer_id IS NULL
  AND ps.subscription_type <> 'lifetime';

-- ------------------------------------------------- 2. Premium por evento
-- El evento en el que está alguien ahora mismo: el mismo criterio que
-- `get_my_active_event()`.
CREATE OR REPLACE FUNCTION public.active_event_of(p_profile_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ea.event_id
    FROM public.event_attendance ea
    JOIN public.events e ON e.id = ea.event_id
    WHERE ea.profile_id = p_profile_id
      AND ea.left_at IS NULL
      AND e.end_date > NOW()
    ORDER BY ea.last_seen_at DESC NULLS LAST
    LIMIT 1;
$$;

-- ¿Tiene Premium esta persona en este evento? El mensual y el de por vida
-- valen en todos; el de evento, sólo en el suyo.
CREATE OR REPLACE FUNCTION public.is_premium_for_event(p_profile_id UUID, p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        EXISTS (
            SELECT 1 FROM public.premium_subscriptions ps
            WHERE ps.user_id = p_profile_id
              AND ps.status = 'active'
              AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
              AND (ps.event_id IS NULL OR (p_event_id IS NOT NULL AND ps.event_id = p_event_id))
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles pr WHERE pr.id = p_profile_id AND pr.role = 'admin'
        ),
        FALSE
    );
$$;

-- La firma de siempre: ahora mira el evento en el que está la persona.
CREATE OR REPLACE FUNCTION public.is_premium(p_profile_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_premium_for_event(
        COALESCE(p_profile_id, public.current_profile_id()),
        public.active_event_of(COALESCE(p_profile_id, public.current_profile_id()))
    );
$$;

-- Guardar un match es del evento donde se hizo: al acabar la fiesta la persona
-- ya no «está» en ningún evento, y con `is_premium()` perdía el derecho.
CREATE OR REPLACE FUNCTION public.keep_connection(p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_conn RECORD;
    v_premium BOOLEAN;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_conn FROM public.connections WHERE id = p_connection_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CONNECTION_NOT_FOUND';
    END IF;

    IF v_conn.user_id_1 = v_profile_id THEN
        UPDATE public.connections SET kept_by_1 = TRUE WHERE id = p_connection_id;
    ELSIF v_conn.user_id_2 = v_profile_id THEN
        UPDATE public.connections SET kept_by_2 = TRUE WHERE id = p_connection_id;
    ELSE
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    v_premium := public.is_premium_for_event(v_profile_id, v_conn.event_id);

    UPDATE public.connections
    SET expires_at = NULL
    WHERE id = p_connection_id
      AND (v_premium OR (kept_by_1 AND kept_by_2));

    RETURN EXISTS (
        SELECT 1 FROM public.connections
        WHERE id = p_connection_id AND expires_at IS NULL
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_boost(p_event_id uuid)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_expira TIMESTAMPTZ;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF NOT public.is_premium_for_event(v_profile_id, p_event_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    SELECT expires_at INTO v_expira
    FROM public.profile_boosts
    WHERE profile_id = v_profile_id AND event_id = p_event_id;

    IF FOUND THEN
        IF v_expira > NOW() THEN
            RETURN v_expira;
        END IF;
        RAISE EXCEPTION 'BOOST_ALREADY_USED';
    END IF;

    v_expira := NOW() + INTERVAL '1 hour';

    INSERT INTO public.profile_boosts (profile_id, event_id, expires_at)
    VALUES (v_profile_id, p_event_id, v_expira);

    RETURN v_expira;
END;
$function$;

CREATE OR REPLACE FUNCTION public.undo_pass(p_profile_id uuid, p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_borrados INTEGER;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF NOT public.is_premium_for_event(v_profile_id, p_event_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    DELETE FROM public.swipes
    WHERE swiper_id = v_profile_id
      AND swiped_id = p_profile_id
      AND event_id = p_event_id
      AND swipe_type = 'dislike';

    GET DIAGNOSTICS v_borrados = ROW_COUNT;
    RETURN v_borrados > 0;
END;
$function$;

-- Lo que la app necesita para pintar Premium: si lo hay aquí y ahora, de qué
-- tipo y para qué evento.
CREATE OR REPLACE FUNCTION public.my_premium_status()
RETURNS TABLE (
    is_premium BOOLEAN,
    subscription_id UUID,
    subscription_type TEXT,
    event_id UUID,
    expires_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN,
    active_event_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_event UUID;
BEGIN
    IF v_profile IS NULL THEN
        RETURN;
    END IF;
    v_event := public.active_event_of(v_profile);

    RETURN QUERY
    SELECT
        public.is_premium_for_event(v_profile, v_event),
        s.id, s.subscription_type, s.event_id, s.expires_at,
        COALESCE(s.cancel_at_period_end, FALSE),
        v_event
    FROM (SELECT 1) AS uno
    LEFT JOIN LATERAL (
        -- La que cuenta ahora: primero la mensual o de por vida; si no, la de
        -- este evento.
        SELECT ps.* FROM public.premium_subscriptions ps
        WHERE ps.user_id = v_profile
          AND ps.status = 'active'
          AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
          AND (ps.event_id IS NULL OR ps.event_id = v_event)
        ORDER BY (ps.event_id IS NULL) DESC, ps.started_at DESC
        LIMIT 1
    ) s ON TRUE;
END;
$$;

-- -------------------------------------------------------- 3. Supercrush
CREATE TABLE IF NOT EXISTS public.supercrush_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- +N al comprar o de regalo, -1 al gastar uno comprado, 0 al usar el que
    -- incluye Premium en un evento (se apunta para no repetirlo).
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('welcome', 'purchase', 'spent', 'included', 'admin')),
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    swiped_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    stripe_session_id TEXT UNIQUE,
    amount_cents INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supercrush_ledger_profile_idx ON public.supercrush_ledger (profile_id);
-- Un solo regalo de bienvenida por persona.
CREATE UNIQUE INDEX IF NOT EXISTS supercrush_ledger_welcome_once
    ON public.supercrush_ledger (profile_id) WHERE reason = 'welcome';

ALTER TABLE public.supercrush_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own supercrush ledger" ON public.supercrush_ledger;
CREATE POLICY "Own supercrush ledger" ON public.supercrush_ledger
    FOR SELECT USING (profile_id = public.current_profile_id());

CREATE OR REPLACE FUNCTION public.supercrush_balance(p_profile_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(delta), 0)::INTEGER
    FROM public.supercrush_ledger
    WHERE profile_id = p_profile_id;
$$;

-- Saldo y si queda el incluido de Premium en el evento en el que estás.
CREATE OR REPLACE FUNCTION public.my_supercrush()
RETURNS TABLE (balance INTEGER, included_available BOOLEAN, event_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_event UUID;
BEGIN
    IF v_profile IS NULL THEN
        RETURN;
    END IF;
    v_event := public.active_event_of(v_profile);
    RETURN QUERY SELECT
        public.supercrush_balance(v_profile),
        v_event IS NOT NULL
            AND public.is_premium_for_event(v_profile, v_event)
            AND NOT EXISTS (
                SELECT 1 FROM public.supercrush_ledger l
                WHERE l.profile_id = v_profile AND l.event_id = v_event AND l.reason = 'included'
            ),
        v_event;
END;
$$;

-- Cobra el supercrush al insertar el swipe. Primero el incluido de Premium en
-- ese evento; si ya se usó, uno del saldo; si no hay, no se envía.
CREATE OR REPLACE FUNCTION public.charge_supercrush()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.swipe_type <> 'super_like' THEN
        RETURN NEW;
    END IF;
    -- Sólo lo que manda la propia persona. Los de las salas de pruebas los
    -- inserta el servidor en nombre de perfiles del seed y no se cobran.
    IF public.current_profile_id() IS NULL OR NEW.swiper_id <> public.current_profile_id() THEN
        RETURN NEW;
    END IF;
    IF NEW.event_id IS NULL THEN
        RAISE EXCEPTION 'EVENT_REQUIRED';
    END IF;

    -- Dos toques a la vez no pueden gastar el mismo supercrush.
    PERFORM pg_advisory_xact_lock(hashtextextended('supercrush:' || NEW.swiper_id::text, 0));

    IF public.is_premium_for_event(NEW.swiper_id, NEW.event_id)
       AND NOT EXISTS (
           SELECT 1 FROM public.supercrush_ledger l
           WHERE l.profile_id = NEW.swiper_id AND l.event_id = NEW.event_id AND l.reason = 'included'
       ) THEN
        INSERT INTO public.supercrush_ledger (profile_id, delta, reason, event_id, swiped_id)
        VALUES (NEW.swiper_id, 0, 'included', NEW.event_id, NEW.swiped_id);
        RETURN NEW;
    END IF;

    IF public.supercrush_balance(NEW.swiper_id) < 1 THEN
        RAISE EXCEPTION 'NO_SUPERCRUSH';
    END IF;

    INSERT INTO public.supercrush_ledger (profile_id, delta, reason, event_id, swiped_id)
    VALUES (NEW.swiper_id, -1, 'spent', NEW.event_id, NEW.swiped_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS swipes_charge_supercrush ON public.swipes;
CREATE TRIGGER swipes_charge_supercrush
    BEFORE INSERT ON public.swipes
    FOR EACH ROW EXECUTE FUNCTION public.charge_supercrush();

-- Regalo de bienvenida: uno por cuenta, también a las que ya existían.
CREATE OR REPLACE FUNCTION public.supercrush_welcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.supercrush_ledger (profile_id, delta, reason)
    VALUES (NEW.id, 1, 'welcome')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_supercrush_welcome ON public.profiles;
CREATE TRIGGER profiles_supercrush_welcome
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.supercrush_welcome();

INSERT INTO public.supercrush_ledger (profile_id, delta, reason)
SELECT p.id, 1, 'welcome' FROM public.profiles p
ON CONFLICT DO NOTHING;

-- Compra confirmada por Stripe. Idempotente por sesión: Stripe puede repetir el
-- aviso y no debe sumar dos veces.
CREATE OR REPLACE FUNCTION public.credit_supercrush_purchase(
    p_profile_id UUID, p_quantity INTEGER, p_session_id TEXT, p_amount_cents INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;
    INSERT INTO public.supercrush_ledger (profile_id, delta, reason, stripe_session_id, amount_cents)
    VALUES (p_profile_id, p_quantity, 'purchase', p_session_id, p_amount_cents)
    ON CONFLICT (stripe_session_id) DO NOTHING;
    RETURN FOUND;
END;
$$;

-- --------------------------------------------------------- 4. Locales
CREATE OR REPLACE FUNCTION public.venue_plan_limits(p_plan text)
RETURNS TABLE(max_active_events integer, max_team_members integer, promoter_codes boolean, demographics boolean, promotions boolean, csv_export boolean)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
    SELECT planes.max_active_events, planes.max_team_members, planes.promoter_codes,
           planes.demographics, planes.promotions, planes.csv_export
    FROM (VALUES
        ('free',     1,   2,  FALSE, FALSE, FALSE, FALSE),
        ('pro',      5,   8,  TRUE,  FALSE, TRUE,  FALSE),
        ('business', 50,  40, TRUE,  TRUE,  TRUE,  TRUE)
    ) AS planes(plan, max_active_events, max_team_members, promoter_codes,
                demographics, promotions, csv_export)
    WHERE planes.plan = COALESCE(p_plan, 'free');
$function$;

CREATE OR REPLACE FUNCTION public.venue_has_feature(p_feature text, p_venue_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_plan TEXT := public.venue_plan(p_venue_id);
    v_limits RECORD;
BEGIN
    SELECT * INTO v_limits FROM public.venue_plan_limits(v_plan);

    RETURN COALESCE(CASE p_feature
        WHEN 'promoter_codes'  THEN v_limits.promoter_codes
        WHEN 'demographics'    THEN v_limits.demographics
        WHEN 'promotions'      THEN v_limits.promotions
        WHEN 'csv_export'      THEN v_limits.csv_export
        WHEN 'pdf_export'      THEN v_plan = 'business'
        WHEN 'headcount_curve' THEN v_plan = 'business'
        ELSE FALSE
    END, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_headcount_curve(p_event_id uuid)
RETURNS TABLE(bucket timestamp with time zone, total integer, vybe bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_venue UUID;
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.start_date, e.end_date, e.venue_id INTO v_start, v_end, v_venue
    FROM public.events e WHERE e.id = p_event_id;

    -- La curva de aforo y el % con la app son de Business.
    IF NOT public.is_admin() AND public.venue_plan(v_venue) <> 'business' THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;

    v_start := LEAST(
        v_start,
        COALESCE((SELECT MIN(l.at) FROM public.event_headcount_log l WHERE l.event_id = p_event_id), v_start)
    );
    v_end := LEAST(v_end, NOW());
    v_start := GREATEST(v_start, v_end - INTERVAL '24 hours');

    RETURN QUERY
    SELECT
        b.t,
        (SELECT l.total FROM public.event_headcount_log l
          WHERE l.event_id = p_event_id AND l.at < b.t + INTERVAL '15 minutes'
          ORDER BY l.at DESC LIMIT 1),
        (SELECT COUNT(*) FROM public.event_attendance ea
          WHERE ea.event_id = p_event_id
            AND ea.checked_in_at < b.t + INTERVAL '15 minutes'
            AND ea.last_seen_at >= b.t)
    FROM generate_series(
        date_trunc('hour', v_start),
        v_end,
        INTERVAL '15 minutes'
    ) AS b(t);
END;
$function$;

-- ------------------------------------------------------------- permisos
REVOKE ALL ON FUNCTION public.active_event_of(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_premium_for_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supercrush_balance(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_supercrush_purchase(UUID, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_supercrush() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supercrush_welcome() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_premium_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_supercrush() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.active_event_of(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_premium_for_event(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.supercrush_balance(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_supercrush_purchase(UUID, INTEGER, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_premium_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_supercrush() TO authenticated, service_role;
GRANT SELECT ON public.supercrush_ledger TO authenticated;
GRANT ALL ON public.supercrush_ledger TO service_role;
