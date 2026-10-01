-- ============================================================================
-- 032. Limpieza de permisos y search_path
-- ============================================================================
-- Dos avisos del analizador de Supabase que conviene dejar cerrados, aunque
-- ninguno de los dos sea explotable hoy:
--
--   1. Ocho funciones `SECURITY DEFINER` figuran como ejecutables por `anon`.
--      Todas devuelven TRIGGER, así que PostgREST no las expone y llamarlas
--      fuera de un disparador da error. Aun así se revocan: el permiso no lo
--      necesita nadie, y dejarlo obliga a razonar cada vez por qué el aviso no
--      importa.
--
--   2. Cuatro funciones puras sin `search_path` fijo. No leen ninguna tabla, así
--      que no hay nada que secuestrar, pero fijarlo es gratis y deja el
--      analizador en silencio para que el próximo aviso se vea.
-- ============================================================================

-- ============================================================================
-- 1. Las funciones de disparador no las ejecuta nadie a mano
-- ============================================================================

DO $$
DECLARE
    v_funcion TEXT;
BEGIN
    FOREACH v_funcion IN ARRAY ARRAY[
        'enforce_group_message_limit',
        'enforce_promotions_plan',
        'enforce_venue_event_limit',
        'enforce_venue_team_limit',
        'freeze_gender',
        'protect_profile_fields',
        'protect_venue_fields',
        'require_verified_phone'
    ]
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC, anon, authenticated',
            v_funcion
        );
    END LOOP;
END $$;

-- ============================================================================
-- 2. search_path fijo en las funciones puras
-- ============================================================================

ALTER FUNCTION public.wants_gender(TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.demographics_min_bucket() SET search_path = public;
ALTER FUNCTION public.venue_plan_limits(TEXT) SET search_path = public;
ALTER FUNCTION public.filling_up_threshold() SET search_path = public;
