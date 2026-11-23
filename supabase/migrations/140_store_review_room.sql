-- ============================================================================
-- 140 · Sala de revisión para Apple y Google, invisible para el público
-- ============================================================================
-- El 23-11-2026, al salir Fiestea en las dos tiendas, se borraron Aurora
-- Sessions, «Sala Aurora» y toda la gente de prueba (tools/limpiar-pruebas). Pero
-- cada actualización la revisa una persona de Apple o Google con las cuentas
-- revision.apple@fiestea.es (fiester@) y revision.negocio@fiestea.es (negocio),
-- y tiene que poder entrar en una fiesta, deslizar y ver Crushes. El usuario no
-- quiere que nadie de verdad vea gente falsa, así que:
--
--   1. La sala («Fiestea Review Room») es de revision.negocio y está SIN
--      verificar (verification_status 'rejected', para que tampoco salga en
--      las altas pendientes de administración). Las reglas de siempre ya
--      esconden a todo el mundo los negocios sin verificar y sus fiestas: la
--      lista, el mapa, el buscador, la ficha pública y el perfil del negocio.
--   2. Sólo las dos cuentas de revisión (is_store_reviewer) ven esa sala y su
--      fiesta, con dos políticas nuevas; el dueño ya veía lo suyo.
--   3. La fiesta, «Review Night», es sala de pruebas (test_lab, sin ubicación,
--      hasta 2030) y se entra con el código 583920.
--   4. Doce personas de demostración (@seed.vybe.test, el dominio que ya
--      reconocen get_nearby_profiles y test_lab_welcome_likes) sólo están en
--      esa fiesta: nadie más puede verlas porque nadie más puede entrar.
--   5. revision.apple está dentro, con 5 matches con mensajes; al entrar recibe
--      los likes de bienvenida de la sala de pruebas.
--   6. search_known_places (139) deja fuera las fiestas de negocios sin
--      verificar (si no, «Fiestea Review Room» saldría al crear una fiesta).
-- ============================================================================

-- 2 ----------------------------------------------------------------- permisos
CREATE OR REPLACE FUNCTION public.is_store_reviewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(EXISTS (
        SELECT 1 FROM auth.users u
         WHERE u.id = auth.uid()
           AND u.email IN ('revision.apple@fiestea.es', 'revision.negocio@fiestea.es')
    ), FALSE);
$$;
REVOKE ALL ON FUNCTION public.is_store_reviewer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_store_reviewer() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_store_reviewer() TO authenticated;

DO $$
DECLARE
    v_negocio UUID;
    v_apple UUID;
    v_apple_profile UUID;
    v_venue UUID := 'b7e1a4c0-1400-4e40-9a40-000000000140';
    v_event UUID := 'b7e1a4c0-1400-4e40-9a40-000000000141';
    v_user UUID;
    v_profile UUID;
    i INT;
    -- nombre, edad, género, foto (pravatar.cc, como el seed de siempre)
    v_gente TEXT[][] := ARRAY[
        ['Lucía', '24', 'woman', '5'], ['Marta', '27', 'woman', '9'], ['Aina', '23', 'woman', '10'],
        ['Carla', '29', 'woman', '16'], ['Alba', '25', 'woman', '20'], ['Paula', '31', 'woman', '23'],
        ['Marc', '26', 'man', '12'], ['Pablo', '28', 'man', '13'], ['Biel', '24', 'man', '14'],
        ['Hugo', '30', 'man', '15'], ['Joan', '27', 'man', '33'], ['Álex', '25', 'man', '52']
    ];
    v_perfiles UUID[] := ARRAY[]::UUID[];
    v_mensajes TEXT[] := ARRAY[
        '¡Hola! ¿Qué tal la noche?',
        'Me ha encantado la sesión del DJ 🔥',
        '¿Vienes a la barra de arriba?',
        'Jaja, te he visto bailando 😄',
        '¿Te apetece salir a la terraza?'
    ];
