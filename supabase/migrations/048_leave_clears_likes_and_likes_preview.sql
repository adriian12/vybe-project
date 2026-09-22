-- =============================================================================
-- 048 · Salir borra tus likes sin match · «Le gustas» sin premium, pixelado
-- =============================================================================
-- 1. Al salir de un evento se borran los likes (y super likes) que diste en él
--    y que no llegaron a match. Los matches y sus chats se quedan.
-- 2. Quien no es premium ve cuántas personas le han dado like y una miniatura
--    pixelada de cada una, sin nombre ni id. La miniatura la genera la Edge
--    Function `likes-preview` en el servidor: al móvil nunca le llega la foto
--    real, que si no se sacaría de la red con cualquier inspector.
--    `likes_for_preview()` le da los datos y sólo la puede llamar ella.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.leave_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
BEGIN
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    UPDATE public.event_attendance
    SET left_at = NOW()
    WHERE event_id = p_event_id AND profile_id = v_profile_id;

    -- Tus likes de esta fiesta que no llegaron a match se pierden.
    DELETE FROM public.swipes s
    WHERE s.swiper_id = v_profile_id
      AND s.event_id = p_event_id
      AND s.swipe_type IN ('like', 'super_like')
      AND NOT public.are_connected(v_profile_id, s.swiped_id);
END;
$$;

-- Los mismos likes que `get_likes_received()`, sin nada que identifique a la
-- persona salvo la foto, que la Edge Function convierte en miniatura pixelada.
CREATE OR REPLACE FUNCTION public.likes_for_preview(p_profile_id UUID)
RETURNS TABLE(photo_url TEXT, swipe_type TEXT, event_name TEXT, liked_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
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
    ORDER BY s.created_at DESC
    LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.leave_event(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_event(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.likes_for_preview(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.likes_for_preview(UUID) TO service_role;
