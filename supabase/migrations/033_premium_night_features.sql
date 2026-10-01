-- ============================================================================
-- 033. Premium: lo que sólo tiene sentido en una noche
-- ============================================================================
-- Lo que Premium ofrecía era la escalera de cualquier app de citas y no tocaba
-- lo único que hace distinta a esta: que las dos personas están en el mismo
-- sitio, esta noche, y mañana ya no. Estas cuatro sí:
--
--   1. Rescatar la conexión. Caduca a las 24 h salvo que la guarden LOS DOS, y
--      si la otra persona no abre la app el lunes se pierde igual. Con Premium
--      basta con que la guardes tú.
--   2. Ver quién va antes de ir. Hasta ahora sólo había un número.
--   3. Segunda oportunidad: recuperar a quien descartaste esta noche.
--   4. Destacar una hora dentro del evento.
--
-- La ordenación del tablón por impulso está en la migración 034.
-- ============================================================================

-- ============================================================================
-- 1. RESCATAR LA CONEXIÓN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.keep_connection(p_connection_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_conn RECORD;
    v_premium BOOLEAN;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    SELECT * INTO v_conn FROM public.connections WHERE id = p_connection_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CONNECTION_NOT_FOUND';
    END IF;

    IF v_conn.user_id_1 = v_profile_id THEN
        UPDATE public.connections SET kept_by_1 = TRUE WHERE id = p_connection_id;
    ELSIF v_conn.user_id_2 = v_profile_id THEN
        UPDATE public.connections SET kept_by_2 = TRUE WHERE id = p_connection_id;
    ELSE
        RAISE EXCEPTION 'NOT_A_MEMBER';
    END IF;

    v_premium := public.is_premium(v_profile_id);

    UPDATE public.connections
    SET expires_at = NULL
    WHERE id = p_connection_id
      AND (v_premium OR (kept_by_1 AND kept_by_2));

    RETURN EXISTS (
        SELECT 1 FROM public.connections
        WHERE id = p_connection_id AND expires_at IS NULL
    );
END;
$$;

-- ============================================================================
-- 2. QUIÉN VA AL EVENTO
-- ============================================================================

/**
 * Devuelve **sólo el nombre y la foto**: es para decidir si merece la pena
 * arreglarse, no para husmear perfiles desde el sofá.
 *
 * Quién no sale:
 *   · quien tiene el modo invisible **y** Premium, que es cuando el modo
 *     invisible surte efecto;
 *   · quien no quiere ver tu género o cuyo género tú no quieres ver;
 *   · quien está bloqueado, sin verificar o suspendido.
 */
CREATE OR REPLACE FUNCTION public.get_event_attendees_preview(p_event_id UUID)
RETURNS TABLE (id UUID, name TEXT, avatar TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_my_gender TEXT;
    v_my_wants TEXT;
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    SELECT pr.gender, pr.wants INTO v_my_gender, v_my_wants
    FROM public.profiles pr WHERE pr.id = v_profile_id;

    RETURN QUERY
    SELECT p.id, p.name, COALESCE(p.avatar, p.photos[1])
    FROM public.event_intents i
    JOIN public.profiles p ON p.id = i.profile_id
    WHERE i.event_id = p_event_id
      AND p.id <> v_profile_id
      AND p.status = 'active'
      AND p.is_verified = TRUE
      AND (p.suspended_until IS NULL OR p.suspended_until < NOW())
      AND NOT (p.is_invisible AND public.is_premium(p.id))
      AND public.wants_gender(v_my_wants, p.gender)
      AND public.wants_gender(p.wants, v_my_gender)
      AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.blocker_id = v_profile_id AND b.blocked_id = p.id)
             OR (b.blocker_id = p.id AND b.blocked_id = v_profile_id)
      )
    ORDER BY i.created_at DESC
    LIMIT 50;
END;
$$;

-- ============================================================================
-- 3. SEGUNDA OPORTUNIDAD
-- ============================================================================

/**
 * A quién descartaste en este evento.
 *
 * En una sala llena se desliza deprisa y con una mano; descartar sin querer a
 * alguien que está a diez metros es lo más frustrante que tiene la aplicación.
 */
