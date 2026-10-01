-- ============================================
-- Vybe App - Funciones Helper Adicionales
-- ============================================

-- Función para actualizar ubicación de usuario (usando columnas separadas)
CREATE OR REPLACE FUNCTION update_user_location(
    p_profile_id UUID,
    p_longitude DOUBLE PRECISION,
    p_latitude DOUBLE PRECISION
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET latitude = p_latitude,
        longitude = p_longitude
    WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para calcular distancia entre dos puntos (Haversine)
-- Útil cuando PostGIS no está disponible o como fallback
CREATE OR REPLACE FUNCTION get_distance(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    R DOUBLE PRECISION := 6371000; -- Radio de la Tierra en metros
    dlat DOUBLE PRECISION;
    dlon DOUBLE PRECISION;
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);
    
    a := sin(dlat/2) * sin(dlat/2) +
         cos(radians(lat1)) * cos(radians(lat2)) *
         sin(dlon/2) * sin(dlon/2);
    
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    
    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Función para verificar si un usuario está bloqueado
CREATE OR REPLACE FUNCTION is_user_blocked(
    p_user_id UUID,
    p_other_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = p_user_id AND blocked_id = p_other_user_id)
           OR (blocker_id = p_other_user_id AND blocked_id = p_user_id)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Función para obtener estadísticas de un evento
CREATE OR REPLACE FUNCTION get_event_stats(
    p_event_id UUID
)
RETURNS TABLE (
    scans_count BIGINT,
    active_users_count BIGINT,
    matches_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT ec.id)::BIGINT AS scans_count,
        COUNT(DISTINCT p.id)::BIGINT AS active_users_count,
        COUNT(DISTINCT c.id)::BIGINT AS matches_count
    FROM public.events e
    LEFT JOIN public.event_codes ec ON ec.venue_id = e.venue_id
    LEFT JOIN public.profiles p ON p.last_location IS NOT NULL
    LEFT JOIN public.swipes s ON s.event_id = e.id
    LEFT JOIN public.connections c ON (
        (c.user_id_1 = s.swiper_id AND c.user_id_2 = s.swiped_id)
        OR (c.user_id_1 = s.swiped_id AND c.user_id_2 = s.swiper_id)
    )
    WHERE e.id = p_event_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Función para limpiar códigos de evento expirados
CREATE OR REPLACE FUNCTION cleanup_expired_event_codes()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    UPDATE public.event_codes
    SET active = FALSE
    WHERE expires_at < NOW() AND active = TRUE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener conversaciones de un usuario
CREATE OR REPLACE FUNCTION get_user_conversations(
    p_user_id UUID
)
RETURNS TABLE (
    other_user_id UUID,
    other_user_name TEXT,
    last_message_content TEXT,
    last_message_time TIMESTAMPTZ,
    unread_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN m.sender_id = p_user_id THEN m.receiver_id
            ELSE m.sender_id
        END AS other_user_id,
        p.name AS other_user_name,
        m.content AS last_message_content,
        m.created_at AS last_message_time,
        COUNT(*) FILTER (WHERE m.receiver_id = p_user_id AND m.read = FALSE) AS unread_count
    FROM public.messages m
    JOIN public.profiles p ON p.id = CASE 
        WHEN m.sender_id = p_user_id THEN m.receiver_id
        ELSE m.sender_id
    END
    WHERE m.sender_id = p_user_id OR m.receiver_id = p_user_id
    GROUP BY 
        CASE 
            WHEN m.sender_id = p_user_id THEN m.receiver_id
            ELSE m.sender_id
        END,
        p.name,
        m.content,
        m.created_at
    ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Comentarios
COMMENT ON FUNCTION get_distance IS 'Calcula la distancia entre dos puntos geográficos usando la fórmula de Haversine';
COMMENT ON FUNCTION is_user_blocked IS 'Verifica si un usuario está bloqueado por otro';
COMMENT ON FUNCTION get_event_stats IS 'Obtiene estadísticas de un evento específico';
COMMENT ON FUNCTION cleanup_expired_event_codes IS 'Desactiva códigos de evento expirados';
COMMENT ON FUNCTION get_user_conversations IS 'Obtiene las conversaciones de un usuario con información de último mensaje y mensajes no leídos';

