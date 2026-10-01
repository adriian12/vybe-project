-- ============================================
-- Vybe App - Esquema de Base de Datos Completo
-- ============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- PostGIS no es necesario si usamos columnas separadas de lat/lng

-- ============================================
-- ELIMINAR TABLAS EXISTENTES (si es necesario)
-- ============================================
-- Descomenta las siguientes líneas si necesitas recrear las tablas desde cero
-- DROP TABLE IF EXISTS public.event_stats CASCADE;
-- DROP TABLE IF EXISTS public.premium_subscriptions CASCADE;
-- DROP TABLE IF EXISTS public.verification_codes CASCADE;
-- DROP TABLE IF EXISTS public.blocks CASCADE;
-- DROP TABLE IF EXISTS public.reports CASCADE;
-- DROP TABLE IF EXISTS public.swipes CASCADE;
-- DROP TABLE IF EXISTS public.messages CASCADE;
-- DROP TABLE IF EXISTS public.connections CASCADE;
-- DROP TABLE IF EXISTS public.event_codes CASCADE;
-- DROP TABLE IF EXISTS public.events CASCADE;
-- DROP TABLE IF EXISTS public.venues CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================
-- TABLAS PRINCIPALES
-- ============================================

-- Tabla de perfiles de usuarios
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 18 AND age <= 100),
    bio TEXT,
    photos TEXT[] DEFAULT '{}',
    avatar TEXT,
    phone TEXT,
    phone_verified BOOLEAN DEFAULT FALSE,
    face_verified BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Tabla de venues (locales/empresas)
CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('discoteca', 'bar', 'festival', 'fiesta_privada', 'evento_empresarial', 'local')),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    event_radius INTEGER DEFAULT 50 CHECK (event_radius > 0),
    is_verified BOOLEAN DEFAULT FALSE,
    documents TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(venue_id)
);

-- Tabla de eventos
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    theme TEXT,
    dress_code TEXT,
    min_age INTEGER CHECK (min_age >= 18),
    max_age INTEGER CHECK (max_age IS NULL OR max_age >= min_age),
    price DECIMAL(10, 2),
    booking_url TEXT,
    qr_code TEXT,
    max_capacity INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_date > start_date)
);

-- Tabla de códigos de eventos
CREATE TABLE IF NOT EXISTS public.event_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(code)
);

-- Tabla de conexiones/matches
CREATE TABLE IF NOT EXISTS public.connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    connection_type TEXT NOT NULL DEFAULT 'match' CHECK (connection_type IN ('vybe_check', 'match')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (user_id_1 != user_id_2),
    UNIQUE(user_id_1, user_id_2)
);

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (sender_id != receiver_id)
);

-- Tabla de swipes (historial de likes/dislikes)
CREATE TABLE IF NOT EXISTS public.swipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    swiper_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    swiped_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    swipe_type TEXT NOT NULL CHECK (swipe_type IN ('like', 'dislike', 'super_like')),
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (swiper_id != swiped_id),
    UNIQUE(swiper_id, swiped_id, event_id)
);

-- Tabla de reportes
-- Eliminar tabla si existe para evitar conflictos con estructura anterior
DROP TABLE IF EXISTS public.reports CASCADE;
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL CHECK (report_type IN ('inappropriate_content', 'harassment', 'fake_profile', 'spam', 'other')),
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    CHECK (reporter_id != reported_id)
);

-- Tabla de bloqueos
CREATE TABLE IF NOT EXISTS public.blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (blocker_id != blocked_id),
    UNIQUE(blocker_id, blocked_id)
);

-- Tabla de códigos de verificación
CREATE TABLE IF NOT EXISTS public.verification_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_type TEXT NOT NULL CHECK (user_type IN ('user', 'venue')),
    code TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Tabla de suscripciones premium
CREATE TABLE IF NOT EXISTS public.premium_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription_type TEXT NOT NULL CHECK (subscription_type IN ('monthly', 'event', 'lifetime')),
    event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE(user_id, event_id, subscription_type)
);

-- Tabla de estadísticas de eventos (para venues)
CREATE TABLE IF NOT EXISTS public.event_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
    scans_count INTEGER DEFAULT 0,
    active_users_count INTEGER DEFAULT 0,
    matches_count INTEGER DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, recorded_at)
);

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================

-- Índices para profiles
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_verified ON public.profiles(is_verified);

