-- ============================================================================
-- Vybe App - Usuarios de prueba en auth.users
--
-- Ejecutar ANTES de 004_seed_data.sql.
--
-- Cambios respecto a la versión anterior:
--   * Los metadatos incluyen `account_type`, que es lo que usa el trigger
--     handle_new_user() para decidir si crear un perfil o un venue. Sin él,
--     las cuentas de local se daban de alta como usuarios normales.
--   * Se crea también la fila en auth.identities. GoTrue la exige para el
--     proveedor de email; sin ella el login con contraseña puede fallar.
--   * Un único bucle en vez de siete bloques repetidos.
--
-- ⚠️ Sólo para desarrollo: nunca ejecutes este script contra producción.
--    La contraseña no viene escrita: cambia `CAMBIA_ESTA_CONTRASEÑA` antes de
--    ejecutarlo y guárdala fuera del repositorio (`info.txt` está en
--    .gitignore). Si se deja tal cual, el script se niega a crear las cuentas.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_instance_id UUID;
    v_user_id UUID;
    v_password TEXT := 'CAMBIA_ESTA_CONTRASEÑA';
    account RECORD;
BEGIN
    IF v_password = 'CAMBIA_ESTA_CONTRASEÑA' OR length(v_password) < 8 THEN
        RAISE EXCEPTION 'Pon una contraseña propia en v_password antes de ejecutar 005_create_test_users.sql';
    END IF;

    SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
    v_instance_id := COALESCE(v_instance_id, '00000000-0000-0000-0000-000000000000'::uuid);

    FOR account IN
        SELECT * FROM (VALUES
            ('usuario1@test.com',  '{"account_type":"user","name":"María García","age":25}'::jsonb),
            ('usuario2@test.com',  '{"account_type":"user","name":"Juan Pérez","age":28}'::jsonb),
            ('usuario3@test.com',  '{"account_type":"user","name":"Ana Martínez","age":23}'::jsonb),
            ('usuario4@test.com',  '{"account_type":"user","name":"Carlos López","age":30}'::jsonb),
            ('admin@vybe.com',     '{"account_type":"user","name":"Administración Vybe","age":30}'::jsonb),
            ('discoteca@test.com', '{"account_type":"venue","venue_name":"Discoteca Pacha","venue_type":"discoteca","phone":"+34600000001"}'::jsonb),
            ('bar@test.com',       '{"account_type":"venue","venue_name":"Bar La Terraza","venue_type":"bar","phone":"+34600000002"}'::jsonb),
            ('festival@test.com',  '{"account_type":"venue","venue_name":"Festival Mallorca","venue_type":"festival","phone":"+34600000003"}'::jsonb)
        ) AS t(email, meta)
    LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.email = account.email);

        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data,
            is_super_admin, confirmation_token, recovery_token
        ) VALUES (
            v_instance_id, v_user_id, 'authenticated', 'authenticated',
            account.email, crypt(v_password, gen_salt('bf')),
            NOW(), NOW(), NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb, account.meta,
            FALSE, '', ''
        );

        -- Necesario para que el login por email/contraseña funcione.
        -- La columna provider_id sólo existe en versiones recientes de GoTrue,
        -- así que se contempla también el esquema antiguo.
        BEGIN
            INSERT INTO auth.identities (
                provider_id, user_id, identity_data, provider,
                last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_user_id::text, v_user_id,
                jsonb_build_object('sub', v_user_id::text, 'email', account.email, 'email_verified', true),
                'email', NOW(), NOW(), NOW()
            )
            ON CONFLICT DO NOTHING;
        EXCEPTION WHEN undefined_column THEN
            INSERT INTO auth.identities (
                id, user_id, identity_data, provider,
                last_sign_in_at, created_at, updated_at
            ) VALUES (
                v_user_id::text, v_user_id,
                jsonb_build_object('sub', v_user_id::text, 'email', account.email, 'email_verified', true),
                'email', NOW(), NOW(), NOW()
            )
            ON CONFLICT DO NOTHING;
        END;
    END LOOP;
END $$;

-- El panel de administración se abre por rol, no por email hardcodeado.
UPDATE public.profiles p
SET role = 'admin'
FROM auth.users u
WHERE p.user_id = u.id AND u.email = 'admin@vybe.com';

-- Comprobación:
--   SELECT u.email, p.id IS NOT NULL AS tiene_perfil, v.id IS NOT NULL AS tiene_venue
--   FROM auth.users u
--   LEFT JOIN public.profiles p ON p.user_id = u.id
--   LEFT JOIN public.venues   v ON v.venue_id = u.id
--   WHERE u.email LIKE '%@test.com' OR u.email = 'admin@vybe.com';
