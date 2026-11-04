-- ============================================================================
-- 132 · «Quién va»: primero las caras de tus matches
-- ============================================================================
-- En la ficha, con Premium, las miniaturas de «Quién va» salen primero las de
-- gente con la que has tenido match (una conexión que sigue guardada o un
-- «me gusta» mutuo que aún existe) y el resto al azar, en vez de por quién lo
-- marcó último. Sirve para intuir que va alguien que ya conoces; la sección no
-- se puede pulsar y no enseña nada más que antes.
--
-- Los matches que caducaron sin guardarse ya no existen en ningún sitio: esos
-- salen como cualquier otra persona. Misma firma y mismos permisos.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_event_attendees_preview(p_event_id uuid)
 RETURNS TABLE(id uuid, name text, avatar text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ORDER BY
        -- Primero, con quien has tenido match.
        (EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.user_id_1 = LEAST(v_profile_id, p.id)
              AND c.user_id_2 = GREATEST(v_profile_id, p.id)
         )
         OR (EXISTS (SELECT 1 FROM public.swipes s
                     WHERE s.swiper_id = v_profile_id AND s.swiped_id = p.id
                       AND s.swipe_type IN ('like', 'super_like'))
             AND EXISTS (SELECT 1 FROM public.swipes s
                         WHERE s.swiper_id = p.id AND s.swiped_id = v_profile_id
                           AND s.swipe_type IN ('like', 'super_like')))) DESC,
        -- El resto, al azar.
        random()
    LIMIT 50;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_event_attendees_preview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_attendees_preview(UUID) TO authenticated;
