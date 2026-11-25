-- 146 · Señales reales de cada fiesta y etiquetas de las salas conocidas.
--
-- Mientras haya poca gente con la app, «0 van a ir» echa para atrás. En vez de
-- inventar cifras, la app enseña lo que sí es verdad:
--   · visitas a la ficha en los últimos 7 días (analítica anónima);
--   · cuántos han mirado entradas en las últimas 24 h (booking_clicks);
--   · seguidores del local (nunca los del local de la casa);
--   · si la fiesta se ha añadido hace poco;
--   · etiquetas: «Se suele llenar» y «Popular en …» para las salas conocidas
--     (tabla `popular_places`, que se aplica sola a las fiestas nuevas),
--     «Últimas entradas» si quedan menos del 15 % de las que vende la app y
--     «Destacada» mientras dure el destacado.

CREATE TABLE IF NOT EXISTS public.popular_places (
    id BIGSERIAL PRIMARY KEY,
    -- Expresión regular (sin mayúsculas) contra «sala | nombre de la fiesta».
    pattern TEXT NOT NULL UNIQUE,
    -- Lo que se lee en «Popular en …».
    city_label TEXT NOT NULL,
    fills_up BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.popular_places ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.popular_places FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.popular_places;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.popular_places
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

INSERT INTO public.popular_places (pattern, city_label) VALUES
    -- Mallorca
    ('\mamok\M', 'Palma'),
    ('\mfitz\M', 'Palma'),
    ('\mbcm\M', 'Mallorca'),
    ('\mparao\M', 'Palma'),
    ('\mover club\M', 'Palma'),
    ('son fuster', 'Palma'),
    -- Madrid
    ('\mfabrik\M', 'Madrid'),
    ('\mmondo\M', 'Madrid'),
    ('\mlula club\M', 'Madrid'),
    ('\mla riviera\M', 'Madrid'),
    ('\msala el sol\M', 'Madrid'),
    ('\mindependance\M', 'Madrid'),
    ('\mgoya social club\M', 'Madrid'),
    ('\mteatro kapital\M', 'Madrid'),
    ('\mopium madrid\M', 'Madrid'),
    ('\msala uni\M', 'Madrid'),
    ('\msala siroco\M', 'Madrid'),
    -- Barcelona
    ('\mrazzmatazz\M', 'Barcelona'),
    ('\msala apolo\M', 'Barcelona'),
    ('\mmoog\M', 'Barcelona'),
    ('\mcity hall\M', 'Barcelona'),
    ('\minput high fidelity\M', 'Barcelona'),
    ('\mmacarena club\M', 'Barcelona'),
    ('\mbikini club\M', 'Barcelona'),
    ('\mmarula\M', 'Barcelona'),
    ('\mluz de gas\M', 'Barcelona'),
    ('\mjamboree\M', 'Barcelona'),
    ('\mopium barcelona\M', 'Barcelona'),
    ('\mpacha barcelona\M', 'Barcelona'),
    ('\motto zutz\M', 'Barcelona'),
    ('\msutton\M', 'Barcelona'),
    ('\mdowntown barcelona\M', 'Barcelona'),
    -- Alicante
    ('\munderclub\M', 'Alicante'),
    ('\mmarmarela\M', 'Alicante'),
    ('\mstereo alicante\M', 'Alicante')
ON CONFLICT (pattern) DO NOTHING;

-- Las visitas a la ficha se buscan por fiesta y fecha.
CREATE INDEX IF NOT EXISTS analytics_events_event_viewed_idx
    ON public.analytics_events ((props->>'eventId'), created_at)
    WHERE name = 'event_viewed';
CREATE INDEX IF NOT EXISTS booking_clicks_event_created_idx
    ON public.booking_clicks (event_id, created_at);

CREATE OR REPLACE FUNCTION public.get_events_signals(p_event_ids UUID[])
RETURNS TABLE (
    event_id UUID,
    views_week INTEGER,
    ticket_clicks_day INTEGER,
    followers INTEGER,
    venue_name TEXT,
    is_new BOOLEAN,
    popular_city TEXT,
    fills_up BOOLEAN,
    last_tickets BOOLEAN,
    featured BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    WITH ids AS (
        -- Como mucho 200 por llamada: es lo que pide una pantalla.
        SELECT DISTINCT x AS id FROM unnest(p_event_ids[1:200]) AS x
    ),
    ev AS (
        SELECT e.id, e.created_at, e.featured_until, e.venue_id,
               lower(COALESCE(e.place_name, '') || ' | ' || COALESCE(e.name, '')) AS texto
          FROM public.events e
          JOIN ids ON ids.id = e.id
    ),
    vistas AS (
        SELECT (a.props->>'eventId')::uuid AS id, COUNT(*)::int AS n
          FROM public.analytics_events a
         WHERE a.name = 'event_viewed'
           AND a.created_at > NOW() - INTERVAL '7 days'
           AND a.props->>'eventId' IN (SELECT id::text FROM ids)
         GROUP BY 1
    ),
    clics AS (
        SELECT b.event_id AS id, COUNT(DISTINCT COALESCE(b.profile_id::text, b.id::text))::int AS n
          FROM public.booking_clicks b
         WHERE b.event_id IN (SELECT id FROM ids)
           AND b.created_at > NOW() - INTERVAL '24 hours'
         GROUP BY 1
    ),
    aforo AS (
        -- Entradas que vende la app: capacidad y vendidas de los tipos activos.
        SELECT tt.event_id AS id,
               SUM(tt.capacity)::int AS capacidad,
               (SELECT COUNT(*) FROM public.tickets t
                 WHERE t.event_id = tt.event_id AND t.status IN ('valid', 'used'))::int AS vendidas
          FROM public.ticket_types tt
         WHERE tt.event_id IN (SELECT id FROM ids)
           AND tt.active AND tt.deleted_at IS NULL AND tt.capacity IS NOT NULL
         GROUP BY tt.event_id
    )
    SELECT
        ev.id,
        COALESCE(vistas.n, 0),
        COALESCE(clics.n, 0),
        CASE WHEN v.is_platform THEN 0
             ELSE (SELECT COUNT(*)::int FROM public.venue_followers f WHERE f.venue_id = ev.venue_id) END,
        CASE WHEN v.is_platform THEN NULL ELSE v.name END,
        COALESCE(ev.created_at > NOW() - INTERVAL '7 days', FALSE),
        pp.city_label,
        COALESCE(pp.fills_up, FALSE),
        COALESCE(aforo.capacidad > 0
                 AND aforo.vendidas < aforo.capacidad
                 AND aforo.capacidad - aforo.vendidas <= GREATEST(1, CEIL(aforo.capacidad * 0.15)), FALSE),
        COALESCE(ev.featured_until > NOW(), FALSE)
      FROM ev
      LEFT JOIN public.venues v ON v.id = ev.venue_id
      LEFT JOIN vistas ON vistas.id = ev.id
      LEFT JOIN clics ON clics.id = ev.id
      LEFT JOIN aforo ON aforo.id = ev.id
      LEFT JOIN LATERAL (
          SELECT p.city_label, p.fills_up
            FROM public.popular_places p
           WHERE ev.texto ~ p.pattern
           ORDER BY p.id
           LIMIT 1
      ) pp ON TRUE;
$$;

-- La ficha y el listado también se ven sin cuenta (enlace compartido).
REVOKE ALL ON FUNCTION public.get_events_signals(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_events_signals(UUID[]) TO anon, authenticated, service_role;
