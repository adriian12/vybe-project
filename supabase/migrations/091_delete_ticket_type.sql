-- 091: eliminar un tipo de entrada desde Ventas.
--
-- Sin ventas, se borra de verdad. Con ventas (pagadas, devueltas o a medio
-- pagar) no se puede borrar: las entradas vendidas siguen valiendo y los
-- pedidos lo necesitan. Se retira: deja de venderse y de salir en Ventas.

ALTER TABLE public.ticket_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.delete_ticket_type(p_type_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.ticket_types WHERE id = p_type_id AND deleted_at IS NULL;
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND';
    END IF;
    IF NOT (public.is_admin()
            OR (public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner')) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF EXISTS (SELECT 1 FROM public.ticket_orders WHERE ticket_type_id = p_type_id)
       OR EXISTS (SELECT 1 FROM public.tickets WHERE ticket_type_id = p_type_id) THEN
        UPDATE public.ticket_types SET active = FALSE, deleted_at = NOW() WHERE id = p_type_id;
        RETURN 'archived';
    END IF;

    DELETE FROM public.ticket_types WHERE id = p_type_id;
    RETURN 'deleted';
END;
$$;

DROP FUNCTION IF EXISTS public.get_ticket_sales(uuid);
CREATE FUNCTION public.get_ticket_sales(p_event_id uuid)
 RETURNS TABLE(id uuid, kind text, name text, description text, price_cents integer, capacity integer, guests integer, min_spend_cents integer, max_per_order integer, active boolean, sold integer, used integer, revenue_cents bigint, min_age integer, dress_code text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID;
BEGIN
    SELECT venue_id INTO v_venue FROM public.events WHERE events.id = p_event_id;
    IF v_venue IS NULL OR NOT (public.is_admin()
        OR (public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner')) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT t.id, t.kind, t.name, t.description, t.price_cents, t.capacity, t.guests,
           t.min_spend_cents, t.max_per_order, t.active,
           COALESCE((SELECT SUM(o.quantity) FROM public.ticket_orders o
                      WHERE o.ticket_type_id = t.id AND o.status = 'paid'), 0)::INTEGER,
           (SELECT COUNT(*) FROM public.tickets tk WHERE tk.ticket_type_id = t.id AND tk.status = 'used')::INTEGER,
           COALESCE((SELECT SUM(o.amount_cents) FROM public.ticket_orders o
                      WHERE o.ticket_type_id = t.id AND o.status = 'paid'), 0)::BIGINT,
           t.min_age, t.dress_code
    FROM public.ticket_types t
    WHERE t.event_id = p_event_id AND t.deleted_at IS NULL
    ORDER BY CASE t.kind WHEN 'entry' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END, t.price_cents;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ticket_sales(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_sales(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_ticket_type(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ticket_type(UUID) TO authenticated;
