-- 088: archivar entradas en «Entradas».
--
-- Quien compra para sus amigos tiene todas las entradas del pedido en su
-- cuenta. Puede archivar las que no son suyas: dejan de salir en la lista,
-- siguen valiendo en la puerta (el QR es el mismo) y se recuperan desde
-- «Archivadas».

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_ticket_archived(p_ticket_id UUID, p_archived BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.tickets
       SET archived_at = CASE WHEN p_archived THEN COALESCE(archived_at, NOW()) ELSE NULL END
     WHERE id = p_ticket_id
       AND profile_id = public.current_profile_id();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.my_tickets();

CREATE FUNCTION public.my_tickets()
RETURNS TABLE(
    id UUID, code TEXT, status TEXT, used_at TIMESTAMPTZ, kind TEXT, type_name TEXT, guests INTEGER,
    min_spend_cents INTEGER, unit_cents INTEGER, event_id UUID, event_name TEXT, start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ, venue_name TEXT, order_id UUID, download_token TEXT, holder_name TEXT,
    archived BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tk.id, tk.code, tk.status, tk.used_at, tt.kind, tt.name, tt.guests, tt.min_spend_cents,
           o.unit_cents, e.id, e.name, e.start_date, e.end_date, v.name, o.id, o.download_token, tk.holder_name,
           tk.archived_at IS NOT NULL
    FROM public.tickets tk
    JOIN public.ticket_types tt ON tt.id = tk.ticket_type_id
    JOIN public.ticket_orders o ON o.id = tk.order_id
    JOIN public.events e ON e.id = tk.event_id
    JOIN public.venues v ON v.id = tk.venue_id
    WHERE tk.profile_id = public.current_profile_id()
      AND o.add_to_account
      AND e.end_date > NOW() - INTERVAL '30 days'
    ORDER BY e.start_date DESC, tt.kind, tk.created_at;
$$;

REVOKE ALL ON FUNCTION public.my_tickets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tickets() TO authenticated;
REVOKE ALL ON FUNCTION public.set_ticket_archived(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ticket_archived(UUID, BOOLEAN) TO authenticated;
