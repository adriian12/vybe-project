-- 124: recibir un supercrush.
--
-- Hasta ahora sólo salía en «Le gustas» y nadie se enteraba. Ahora:
--   1. Llega un aviso, «¡Has recibido un supercrush!» (`SUPERCRUSH` en
--      `send-push`), que abre la ficha de quien te lo dio: `/u/<id>?supercrush=1`.
--   2. Esa ficha se puede ver aunque no sea tu match ni esté en tu tablón
--      (`get_supercrush_sender`), mientras no le hayas contestado. Ahí eliges
--      «Me gusta» (match) o «No me gusta»; después ya no sale en el tablón,
--      como cualquier persona a la que has contestado.
-- Si el supercrush ya es match (le habías dado like), avisa el match y no esto.

CREATE OR REPLACE FUNCTION public.push_supercrush_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.swipe_type <> 'super_like' THEN
        RETURN NEW;
    END IF;
    -- Los de las salas de pruebas los mete el servidor en nombre del seed.
    IF public.current_profile_id() IS NULL OR NEW.swiper_id <> public.current_profile_id() THEN
        RETURN NEW;
    END IF;
    -- `check_match_on_swipe` ya ha corrido (va antes por nombre).
    IF EXISTS (
        SELECT 1 FROM public.connections c
        WHERE c.user_id_1 = LEAST(NEW.swiper_id, NEW.swiped_id)
          AND c.user_id_2 = GREATEST(NEW.swiper_id, NEW.swiped_id)
    ) THEN
        RETURN NEW;
    END IF;
    PERFORM public.push_webhook(jsonb_build_object(
        'type', 'SUPERCRUSH', 'table', 'swipes',
        'record', jsonb_build_object('swiper_id', NEW.swiper_id, 'swiped_id', NEW.swiped_id)
    ));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS z_push_supercrush_received ON public.swipes;
CREATE TRIGGER z_push_supercrush_received
    AFTER INSERT ON public.swipes
    FOR EACH ROW EXECUTE FUNCTION public.push_supercrush_received();

REVOKE ALL ON FUNCTION public.push_supercrush_received() FROM PUBLIC, anon, authenticated;

/**
 * La ficha de quien te ha dado un supercrush y aún no has contestado. Con la
 * foto de la fiesta en la que te lo dio, si la tiene, como en el tablón.
 */
CREATE OR REPLACE FUNCTION public.get_supercrush_sender(p_profile_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    age INTEGER,
    bio TEXT,
    photos TEXT[],
    avatar TEXT,
    is_verified BOOLEAN,
    interests TEXT[],
    event_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id, p.name, p.age, p.bio,
           CASE WHEN ea.photo_url IS NOT NULL THEN ARRAY[ea.photo_url] ELSE p.photos END,
           COALESCE(ea.photo_url, p.avatar),
           p.is_verified,
           COALESCE((SELECT array_agg(i.slug ORDER BY i.sort_order)
                     FROM public.profile_interests pi
                     JOIN public.interests i ON i.id = pi.interest_id
                     WHERE pi.profile_id = p.id), '{}'),
           s.event_id
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.swiper_id
    LEFT JOIN public.event_attendance ea ON ea.profile_id = p.id AND ea.event_id = s.event_id
    WHERE s.swiper_id = p_profile_id
      AND s.swiped_id = public.current_profile_id()
      AND s.swipe_type = 'super_like'
      AND p.status = 'active'
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes m
          WHERE m.swiper_id = public.current_profile_id() AND m.swiped_id = p_profile_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.blocker_id = public.current_profile_id() AND b.blocked_id = p_profile_id)
             OR (b.blocker_id = p_profile_id AND b.blocked_id = public.current_profile_id()))
    ORDER BY s.created_at DESC
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_supercrush_sender(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supercrush_sender(UUID) TO authenticated;
