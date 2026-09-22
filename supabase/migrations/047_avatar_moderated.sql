-- =============================================================================
-- 047 · El avatar también pasa por la revisión automática
-- =============================================================================
-- El avatar se subía y se guardaba desde el navegador sin revisar. Ahora lo
-- pone `moderate-photo` (con la clave de servicio) cuando lo aprueba, y el
-- disparador de `profiles` sólo deja al usuario quitarlo o elegir una de sus
-- fotos ya aprobadas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Dentro de una función SECURITY DEFINER `current_user` es su propietario:
    -- esas funciones ya comprueban quién llama y calculan las columnas.
    IF current_user NOT IN ('authenticated', 'anon')
       OR auth.uid() IS NULL
       OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    NEW.role              := OLD.role;
    NEW.is_verified       := OLD.is_verified;
    NEW.face_verified     := OLD.face_verified;
    NEW.phone_verified    := OLD.phone_verified;
    NEW.status            := OLD.status;
    NEW.suspended_until   := OLD.suspended_until;
    NEW.suspension_reason := OLD.suspension_reason;

    -- Las fotos se pueden quitar, no añadir: las añade `review_photo()` cuando
    -- la moderación las aprueba. Si no, bastaba con escribir una URL cualquiera
    -- en el array para publicar lo que fuera.
    IF NEW.photos IS DISTINCT FROM OLD.photos
       AND NOT (NEW.photos <@ COALESCE(OLD.photos, '{}'::text[])) THEN
        NEW.photos := OLD.photos;
    END IF;

    -- El avatar: quitarlo o elegir una foto ya aprobada. Uno nuevo lo pone la
    -- moderación.
    IF NEW.avatar IS DISTINCT FROM OLD.avatar
       AND NEW.avatar IS NOT NULL
       AND NOT (NEW.avatar = ANY (COALESCE(NEW.photos, '{}'::text[]))) THEN
        NEW.avatar := OLD.avatar;
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;
