-- Notificaciones personalizadas (Business): los avisos de un negocio salen con
-- su logo. Sin Business, o con la casilla sin marcar, salen como siempre, con
-- el icono de Fiestea.
--
-- · venues.branded_push: la casilla de «Avisos» → «Notificaciones
--   personalizadas». Sólo cuenta si el plan incluye `branded_push`.
-- · push_subscriptions.app_build: el número de compilación de la app de ese
--   móvil. Las versiones que lo traen saben pintar el aviso con el logo a la
--   izquierda (Android); a las demás se les manda el aviso normal.

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS branded_push BOOLEAN NOT NULL DEFAULT FALSE;

-- Columna nueva en `venues`: sin su GRANT SELECT nadie la podría leer.
GRANT SELECT (branded_push) ON public.venues TO authenticated;

ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS app_build INTEGER;

-- La función del plan (igual que `brandedPush` en src/lib/venue-plans.ts).
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
        WHEN 'sales_dashboard'       THEN v_plan = 'business'
        WHEN 'price_tiers'           THEN v_plan = 'business'
        WHEN 'branded_push'          THEN v_plan = 'business'
        ELSE FALSE
    END, FALSE);
END;
$function$;

-- Marcar o desmarcar la casilla: sólo el dueño y sólo con Business.
CREATE OR REPLACE FUNCTION public.set_venue_branded_push(p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID := public.current_venue_id();
BEGIN
    IF v_venue IS NULL OR NOT COALESCE(public.current_venue_role() = 'owner', FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_enabled AND NOT COALESCE(public.venue_has_feature('branded_push', v_venue), FALSE) THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    UPDATE public.venues SET branded_push = COALESCE(p_enabled, FALSE) WHERE id = v_venue;
    RETURN COALESCE(p_enabled, FALSE);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_venue_branded_push(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_venue_branded_push(BOOLEAN) TO authenticated, service_role;

-- La app manda ahora su número de compilación. Se cambia la firma (parámetro
-- nuevo con valor por defecto): se borra la anterior para que una llamada con
-- tres parámetros no sea ambigua entre las dos.
DROP FUNCTION IF EXISTS public.save_native_push_token(text, text, text);

CREATE OR REPLACE FUNCTION public.save_native_push_token(
    p_token text,
    p_platform text,
    p_device_model text DEFAULT NULL::text,
    p_app_build integer DEFAULT NULL::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF p_platform NOT IN ('android', 'ios') THEN
        RAISE EXCEPTION 'INVALID_PLATFORM';
    END IF;

    INSERT INTO public.push_subscriptions (
        profile_id, endpoint, native_token, platform, device_model, last_used_at, app_build
    )
    VALUES (v_profile_id, p_token, p_token, p_platform, p_device_model, NOW(), p_app_build)
    ON CONFLICT (endpoint) DO UPDATE
        SET profile_id = EXCLUDED.profile_id,
            native_token = EXCLUDED.native_token,
            platform = EXCLUDED.platform,
            device_model = EXCLUDED.device_model,
            app_build = EXCLUDED.app_build,
            last_used_at = NOW();
END;
$function$;

REVOKE ALL ON FUNCTION public.save_native_push_token(text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_native_push_token(text, text, text, integer) TO authenticated, service_role;
