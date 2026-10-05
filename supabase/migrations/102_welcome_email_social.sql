-- ============================================================================
-- 102 · Correo de bienvenida a quien entra con Google o Apple
-- ============================================================================
-- Con correo y contraseña llega el correo de verificación; con Google o Apple
-- la cuenta se creaba sin ningún correo. Al crearse el perfil de una cuenta
-- social, se llama a la Edge Function `welcome-email` por `pg_net` (mismo
-- secreto y misma URL que los avisos push). `welcome_email_sent_at` evita
-- mandarlo dos veces.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.welcome_email_on_social_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_proveedor TEXT;
    v_secret TEXT;
    v_url TEXT;
BEGIN
    SELECT COALESCE(u.raw_app_meta_data->>'provider', 'email') INTO v_proveedor
    FROM auth.users u WHERE u.id = NEW.user_id;

    IF v_proveedor IS NULL OR v_proveedor = 'email' THEN
        RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_hook_secret';
    SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'functions_url';
    IF v_secret IS NULL OR v_url IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := v_url || '/welcome-email',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object('userId', NEW.user_id)
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Un correo que no sale nunca puede impedir que se cree la cuenta.
    RAISE WARNING 'welcome_email_on_social_signup: %', SQLERRM;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.welcome_email_on_social_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_welcome_email ON public.profiles;
CREATE TRIGGER profiles_welcome_email
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.welcome_email_on_social_signup();
