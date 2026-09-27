-- 090: compras de Google Play (Google Play Billing) en la app de Android.
--
-- Google exige que el contenido digital (Premium y supercrush) de una app
-- descargada de Google Play se venda con su sistema de cobro. Las entradas de
-- las fiestas (servicios que se disfrutan fuera de la app) siguen con Stripe,
-- igual que en el iPhone.
--
--   · La app compra con Google Play Billing y manda el `purchaseToken` a la
--     Edge Function `google-play`, que lo comprueba con la API de Google Play
--     (Google Play Developer API) y activa lo comprado con las mismas tablas
--     que Stripe y Apple.
--   · Renovaciones, cancelaciones y devoluciones llegan a
--     `google-play-notifications` (Real-time developer notifications, por
--     Pub/Sub).
--   · `google_purchases` guarda cada compra una sola vez: repetirla no suma.

ALTER TABLE public.premium_subscriptions
    ADD COLUMN IF NOT EXISTS google_purchase_token TEXT;
CREATE INDEX IF NOT EXISTS idx_subs_google
    ON public.premium_subscriptions(google_purchase_token)
    WHERE google_purchase_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.google_purchases (
    purchase_token TEXT PRIMARY KEY,
    order_id TEXT,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    product_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('monthly', 'event', 'supercrush')),
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    test_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_time TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_google_purchases_profile ON public.google_purchases(profile_id);
CREATE INDEX IF NOT EXISTS idx_google_purchases_order ON public.google_purchases(order_id);
-- Sólo la escriben y la leen las Edge Functions (service_role).
ALTER TABLE public.google_purchases ENABLE ROW LEVEL SECURITY;

-- `store`: de dónde viene el Premium que cuenta ahora. Con Apple o Google,
-- cancelar se hace en la tienda, no con nuestro botón.
DROP FUNCTION IF EXISTS public.my_premium_status();
CREATE FUNCTION public.my_premium_status()
RETURNS TABLE(
    is_premium BOOLEAN, subscription_id UUID, subscription_type TEXT, event_id UUID,
    expires_at TIMESTAMPTZ, cancel_at_period_end BOOLEAN, active_event_id UUID, store TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID := public.current_profile_id();
    v_event UUID;
BEGIN
    IF v_profile IS NULL THEN
        RETURN;
    END IF;
    v_event := public.active_event_of(v_profile);

    RETURN QUERY
    SELECT
        public.is_premium_for_event(v_profile, v_event),
        s.id, s.subscription_type, s.event_id, s.expires_at,
        COALESCE(s.cancel_at_period_end, FALSE),
        v_event,
        CASE
            WHEN s.apple_original_transaction_id IS NOT NULL THEN 'apple'
            WHEN s.google_purchase_token IS NOT NULL THEN 'google'
            WHEN s.stripe_subscription_id IS NOT NULL OR s.stripe_customer_id IS NOT NULL THEN 'stripe'
            ELSE NULL
        END
    FROM (SELECT 1) AS uno
    LEFT JOIN LATERAL (
        SELECT ps.* FROM public.premium_subscriptions ps
        WHERE ps.user_id = v_profile
          AND ps.status = 'active'
          AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
          AND (ps.event_id IS NULL OR ps.event_id = v_event)
        ORDER BY (ps.event_id IS NULL) DESC, ps.started_at DESC
        LIMIT 1
    ) s ON TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.my_premium_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_premium_status() TO authenticated, service_role;
