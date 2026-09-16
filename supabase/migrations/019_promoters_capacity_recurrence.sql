-- ============================================================================
-- 019 — Herramientas de local: atribución de RRPP, aforo en vivo, eventos
--       recurrentes y patrocinio
-- ============================================================================

-- ============================================================================
-- 1. ATRIBUCIÓN DE CÓDIGOS
--
-- Un local paga a sus relaciones públicas por cabeza y hoy no puede comprobar
-- nada: el RRPP dice que ha traído cuarenta y no hay forma de saberlo. Dando a
-- cada uno su propio código, cada check-in queda atribuido.
-- ============================================================================

ALTER TABLE public.event_codes
    ADD COLUMN IF NOT EXISTS label TEXT,
    ADD COLUMN IF NOT EXISTS promoter_name TEXT,
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS max_uses INTEGER,
    ADD COLUMN IF NOT EXISTS uses INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_codes_kind_check') THEN
        ALTER TABLE public.event_codes
            ADD CONSTRAINT event_codes_kind_check
            CHECK (kind IN ('general', 'promoter', 'guest_list', 'staff'));
    END IF;
END $$;

-- Qué código usó cada persona al entrar: es la atribución.
ALTER TABLE public.event_attendance
    ADD COLUMN IF NOT EXISTS code_id UUID REFERENCES public.event_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_code ON public.event_attendance(code_id)
    WHERE code_id IS NOT NULL;

-- ============================================================================
-- 2. AFORO, PATROCINIO Y RECURRENCIA
-- ============================================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS capacity_alert_ratio NUMERIC NOT NULL DEFAULT 0.9,
    -- Patrocinio: un nombre y un logotipo por evento. Es inventario que el
    -- local puede vender a una marca sin que Vybe tenga que intermediar.
    ADD COLUMN IF NOT EXISTS sponsor_name TEXT,
    ADD COLUMN IF NOT EXISTS sponsor_logo_url TEXT,
    ADD COLUMN IF NOT EXISTS sponsor_url TEXT,
    -- Recurrencia: hoy hay que crear cada jueves a mano y se olvidan de
    -- publicar. `weekly` genera la semana siguiente a partir de ésta.
    ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_recurrence_check') THEN
        ALTER TABLE public.events
            ADD CONSTRAINT events_recurrence_check
            CHECK (recurrence IN ('none', 'weekly', 'biweekly'));
    END IF;
END $$;

/**
 * Ocupación en vivo del evento.
 *
 * Contar el aforo con un clicker en la puerta es lo que hacen hoy, y es una
 * obligación legal. Aquí sale del propio check-in: `inside` son quienes han
 * dado señal en las últimas dos horas, que es lo que aproxima «está dentro»
 * sin exigirles que marquen la salida.
 */
