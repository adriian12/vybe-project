-- 070: una sola `venue_has_feature` para PostgREST.
--
-- La 068 creó `venue_has_feature(p_venue_id uuid, p_feature text)` sin ver que
-- ya existía `venue_has_feature(p_feature text, p_venue_id uuid)` (migraciones
-- 021 y 042). Dentro de la base de datos cada llamada encontraba la suya por el
-- orden de los tipos, pero PostgREST llama por nombre de argumento y los dos
-- casaban: respondía 300 («Multiple Choices») y `stripe-connect` lo tomaba como
-- «tu plan no incluye esta función» aunque el local fuera Business.
--
-- Ahora la original conoce todas las funciones de plan, y la de la 068 se queda
-- sólo para las llamadas internas (uuid, text), con otros nombres de argumento
-- para que PostgREST no la confunda.

CREATE OR REPLACE FUNCTION public.venue_has_feature(p_feature TEXT, p_venue_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan TEXT := public.venue_plan(p_venue_id);
    v_limits RECORD;
BEGIN
    SELECT * INTO v_limits FROM public.venue_plan_limits(v_plan);

    RETURN COALESCE(CASE p_feature
        WHEN 'promoter_codes'        THEN v_limits.promoter_codes
        WHEN 'demographics'          THEN v_limits.demographics
        WHEN 'promotions'            THEN v_limits.promotions
        WHEN 'csv_export'            THEN v_limits.csv_export
        WHEN 'pdf_export'            THEN v_plan = 'business'
        WHEN 'headcount_curve'       THEN v_plan = 'business'
        -- Migración 068.
        WHEN 'ticket_sales'          THEN v_plan = 'business'
        WHEN 'promoter_commissions'  THEN v_plan = 'business'
        WHEN 'ratings'               THEN v_plan IN ('pro', 'business')
        WHEN 'segmented_broadcasts'  THEN v_plan IN ('pro', 'business')
        WHEN 'forecast'              THEN TRUE
        ELSE FALSE
    END, FALSE);
END;
$$;

DROP FUNCTION IF EXISTS public.venue_has_feature(UUID, TEXT);

CREATE FUNCTION public.venue_has_feature(p_venue UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.venue_has_feature(p_key, p_venue);
$$;

REVOKE ALL ON FUNCTION public.venue_has_feature(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venue_has_feature(UUID, TEXT) TO authenticated, service_role;
