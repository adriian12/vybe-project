-- Edad mínima y dress code por tipo de entrada (si no se ponen, los de la
-- fiesta), y qué fiestas venden entradas en la app, para que la tarjeta del
-- inicio enseñe «Entradas» en lugar de «Voy a ir».

ALTER TABLE public.ticket_types
    ADD COLUMN IF NOT EXISTS min_age INTEGER CHECK (min_age IS NULL OR min_age BETWEEN 14 AND 99),
    ADD COLUMN IF NOT EXISTS dress_code TEXT CHECK (dress_code IS NULL OR char_length(dress_code) <= 40);

DROP FUNCTION IF EXISTS public.save_ticket_type(uuid, uuid, text, text, text, integer, integer, integer, integer, integer, boolean);
CREATE FUNCTION public.save_ticket_type(p_id uuid, p_event_id uuid, p_kind text, p_name text, p_description text, p_price_cents integer, p_capacity integer, p_guests integer DEFAULT NULL::integer, p_min_spend_cents integer DEFAULT NULL::integer, p_max_per_order integer DEFAULT 6, p_active boolean DEFAULT true, p_min_age integer DEFAULT NULL::integer, p_dress_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_venue UUID;
    v_end TIMESTAMPTZ;
    v_id UUID;
    v_taken INTEGER;
BEGIN
    SELECT venue_id, end_date INTO v_venue, v_end FROM public.events WHERE id = p_event_id;
    IF v_venue IS NULL THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND';
    END IF;
    IF NOT (public.is_admin()
            OR (public.current_venue_id() = v_venue AND public.current_venue_role() = 'owner')) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF NOT public.venue_has_feature(v_venue, 'ticket_sales') THEN
        RAISE EXCEPTION 'PLAN_REQUIRED';
    END IF;
    IF v_end < NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;
    IF p_kind NOT IN ('entry', 'vip', 'table') THEN
        RAISE EXCEPTION 'INVALID_KIND';
    END IF;
    IF p_kind = 'table' AND p_capacity IS NULL THEN
        RAISE EXCEPTION 'TABLES_NEED_CAPACITY';
    END IF;
    IF p_min_age IS NOT NULL AND (p_min_age < 14 OR p_min_age > 99) THEN
        RAISE EXCEPTION 'INVALID_MIN_AGE';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.ticket_types (
            event_id, venue_id, kind, name, description, price_cents, capacity,
            guests, min_spend_cents, max_per_order, active, min_age, dress_code
        )
        VALUES (
            p_event_id, v_venue, p_kind, btrim(p_name), NULLIF(btrim(COALESCE(p_description, '')), ''),
            p_price_cents, p_capacity,
            CASE WHEN p_kind = 'table' THEN p_guests END,
            CASE WHEN p_kind = 'table' THEN p_min_spend_cents END,
            CASE WHEN p_kind = 'table' THEN 1 ELSE COALESCE(p_max_per_order, 6) END,
            COALESCE(p_active, TRUE),
            p_min_age, NULLIF(left(btrim(COALESCE(p_dress_code, '')), 40), '')
        )
        RETURNING id INTO v_id;
        RETURN v_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.ticket_types WHERE id = p_id AND event_id = p_event_id) THEN
        RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND';
    END IF;

    v_taken := public.ticket_type_taken(p_id);
    IF p_capacity IS NOT NULL AND p_capacity < v_taken THEN
        RAISE EXCEPTION 'CAPACITY_BELOW_SOLD';
    END IF;

    UPDATE public.ticket_types
    SET name = btrim(p_name),
        description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        price_cents = p_price_cents,
        capacity = p_capacity,
        guests = CASE WHEN kind = 'table' THEN p_guests END,
        min_spend_cents = CASE WHEN kind = 'table' THEN p_min_spend_cents END,
        max_per_order = CASE WHEN kind = 'table' THEN 1 ELSE COALESCE(p_max_per_order, 6) END,
        active = COALESCE(p_active, TRUE),
        min_age = p_min_age,
        dress_code = NULLIF(left(btrim(COALESCE(p_dress_code, '')), 40), ''),
        updated_at = NOW()
    WHERE id = p_id;

    RETURN p_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_ticket_type(uuid, uuid, text, text, text, integer, integer, integer, integer, integer, boolean, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ticket_type(uuid, uuid, text, text, text, integer, integer, integer, integer, integer, boolean, integer, text) TO authenticated, service_role;

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
    WHERE t.event_id = p_event_id
    ORDER BY CASE t.kind WHEN 'entry' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END, t.price_cents;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_ticket_sales(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ticket_sales(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_ticket_checkout(p_type_id uuid)
 RETURNS TABLE(type_id uuid, kind text, name text, description text, price_cents integer, remaining integer, guests integer, min_spend_cents integer, max_per_order integer, event_id uuid, event_name text, start_date timestamp with time zone, end_date timestamp with time zone, dress_code text, min_age integer, venue_name text, venue_logo text, venue_terms text, payments_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT tt.id, tt.kind, tt.name, tt.description, tt.price_cents,
           CASE WHEN tt.capacity IS NULL THEN NULL ELSE GREATEST(tt.capacity - public.ticket_type_taken(tt.id), 0) END,
           tt.guests, tt.min_spend_cents, tt.max_per_order, e.id, e.name, e.start_date, e.end_date,
           COALESCE(tt.dress_code, e.dress_code), COALESCE(tt.min_age, e.min_age), v.name, v.logo_url, v.business_terms,
           (tt.price_cents = 0 OR (v.stripe_account_id IS NOT NULL AND v.stripe_charges_enabled))
    FROM public.ticket_types tt
    JOIN public.events e ON e.id = tt.event_id
    JOIN public.venues v ON v.id = tt.venue_id
    WHERE tt.id = p_type_id AND tt.active AND e.end_date > NOW();
$function$;

DROP FUNCTION IF EXISTS public.get_events_activity(uuid[]);
CREATE FUNCTION public.get_events_activity(p_event_ids uuid[])
 RETURNS TABLE(event_id uuid, going bigint, inside bigint, vibe_level text, vibe_at timestamp with time zone, friends_going bigint, trend text, women_share integer, queue_level text, now_playing text, entry_closed boolean, headcount integer, swipe_enabled boolean, has_tickets boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    WITH yo AS (SELECT public.current_profile_id() AS id)
    SELECT
        e.id,
        (SELECT COUNT(*) FROM public.event_intents ei WHERE ei.event_id = e.id),
        app.inside,
        CASE WHEN f.total IS NOT NULL
             THEN public.vibe_level_for(GREATEST(f.total, app.inside), e.max_capacity) END,
        f.updated_at,
        (SELECT COUNT(*)
         FROM public.event_intents ei
         JOIN public.connections c
           ON c.expires_at IS NULL
          AND ((c.user_id_1 = yo.id AND c.user_id_2 = ei.profile_id)
            OR (c.user_id_2 = yo.id AND c.user_id_1 = ei.profile_id))
         WHERE ei.event_id = e.id),
        CASE WHEN e.start_date <= NOW() AND e.end_date > NOW() THEN public.event_trend(e.id) END,
        CASE WHEN e.show_gender_split AND e.start_date <= NOW() AND e.end_date > NOW()
             THEN public.event_women_share(e.id) END,
        CASE WHEN e.queue_updated_at > NOW() - INTERVAL '45 minutes' AND e.end_date > NOW()
             THEN e.queue_level END,
        CASE WHEN e.now_playing_at > NOW() - INTERVAL '30 minutes' AND e.end_date > NOW()
             THEN e.now_playing END,
        e.entry_closed_at IS NOT NULL,
        CASE WHEN e.show_headcount AND e.start_date <= NOW() AND e.end_date > NOW()
             THEN GREATEST(COALESCE(f.total, 0), app.inside)::INTEGER END,
        e.swipe_enabled,
        -- Vende entradas en la app: la tarjeta del inicio enseña «Entradas».
        e.end_date > NOW() AND EXISTS (
            SELECT 1 FROM public.ticket_types tt
            JOIN public.venues v ON v.id = tt.venue_id
            WHERE tt.event_id = e.id AND tt.active
              AND (tt.price_cents = 0 OR COALESCE(v.stripe_charges_enabled, FALSE))
              AND public.venue_has_feature(tt.venue_id, 'ticket_sales')
        )
    FROM public.events e
    CROSS JOIN yo
    CROSS JOIN LATERAL (SELECT public.vybe_inside(e.id) AS inside) app
    LEFT JOIN LATERAL public.fresh_headcount(e.id) f ON TRUE
    WHERE e.id = ANY(p_event_ids);
$function$;
REVOKE ALL ON FUNCTION public.get_events_activity(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_events_activity(uuid[]) TO authenticated, service_role;
