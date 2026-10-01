-- ============================================================================
-- 099 · Aurora Sessions vuelve a estar abierta y no se puede cerrar sin querer
-- ============================================================================
-- El 1 de octubre de 2026 se guardó Aurora Sessions desde el formulario de
-- editar fiestas. Ese formulario pone el fin el mismo día del inicio (sólo
-- pide la hora), así que la fiesta pasó a terminar el 10 de septiembre de
-- 2026 a las 22:00. Veinte segundos después, `purge_ended_event_likes()`
-- (098) la vio terminada y borró sus me gusta de prueba.
--
--   1. Aurora vuelve a durar hasta 2030, sin ubicación y como sala de pruebas.
--   2. Las 50 personas del seed vuelven a estar «vistas» hasta el final.
--   3. Vuelven los me gusta de prueba: las 50 a Carlos y Elena (como estaba
--      montado), y a las demás cuentas reales la mitad de bienvenida, con la
--      misma regla fija de `test_lab_welcome_likes()`.
--   4. El borrado de me gusta no toca las salas de pruebas.
--   5. Una sala de pruebas no puede pasar a terminar en el pasado al guardar
--      el formulario: se conserva su fecha de fin. Para cerrarla de verdad,
--      se quita antes `test_lab`.
-- ============================================================================

-- 1 ------------------------------------------------------------------------
UPDATE public.events
SET requires_location = FALSE,
    test_lab = TRUE,
    entry_closed_at = NULL,
    start_date = LEAST(start_date, NOW() - INTERVAL '1 hour'),
    end_date = TIMESTAMPTZ '2030-12-31 23:00:00+00'
WHERE id = 'd26f7152-9583-4a95-a7e4-d28cfbf09538'
  AND name = 'Aurora Sessions';

UPDATE public.event_codes
SET expires_at = TIMESTAMPTZ '2030-12-31 23:00:00+00'
WHERE event_id = 'd26f7152-9583-4a95-a7e4-d28cfbf09538';

-- Los totales que guardó la 098 al «terminar»: Aurora no ha terminado.
DELETE FROM public.event_swipe_totals WHERE event_id = 'd26f7152-9583-4a95-a7e4-d28cfbf09538';

-- 2 ------------------------------------------------------------------------
UPDATE public.event_attendance ea
SET last_seen_at = TIMESTAMPTZ '2030-12-31 23:00:00+00', left_at = NULL
FROM public.profiles p
WHERE p.id = ea.profile_id
  AND p.email LIKE '%@seed.vybe.test'
  AND ea.event_id = 'd26f7152-9583-4a95-a7e4-d28cfbf09538';

-- 3 ------------------------------------------------------------------------
-- Las 50 personas del seed, a Carlos y a Elena.
INSERT INTO public.swipes (swiper_id, swiped_id, swipe_type, event_id)
SELECT ea.profile_id, yo.id,
       CASE WHEN ('x' || substr(md5(ea.profile_id::text || yo.id::text), 1, 2))::bit(8)::int % 5 = 0
            THEN 'super_like' ELSE 'like' END,
       ea.event_id
FROM public.event_attendance ea
JOIN public.profiles s ON s.id = ea.profile_id AND s.email LIKE '%@seed.vybe.test'
JOIN public.profiles yo ON yo.user_id IN (
    SELECT u.id FROM auth.users u WHERE u.email IN ('carlos@vybe-test.local', 'elena@vybe-test.local')
)
WHERE ea.event_id = 'd26f7152-9583-4a95-a7e4-d28cfbf09538'
  AND NOT EXISTS (
      SELECT 1 FROM public.swipes x WHERE x.swiper_id = ea.profile_id AND x.swiped_id = yo.id
  );

-- La bienvenida (la mitad, siempre la misma) a las demás cuentas reales que entraron.
INSERT INTO public.swipes (swiper_id, swiped_id, swipe_type, event_id)
SELECT seed.profile_id, real.profile_id,
       CASE WHEN ('x' || substr(md5(seed.profile_id::text || real.profile_id::text), 1, 2))::bit(8)::int % 5 = 0
            THEN 'super_like' ELSE 'like' END,
       real.event_id
FROM public.event_attendance real
JOIN public.profiles rp ON rp.id = real.profile_id AND rp.email NOT LIKE '%@seed.vybe.test'
JOIN public.event_attendance seed ON seed.event_id = real.event_id
JOIN public.profiles sp ON sp.id = seed.profile_id AND sp.email LIKE '%@seed.vybe.test'
WHERE real.event_id = 'd26f7152-9583-4a95-a7e4-d28cfbf09538'
  AND ('x' || substr(md5(seed.profile_id::text || real.profile_id::text), 1, 2))::bit(8)::int % 2 = 0
  AND NOT EXISTS (
      SELECT 1 FROM public.swipes x WHERE x.swiper_id = seed.profile_id AND x.swiped_id = real.profile_id
  );

-- 4 ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_ended_event_likes(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_borrados INTEGER;
BEGIN
    -- Los totales, antes de que el borrado los cambie (una vez por fiesta).
    INSERT INTO public.event_swipe_totals (event_id, swipes, swipers)
    SELECT e.id,
           (SELECT COUNT(*) FROM public.swipes s2 WHERE s2.event_id = e.id),
           (SELECT COUNT(DISTINCT s2.swiper_id) FROM public.swipes s2 WHERE s2.event_id = e.id)
    FROM public.events e
    WHERE e.end_date <= NOW()
      AND NOT COALESCE(e.test_lab, FALSE)
      AND EXISTS (SELECT 1 FROM public.swipes s WHERE s.event_id = e.id AND s.swipe_type IN ('like', 'super_like'))
      AND NOT EXISTS (SELECT 1 FROM public.event_swipe_totals t WHERE t.event_id = e.id)
    ON CONFLICT (event_id) DO NOTHING;

    WITH borrar AS (
        SELECT s.id
        FROM public.swipes s
        JOIN public.events e ON e.id = s.event_id
        WHERE e.end_date <= NOW()
          -- Las salas de pruebas (099): sus me gusta son el decorado.
          AND NOT COALESCE(e.test_lab, FALSE)
          AND s.swipe_type IN ('like', 'super_like')
          AND NOT EXISTS (
              SELECT 1 FROM public.connections c
              WHERE (c.user_id_1 = s.swiper_id AND c.user_id_2 = s.swiped_id)
                 OR (c.user_id_1 = s.swiped_id AND c.user_id_2 = s.swiper_id)
          )
        LIMIT GREATEST(COALESCE(p_limit, 5000), 1)
    )
    DELETE FROM public.swipes s USING borrar b WHERE s.id = b.id;

    GET DIAGNOSTICS v_borrados = ROW_COUNT;
    RETURN v_borrados;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_ended_event_likes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_ended_event_likes(integer) TO service_role;

-- 5 ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.keep_test_lab_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    -- El formulario de editar fiestas pone el fin el mismo día del inicio: en
    -- una sala de pruebas que dura años, eso la cerraría sin querer.
    IF COALESCE(OLD.test_lab, FALSE) AND COALESCE(NEW.test_lab, FALSE)
       AND NEW.end_date < NOW() AND OLD.end_date >= NOW() THEN
        NEW.end_date := OLD.end_date;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS events_keep_test_lab_open ON public.events;
CREATE TRIGGER events_keep_test_lab_open
    BEFORE UPDATE OF end_date ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.keep_test_lab_open();
