-- =============================================================================
-- Borra los datos de prueba de Mallorca (mallorca_test_data.sql)
-- =============================================================================
-- Todo lo que creó el seed cuelga de cuentas `@seed.vybe.test`: las 50
-- personas, los 19 locales reales y la sala de pruebas. Al borrar esas cuentas
-- de auth.users caen en cascada sus perfiles, locales, eventos, códigos,
-- asistencias, fotos, intereses, likes, matches y mensajes.
--
-- Lo único que no cae en cascada son los swipes de cuentas reales sobre esas
-- fiestas (event_id pasaría a NULL), así que se borran antes.
--
--   node scripts/run-sql.mjs supabase/seeds/mallorca_test_data_cleanup.sql
-- =============================================================================

DELETE FROM public.swipes s
USING public.events e, public.venues v
WHERE s.event_id = e.id
  AND e.venue_id = v.id
  AND v.email LIKE '%@seed.vybe.test';

DELETE FROM auth.users WHERE email LIKE '%@seed.vybe.test';

SELECT json_build_object(
  'cuentas_seed', (SELECT COUNT(*) FROM auth.users WHERE email LIKE '%@seed.vybe.test'),
  'locales_seed', (SELECT COUNT(*) FROM public.venues WHERE email LIKE '%@seed.vybe.test'),
  'codigo_LAB777', (SELECT COUNT(*) FROM public.event_codes WHERE code = 'LAB777')
) AS resultado;
