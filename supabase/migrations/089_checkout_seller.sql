-- 089: quién vende, antes de pagar.
--
-- En una venta a distancia el comprador tiene que saber, antes de pagar, la
-- identidad del vendedor, su NIF y su dirección (artículo 97 de la Ley General
-- para la Defensa de los Consumidores). El vendedor de una entrada es el
-- negocio, no Fiestea: la pantalla de compra lo enseña con estos datos.

DROP FUNCTION IF EXISTS public.get_ticket_checkout(uuid);

CREATE FUNCTION public.get_ticket_checkout(p_type_id uuid)
 RETURNS TABLE(type_id uuid, kind text, name text, description text, price_cents integer, remaining integer, guests integer,
               min_spend_cents integer, max_per_order integer, event_id uuid, event_name text, start_date timestamp with time zone,
               end_date timestamp with time zone, dress_code text, min_age integer, venue_name text, venue_logo text,
               venue_terms text, payments_enabled boolean, venue_tax_id text, venue_address text, venue_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT tt.id, tt.kind, tt.name, tt.description, tt.price_cents,
           CASE WHEN tt.capacity IS NULL THEN NULL ELSE GREATEST(tt.capacity - public.ticket_type_taken(tt.id), 0) END,
           tt.guests, tt.min_spend_cents, tt.max_per_order, e.id, e.name, e.start_date, e.end_date,
           COALESCE(tt.dress_code, e.dress_code), COALESCE(tt.min_age, e.min_age), v.name, v.logo_url, v.business_terms,
           (tt.price_cents = 0 OR (v.stripe_account_id IS NOT NULL AND v.stripe_charges_enabled)),
           v.tax_id, v.address, COALESCE(v.contact_email, v.email)
    FROM public.ticket_types tt
    JOIN public.events e ON e.id = tt.event_id
    JOIN public.venues v ON v.id = tt.venue_id
    WHERE tt.id = p_type_id AND tt.active AND e.end_date > NOW();
$function$;

REVOKE ALL ON FUNCTION public.get_ticket_checkout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_checkout(uuid) TO authenticated, service_role;
