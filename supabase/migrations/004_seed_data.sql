-- ============================================================================
-- Vybe App - Datos de prueba
--
-- Ejecutar DESPUÉS de 005_create_test_users.sql.
--
-- El trigger handle_new_user() ya crea el perfil o el venue en cuanto nace la
-- cuenta, así que este script no los inserta: los enriquece con ON CONFLICT
-- DO UPDATE. La versión anterior usaba `NOT EXISTS`, de modo que con el trigger
-- activo no llegaba a aplicar nunca las fotos, ubicaciones ni verificaciones.
--
-- Todos los eventos se crean con fechas relativas a NOW(), así que el seed
-- nunca queda caducado.
-- ============================================================================

-- ============================================================================
-- PERFILES
-- ============================================================================

INSERT INTO public.profiles (user_id, name, email, age, bio, photos, avatar,
                             latitude, longitude, is_verified, phone_verified, face_verified)
SELECT
    u.id,
    d.name,
    u.email,
    d.age,
    d.bio,
    ARRAY[d.photo],
    d.photo,
    d.latitude,
    d.longitude,
    TRUE,
    TRUE,
    TRUE
FROM auth.users u
JOIN (VALUES
    ('usuario1@test.com', 'María García',  25, 'Amante de la música electrónica y los cócteles creativos', 'https://i.pravatar.cc/300?img=1',  39.5696, 2.6502),
    ('usuario2@test.com', 'Juan Pérez',    28, 'DJ ocasional, siempre buscando la mejor fiesta de la isla',  'https://i.pravatar.cc/300?img=11', 39.5697, 2.6503),
    ('usuario3@test.com', 'Ana Martínez',  23, 'La pista de baile es mi hogar',                              'https://i.pravatar.cc/300?img=5',  39.5695, 2.6501),
    ('usuario4@test.com', 'Carlos López',  30, 'Organizador de eventos. Siempre con buena vibra',            'https://i.pravatar.cc/300?img=13', 39.5698, 2.6504)
) AS d(email, name, age, bio, photo, latitude, longitude) ON d.email = u.email
ON CONFLICT (user_id) DO UPDATE SET
    name           = EXCLUDED.name,
    email          = EXCLUDED.email,
    age            = EXCLUDED.age,
    bio            = EXCLUDED.bio,
    photos         = EXCLUDED.photos,
    avatar         = EXCLUDED.avatar,
    latitude       = EXCLUDED.latitude,
    longitude      = EXCLUDED.longitude,
    is_verified    = TRUE,
    phone_verified = TRUE,
    face_verified  = TRUE;

-- ============================================================================
-- VENUES
-- ============================================================================

INSERT INTO public.venues (venue_id, name, email, type, latitude, longitude,
                           event_radius, is_verified, verification_status)
SELECT
    u.id,
    d.name,
    u.email,
    d.type,
    d.latitude,
    d.longitude,
    d.radius,
    TRUE,
    'approved'
FROM auth.users u
JOIN (VALUES
    ('discoteca@test.com', 'Discoteca Pacha',   'discoteca', 39.5696, 2.6502, 100),
    ('bar@test.com',       'Bar La Terraza',    'bar',       39.5612, 2.6411,  50),
    ('festival@test.com',  'Festival Mallorca', 'festival',  39.5307, 2.7338, 500)
) AS d(email, name, type, latitude, longitude, radius) ON d.email = u.email
ON CONFLICT (venue_id) DO UPDATE SET
    name                = EXCLUDED.name,
    email               = EXCLUDED.email,
    type                = EXCLUDED.type,
    latitude            = EXCLUDED.latitude,
    longitude           = EXCLUDED.longitude,
    event_radius        = EXCLUDED.event_radius,
    is_verified         = TRUE,
    verification_status = 'approved';

-- ============================================================================
-- EVENTOS
-- Fechas relativas a NOW(): el primero está ya en curso para poder probar el
-- acceso por QR sin tocar nada.
-- ============================================================================

INSERT INTO public.events (venue_id, name, description, start_date, end_date,
                           latitude, longitude, theme, dress_code, min_age, price, max_capacity)
SELECT
    v.id,
    d.name,
    d.description,
    NOW() + (d.starts_in_hours || ' hours')::interval,
    NOW() + (d.ends_in_hours   || ' hours')::interval,
    v.latitude,
    v.longitude,
    d.theme,
    d.dress_code,
    d.min_age,
    d.price,
    d.capacity
FROM public.venues v
JOIN (VALUES
    ('discoteca@test.com', 'Noche Techno',        'Los mejores DJs de techno de la isla',      -1,  6, 'Techno',      'Casual',           18, 20.00, 400),
    ('discoteca@test.com', 'Fiesta Ibicenca',     'Todo blanco, como manda la tradición',      23, 30, 'House',       'Todo blanco',      21, 25.00, 400),
    ('bar@test.com',       'Afterwork Cocktails', 'Cócteles de autor y buena conversación',    -1,  4, 'Chill',       'Casual elegante',  18, 10.00, 80),
    ('bar@test.com',       'Noche de Jazz',       'Jazz en directo en la terraza',             47, 52, 'Jazz',        'Elegante',         18, 15.00, 80),
    ('festival@test.com',  'Mallorca Live Day 1', 'Primera jornada del festival',              71, 82, 'Indie/Rock',  'Libre',            18, 45.00, 5000),
    ('festival@test.com',  'Mallorca Live Day 2', 'Segunda jornada del festival',              95, 106, 'Electrónica','Libre',            18, 45.00, 5000)
) AS d(venue_email, name, description, starts_in_hours, ends_in_hours, theme, dress_code, min_age, price, capacity)
  ON d.venue_email = v.email
WHERE NOT EXISTS (
    SELECT 1 FROM public.events e WHERE e.venue_id = v.id AND e.name = d.name
);

-- ============================================================================
-- CÓDIGOS DE ACCESO
-- Un código por evento en curso, para poder probar el flujo completo.
-- Los usuarios ya no pueden leer esta tabla: se canjean con redeem_event_code().
-- ============================================================================

INSERT INTO public.event_codes (venue_id, event_id, code, expires_at, active)
SELECT
    e.venue_id,
    e.id,
    d.code,
    e.end_date,
    TRUE
FROM public.events e
JOIN (VALUES
    ('Noche Techno',        '100001'),
    ('Afterwork Cocktails', '100002')
) AS d(event_name, code) ON d.event_name = e.name
WHERE e.end_date > NOW()
  AND NOT EXISTS (SELECT 1 FROM public.event_codes c WHERE c.code = d.code);

-- ============================================================================
-- COMPROBACIONES
-- ============================================================================
-- SELECT name, age, is_verified FROM public.profiles ORDER BY name;
-- SELECT name, type, is_verified, verification_status FROM public.venues ORDER BY name;
-- SELECT e.name, e.start_date, e.end_date, v.name AS venue
--   FROM public.events e JOIN public.venues v ON v.id = e.venue_id
--  ORDER BY e.start_date;
-- SELECT c.code, e.name FROM public.event_codes c JOIN public.events e ON e.id = c.event_id;
