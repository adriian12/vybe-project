-- =============================================================================
-- 045 · Verificación que no se guardaba y premium para administración
-- =============================================================================
-- 1. `protect_profile_fields()` (028) devuelve `is_verified`, `phone_verified`,
--    `status`… a su valor anterior cuando quien escribe es el propio usuario.
--    Pero las funciones que la app llama con la sesión del usuario para
--    calcular esas columnas (`recompute_my_verification`, `confirm_phone_code`,
--    `request_account_deletion`) también se ejecutan con su `auth.uid()`, así
--    que el disparador deshacía su trabajo: ninguna cuenta nueva llegaba a
--    `is_verified = TRUE`, no salía en el tablón de nadie y su propio tablón se
--    quedaba en «buscar más gente».
--    El disparador pasa a ejecutarse con los permisos de quien escribe
--    (SECURITY INVOKER) y sólo protege cuando escribe directamente un rol de
--    la API (`authenticated`, `anon`). Las funciones SECURITY DEFINER corren
--    como su propietario, así que su trabajo ya no se deshace; el cliente sigue
--    sin poder tocar esas columnas con un UPDATE directo.
-- 2. Quien administra tiene premium siempre, para poder probarlo todo.
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

    RETURN NEW;
END;
$function$;

-- Las cuentas que ya cumplían (fotos aprobadas y cara verificada) y se
-- quedaron sin verificar por el fallo.
UPDATE public.profiles p
SET is_verified = TRUE
WHERE NOT COALESCE(p.is_verified, FALSE)
  AND COALESCE(p.face_verified, FALSE)
  AND COALESCE(array_length(p.photos, 1), 0) > 0;

-- Quien administra entra en todo sin repetir la verificación de cara.
UPDATE public.profiles p
SET is_verified = TRUE, face_verified = TRUE
WHERE p.role = 'admin'
  AND COALESCE(array_length(p.photos, 1), 0) > 0
  AND NOT (COALESCE(p.is_verified, FALSE) AND COALESCE(p.face_verified, FALSE));

-- ---------------------------------------------------------------------------
-- Premium para administración
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_premium(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.premium_subscriptions
        WHERE user_id = COALESCE(p_profile_id, public.current_profile_id())
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
    )
    OR EXISTS (
        SELECT 1 FROM public.profiles pr
        WHERE pr.id = COALESCE(p_profile_id, public.current_profile_id())
          AND pr.role = 'admin'
    );
$function$;

-- La app lee la suscripción de la tabla: los admins tienen una vitalicia.
INSERT INTO public.premium_subscriptions (user_id, plan_type, subscription_type, status, expires_at)
SELECT pr.id, 'premium', 'lifetime', 'active', NULL
FROM public.profiles pr
WHERE pr.role = 'admin'
ON CONFLICT (user_id, event_id, subscription_type)
DO UPDATE SET status = 'active', expires_at = NULL;

-- Y quien pase a admin más adelante, también.
CREATE OR REPLACE FUNCTION public.admin_gets_premium()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role = 'admin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'admin') THEN
        INSERT INTO public.premium_subscriptions (user_id, plan_type, subscription_type, status, expires_at)
        VALUES (NEW.id, 'premium', 'lifetime', 'active', NULL)
        ON CONFLICT (user_id, event_id, subscription_type)
        DO UPDATE SET status = 'active', expires_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_admin_premium ON public.profiles;
CREATE TRIGGER profiles_admin_premium
    AFTER INSERT OR UPDATE OF role ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.admin_gets_premium();

REVOKE ALL ON FUNCTION public.admin_gets_premium() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;
