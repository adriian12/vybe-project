-- =============================================================================
-- 050 · Una sola foto al entrar
-- =============================================================================
-- Al entrar en un evento sólo se pide una foto con la cámara (cara o cuerpo
-- entero). Si la revisión automática la aprueba (una cara, nada prohibido) y la
-- cuenta todavía no estaba verificada, esa misma foto la verifica: pasa a ser
-- su primera foto de perfil (y avatar si no tenía) y marca la cara como
-- verificada. Antes hacían falta tres fotos de perfil más la de la noche.
-- La llama `moderate-photo` con la clave de servicio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.verify_from_event_photo(p_profile_id UUID, p_url TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles p
    SET photos = CASE
            WHEN COALESCE(array_length(p.photos, 1), 0) = 0 THEN ARRAY[p_url]
            ELSE p.photos
        END,
        avatar = COALESCE(p.avatar, p_url),
        face_verified = TRUE,
        is_verified = TRUE
    WHERE p.id = p_profile_id
      AND NOT (COALESCE(p.is_verified, FALSE) AND COALESCE(p.face_verified, FALSE));
END;
$$;

REVOKE ALL ON FUNCTION public.verify_from_event_photo(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_from_event_photo(UUID, TEXT) TO service_role;

-- La revisión manual de una foto de la noche también verifica la cuenta.
CREATE OR REPLACE FUNCTION public.review_photo(p_item_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_item RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT * INTO v_item FROM public.moderation_queue WHERE id = p_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND';
    END IF;

    UPDATE public.moderation_queue
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        reason = p_reason,
        reviewed_by = auth.uid(),
        reviewed_at = NOW()
    WHERE id = p_item_id;

    IF NOT p_approve THEN
        RETURN;
    END IF;

    IF v_item.kind = 'avatar' THEN
        UPDATE public.profiles SET avatar = v_item.url WHERE id = v_item.profile_id;

    ELSIF v_item.kind = 'event_photo' THEN
        -- Si mientras tanto se hizo otra y pasó la revisión, se queda esa.
        UPDATE public.event_attendance
        SET photo_url = v_item.url, photo_taken_at = NOW()
        WHERE profile_id = v_item.profile_id
          AND event_id = v_item.event_id
          AND photo_url IS NULL
          AND left_at IS NULL;
        PERFORM public.verify_from_event_photo(v_item.profile_id, v_item.url);

    ELSIF v_item.kind = 'face_verification' THEN
        UPDATE public.profiles
        SET face_verified = TRUE,
            is_verified = COALESCE(array_length(photos, 1), 0) > 0
        WHERE id = v_item.profile_id;

    ELSE
        UPDATE public.profiles
        SET photos = CASE
                WHEN v_item.url = ANY(photos) THEN photos
                ELSE array_append(photos, v_item.url)
            END,
            avatar = COALESCE(avatar, v_item.url)
        WHERE id = v_item.profile_id;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.review_photo(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_photo(UUID, BOOLEAN, TEXT) TO authenticated;