CREATE OR REPLACE FUNCTION public.get_passed_profiles(p_event_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    age INTEGER,
    avatar TEXT,
    photos TEXT[],
    passed_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.age,
        -- La foto de esta noche manda sobre la del perfil, igual que en el
        -- tablón: es como se la reconoce dentro del local.
        COALESCE(ea.photo_url, p.avatar, p.photos[1]),
        CASE WHEN ea.photo_url IS NOT NULL THEN ARRAY[ea.photo_url] ELSE p.photos END,
        s.created_at
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.swiped_id
    LEFT JOIN public.event_attendance ea
           ON ea.profile_id = p.id AND ea.event_id = p_event_id
    WHERE s.swiper_id = v_profile_id
      AND s.event_id = p_event_id
      AND s.swipe_type = 'dislike'
      AND p.status = 'active'
      AND p.is_verified = TRUE
      AND (p.suspended_until IS NULL OR p.suspended_until < NOW())
      AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.blocker_id = v_profile_id AND b.blocked_id = p.id)
             OR (b.blocker_id = p.id AND b.blocked_id = v_profile_id)
      )
    ORDER BY s.created_at DESC
    LIMIT 30;
END;
$$;

/**
 * Devuelve a alguien al tablón borrando el descarte. No avisa a nadie: quien
 * fue descartado no tiene por qué enterarse.
 */
CREATE OR REPLACE FUNCTION public.undo_pass(p_profile_id UUID, p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_borrados INTEGER;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    DELETE FROM public.swipes
    WHERE swiper_id = v_profile_id
      AND swiped_id = p_profile_id
      AND event_id = p_event_id
      AND swipe_type = 'dislike';

    GET DIAGNOSTICS v_borrados = ROW_COUNT;
    RETURN v_borrados > 0;
END;
$$;

-- ============================================================================
-- 4. DESTACAR UNA HORA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profile_boosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    -- Uno por persona y evento: la gracia es que sea escaso. Si se pudieran
    -- encadenar, destacar dejaría de significar nada.
    UNIQUE (profile_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_boosts_activos
    ON public.profile_boosts(event_id, expires_at);

ALTER TABLE public.profile_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada cual ve sus impulsos" ON public.profile_boosts;
CREATE POLICY "Cada cual ve sus impulsos"
    ON public.profile_boosts FOR SELECT TO authenticated
    USING (profile_id = public.current_profile_id());

/**
 * Pone tu tarjeta la primera durante una hora.
 *
 * Acotado al evento a propósito: una fiesta dura cinco horas, así que una hora
 * de ventaja se nota. Un «destacar» de una app infinita no significa nada.
 */
CREATE OR REPLACE FUNCTION public.start_boost(p_event_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_expira TIMESTAMPTZ;
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF NOT public.is_premium(v_profile_id) THEN
        RAISE EXCEPTION 'PREMIUM_REQUIRED';
    END IF;

    -- Destacar sin estar dentro no tendría sentido: el tablón es de quien ha
    -- entrado.
    IF NOT EXISTS (
        SELECT 1 FROM public.event_attendance ea
        WHERE ea.event_id = p_event_id AND ea.profile_id = v_profile_id
    ) THEN
        RAISE EXCEPTION 'NOT_AT_EVENT';
    END IF;

    SELECT expires_at INTO v_expira
    FROM public.profile_boosts
    WHERE profile_id = v_profile_id AND event_id = p_event_id;

    IF FOUND THEN
        -- Ya lo usó en este evento: si sigue vivo se devuelve, y si se agotó no
        -- se recarga.
        IF v_expira > NOW() THEN
            RETURN v_expira;
        END IF;
        RAISE EXCEPTION 'BOOST_ALREADY_USED';
    END IF;

    v_expira := NOW() + INTERVAL '1 hour';

    INSERT INTO public.profile_boosts (profile_id, event_id, expires_at)
    VALUES (v_profile_id, p_event_id, v_expira);

    RETURN v_expira;
END;
$$;

/** Cuándo termina mi impulso en este evento, o NULL si no hay ninguno vivo. */
CREATE OR REPLACE FUNCTION public.my_boost(p_event_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT b.expires_at
    FROM public.profile_boosts b
    WHERE b.profile_id = public.current_profile_id()
      AND b.event_id = p_event_id
      AND b.expires_at > NOW();
$$;

-- ============================================================================
-- 5. PERMISOS
-- ============================================================================

REVOKE ALL ON FUNCTION public.get_event_attendees_preview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_attendees_preview(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_passed_profiles(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_passed_profiles(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_pass(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_pass(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.start_boost(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_boost(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.my_boost(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_boost(UUID) TO authenticated;

COMMENT ON FUNCTION public.keep_connection IS
    'Guarda una conexión. Con Premium basta con que lo haga una de las dos personas.';
COMMENT ON FUNCTION public.get_event_attendees_preview IS
    'Quién va al evento: sólo nombre y foto, y sin quien tenga el modo invisible activo con Premium.';
COMMENT ON TABLE public.profile_boosts IS
    'Una hora destacando en el tablón. Uno por persona y evento.';
