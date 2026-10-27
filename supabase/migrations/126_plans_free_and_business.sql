-- =============================================================================
-- 126 · Dos planes de local: Gratis y Business (Pro desaparece)
-- =============================================================================
-- Gratis sirve para trabajar una noche entera: 3 eventos activos a la vez,
-- equipo de 3, puerta, venta de entradas, listas y previsión. Business
-- (69,99 €/mes, sin cambios) suma lo que hace crecer: eventos y equipo sin
-- límite, RRPP con códigos y comisiones, promociones, valoraciones, públicos,
-- curva de aforo, demografía, exportar y un destacado al mes incluido.
--
-- Sin límite = NULL: `v_current >= NULL` no es cierto y los disparadores de
-- eventos y equipo dejan pasar.
--
-- No había ningún Pro de pago, sólo 22 pruebas: pasan a prueba de Business con
-- la misma fecha de fin. La prueba de los locales nuevos también es Business.
-- =============================================================================

-- 1. Límites ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venue_plan_limits(p_plan text)
 RETURNS TABLE(max_active_events integer, max_team_members integer, promoter_codes boolean, demographics boolean, promotions boolean, csv_export boolean)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
    SELECT planes.max_active_events, planes.max_team_members, planes.promoter_codes,
           planes.demographics, planes.promotions, planes.csv_export
    FROM (VALUES
        ('free',     3,                 3,                 FALSE, FALSE, FALSE, FALSE),
        ('business', NULL::INTEGER,     NULL::INTEGER,     TRUE,  TRUE,  TRUE,  TRUE)
    ) AS planes(plan, max_active_events, max_team_members, promoter_codes,
                demographics, promotions, csv_export)
    WHERE planes.plan = COALESCE(p_plan, 'free');
$function$;

-- 2. Funciones ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venue_has_feature(p_feature text, p_venue_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_plan TEXT := public.venue_plan(p_venue_id);
BEGIN
    RETURN COALESCE(CASE p_feature
        -- En todos los planes.
        WHEN 'ticket_sales'          THEN TRUE
        WHEN 'forecast'              THEN TRUE
        -- Sólo Business.
        WHEN 'promoter_codes'        THEN v_plan = 'business'
        WHEN 'promoter_commissions'  THEN v_plan = 'business'
        WHEN 'promotions'            THEN v_plan = 'business'
        WHEN 'demographics'          THEN v_plan = 'business'
        WHEN 'csv_export'            THEN v_plan = 'business'
        WHEN 'pdf_export'            THEN v_plan = 'business'
        WHEN 'headcount_curve'       THEN v_plan = 'business'
        WHEN 'ratings'               THEN v_plan = 'business'
        WHEN 'segmented_broadcasts'  THEN v_plan = 'business'
        WHEN 'included_boost'        THEN v_plan = 'business'
        ELSE FALSE
    END, FALSE);
END;
$function$;

-- 3. Pro → Business -----------------------------------------------------------
UPDATE public.venue_subscriptions SET plan = 'business' WHERE plan = 'pro';

ALTER TABLE public.venue_subscriptions DROP CONSTRAINT IF EXISTS venue_subscriptions_plan_check;
ALTER TABLE public.venue_subscriptions
    ADD CONSTRAINT venue_subscriptions_plan_check CHECK (plan IN ('free', 'business'));

CREATE OR REPLACE FUNCTION public.start_venue_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF COALESCE(NEW.is_verified, FALSE)
       AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.is_verified, FALSE))
       AND NOT EXISTS (SELECT 1 FROM public.venue_subscriptions vs WHERE vs.venue_id = NEW.id) THEN
        INSERT INTO public.venue_subscriptions (venue_id, plan, status, started_at, expires_at, cancel_at_period_end)
        VALUES (NEW.id, 'business', 'trialing', NOW(), NOW() + INTERVAL '30 days', TRUE);
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_venue_plan(p_venue_id uuid, p_plan text, p_days integer DEFAULT 30)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_plan NOT IN ('free', 'business') THEN
        RAISE EXCEPTION 'INVALID_PLAN';
    END IF;

    IF p_plan = 'free' THEN
        UPDATE public.venue_subscriptions SET status = 'cancelled' WHERE venue_id = p_venue_id;
        RETURN 'free';
    END IF;

    INSERT INTO public.venue_subscriptions (venue_id, plan, status, started_at, expires_at, cancel_at_period_end)
    VALUES (p_venue_id, p_plan, 'active', NOW(),
            NOW() + (GREATEST(1, COALESCE(p_days, 30)) || ' days')::INTERVAL, FALSE)
    ON CONFLICT (venue_id)
    DO UPDATE SET plan = EXCLUDED.plan, status = 'active', started_at = NOW(),
                  expires_at = EXCLUDED.expires_at, cancel_at_period_end = FALSE;

    RETURN p_plan;
END;
$function$;

-- 4. Un destacado al mes incluido en Business --------------------------------
ALTER TABLE public.event_boosts ADD COLUMN IF NOT EXISTS included BOOLEAN NOT NULL DEFAULT FALSE;

/** Destacados incluidos que le quedan este mes (hora de Madrid) al local. */
CREATE OR REPLACE FUNCTION public.get_included_boosts_left()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL OR NOT COALESCE(public.venue_has_feature('included_boost', v_venue), FALSE) THEN
        RETURN 0;
    END IF;
    RETURN GREATEST(1 - (
        SELECT COUNT(*) FROM public.event_boosts b
        WHERE b.venue_id = v_venue AND b.included
          AND b.created_at >= (date_trunc('month', NOW() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')
    )::INTEGER, 0);
END;
$function$;

/** Destaca un evento del local con el destacado del mes. Sólo el dueño. */
CREATE OR REPLACE FUNCTION public.use_included_boost(p_event_id UUID)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_evento RECORD;
BEGIN
    SELECT e.id, e.venue_id, e.end_date, e.featured_until INTO v_evento
    FROM public.events e WHERE e.id = p_event_id;

    IF v_evento.id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.venues v WHERE v.id = v_evento.venue_id AND v.venue_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF v_evento.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    IF v_evento.featured_until IS NOT NULL AND v_evento.featured_until > NOW() THEN
        RETURN v_evento.featured_until;
    END IF;

    -- Uno a la vez: que dos clics seguidos no gasten dos.
    PERFORM pg_advisory_xact_lock(hashtext('included_boost:' || v_evento.venue_id::TEXT));
    IF COALESCE(public.get_included_boosts_left(), 0) < 1 THEN
        RAISE EXCEPTION 'NO_INCLUDED_BOOST';
    END IF;

    INSERT INTO public.event_boosts (event_id, venue_id, amount_cents, included)
    VALUES (v_evento.id, v_evento.venue_id, 0, TRUE);

    PERFORM set_config('vybe.event_system', 'on', TRUE);
    UPDATE public.events SET featured_until = v_evento.end_date WHERE id = v_evento.id;
    PERFORM set_config('vybe.event_system', 'off', TRUE);

    RETURN v_evento.end_date;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_included_boosts_left() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.use_included_boost(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_included_boosts_left() TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_included_boost(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
