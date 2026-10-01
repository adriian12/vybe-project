-- El local de la casa (`venues.is_platform`) no tiene límites de plan.
--
-- Al añadir eventos de Funout saltaba PLAN_EVENT_LIMIT: el local de la
-- plataforma contaba como plan gratuito. Ahora `venue_plan()` le da Business,
-- con lo que también tiene todas las funciones del panel.
--
-- Y su dueño es una cuenta de sistema (`sistema@fiestea.es`, sin contraseña
-- conocida), no el admin que lo crea: una cuenta dueña de un local entra en la
-- app como negocio (dejaría de ver administración), y si se borraba se llevaba
-- en cascada el local y todas sus fiestas.

CREATE OR REPLACE FUNCTION public.venue_plan(p_venue_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM public.venues v
                     WHERE v.id = COALESCE(p_venue_id, public.current_venue_id()) AND v.is_platform)
            THEN 'business'
        ELSE COALESCE(
            (SELECT vs.plan
             FROM public.venue_subscriptions vs
             WHERE vs.venue_id = COALESCE(p_venue_id, public.current_venue_id())
               AND vs.status IN ('active', 'trialing')
               AND (vs.expires_at IS NULL OR vs.expires_at > NOW())),
            'free'
        )
    END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_house_venue()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id UUID;
    v_owner UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    SELECT id INTO v_id FROM public.venues WHERE is_platform ORDER BY created_at LIMIT 1;
    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    SELECT id INTO v_owner FROM auth.users WHERE email = 'sistema@fiestea.es';
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'HOUSE_OWNER_MISSING';
    END IF;

    INSERT INTO public.venues (venue_id, name, email, type, verification_status, is_verified, city, is_platform, event_radius)
    VALUES (v_owner, 'Fiestea', 'hola@fiestea.es', 'local', 'approved', TRUE, 'España', TRUE, 300)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

-- La cuenta de sistema nunca sale en un tablón.
UPDATE public.profiles p
SET account_type = 'guest'
FROM auth.users u
WHERE u.id = p.user_id AND u.email = 'sistema@fiestea.es';