-- Índices para venues
CREATE INDEX IF NOT EXISTS idx_venues_venue_id ON public.venues(venue_id);
CREATE INDEX IF NOT EXISTS idx_venues_location ON public.venues(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_type ON public.venues(type);

-- Índices para events
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON public.events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_dates ON public.events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_location ON public.events(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Índices para connections
CREATE INDEX IF NOT EXISTS idx_connections_user_1 ON public.connections(user_id_1);
CREATE INDEX IF NOT EXISTS idx_connections_user_2 ON public.connections(user_id_2);
CREATE INDEX IF NOT EXISTS idx_connections_created ON public.connections(created_at DESC);

-- Índices para messages
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(receiver_id, read) WHERE read = FALSE;

-- Índices para swipes
CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON public.swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_swipes_swiped ON public.swipes(swiped_id);
CREATE INDEX IF NOT EXISTS idx_swipes_event ON public.swipes(event_id);
CREATE INDEX IF NOT EXISTS idx_swipes_type ON public.swipes(swipe_type);

-- Índices para reports
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);

-- Índices para blocks
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);

-- Índices para event_codes
CREATE INDEX IF NOT EXISTS idx_event_codes_code ON public.event_codes(code);
CREATE INDEX IF NOT EXISTS idx_event_codes_venue ON public.event_codes(venue_id);
CREATE INDEX IF NOT EXISTS idx_event_codes_active ON public.event_codes(active) WHERE active = TRUE;

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON public.venues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para crear perfil automáticamente cuando se crea un usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- El perfil se creará manualmente desde la aplicación
    -- Esta función está aquí por si se necesita en el futuro
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para verificar match automático
CREATE OR REPLACE FUNCTION public.check_match()
RETURNS TRIGGER AS $$
DECLARE
    reverse_swipe RECORD;
BEGIN
    -- Verificar si existe un swipe inverso (match)
    SELECT * INTO reverse_swipe
    FROM public.swipes
    WHERE swiper_id = NEW.swiped_id
      AND swiped_id = NEW.swiper_id
      AND swipe_type IN ('like', 'super_like')
      AND (NEW.event_id IS NULL OR event_id = NEW.event_id);
    
    -- Si hay match, crear conexión
    IF FOUND AND reverse_swipe.swipe_type IN ('like', 'super_like') THEN
        INSERT INTO public.connections (user_id_1, user_id_2, connection_type)
        VALUES (
            LEAST(NEW.swiper_id, NEW.swiped_id),
            GREATEST(NEW.swiper_id, NEW.swiped_id),
            CASE WHEN NEW.swipe_type = 'super_like' OR reverse_swipe.swipe_type = 'super_like' 
                 THEN 'vybe_check' 
                 ELSE 'match' 
            END
        )
        ON CONFLICT (user_id_1, user_id_2) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para verificar matches automáticamente
CREATE TRIGGER check_match_on_swipe
    AFTER INSERT ON public.swipes
    FOR EACH ROW
    WHEN (NEW.swipe_type IN ('like', 'super_like'))
    EXECUTE FUNCTION public.check_match();

-- Función para obtener perfiles cercanos usando fórmula de Haversine
CREATE OR REPLACE FUNCTION public.get_nearby_profiles(
    p_user_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_radius_meters INTEGER DEFAULT 5000,
    p_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    age INTEGER,
    bio TEXT,
    photos TEXT[],
    avatar TEXT,
    distance_meters DOUBLE PRECISION,
    is_verified BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH nearby AS (
        SELECT 
            p.id,
            p.name,
            p.age,
            p.bio,
            p.photos,
            p.avatar,
            p.is_verified,
            -- Fórmula de Haversine para calcular distancia
            (
                6371000 * acos(
                    cos(radians(p_latitude)) *
                    cos(radians(p.latitude)) *
                    cos(radians(p.longitude) - radians(p_longitude)) +
                    sin(radians(p_latitude)) *
                    sin(radians(p.latitude))
                )
            ) AS distance_meters
        FROM public.profiles p
        WHERE p.id != p_user_id
          AND p.latitude IS NOT NULL
          AND p.longitude IS NOT NULL
          AND p.is_verified = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM public.blocks b
              WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
                 OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.swipes s
              WHERE s.swiper_id = p_user_id 
                AND s.swiped_id = p.id
                AND (p_event_id IS NULL OR s.event_id = p_event_id)
          )
    )
    SELECT 
        nearby.id,
        nearby.name,
        nearby.age,
        nearby.bio,
        nearby.photos,
        nearby.avatar,
        nearby.distance_meters,
        nearby.is_verified
    FROM nearby
    WHERE nearby.distance_meters <= p_radius_meters
    ORDER BY nearby.distance_meters ASC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_stats ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLICIES PARA PROFILES
