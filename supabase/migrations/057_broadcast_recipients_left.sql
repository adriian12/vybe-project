-- =============================================================================
-- 057 · Los avisos del local no siguen a quien ya se ha ido
-- =============================================================================
-- `broadcast_recipients()` miraba sólo `last_seen_at`, así que quien había
-- salido del evento seguía recibiendo los avisos durante cuatro horas. Los
-- invitados sí los reciben: es parte de lo que tienen.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.broadcast_recipients(p_broadcast_id uuid)
 RETURNS TABLE(profile_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p.id
    FROM public.broadcasts b
    JOIN public.profiles p
      ON p.status = 'active'
     AND p.notify_events
     AND (
         b.event_id IS NULL
         OR EXISTS (
             SELECT 1 FROM public.event_attendance ea
             WHERE ea.event_id = b.event_id
               AND ea.profile_id = p.id
               AND ea.left_at IS NULL
               AND ea.last_seen_at > NOW() - INTERVAL '4 hours'
         )
     )
    WHERE b.id = p_broadcast_id
      AND b.status = 'pending';
$function$;
