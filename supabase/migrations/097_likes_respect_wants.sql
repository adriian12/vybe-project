-- ============================================================================
-- 097 · «Le gustas» respeta «Quiero ver»
-- ============================================================================
-- El filtro «Quiero ver» (`profiles.wants`: mujeres, hombres o todos) sólo se
-- aplicaba al tablón (`get_nearby_profiles`). En Crushes → «Le gustas» salía
-- todo el que te había dado like, también hombres a quien sólo quiere ver
-- mujeres. Ahora las dos listas (la de Premium y la vista previa pixelada,
-- que además da el número) usan la misma regla que el tablón:
-- `wants_gender(lo que quiero ver, su género)`. Quien no ha dicho su género
-- sigue saliendo, igual que en el tablón.
--
-- Es un filtro, no un borrado: si vuelves a «Todos», reaparecen.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_likes_received()
 RETURNS TABLE(id uuid, name text, age integer, bio text, photos text[], avatar text, swipe_type text, event_name text, liked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        p.id, p.name, p.age, p.bio, p.photos, p.avatar,
        s.swipe_type, e.name, s.created_at
    FROM public.swipes s
    JOIN public.profiles p ON p.id = s.swiper_id
    LEFT JOIN public.events e ON e.id = s.event_id
    WHERE s.swiped_id = v_profile_id
      AND s.swipe_type IN ('like', 'super_like')
      AND p.status = 'active'
      AND p.is_verified = TRUE
      -- «Quiero ver» también vale aquí, como en el tablón (097).
      AND public.wants_gender(
          COALESCE((SELECT me.wants FROM public.profiles me WHERE me.id = v_profile_id), 'all'), p.gender)
      AND NOT public.are_connected(v_profile_id, s.swiper_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes mine
          WHERE mine.swiper_id = v_profile_id AND mine.swiped_id = s.swiper_id
      )
    ORDER BY s.created_at DESC
    LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.likes_for_preview(p_profile_id uuid)
 RETURNS TABLE(profile_id uuid, name text, age integer, photo_url text, swipe_type text, event_name text, liked_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- «Quiero ver» también vale aquí, como en el tablón (097).
      AND public.wants_gender(
          COALESCE((SELECT me.wants FROM public.profiles me WHERE me.id = p_profile_id), 'all'), p.gender)
      AND NOT public.are_connected(p_profile_id, s.swiper_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.swipes mine
          WHERE mine.swiper_id = p_profile_id AND mine.swiped_id = s.swiper_id
      )
    ORDER BY (s.swipe_type = 'super_like') DESC, s.created_at DESC
    LIMIT 50;
$function$;
