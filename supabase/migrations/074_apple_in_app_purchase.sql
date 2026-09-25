-- 074: compras integradas de Apple (In-App Purchase) en la app de iOS.
--
-- Apple exige que el contenido digital (Premium y supercrush) se venda en iOS
-- con su compra integrada. Android y la web siguen con Stripe.
--
--   · La app compra con StoreKit 2 y manda la transacción firmada (JWS) a la
--     Edge Function `apple-iap`, que verifica la firma de Apple y activa lo
--     comprado con las mismas tablas que Stripe.
--   · Las renovaciones, cancelaciones y devoluciones llegan a
--     `apple-notifications` (App Store Server Notifications V2).
--   · `apple_transactions` guarda cada transacción una sola vez: si la app o
--     Apple la mandan dos veces, no se suma dos veces.

ALTER TABLE public.premium_subscriptions
    ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT;
CREATE INDEX IF NOT EXISTS idx_subs_apple
    ON public.premium_subscriptions(apple_original_transaction_id)
    WHERE apple_original_transaction_id IS NOT NULL;

-- Devolución de supercrush comprados en Apple.
ALTER TABLE public.supercrush_ledger DROP CONSTRAINT IF EXISTS supercrush_ledger_reason_check;
ALTER TABLE public.supercrush_ledger
    ADD CONSTRAINT supercrush_ledger_reason_check
    CHECK (reason IN ('welcome', 'purchase', 'spent', 'included', 'admin', 'refund'));

CREATE TABLE IF NOT EXISTS public.apple_transactions (
    transaction_id TEXT PRIMARY KEY,
    original_transaction_id TEXT NOT NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    product_id TEXT NOT NULL,
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_cents INTEGER,
    currency TEXT,
    environment TEXT NOT NULL,
    purchase_date TIMESTAMPTZ NOT NULL,
    expires_date TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apple_tx_original ON public.apple_transactions(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_apple_tx_profile ON public.apple_transactions(profile_id);
-- Sólo la escriben y la leen las Edge Functions (service_role).
ALTER TABLE public.apple_transactions ENABLE ROW LEVEL SECURITY;

-- `store`: de dónde viene el Premium que cuenta ahora. Con Apple, cancelar se
-- hace en los ajustes del iPhone, no con nuestro botón.
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
            WHEN s.stripe_subscription_id IS NOT NULL OR s.stripe_customer_id IS NOT NULL THEN 'stripe'
            ELSE NULL
        END
    FROM (SELECT 1) AS uno
    LEFT JOIN LATERAL (
        -- La que cuenta ahora: primero la mensual o de por vida; si no, la de
        -- este evento.
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
