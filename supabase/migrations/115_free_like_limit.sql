-- 115: sin Premium, 5 me gusta por fiesta.
--
-- Para que no se dé like a todo el tablón sin mirar y para que Premium valga
-- algo más. Cuenta sólo el «me gusta» normal: el supercrush ya se paga (o es
-- el de regalo de la fiesta) y descartar es gratis.
--
-- La cuenta va en una tabla aparte y no se saca de `swipes`: al salir de la
-- fiesta se borran los likes que no llegaron a match (migración 048), y con
-- ellos se reiniciaría el contador al volver a entrar.

CREATE TABLE IF NOT EXISTS public.event_like_usage (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    likes INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (profile_id, event_id)
);

-- Sólo la escriben y leen las funciones de abajo.
ALTER TABLE public.event_like_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_like_usage FROM anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.event_like_usage;
CREATE TRIGGER a_api_rate_guard BEFORE INSERT OR UPDATE OR DELETE ON public.event_like_usage
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- Cuántos me gusta da la cuenta gratuita en cada fiesta.
CREATE OR REPLACE FUNCTION public.free_likes_per_event()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 5 $$;

/** Si a esta persona, en esta fiesta, se le cuentan los me gusta. */
CREATE OR REPLACE FUNCTION public.likes_are_limited(p_profile_id UUID, p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_event_id IS NOT NULL
       AND NOT public.is_premium_for_event(p_profile_id, p_event_id)
       -- La cuenta con la que Apple revisa la app prueba el match en Aurora
       -- con la versión 1.0, que aún no sabe enseñar este límite. Quitar
       -- cuando la aprueben.
       AND NOT EXISTS (
           SELECT 1 FROM public.profiles pr
           WHERE pr.id = p_profile_id AND pr.email = 'revision.apple@fiestea.es'
       );
$$;

CREATE OR REPLACE FUNCTION public.enforce_free_like_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_usados INTEGER;
BEGIN
    IF NEW.swipe_type <> 'like' THEN
        RETURN NEW;
    END IF;
    -- Sólo lo que da la propia persona: los likes de las salas de pruebas los
    -- inserta el servidor en nombre del seed.
    IF public.current_profile_id() IS NULL OR NEW.swiper_id <> public.current_profile_id() THEN
        RETURN NEW;
    END IF;
    IF NOT public.likes_are_limited(NEW.swiper_id, NEW.event_id) THEN
        RETURN NEW;
    END IF;

    -- Si el insert falla después (like repetido), la suma se deshace con él.
    INSERT INTO public.event_like_usage AS u (profile_id, event_id, likes)
    VALUES (NEW.swiper_id, NEW.event_id, 1)
    ON CONFLICT (profile_id, event_id)
    DO UPDATE SET likes = u.likes + 1, updated_at = NOW()
    RETURNING u.likes INTO v_usados;

    IF v_usados > public.free_likes_per_event() THEN
        RAISE EXCEPTION 'LIKE_LIMIT';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_free_like_limit ON public.swipes;
CREATE TRIGGER b_free_like_limit
    BEFORE INSERT ON public.swipes
    FOR EACH ROW EXECUTE FUNCTION public.enforce_free_like_limit();

/**
 * Los me gusta que le quedan a quien llama en esa fiesta; NULL si no tiene
 * límite (Premium de esa fiesta o mensual).
 */
CREATE OR REPLACE FUNCTION public.my_likes_left(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := public.current_profile_id();
BEGIN
    IF v_me IS NULL OR NOT public.likes_are_limited(v_me, p_event_id) THEN
        RETURN NULL;
    END IF;
    RETURN GREATEST(
        public.free_likes_per_event() - COALESCE(
            (SELECT u.likes FROM public.event_like_usage u
             WHERE u.profile_id = v_me AND u.event_id = p_event_id),
            0),
        0);
END;
$$;

REVOKE ALL ON FUNCTION public.free_likes_per_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_likes_per_event() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.likes_are_limited(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.likes_are_limited(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_free_like_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_likes_left(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_likes_left(UUID) TO authenticated;
