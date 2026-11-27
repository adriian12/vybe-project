-- 151 · Quien se registra con Google o Apple empieza como invitado.
--
-- Antes empezaba como fiester@ sin terminar y la app le ponía delante una
-- ventana que no se podía cerrar (tipo de cuenta, fecha de nacimiento,
-- género…). Google y Apple no dan la fecha ni el género, y mucha gente se
-- quedaba ahí. Ahora entra directamente como invitado (ve fiestas, compra
-- entradas, sigue locales) y esos datos se piden sólo cuando quiere pasar a
-- fiester@ para entrar al tablón (tarjeta «Cambiar a Fiester@», también dentro
-- de la fiesta).
--
-- No se apunta como cambio de tipo: el primer paso a fiester@ sigue libre.
-- Quien se registra con correo ya elige en el formulario: no cambia.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_account_type TEXT := COALESCE(NEW.raw_user_meta_data->>'account_type', 'user');
    v_venue_type TEXT;
    v_radius INTEGER;
    v_name TEXT := NULLIF(btrim(COALESCE(
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'full_name',
        ''
    )), '');
    -- Google o Apple: no traen fecha de nacimiento ni género (151).
    v_social BOOLEAN := COALESCE(NEW.raw_app_meta_data->>'provider', 'email') IN ('google', 'apple');
BEGIN
    IF COALESCE(NEW.is_anonymous, FALSE) THEN
        RETURN NEW;
    END IF;

    IF v_account_type = 'venue' THEN
        v_venue_type := COALESCE(NULLIF(NEW.raw_user_meta_data->>'venue_type', ''), 'local');

        v_radius := CASE v_venue_type
            WHEN 'discoteca' THEN 100
            WHEN 'festival' THEN 500
            WHEN 'evento_empresarial' THEN 250
            ELSE 50
        END;

        INSERT INTO public.venues (
            venue_id, name, email, type, phone, tax_id, address, event_radius
        )
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'venue_name', split_part(NEW.email, '@', 1)),
            NEW.email,
            v_venue_type,
            NEW.raw_user_meta_data->>'phone',
            NULLIF(NEW.raw_user_meta_data->>'tax_id', ''),
            NULLIF(NEW.raw_user_meta_data->>'address', ''),
            v_radius
        )
        ON CONFLICT (venue_id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (user_id, name, email, age, phone, gender, wants, account_type)
        VALUES (
            NEW.id,
            COALESCE(v_name, split_part(COALESCE(NEW.email, 'fiester'), '@', 1)),
            NEW.email,
            GREATEST(18, COALESCE((NEW.raw_user_meta_data->>'age')::INTEGER, 18)),
            NEW.raw_user_meta_data->>'phone',
            CASE WHEN NEW.raw_user_meta_data->>'gender' IN ('man', 'woman')
                 THEN NEW.raw_user_meta_data->>'gender' END,
            CASE WHEN NEW.raw_user_meta_data->>'wants' IN ('men', 'women', 'all')
                 THEN NEW.raw_user_meta_data->>'wants' ELSE 'all' END,
            CASE WHEN NEW.raw_user_meta_data->>'profile_kind' = 'guest' OR v_social
                 THEN 'guest' ELSE 'vyber' END
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;

-- Los que ya se quedaron a medias con Google o Apple pasan a invitado.
UPDATE public.profiles p
SET account_type = 'guest'
FROM auth.users u
WHERE u.id = p.user_id
  AND p.account_type = 'vyber'
  AND p.profile_completed_at IS NULL
  AND p.role IS DISTINCT FROM 'admin'
  AND COALESCE(u.raw_app_meta_data->>'provider', 'email') IN ('google', 'apple');
