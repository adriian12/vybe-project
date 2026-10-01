-- ============================================================================
-- 013 — Claves foráneas que faltaban entre las tablas del modelo
--
-- Encontrado al regenerar los tipos: el compilador avisó de que PostgREST no
-- sabe relacionar `connections` con `profiles`.
--
--     src/services/api.ts(343,31): Conversion of type
--     'SelectQueryError<"could not find the relation between connections and
--     profiles">'
--
-- `api.getMatches()` pide el embed `profiles!connections_user_id_1_fkey(*)`, y
-- PostgREST resuelve esos embeds a partir de las claves foráneas reales. Sin
-- ellas la consulta falla entera y la pantalla de conexiones sale vacía, aunque
-- el match exista. Lo mismo afecta a cualquier embed sobre `messages`.
--
-- Faltaban seis, todas del modelo heredado:
--
--     connections.user_id_1        → profiles.id
--     connections.user_id_2        → profiles.id
--     messages.sender_id           → profiles.id
--     messages.receiver_id         → profiles.id
--     event_codes.venue_id         → venues.id
--     premium_subscriptions.user_id → profiles.id
--
-- Los nombres importan: son los que aparecen literalmente en las consultas.
-- ============================================================================

-- ============================================================================
-- 1. FILAS HUÉRFANAS
--
-- Sin perfil al otro lado no hay nada que mostrar: son conversaciones y
-- conexiones de cuentas que ya no existen, restos de cuando `profiles` estaba
-- vacía y las cuentas vivían en la tabla `users`. Hay que retirarlas antes de
-- crear las restricciones, porque si no PostgreSQL las rechaza.
-- ============================================================================

DELETE FROM public.messages m
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.sender_id)
   OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.receiver_id);

DELETE FROM public.connections c
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.user_id_1)
   OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.user_id_2);

DELETE FROM public.event_codes ec
WHERE NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = ec.venue_id);

DELETE FROM public.premium_subscriptions ps
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ps.user_id);

-- ============================================================================
-- 2. RESTRICCIONES
-- ============================================================================

DO $$
DECLARE
    fk RECORD;
BEGIN
    FOR fk IN
        SELECT * FROM (VALUES
            ('connections', 'user_id_1', 'profiles', 'connections_user_id_1_fkey'),
            ('connections', 'user_id_2', 'profiles', 'connections_user_id_2_fkey'),
            ('messages', 'sender_id', 'profiles', 'messages_sender_id_fkey'),
            ('messages', 'receiver_id', 'profiles', 'messages_receiver_id_fkey'),
            ('event_codes', 'venue_id', 'venues', 'event_codes_venue_id_fkey'),
            ('premium_subscriptions', 'user_id', 'profiles', 'premium_subscriptions_user_id_fkey')
        ) AS t(tabla, columna, destino, nombre)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.nombre) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE CASCADE',
                fk.tabla, fk.nombre, fk.columna, fk.destino
            );
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- 3. PLAN_TYPE CON VALOR POR DEFECTO
--
-- La 008 la mantiene sincronizada con `subscription_type` mediante un trigger,
-- pero al ser NOT NULL sin DEFAULT los tipos generados la marcaban obligatoria
-- y el upsert de `api.createSubscription()` no compilaba.
-- ============================================================================

ALTER TABLE public.premium_subscriptions
    ALTER COLUMN plan_type SET DEFAULT 'premium';

-- ============================================================================
-- 4. COMPROBACIÓN
-- ============================================================================

DO $$
DECLARE
    faltan TEXT;
BEGIN
    SELECT string_agg(nombre, ', ')
    INTO faltan
    FROM (VALUES
        ('connections_user_id_1_fkey'), ('connections_user_id_2_fkey'),
        ('messages_sender_id_fkey'), ('messages_receiver_id_fkey'),
        ('event_codes_venue_id_fkey'), ('premium_subscriptions_user_id_fkey')
    ) AS t(nombre)
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t.nombre);

    IF faltan IS NOT NULL THEN
        RAISE EXCEPTION 'Siguen faltando claves foráneas: %', faltan;
    END IF;
END $$;