-- ============================================

-- Los usuarios pueden ver su propio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

-- Los usuarios pueden actualizar su propio perfil
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);

-- Los usuarios pueden insertar su propio perfil
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Los usuarios verificados pueden ver otros perfiles verificados
DROP POLICY IF EXISTS "Verified users can view verified profiles" ON public.profiles;
CREATE POLICY "Verified users can view verified profiles"
    ON public.profiles FOR SELECT
    USING (
        is_verified = TRUE 
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.is_verified = TRUE
        )
    );

-- ============================================
-- POLICIES PARA VENUES
-- ============================================

-- Los venues pueden ver su propio venue
DROP POLICY IF EXISTS "Venues can view own venue" ON public.venues;
CREATE POLICY "Venues can view own venue"
    ON public.venues FOR SELECT
    USING (auth.uid() = venue_id);

-- Los venues pueden actualizar su propio venue
DROP POLICY IF EXISTS "Venues can update own venue" ON public.venues;
CREATE POLICY "Venues can update own venue"
    ON public.venues FOR UPDATE
    USING (auth.uid() = venue_id);

-- Los venues pueden insertar su propio venue
DROP POLICY IF EXISTS "Venues can insert own venue" ON public.venues;
CREATE POLICY "Venues can insert own venue"
    ON public.venues FOR INSERT
    WITH CHECK (auth.uid() = venue_id);

-- Los usuarios pueden ver venues verificados
DROP POLICY IF EXISTS "Users can view verified venues" ON public.venues;
CREATE POLICY "Users can view verified venues"
    ON public.venues FOR SELECT
    USING (is_verified = TRUE);

-- ============================================
-- POLICIES PARA EVENTS
-- ============================================

-- Los venues pueden ver sus propios eventos
DROP POLICY IF EXISTS "Venues can view own events" ON public.events;
CREATE POLICY "Venues can view own events"
    ON public.events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.venues v
            WHERE v.id = events.venue_id AND v.venue_id = auth.uid()
        )
    );

-- Los venues pueden crear eventos para su venue
DROP POLICY IF EXISTS "Venues can create own events" ON public.events;
CREATE POLICY "Venues can create own events"
    ON public.events FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.venues v
            WHERE v.id = venue_id AND v.venue_id = auth.uid()
        )
    );

-- Los venues pueden actualizar sus propios eventos
DROP POLICY IF EXISTS "Venues can update own events" ON public.events;
CREATE POLICY "Venues can update own events"
    ON public.events FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.venues v
            WHERE v.id = events.venue_id AND v.venue_id = auth.uid()
        )
    );

-- Los usuarios pueden ver eventos activos
DROP POLICY IF EXISTS "Users can view active events" ON public.events;
CREATE POLICY "Users can view active events"
    ON public.events FOR SELECT
    USING (end_date > NOW());

-- ============================================
-- POLICIES PARA CONNECTIONS
-- ============================================

-- Los usuarios pueden ver sus propias conexiones
DROP POLICY IF EXISTS "Users can view own connections" ON public.connections;
CREATE POLICY "Users can view own connections"
    ON public.connections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND (p.id = connections.user_id_1 OR p.id = connections.user_id_2)
        )
    );

-- Las conexiones se crean automáticamente por triggers, pero permitimos inserción manual
DROP POLICY IF EXISTS "Users can create connections" ON public.connections;
CREATE POLICY "Users can create connections"
    ON public.connections FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND (p.id = user_id_1 OR p.id = user_id_2)
        )
    );

-- ============================================
-- POLICIES PARA MESSAGES
-- ============================================

-- Los usuarios pueden ver mensajes donde son remitente o receptor
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
            AND (p.id = messages.sender_id OR p.id = messages.receiver_id)
        )
    );

-- Los usuarios pueden enviar mensajes si tienen conexión
DROP POLICY IF EXISTS "Users can send messages to connections" ON public.messages;
CREATE POLICY "Users can send messages to connections"
    ON public.messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = sender_id
        )
        AND EXISTS (
            SELECT 1 FROM public.connections c
            WHERE (c.user_id_1 = sender_id AND c.user_id_2 = receiver_id)
               OR (c.user_id_1 = receiver_id AND c.user_id_2 = sender_id)
        )
    );

-- Los usuarios pueden actualizar el estado de lectura de sus mensajes recibidos
DROP POLICY IF EXISTS "Users can update own received messages" ON public.messages;
CREATE POLICY "Users can update own received messages"
    ON public.messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = receiver_id
        )
    );

-- ============================================
-- POLICIES PARA SWIPES
-- ============================================

