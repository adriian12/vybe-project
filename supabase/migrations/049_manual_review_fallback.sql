-- =============================================================================
-- 049 · Revisión manual de respaldo, aviso al admin y cola de moderación cerrada
-- =============================================================================
-- 1. La cola de moderación dejaba al móvil insertar un elemento con cualquier
--    `status`: bastaba con crearlo ya `approved` para que `set_event_photo()`
--    lo aceptara sin pasar por la revisión. Ahora sólo se puede crear
--    pendiente, sin puntuación ni revisor.
-- 2. Cuando la revisión automática no responde, la foto queda pendiente
--    (`reason = 'unavailable'`) para revisión manual y los admins reciben un
--    aviso «Tienes imágenes por revisar», como mucho uno cada 10 minutos.
-- 3. `review_photo()` sabe publicar cada tipo: foto del perfil, avatar, foto
--    de la noche (en su evento, si la persona no tiene ya una) y verificación
--    de cara.
-- =============================================================================

ALTER TABLE public.moderation_queue
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Users create own moderation items" ON public.moderation_queue;
CREATE POLICY "Users create own moderation items" ON public.moderation_queue
    FOR INSERT
    WITH CHECK (
        profile_id = public.current_profile_id()
        AND status = 'pending'
        AND score IS NULL
        AND reason IS NULL
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
    );

-- ---------------------------------------------------------------------------
-- Aviso a administración
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_notices (
    key TEXT PRIMARY KEY,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.admin_notices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.notify_admins_pending_photos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'pending'
       AND NEW.reason = 'unavailable'
       AND OLD.reason IS DISTINCT FROM 'unavailable' THEN
        -- Uno cada 10 minutos: si Sightengine se cae en plena noche, no se
        -- manda un aviso por foto.
        INSERT INTO public.admin_notices AS n (key, sent_at)
        VALUES ('photos_pending', NOW())
        ON CONFLICT (key) DO UPDATE SET sent_at = NOW()
        WHERE n.sent_at < NOW() - INTERVAL '10 minutes';

        IF FOUND THEN
            PERFORM public.push_webhook(jsonb_build_object(
                'type', 'PHOTOS_PENDING', 'table', 'moderation_queue', 'record', jsonb_build_object('id', NEW.id)
            ));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS moderation_queue_notify_admins ON public.moderation_queue;
CREATE TRIGGER moderation_queue_notify_admins
    AFTER UPDATE OF reason, status ON public.moderation_queue
    FOR EACH ROW EXECUTE FUNCTION public.notify_admins_pending_photos();

-- Lo que falta por revisar a mano, para el texto del aviso.
CREATE OR REPLACE FUNCTION public.count_pending_moderation()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER FROM public.moderation_queue WHERE status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- Revisión manual: publicar cada tipo donde toca
-- ---------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.notify_admins_pending_photos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_pending_moderation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_moderation() TO service_role;
REVOKE ALL ON FUNCTION public.review_photo(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_photo(UUID, BOOLEAN, TEXT) TO authenticated;