CREATE OR REPLACE FUNCTION public.get_event_occupancy(p_event_id UUID)
RETURNS TABLE (
    inside BIGINT,
    total_check_ins BIGINT,
    capacity INTEGER,
    ratio NUMERIC,
    alert BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_capacity INTEGER;
    v_alert_ratio NUMERIC;
    v_inside BIGINT;
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT e.max_capacity, e.capacity_alert_ratio
    INTO v_capacity, v_alert_ratio
    FROM public.events e WHERE e.id = p_event_id;

    SELECT COUNT(*) INTO v_inside
    FROM public.event_attendance ea
    WHERE ea.event_id = p_event_id
      AND ea.last_seen_at > NOW() - INTERVAL '2 hours';

    RETURN QUERY SELECT
        v_inside,
        (SELECT COUNT(*) FROM public.event_attendance ea WHERE ea.event_id = p_event_id),
        v_capacity,
        CASE WHEN COALESCE(v_capacity, 0) > 0
             THEN ROUND(v_inside::NUMERIC / v_capacity, 3) END,
        CASE WHEN COALESCE(v_capacity, 0) > 0
             THEN v_inside::NUMERIC / v_capacity >= COALESCE(v_alert_ratio, 0.9)
             ELSE FALSE END;
END;
$$;

/** Rendimiento de cada código: cuánta gente entró con él y cuántos matches salieron. */
CREATE OR REPLACE FUNCTION public.get_code_attribution(p_event_id UUID)
RETURNS TABLE (
    code_id UUID,
    code TEXT,
    label TEXT,
    promoter_name TEXT,
    kind TEXT,
    check_ins BIGINT,
    still_inside BIGINT,
    matches BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.can_read_event_metrics(p_event_id) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT
        ec.id, ec.code, ec.label, ec.promoter_name, ec.kind,
        COUNT(ea.id),
        COUNT(ea.id) FILTER (WHERE ea.last_seen_at > NOW() - INTERVAL '2 hours'),
        (SELECT COUNT(*) FROM public.connections c
          WHERE c.event_id = p_event_id
            AND (c.user_id_1 IN (SELECT a.profile_id FROM public.event_attendance a WHERE a.code_id = ec.id)
              OR c.user_id_2 IN (SELECT a.profile_id FROM public.event_attendance a WHERE a.code_id = ec.id)))
    FROM public.event_codes ec
    LEFT JOIN public.event_attendance ea ON ea.code_id = ec.id
    WHERE ec.event_id = p_event_id
    GROUP BY ec.id, ec.code, ec.label, ec.promoter_name, ec.kind
    ORDER BY COUNT(ea.id) DESC;
END;
$$;

-- `create_labeled_code()` se define aquí y la 021 la reemplaza para añadirle la
-- comprobación del plan. La versión vigente es la de la 021.
CREATE OR REPLACE FUNCTION public.create_labeled_code(
    p_event_id UUID,
    p_kind TEXT,
    p_label TEXT,
    p_promoter_name TEXT DEFAULT NULL,
    p_max_uses INTEGER DEFAULT NULL
)
RETURNS TABLE (id UUID, code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_venue_id UUID;
    v_end TIMESTAMPTZ;
    v_code TEXT;
    v_id UUID;
BEGIN
    SELECT e.venue_id, e.end_date INTO v_venue_id, v_end
    FROM public.events e WHERE e.id = p_event_id;

    IF v_venue_id IS NULL OR v_venue_id IS DISTINCT FROM public.current_venue_id() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    IF p_kind NOT IN ('promoter', 'guest_list', 'staff') THEN
        RAISE EXCEPTION 'INVALID_KIND';
    END IF;

    -- Se reintenta ante colisión: `code` es único en toda la tabla.
    FOR i IN 1..10 LOOP
        v_code := upper(substring(md5(random()::text) FROM 1 FOR 6));
        BEGIN
            INSERT INTO public.event_codes (
                venue_id, event_id, code, expires_at, active, kind, label,
                promoter_name, max_uses
            )
            VALUES (v_venue_id, p_event_id, v_code, v_end, TRUE, p_kind, p_label,
                    p_promoter_name, p_max_uses)
            RETURNING event_codes.id INTO v_id;

            RETURN QUERY SELECT v_id, v_code;
            RETURN;
        EXCEPTION WHEN unique_violation THEN
            CONTINUE;
        END;
    END LOOP;

    RAISE EXCEPTION 'CODE_GENERATION_FAILED';
END;
$$;

-- ============================================================================
-- 3. CANJEO CON ATRIBUCIÓN Y LÍMITE DE USOS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.redeem_event_code(
    p_code TEXT,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
    event_id UUID,
    event_name TEXT,
    venue_id UUID,
    venue_name TEXT,
    venue_type TEXT,
    event_radius INTEGER,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_id UUID;
    v_code RECORD;
    v_event RECORD;
    v_venue RECORD;
    v_distance DOUBLE PRECISION;
BEGIN
    v_profile_id := public.current_profile_id();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_code
    FROM public.event_codes ec
    WHERE upper(ec.code) = upper(btrim(p_code))
      AND ec.active = TRUE
      AND ec.expires_at > NOW()
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_CODE';
    END IF;

    -- Las listas cerradas tienen aforo propio: cuando se agota, se agota.
    IF v_code.max_uses IS NOT NULL AND v_code.uses >= v_code.max_uses THEN
        RAISE EXCEPTION 'CODE_EXHAUSTED';
    END IF;

    SELECT * INTO v_venue FROM public.venues WHERE id = v_code.venue_id;
    IF NOT FOUND OR v_venue.is_verified = FALSE THEN
        RAISE EXCEPTION 'VENUE_NOT_VERIFIED';
    END IF;

    IF v_code.event_id IS NOT NULL THEN
        SELECT * INTO v_event FROM public.events WHERE id = v_code.event_id;
    ELSE
        SELECT * INTO v_event
        FROM public.events e
        WHERE e.venue_id = v_code.venue_id AND e.end_date > NOW()
        ORDER BY e.start_date ASC
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_EVENT';
    END IF;

    IF v_event.end_date <= NOW() THEN
        RAISE EXCEPTION 'EVENT_ENDED';
    END IF;

    v_distance := NULL;
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        IF v_event.latitude IS NOT NULL AND v_event.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_event.latitude, v_event.longitude);
        ELSIF v_venue.latitude IS NOT NULL AND v_venue.longitude IS NOT NULL THEN
            v_distance := public.get_distance(p_latitude, p_longitude, v_venue.latitude, v_venue.longitude);
        END IF;

        IF v_distance IS NOT NULL AND v_distance > COALESCE(v_venue.event_radius, 50) THEN
            RAISE EXCEPTION 'TOO_FAR';
        END IF;
    END IF;

    INSERT INTO public.event_attendance AS ea (
        event_id, profile_id, latitude, longitude, code_id
    )
    VALUES (v_event.id, v_profile_id, p_latitude, p_longitude, v_code.id)
    ON CONFLICT (event_id, profile_id) DO UPDATE
        SET last_seen_at = NOW(),
            latitude = COALESCE(EXCLUDED.latitude, ea.latitude),
            longitude = COALESCE(EXCLUDED.longitude, ea.longitude),
            -- La atribución es del primer código con el que entró: si vuelve a
            -- canjear otro, el RRPP que lo trajo no cambia.
            code_id = COALESCE(ea.code_id, EXCLUDED.code_id);

    -- El contador sólo sube en el primer canje de esta persona con este código.
    UPDATE public.event_codes
    SET uses = uses + 1
    WHERE id = v_code.id
      AND EXISTS (
          SELECT 1 FROM public.event_attendance a
          WHERE a.event_id = v_event.id AND a.profile_id = v_profile_id
            AND a.code_id = v_code.id AND a.checked_in_at > NOW() - INTERVAL '5 seconds'
      );

    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
        UPDATE public.profiles
        SET latitude = p_latitude, longitude = p_longitude
        WHERE id = v_profile_id;
    END IF;

    RETURN QUERY SELECT
        v_event.id, v_event.name, v_venue.id, v_venue.name, v_venue.type,
        COALESCE(v_venue.event_radius, 50),
        v_event.start_date, v_event.end_date, v_distance;
END;
$$;

-- ============================================================================
-- 4. EVENTOS RECURRENTES
-- ============================================================================

/**
 * Duplica los eventos recurrentes que ya han terminado hacia la semana
 * siguiente. Pensada para pg_cron una vez al día.
 */
CREATE OR REPLACE FUNCTION public.generate_recurring_events()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_created INTEGER := 0;
    v_source RECORD;
    v_step INTERVAL;
BEGIN
    FOR v_source IN
        SELECT * FROM public.events e
        WHERE e.recurrence <> 'none'
          AND e.end_date < NOW()
          -- Sólo la última de la serie, para no duplicar toda la historia.
          AND NOT EXISTS (
              SELECT 1 FROM public.events later
              WHERE COALESCE(later.recurrence_parent_id, later.id) = COALESCE(e.recurrence_parent_id, e.id)
                AND later.start_date > e.start_date
          )
    LOOP
        v_step := CASE v_source.recurrence WHEN 'biweekly' THEN INTERVAL '14 days'
                                           ELSE INTERVAL '7 days' END;

        INSERT INTO public.events (
            venue_id, name, description, start_date, end_date, latitude, longitude,
            theme, dress_code, min_age, max_age, price, booking_url, max_capacity,
            capacity_alert_ratio, sponsor_name, sponsor_logo_url, sponsor_url,
            recurrence, recurrence_parent_id, ticket_provider, tickets_available
        )
        VALUES (
            v_source.venue_id, v_source.name, v_source.description,
            v_source.start_date + v_step, v_source.end_date + v_step,
            v_source.latitude, v_source.longitude, v_source.theme, v_source.dress_code,
            v_source.min_age, v_source.max_age, v_source.price, v_source.booking_url,
            v_source.max_capacity, v_source.capacity_alert_ratio,
            v_source.sponsor_name, v_source.sponsor_logo_url, v_source.sponsor_url,
            v_source.recurrence, COALESCE(v_source.recurrence_parent_id, v_source.id),
            v_source.ticket_provider, v_source.tickets_available
        );

        v_created := v_created + 1;
    END LOOP;

    RETURN v_created;
END;
$$;

-- ============================================================================
-- 5. PERMISOS
-- ============================================================================

DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace
          AND p.proname IN (
              'get_event_occupancy', 'get_code_attribution', 'create_labeled_code',
              'redeem_event_code'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.generate_recurring_events() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.event_attendance.code_id IS
    'Código con el que entró. Es lo que permite pagar a cada RRPP por la gente que trae de verdad.';
COMMENT ON FUNCTION public.get_event_occupancy IS
    'Aforo en vivo. `inside` son los check-ins con señal en las últimas dos horas.';