-- Los usuarios pueden ver sus propios swipes
DROP POLICY IF EXISTS "Users can view own swipes" ON public.swipes;
CREATE POLICY "Users can view own swipes"
    ON public.swipes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = swipes.swiper_id
        )
    );

-- Los usuarios pueden crear swipes
DROP POLICY IF EXISTS "Users can create swipes" ON public.swipes;
CREATE POLICY "Users can create swipes"
    ON public.swipes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = swiper_id
        )
    );

-- ============================================
-- POLICIES PARA REPORTS
-- ============================================

-- Los usuarios pueden ver sus propios reportes
DROP POLICY IF EXISTS "Users can view own reports" ON public.reports;
CREATE POLICY "Users can view own reports"
    ON public.reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = reports.reporter_id
        )
    );

-- Los usuarios pueden crear reportes
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;
CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = reporter_id
        )
    );

-- Los administradores pueden ver todos los reportes
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
CREATE POLICY "Admins can view all reports"
    ON public.reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = auth.uid()
            AND u.email = 'admin@vybe.com'
        )
    );

-- ============================================
-- POLICIES PARA BLOCKS
-- ============================================

-- Los usuarios pueden ver sus propios bloqueos
DROP POLICY IF EXISTS "Users can view own blocks" ON public.blocks;
CREATE POLICY "Users can view own blocks"
    ON public.blocks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = blocks.blocker_id
        )
    );

-- Los usuarios pueden crear bloqueos
DROP POLICY IF EXISTS "Users can create blocks" ON public.blocks;
CREATE POLICY "Users can create blocks"
    ON public.blocks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = blocker_id
        )
    );

-- ============================================
-- POLICIES PARA EVENT_CODES
-- ============================================

-- Los venues pueden ver sus propios códigos
DROP POLICY IF EXISTS "Venues can view own event codes" ON public.event_codes;
CREATE POLICY "Venues can view own event codes"
    ON public.event_codes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.venues v
            WHERE v.id = event_codes.venue_id AND v.venue_id = auth.uid()
        )
    );

-- Los venues pueden crear códigos
DROP POLICY IF EXISTS "Venues can create event codes" ON public.event_codes;
CREATE POLICY "Venues can create event codes"
    ON public.event_codes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.venues v
            WHERE v.id = venue_id AND v.venue_id = auth.uid()
        )
    );

-- Los usuarios pueden ver códigos activos para verificar
DROP POLICY IF EXISTS "Users can view active event codes" ON public.event_codes;
CREATE POLICY "Users can view active event codes"
    ON public.event_codes FOR SELECT
    USING (active = TRUE AND expires_at > NOW());

-- ============================================
-- POLICIES PARA PREMIUM_SUBSCRIPTIONS
-- ============================================

-- Los usuarios pueden ver sus propias suscripciones
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.premium_subscriptions;
CREATE POLICY "Users can view own subscriptions"
    ON public.premium_subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = premium_subscriptions.user_id
        )
    );

-- Los usuarios pueden crear suscripciones
DROP POLICY IF EXISTS "Users can create subscriptions" ON public.premium_subscriptions;
CREATE POLICY "Users can create subscriptions"
    ON public.premium_subscriptions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.id = user_id
        )
    );

-- ============================================
-- POLICIES PARA EVENT_STATS
-- ============================================

-- Los venues pueden ver estadísticas de sus eventos
DROP POLICY IF EXISTS "Venues can view own event stats" ON public.event_stats;
CREATE POLICY "Venues can view own event stats"
    ON public.event_stats FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.venues v
            WHERE v.id = event_stats.venue_id AND v.venue_id = auth.uid()
        )
    );

-- ============================================
-- COMENTARIOS
-- ============================================

COMMENT ON TABLE public.profiles IS 'Perfiles de usuarios de la aplicación';
COMMENT ON TABLE public.venues IS 'Locales y empresas que organizan eventos';
COMMENT ON TABLE public.events IS 'Eventos creados por venues';
COMMENT ON TABLE public.connections IS 'Conexiones/matches entre usuarios';
COMMENT ON TABLE public.messages IS 'Mensajes entre usuarios conectados';
COMMENT ON TABLE public.swipes IS 'Historial de likes/dislikes';
COMMENT ON TABLE public.reports IS 'Reportes de usuarios';
COMMENT ON TABLE public.blocks IS 'Usuarios bloqueados';
COMMENT ON TABLE public.event_codes IS 'Códigos QR para acceso a eventos';
COMMENT ON TABLE public.premium_subscriptions IS 'Suscripciones premium de usuarios';

