-- «Entradas» ofrece el PDF y el pase de Apple Wallet de cada entrada: hace falta
-- el pedido y su token de descarga (el mismo que va en el correo).

DROP FUNCTION IF EXISTS public.my_tickets();

CREATE FUNCTION public.my_tickets()
RETURNS TABLE(
    id UUID, code TEXT, status TEXT, used_at TIMESTAMPTZ, kind TEXT, type_name TEXT, guests INTEGER,
    min_spend_cents INTEGER, unit_cents INTEGER, event_id UUID, event_name TEXT, start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ, venue_name TEXT, order_id UUID, download_token TEXT, holder_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tk.id, tk.code, tk.status, tk.used_at, tt.kind, tt.name, tt.guests, tt.min_spend_cents,
           o.unit_cents, e.id, e.name, e.start_date, e.end_date, v.name, o.id, o.download_token, tk.holder_name
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
