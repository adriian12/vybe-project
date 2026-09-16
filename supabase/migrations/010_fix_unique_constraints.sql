-- ============================================================================
-- 010 — Restricciones únicas que faltaban en la base de datos real
--
-- Encontradas probando el flujo completo contra el proyecto en producción.
-- La migración 001 las declaraba, pero la base de datos se creó fuera de ella
-- y llegó con otra forma. `CREATE TABLE IF NOT EXISTS` no avisa de eso.
--
--   1. `connections` no tenía UNIQUE (user_id_1, user_id_2). El trigger
--      check_match() termina en `ON CONFLICT (user_id_1, user_id_2) DO NOTHING`
--      y PostgreSQL responde «there is no unique or exclusion constraint
--      matching the ON CONFLICT specification». El INSERT del segundo swipe
--      fallaba entero, así que **ningún match llegaba a crearse** y, sin
--      conexión, la policy de `messages` impedía también abrir el chat. Es el
--      camino central del producto.
--
--   2. `premium_subscriptions` tenía UNIQUE (user_id), heredada del modelo
--      antiguo de un único plan por persona. Con ella, comprar el pase de un
--      evento teniendo ya una suscripción mensual fallaba, y la restricción
--      que añadió la 008 sobre (user_id, event_id, subscription_type) no podía
--      cumplir su función.
-- ============================================================================

-- ============================================================================
-- 1. CONNECTIONS
-- ============================================================================

-- El trigger guarda siempre el par ordenado con LEAST/GREATEST. Cualquier fila
-- anterior que no siga ese orden se normaliza antes de crear la restricción.
UPDATE public.connections
SET user_id_1 = LEAST(user_id_1, user_id_2),
    user_id_2 = GREATEST(user_id_1, user_id_2)
WHERE user_id_1 > user_id_2;

-- Duplicados previos: se conserva la conexión más antigua, que es la que
-- refleja cuándo se conocieron de verdad.
DELETE FROM public.connections c
WHERE EXISTS (
    SELECT 1 FROM public.connections older
    WHERE older.user_id_1 = c.user_id_1
      AND older.user_id_2 = c.user_id_2
      AND (older.created_at < c.created_at
           OR (older.created_at = c.created_at AND older.id < c.id))
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'connections_pair_key'
    ) THEN
        ALTER TABLE public.connections
            ADD CONSTRAINT connections_pair_key UNIQUE (user_id_1, user_id_2);
    END IF;
END $$;

-- ============================================================================
-- 2. PREMIUM_SUBSCRIPTIONS
-- ============================================================================

DO $$
DECLARE
    old_constraint TEXT;
BEGIN
    -- El nombre lo puso quien creó la tabla, así que se busca por definición.
    SELECT conname INTO old_constraint
    FROM pg_constraint
    WHERE conrelid = 'public.premium_subscriptions'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (user_id)';

    IF old_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.premium_subscriptions DROP CONSTRAINT %I',
                       old_constraint);
    END IF;
END $$;

-- ============================================================================
-- 3. COMPROBACIÓN
--
-- Falla la migración si alguna de las dos no ha quedado como debe, para no dar
-- por buena una corrección que en realidad no se aplicó.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.connections'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (user_id_1, user_id_2)'
    ) THEN
        RAISE EXCEPTION 'connections sigue sin la restricción única del par';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.premium_subscriptions'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (user_id)'
    ) THEN
        RAISE EXCEPTION 'premium_subscriptions conserva UNIQUE (user_id)';
    END IF;
END $$;

COMMENT ON CONSTRAINT connections_pair_key ON public.connections IS
    'El par siempre se guarda ordenado (LEAST, GREATEST). Es lo que permite el ON CONFLICT de check_match().';