BEGIN
    SELECT id INTO v_negocio FROM auth.users WHERE email = 'revision.negocio@fiestea.es';
    SELECT id INTO v_apple FROM auth.users WHERE email = 'revision.apple@fiestea.es';
    SELECT id INTO v_apple_profile FROM public.profiles WHERE user_id = v_apple;
    IF v_negocio IS NULL OR v_apple_profile IS NULL THEN
        RAISE EXCEPTION 'Faltan las cuentas de revisión';
    END IF;

    -- 1 ----------------------------------------------------------- la sala
    INSERT INTO public.venues (id, venue_id, name, email, type, city, address, description, is_verified, verification_status)
    VALUES (v_venue, v_negocio, 'Fiestea Review Room', 'revision.negocio@fiestea.es', 'discoteca', 'Palma',
            'Passeig Marítim, Palma', 'Demo venue for the App Store and Google Play review. Not visible to the public.',
            FALSE, 'rejected')
    ON CONFLICT (id) DO NOTHING;

    -- Plan Business para que el panel de la demo tenga todo.
    INSERT INTO public.venue_subscriptions (venue_id, plan, status, started_at, expires_at)
    SELECT v_venue, 'business', 'active', NOW(), TIMESTAMPTZ '2030-12-31 23:00:00+00'
    WHERE NOT EXISTS (SELECT 1 FROM public.venue_subscriptions WHERE venue_id = v_venue);

    -- 3 --------------------------------------------------------- la fiesta
    INSERT INTO public.events (id, venue_id, name, description, start_date, end_date, place_name, city,
                               requires_location, test_lab, entry_enabled, swipe_enabled, place_type, theme)
    VALUES (v_event, v_venue, 'Review Night', 'Private test party for the store review.',
            NOW() - INTERVAL '1 hour', TIMESTAMPTZ '2030-12-31 23:00:00+00', 'Fiestea Review Room', 'Palma',
            FALSE, TRUE, TRUE, TRUE, 'discoteca', 'House')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.event_codes (venue_id, event_id, code, expires_at, label)
    SELECT v_venue, v_event, '583920', TIMESTAMPTZ '2030-12-31 23:00:00+00', 'Store review'
    WHERE NOT EXISTS (SELECT 1 FROM public.event_codes WHERE event_id = v_event AND code = '583920');

    -- 4 ------------------------------------------- personas de demostración
    FOR i IN 1 .. array_length(v_gente, 1) LOOP
        v_user := gen_random_uuid();
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                                raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                'review-' || i || '@seed.vybe.test', crypt(gen_random_uuid()::TEXT, gen_salt('bf')), NOW(),
                '{"provider":"email","providers":["email"]}', jsonb_build_object('name', v_gente[i][1]), NOW(), NOW());

        SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_user;
        IF v_profile IS NULL THEN
            INSERT INTO public.profiles (user_id, name, age, email)
            VALUES (v_user, v_gente[i][1], v_gente[i][2]::INT, 'review-' || i || '@seed.vybe.test')
            RETURNING id INTO v_profile;
        END IF;

        UPDATE public.profiles
           SET name = v_gente[i][1], age = v_gente[i][2]::INT, gender = v_gente[i][3], wants = 'all',
               email = 'review-' || i || '@seed.vybe.test', account_type = 'vyber', is_verified = TRUE,
               face_verified = TRUE, status = 'active', bio = 'Demo profile for the store review',
               plan_tonight = 'Conocer gente', profile_completed_at = NOW(),
               photos = ARRAY['https://i.pravatar.cc/600?img=' || v_gente[i][4]],
               avatar = 'https://i.pravatar.cc/600?img=' || v_gente[i][4]
         WHERE id = v_profile;

        INSERT INTO public.event_attendance (event_id, profile_id, checked_in_at, last_seen_at, photo_url, photo_taken_at)
        VALUES (v_event, v_profile, NOW(), TIMESTAMPTZ '2030-12-31 23:00:00+00',
                'https://i.pravatar.cc/600?img=' || v_gente[i][4], NOW());

        v_perfiles := v_perfiles || v_profile;
    END LOOP;

    -- 5 ------------------------------------- la cuenta de Apple, dentro
    DELETE FROM public.event_attendance WHERE event_id = v_event AND profile_id = v_apple_profile;
    INSERT INTO public.event_attendance (event_id, profile_id, checked_in_at, last_seen_at, photo_url, photo_taken_at)
    SELECT v_event, p.id, NOW(), TIMESTAMPTZ '2030-12-31 23:00:00+00', p.avatar, NOW()
      FROM public.profiles p WHERE p.id = v_apple_profile;

    -- 5 matches (las cinco primeras) con un mensaje de cada una y respuesta.
    FOR i IN 1 .. 5 LOOP
        INSERT INTO public.swipes (swiper_id, swiped_id, swipe_type, event_id)
        VALUES (v_perfiles[i], v_apple_profile, 'like', v_event), (v_apple_profile, v_perfiles[i], 'like', v_event)
        ON CONFLICT DO NOTHING;
        -- El like mutuo ya crea el match; si no, se crea. Su chat no caduca.
        INSERT INTO public.connections (user_id_1, user_id_2, event_id, expires_at)
        VALUES (v_perfiles[i], v_apple_profile, v_event, TIMESTAMPTZ '2030-12-31 23:00:00+00')
        ON CONFLICT DO NOTHING;
        UPDATE public.connections
           SET expires_at = TIMESTAMPTZ '2030-12-31 23:00:00+00', event_id = v_event
         WHERE LEAST(user_id_1, user_id_2) = LEAST(v_perfiles[i], v_apple_profile)
           AND GREATEST(user_id_1, user_id_2) = GREATEST(v_perfiles[i], v_apple_profile);
        INSERT INTO public.messages (sender_id, receiver_id, content, created_at)
        VALUES (v_perfiles[i], v_apple_profile, v_mensajes[i], NOW() - INTERVAL '20 minutes'),
               (v_apple_profile, v_perfiles[i], '¡Hola! 😊', NOW() - INTERVAL '10 minutes');
    END LOOP;
