-- =============================================================================
-- Renombra a «Vybe» los datos de prueba de Mallorca ya cargados
-- =============================================================================
-- Sólo hace falta una vez, en una base de datos donde se cargó
-- mallorca_test_data.sql cuando la marca era «Vybes». Un seed cargado de nuevo
-- ya sale con los nombres buenos.
--
--   · correos `@seed.vybes.test`  →  `@seed.vybe.test` (cuenta, identidad,
--     perfil y local)
--   · «Vybes · Sala de pruebas» y «Vybes Test Night» →  «Vybe …»
--
-- Va con la migración 036, que hace que admin_reset_test_lab() busque la sala
-- por el correo nuevo. Se puede ejecutar dos veces sin efecto.
--
--   node scripts/run-sql.mjs supabase/seeds/rename_seed_to_vybe.sql
-- =============================================================================

UPDATE auth.users
SET email = replace(email, '@seed.vybes.test', '@seed.vybe.test'),
    raw_user_meta_data = CASE
        WHEN raw_user_meta_data->>'venue_name' LIKE 'Vybes %'
            THEN jsonb_set(raw_user_meta_data, '{venue_name}',
                           to_jsonb(replace(raw_user_meta_data->>'venue_name', 'Vybes ', 'Vybe ')))
        ELSE raw_user_meta_data
    END,
    updated_at = NOW()
WHERE email LIKE '%@seed.vybes.test';

UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}',
        to_jsonb(replace(identity_data->>'email', '@seed.vybes.test', '@seed.vybe.test'))),
    updated_at = NOW()
WHERE identity_data->>'email' LIKE '%@seed.vybes.test';

UPDATE public.profiles
SET email = replace(email, '@seed.vybes.test', '@seed.vybe.test')
WHERE email LIKE '%@seed.vybes.test';

UPDATE public.venues
SET email = replace(email, '@seed.vybes.test', '@seed.vybe.test'),
    name = replace(name, 'Vybes · ', 'Vybe · ')
WHERE email LIKE '%@seed.vybes.test';

UPDATE public.events e
SET name = 'Vybe Test Night'
FROM public.venues v
WHERE v.id = e.venue_id
  AND v.email = 'sala-pruebas@seed.vybe.test'
  AND e.name = 'Vybes Test Night';

SELECT json_build_object(
    'cuentas_nuevas', (SELECT COUNT(*) FROM auth.users WHERE email LIKE '%@seed.vybe.test'),
    'cuentas_viejas', (SELECT COUNT(*) FROM auth.users WHERE email LIKE '%@seed.vybes.test'),
    'identidades_nuevas', (SELECT COUNT(*) FROM auth.identities WHERE identity_data->>'email' LIKE '%@seed.vybe.test'),
    'perfiles_nuevos', (SELECT COUNT(*) FROM public.profiles WHERE email LIKE '%@seed.vybe.test'),
    'locales_nuevos', (SELECT COUNT(*) FROM public.venues WHERE email LIKE '%@seed.vybe.test'),
    'sala', (SELECT name FROM public.venues WHERE email = 'sala-pruebas@seed.vybe.test'),
    'fiesta', (SELECT e.name FROM public.events e JOIN public.venues v ON v.id = e.venue_id
               WHERE v.email = 'sala-pruebas@seed.vybe.test' LIMIT 1)
) AS resultado;
