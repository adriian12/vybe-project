-- ============================================================================
-- 095 · Carteles en su propio bucket y quién puede ver las fotos de la noche
-- ============================================================================
-- Va justo después de la 094, que pone `event-photos` en privado. Sin esto:
--
--   · Los carteles de las fiestas se subían a `event-photos` (el bucket
--     `event-posters` existía, público, pero sin reglas de subida). Con el
--     bucket privado, el cartel sólo lo veían el dueño, sus matches y quien
--     estuviera en su fiesta: para el resto del público salía roto.
--   · El panel del negocio enseña la foto de quien dice que va («Voy a ir»),
--     de quien pide ayuda y de quien es denunciado en su fiesta, y los grupos
--     de amigos se ven entre sí. La política de la 094 sólo admitía al dueño,
--     a sus matches, a quien comparte fiesta y a administración.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Carteles: bucket público con reglas de subida. La primera carpeta de la ruta
-- es el uid de quien sube (`api.uploadFile` lo hace siempre así).
-- ---------------------------------------------------------------------------
-- Los mismos límites que el formulario (`create-event-form.tsx`: 10 MB, JPEG,
-- PNG o WebP). En `event-photos` el límite era de 5 MB, así que un cartel de
-- más de 5 MB fallaba al subirlo.
UPDATE storage.buckets
   SET public = TRUE,
       file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'event-posters';

DROP POLICY IF EXISTS "Event posters are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own event posters" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own event posters" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own event posters" ON storage.objects;

CREATE POLICY "Event posters are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'event-posters');

CREATE POLICY "Users can upload own event posters"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'event-posters' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

CREATE POLICY "Users can update own event posters"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'event-posters' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

CREATE POLICY "Users can delete own event posters"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'event-posters' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- ---------------------------------------------------------------------------
-- Fotos de la noche: quién puede firmarlas. Además de lo de la 094 (su dueño,
-- sus matches, quien comparte fiesta con él y administración):
--
--   · El equipo del negocio (propietarios y seguridad con cuenta) ve la foto
--     de quien ha dicho que va a una de sus fiestas o ha entrado en ella:
--     lista «Voy a ir», denuncias y control de la puerta.
--   · Quien atiende las alertas de ayuda ve la foto de quien la ha pedido.
--   · Los miembros de un mismo grupo se ven entre sí.
--
-- La foto de la noche se borra cuando la fiesta termina, así que nada de esto
-- da acceso indefinido.
-- ---------------------------------------------------------------------------
-- Las comprobaciones van en una función SECURITY DEFINER: las políticas se
-- evalúan con los permisos de quien pregunta, y `authenticated` no puede
-- ejecutar `can_count_event` ni `can_handle_sos` (ni debe). La función sólo
-- devuelve sí o no.
CREATE OR REPLACE FUNCTION public.can_view_event_photo(p_owner_folder TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := public.current_profile_id();
    v_owner UUID;
BEGIN
    SELECT p.id INTO v_owner FROM public.profiles p WHERE p.user_id::TEXT = p_owner_folder;
    IF v_owner IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN COALESCE(
        -- Sus matches, quien comparte fiesta con él ahora y su grupo.
        (v_me IS NOT NULL AND (
            public.are_connected(v_me, v_owner)
            OR public.shares_active_event(v_me, v_owner)
            OR EXISTS (
                SELECT 1
                FROM public.group_members yo
                JOIN public.group_members otro ON otro.group_id = yo.group_id
                WHERE yo.profile_id = v_me AND otro.profile_id = v_owner
            )
        ))
        -- El equipo del negocio: quien ha dicho que va o ha entrado en una de
        -- sus fiestas (lista «Voy a ir», denuncias, puerta).
        OR EXISTS (
            SELECT 1 FROM public.event_intents ei
            WHERE ei.profile_id = v_owner
              AND (public.can_read_event_metrics(ei.event_id) OR public.can_count_event(ei.event_id))
        )
        OR EXISTS (
            SELECT 1 FROM public.event_attendance ea
            WHERE ea.profile_id = v_owner
              AND (public.can_read_event_metrics(ea.event_id) OR public.can_count_event(ea.event_id))
        )
        -- Quien atiende una alerta de ayuda de esa persona.
        OR EXISTS (
            SELECT 1 FROM public.sos_alerts s
            WHERE s.profile_id = v_owner
              AND s.event_id IS NOT NULL
              AND public.can_handle_sos(s.event_id)
        ),
        FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_event_photo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_event_photo(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Event photos are readable by peers" ON storage.objects;

CREATE POLICY "Event photos are readable by peers"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'event-photos'
        AND (
            (storage.foldername(name))[1] = auth.uid()::TEXT
            OR public.is_admin()
            OR public.can_view_event_photo((storage.foldername(name))[1])
        )
    );
