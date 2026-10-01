-- ============================================================================
-- 028. Columnas que sólo puede cambiar administración
-- ============================================================================
-- Las policies de `profiles` y `venues` dejaban a cada cual actualizar su
-- propia fila entera, sin distinguir columnas. Con la anon key y el id de la
-- sesión bastaba para:
--
--   · ponerse `role = 'admin'` y entrar en el panel de administración con todo
--     lo que eso permite: aprobar locales, ver denuncias, suspender a nadie;
--   · ponerse `is_verified = true` y saltarse las fotos y la verificación
--     facial;
--   · deshacer la propia suspensión (`status`, `suspended_until`);
--   · que un local se aprobara a sí mismo (`venues.is_verified`) y se pusiera
--     el radio de geocerca que quisiera.
--
-- Se arregla con disparadores que devuelven esas columnas a su valor anterior
-- en lugar de dar error: así una escritura que mande la fila entera sigue
-- funcionando para lo que sí puede cambiar. Sin sesión (`auth.uid()` nulo) la
-- escritura viene del servidor, y ahí no hay a quién limitar.
--
-- Lo que la aplicación sí necesitaba escribir pasa ahora por funciones que
-- comprueban de verdad lo que dicen comprobar.
-- ============================================================================

-- ============================================================================
-- 1. PERFILES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
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

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_fields ON public.profiles;
CREATE TRIGGER profiles_protect_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ============================================================================
-- 2. LOCALES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_venue_fields()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.is_admin() THEN
        RETURN NEW;
    END IF;

    NEW.is_verified         := OLD.is_verified;
    NEW.verification_status := OLD.verification_status;

    -- El radio decide hasta dónde llega la geocerca del evento. Lo fija el tipo
    -- de local al darse de alta; cambiarlo a voluntad permitiría hacer que
    -- «estar dentro» significara media isla.
    NEW.event_radius := OLD.event_radius;

    -- Una vez aprobado, el nombre y el NIF quedan fijos: si no, se podría
    -- verificar una identidad y operar con otra.
    IF COALESCE(OLD.is_verified, FALSE) THEN
        NEW.name   := OLD.name;
        NEW.tax_id := OLD.tax_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_protect_fields ON public.venues;
CREATE TRIGGER venues_protect_fields
    BEFORE UPDATE ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.protect_venue_fields();

-- ============================================================================
-- 3. LO QUE LA APLICACIÓN SÍ NECESITA ESCRIBIR
-- ============================================================================

/**
 * Recalcula si el perfil está verificado, a partir del estado real.
 *
 * Antes lo decidía el navegador y escribía la columna. Ahora la regla vive
 * aquí: hace falta al menos una foto aprobada y la verificación facial.
 */
CREATE OR REPLACE FUNCTION public.recompute_my_verification()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_profile_id UUID := public.current_profile_id();
    v_verified BOOLEAN;
BEGIN
    IF v_profile_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(array_length(p.photos, 1), 0) > 0 AND COALESCE(p.face_verified, FALSE)
    INTO v_verified
    FROM public.profiles p
    WHERE p.id = v_profile_id;

    UPDATE public.profiles
    SET is_verified = COALESCE(v_verified, FALSE)
    WHERE id = v_profile_id;

    RETURN COALESCE(v_verified, FALSE);
END;
$$;

/**
 * Comprueba el código del SMS y marca el teléfono como verificado.
 *
 * Antes el navegador leía la tabla de códigos, decidía si coincidía y escribía
 * `phone_verified` él mismo: cualquiera podía marcarse el teléfono como
 * verificado sin recibir ningún SMS.
 */
CREATE OR REPLACE FUNCTION public.confirm_phone_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_code_id UUID;
    v_phone TEXT;
BEGIN
    IF v_user_id IS NULL OR p_code IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT id, phone INTO v_code_id, v_phone
    FROM public.verification_codes
    WHERE user_id = v_user_id
      AND code = p_code
      AND verified = FALSE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_code_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.verification_codes SET verified = TRUE WHERE id = v_code_id;

    UPDATE public.profiles
    SET phone_verified = TRUE,
        phone = COALESCE(v_phone, phone)
    WHERE user_id = v_user_id;

    RETURN TRUE;
END;
$$;

/**
 * Marca la verificación facial. La llama `moderate-photo` con la clave de
 * servicio después de que Sightengine confirme que hay exactamente una cara.
 */
CREATE OR REPLACE FUNCTION public.set_face_verified(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET face_verified = TRUE,
        is_verified = COALESCE(array_length(photos, 1), 0) > 0
    WHERE id = p_profile_id;
END;
$$;

-- ============================================================================
-- 4. PERMISOS
-- ============================================================================

REVOKE ALL ON FUNCTION public.recompute_my_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_my_verification() TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_phone_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_phone_code(TEXT) TO authenticated;

-- Ésta no: sólo el servidor, después de comprobar la foto.
REVOKE ALL ON FUNCTION public.set_face_verified(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_face_verified(UUID) TO service_role;

COMMENT ON FUNCTION public.protect_profile_fields IS
    'Devuelve a su valor anterior las columnas de perfil que sólo puede cambiar administración o el servidor.';
COMMENT ON FUNCTION public.protect_venue_fields IS
    'Impide que un local se apruebe a sí mismo o se cambie el radio de la geocerca.';
