-- 148: «Ver fiestas sin cuenta».
--
-- Quien pulsa «Ver fiestas sin cuenta» en la bienvenida entra con una sesión
-- anónima de Supabase Auth (`signInAnonymously`, activado en la configuración de
-- Auth). Tiene el rol `authenticated`, así que lee fiestas, locales y el mapa con
-- las mismas políticas que cualquier cuenta, pero:
--
--   · no se le crea perfil (`handle_new_user` lo salta), así que todo lo que va
--     por `profiles` (seguir, entradas, entrar, tablón, chat…) no le funciona y
--     la app le pide registrarse;
--   · políticas RESTRICTIVE: no puede crearse un perfil ni un negocio a mano,
--     ni pedir códigos de verificación, ni subir ficheros;
--   · `purge_anonymous_users()`: cada noche se borran las sesiones anónimas de
--     más de 30 días. Al registrarse, la app cambia la sesión por la nueva y la
--     anónima se queda huérfana hasta entonces.

CREATE OR REPLACE FUNCTION public.is_anonymous_session()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
    SELECT COALESCE((auth.jwt() ->> 'is_anonymous')::BOOLEAN, FALSE);
$$;

REVOKE ALL ON FUNCTION public.is_anonymous_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_anonymous_session() TO authenticated;

-- Sin perfil ni negocio para las sesiones anónimas.
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
            CASE WHEN NEW.raw_user_meta_data->>'profile_kind' = 'guest' THEN 'guest' ELSE 'vyber' END
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Sin cuenta no crea perfil" ON public.profiles;
CREATE POLICY "Sin cuenta no crea perfil" ON public.profiles AS RESTRICTIVE
    FOR INSERT TO authenticated WITH CHECK (NOT public.is_anonymous_session());

DROP POLICY IF EXISTS "Sin cuenta no crea negocio" ON public.venues;
CREATE POLICY "Sin cuenta no crea negocio" ON public.venues AS RESTRICTIVE
    FOR INSERT TO authenticated WITH CHECK (NOT public.is_anonymous_session());

DROP POLICY IF EXISTS "Sin cuenta no pide códigos" ON public.verification_codes;
CREATE POLICY "Sin cuenta no pide códigos" ON public.verification_codes AS RESTRICTIVE
    FOR INSERT TO authenticated WITH CHECK (NOT public.is_anonymous_session());

DROP POLICY IF EXISTS "Sin cuenta no sube ficheros" ON storage.objects;
CREATE POLICY "Sin cuenta no sube ficheros" ON storage.objects AS RESTRICTIVE
    FOR INSERT TO authenticated WITH CHECK (NOT public.is_anonymous_session());

DROP POLICY IF EXISTS "Sin cuenta no cambia ficheros" ON storage.objects;
CREATE POLICY "Sin cuenta no cambia ficheros" ON storage.objects AS RESTRICTIVE
    FOR UPDATE TO authenticated USING (NOT public.is_anonymous_session());

CREATE OR REPLACE FUNCTION public.purge_anonymous_users()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    DELETE FROM auth.users
     WHERE is_anonymous
       AND created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_anonymous_users() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('fiestea-purgar-anonimos')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiestea-purgar-anonimos');
SELECT cron.schedule('fiestea-purgar-anonimos', '45 3 * * *', $$SELECT public.purge_anonymous_users()$$);
