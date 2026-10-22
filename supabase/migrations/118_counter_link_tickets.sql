-- 118: el enlace del contador también valida entradas.
--
-- El portero que cuenta con `/contador/<token>` (migración 040) no podía
-- escanear entradas: eso sólo lo hacía Control puerta (antes «Seguridad») con
-- su enlace de equipo o con cuenta. Ahora la página del contador lleva abajo
-- un botón fijo «Escanear entrada» que llama a esta función por `door-counter`.
--
-- Igual que `team_link_action('ticket')`: la entrada tiene que ser de la
-- fiesta del enlace, y la validación es la de siempre (`validate_event_ticket`)
-- con el papel de Control puerta fijado en la transacción. Sólo con el plan que
-- vende entradas: sin él, el botón no sale.

CREATE OR REPLACE FUNCTION public.counter_link_ticket(p_token_hash TEXT, p_code TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_link public.event_counter_links%ROWTYPE;
    v_venue UUID;
    v_entradas BOOLEAN;
    v_res JSONB;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT * INTO v_link FROM public.event_counter_links l
    WHERE l.token_hash = p_token_hash
      AND l.revoked_at IS NULL
      AND l.expires_at > NOW();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LINK';
    END IF;

    SELECT e.venue_id INTO v_venue FROM public.events e WHERE e.id = v_link.event_id;
    v_entradas := COALESCE(public.venue_has_feature('ticket_sales', v_venue), FALSE);

    -- Sin código: sólo si el enlace puede validar entradas.
    IF p_code IS NULL THEN
        RETURN jsonb_build_object('tickets', v_entradas);
    END IF;

    IF NOT v_entradas THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.tickets tk
        WHERE upper(tk.code) = upper(btrim(p_code)) AND tk.event_id = v_link.event_id
    ) THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND';
    END IF;

    PERFORM set_config('vybe.team_venue', v_venue::TEXT, TRUE);
    PERFORM set_config('vybe.team_role', 'security', TRUE);
    UPDATE public.event_counter_links SET last_used_at = NOW() WHERE id = v_link.id;

    SELECT to_jsonb(x) INTO v_res FROM public.validate_event_ticket(btrim(p_code)) x;
    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.counter_link_ticket(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.counter_link_ticket(TEXT, TEXT) TO service_role;