END $$;

-- 2 (políticas) -------------------------------------------------------------
DROP POLICY IF EXISTS "Store reviewers can view the review room" ON public.venues;
CREATE POLICY "Store reviewers can view the review room" ON public.venues
    FOR SELECT TO authenticated
    USING (id = 'b7e1a4c0-1400-4e40-9a40-000000000140' AND public.is_store_reviewer());

DROP POLICY IF EXISTS "Store reviewers can view the review party" ON public.events;
CREATE POLICY "Store reviewers can view the review party" ON public.events
    FOR SELECT TO authenticated
    USING (venue_id = 'b7e1a4c0-1400-4e40-9a40-000000000140' AND public.is_store_reviewer());

-- 6 ----------------------------------------------------------------------------
-- search_known_places (139): sólo salas de fiestas de negocios verificados o de
-- la plataforma.
CREATE OR REPLACE FUNCTION public.search_known_places(p_query TEXT)
RETURNS TABLE (
    place_name TEXT,
    address TEXT,
    city TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    events INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_q TEXT := public.venue_search_key(p_query);
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE(
        public.is_admin() OR EXISTS (SELECT 1 FROM public.venues v WHERE v.venue_id = auth.uid()),
        FALSE
    ) THEN
        RETURN;
    END IF;
    IF length(v_q) < 2 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH f AS (
        SELECT e.place_name, e.address, e.city, e.latitude, e.longitude,
               public.venue_search_key(e.place_name) AS k
          FROM public.events e
          JOIN public.venues ve ON ve.id = e.venue_id AND (ve.is_verified OR ve.is_platform)
         WHERE e.place_name IS NOT NULL
           AND e.latitude IS NOT NULL
           AND e.longitude IS NOT NULL
           AND public.venue_search_key(e.place_name) LIKE '%' || v_q || '%'
    ),
    punto AS (
        SELECT k,
               mode() WITHIN GROUP (ORDER BY f.latitude::TEXT || ',' || f.longitude::TEXT) AS p,
               mode() WITHIN GROUP (ORDER BY f.place_name) AS nombre,
               mode() WITHIN GROUP (ORDER BY f.address) AS dir,
               mode() WITHIN GROUP (ORDER BY f.city) AS ciudad,
               COUNT(*)::INTEGER AS n,
               bool_or(f.k LIKE v_q || '%') AS empieza
          FROM f
         GROUP BY k
    )
    SELECT punto.nombre::TEXT, punto.dir::TEXT, punto.ciudad::TEXT,
           split_part(punto.p, ',', 1)::DOUBLE PRECISION,
           split_part(punto.p, ',', 2)::DOUBLE PRECISION,
           punto.n
      FROM punto
     ORDER BY punto.empieza DESC, punto.n DESC
     LIMIT 6;
END;
$$;
REVOKE ALL ON FUNCTION public.search_known_places(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_known_places(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_known_places(TEXT) TO authenticated;
