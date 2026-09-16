-- ============================================================================
-- 008 — Reconciliación con los datos que ya había en la base de datos
--
-- El proyecto arrastraba dos modelos de datos en paralelo: el de las
-- migraciones (`profiles`, `venues`, `events`…) y otro creado fuera de ellas
-- (`users`, `venue_profiles`, `venue_events`…), probablemente heredado de
-- Lovable. Las cuentas reales vivían sólo en el segundo, así que `profiles`
-- estaba vacía y nadie podía iniciar sesión: el trigger de alta automática que
-- instala la 006 sólo se dispara en registros nuevos.
--
-- Esta migración:
--   1. Normaliza `premium_subscriptions` con las columnas que espera el cliente.
--   2. Crea perfil o local para cada cuenta de `auth.users` que no lo tenga,
--      leyendo el rol de la tabla heredada `users`.
--   3. Limpia los códigos de evento huérfanos y las suscripciones sin dueño.
--   4. Reintenta la migración de asistencias que la 006 no pudo hacer porque
--      todavía no existían los perfiles.
--
-- No borra ninguna tabla heredada: se quedan como están, con RLS activado y sin
-- permisos para `anon`. Qué hacer con ellas es una decisión de producto.
-- ============================================================================

-- ============================================================================
-- 1. PREMIUM_SUBSCRIPTIONS
--
-- La tabla real tenía `plan_type` y ninguna referencia al evento, mientras que
-- el cliente hace upsert sobre (user_id, event_id, subscription_type). Sin la
-- restricción única, `onConflict` falla y cada compra crearía una fila nueva.
-- ============================================================================

ALTER TABLE public.premium_subscriptions
    ADD COLUMN IF NOT EXISTS subscription_type TEXT,
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

UPDATE public.premium_subscriptions
SET subscription_type = plan_type
WHERE subscription_type IS NULL;

ALTER TABLE public.premium_subscriptions
    ALTER COLUMN subscription_type SET DEFAULT 'premium';

UPDATE public.premium_subscriptions
SET subscription_type = 'premium'
WHERE subscription_type IS NULL;

ALTER TABLE public.premium_subscriptions
    ALTER COLUMN subscription_type SET NOT NULL;

-- `plan_type` es NOT NULL y sigue existiendo: se mantiene sincronizada para no
-- romper nada que aún la lea.
CREATE OR REPLACE FUNCTION public.sync_subscription_plan_type()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
    IF NEW.subscription_type IS NULL THEN
        NEW.subscription_type := COALESCE(NEW.plan_type, 'premium');
    END IF;
    NEW.plan_type := NEW.subscription_type;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_subscription_plan_type_trigger ON public.premium_subscriptions;
CREATE TRIGGER sync_subscription_plan_type_trigger
    BEFORE INSERT OR UPDATE ON public.premium_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_plan_type();

-- Suscripciones sin perfil: quedaron huérfanas al vaciarse `profiles`.
DELETE FROM public.premium_subscriptions ps
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ps.user_id);

-- NULLS NOT DISTINCT (PostgreSQL 15+) para que las suscripciones globales, que
-- no llevan evento, también choquen entre sí en lugar de duplicarse.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'premium_subscriptions_user_event_type_key'
    ) THEN
        ALTER TABLE public.premium_subscriptions
            ADD CONSTRAINT premium_subscriptions_user_event_type_key
            UNIQUE NULLS NOT DISTINCT (user_id, event_id, subscription_type);
    END IF;
END $$;

-- ============================================================================
-- 2. ALTA DE LAS CUENTAS QUE YA EXISTÍAN
-- ============================================================================

-- Locales: los datos buenos están en la tabla heredada `venue_profiles`.
-- `venues` no tiene dirección ni aforo: de `venue_profiles` sólo se puede
-- recuperar el nombre, el tipo y el teléfono.
INSERT INTO public.venues (
    venue_id, name, email, type, phone, is_verified, verification_status
)
SELECT
    u.id,
    COALESCE(vp.venue_name, u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
    u.email,
    CASE COALESCE(vp.venue_type, 'local')
        WHEN 'nightclub' THEN 'discoteca'
        WHEN 'bar' THEN 'bar'
        WHEN 'festival' THEN 'festival'
        ELSE 'local'
    END,
    vp.venue_phone,
    FALSE,
    'pending'
FROM auth.users u
LEFT JOIN public.venue_profiles vp ON vp.id = u.id
WHERE (SELECT lu.role FROM public.users lu WHERE lu.id = u.id) = 'venue'
  AND NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.venue_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);

-- Usuarios: el resto de cuentas.
INSERT INTO public.profiles (user_id, name, email, age, role)
SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
    u.email,
    GREATEST(18, COALESCE((u.raw_user_meta_data->>'age')::INTEGER, 18)),
    CASE WHEN (SELECT lu.role FROM public.users lu WHERE lu.id = u.id) = 'admin'
         THEN 'admin' ELSE 'user' END
FROM auth.users u
WHERE COALESCE((SELECT lu.role FROM public.users lu WHERE lu.id = u.id), 'user') <> 'venue'
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.venue_id = u.id);

-- El equipo del local: la 007 sólo pudo darlo de alta para los locales que ya
-- existían, y entonces no había ninguno.
INSERT INTO public.venue_members (venue_id, user_id, email, role)
SELECT v.id, v.venue_id, v.email, 'owner'
FROM public.venues v
ON CONFLICT (venue_id, user_id) DO NOTHING;

-- ============================================================================
-- 3. LIMPIEZA DE RESTOS
-- ============================================================================

-- Códigos de acceso de locales que ya no existen: nunca podrían canjearse.
DELETE FROM public.event_codes ec
WHERE NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = ec.venue_id);

-- ============================================================================
-- 4. ASISTENCIAS HEREDADAS
--
-- La 006 renombró la tabla antigua y trató de migrar sus filas, pero el join
-- contra `profiles` no encontraba nada porque la tabla estaba vacía. Ahora sí.
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('public.event_attendance_legacy') IS NOT NULL THEN
        INSERT INTO public.event_attendance (event_id, profile_id, checked_in_at, last_seen_at)
        SELECT l.event_id, p.id,
               COALESCE(l.verified_at, l.created_at, NOW()),
               COALESCE(l.verified_at, l.created_at, NOW())
        FROM public.event_attendance_legacy l
        JOIN public.profiles p ON p.user_id = l.user_id
        WHERE EXISTS (SELECT 1 FROM public.events e WHERE e.id = l.event_id)
        ON CONFLICT (event_id, profile_id) DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- 5. COMENTARIOS
-- ============================================================================

COMMENT ON COLUMN public.premium_subscriptions.subscription_type IS
    'Tipo de suscripción que usa el cliente. `plan_type` se mantiene sincronizada por trigger para no romper el modelo heredado.';
COMMENT ON COLUMN public.premium_subscriptions.event_id IS
    'Evento al que se limita la suscripción. NULL para las globales.';
