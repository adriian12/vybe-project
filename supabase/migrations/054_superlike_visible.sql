-- =============================================================================
-- 054 · El super like se ve siempre en «Le gustas»
-- =============================================================================
-- Sin Premium, «Le gustas» enseña las fotos pixeladas. Un super like es otra
-- cosa: quien lo manda quiere que se sepa, así que se ve tal cual, con su
-- nombre, y se le puede devolver el like. El resto siguen pixelados.
--
-- Se quita además la versión antigua de `queue_broadcast` (sin hora
-- programada), que quedó tras la migración 053: con dos versiones, el cliente
-- podía llamar a la que no programa.
-- =============================================================================

DROP FUNCTION IF EXISTS public.queue_broadcast(text, text, uuid, text);

DROP FUNCTION IF EXISTS public.likes_for_preview(UUID);
CREATE FUNCTION public.likes_for_preview(p_profile_id UUID)
RETURNS TABLE(
    profile_id UUID,
    name TEXT,
    age INTEGER,
    photo_url TEXT,
    swipe_type TEXT,
    event_name TEXT,
    liked_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        -- De un like normal no se dice ni quién es: la Edge Function sólo
        -- devuelve una miniatura pixelada. Del super like, todo.
        CASE WHEN s.swipe_type = 'super_like' THEN p.id END,
        CASE WHEN s.swipe_type = 'super_like' THEN p.name END,
        CASE WHEN s.swipe_type = 'super_like' THEN p.age END,
        COALESCE(p.photos[1], p.avatar),
        s.swipe_type, e.name, s.created_at
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.swiper_id
    LEFT JOIN public.events e ON e.id = s.event_id
    WHERE s.swiped_id = p_profile_id
      AND s.swipe_type IN ('like', 'super_like')
      AND p.status = 'active'
      AND p.is_verified = TRUE
      AND NOT public.are_connected(p_profile_id, s.swiper_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes mine
          WHERE mine.swiper_id = p_profile_id AND mine.swiped_id = s.swiper_id
      )
    ORDER BY (s.swipe_type = 'super_like') DESC, s.created_at DESC
    LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.likes_for_preview(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.likes_for_preview(UUID) TO service_role;
