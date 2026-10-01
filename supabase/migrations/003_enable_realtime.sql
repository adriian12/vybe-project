-- ============================================
-- Vybe App - Habilitar Realtime para Mensajes
-- ============================================

-- Habilitar Realtime para la tabla de mensajes
-- Esto permite que los cambios en la tabla se propaguen en tiempo real
-- NOTA: Este comando funciona en el plan gratuito de Supabase

-- Verificar si la publicación existe
DO $$
BEGIN
    -- Intentar agregar la tabla a la publicación de Realtime
    -- Si la publicación no existe, esto fallará silenciosamente
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    EXCEPTION
        WHEN undefined_object THEN
            -- La publicación no existe, crear una nueva
            CREATE PUBLICATION supabase_realtime FOR TABLE public.messages;
        WHEN duplicate_object THEN
            -- La tabla ya está en la publicación, no hacer nada
            NULL;
    END;
END $$;

-- Verificar que Realtime esté habilitado
-- Ejecuta esto después para confirmar:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages';

-- IMPORTANTE: Si estás en el plan gratuito y Realtime no funciona:
-- 1. Verifica que tu proyecto tenga Realtime habilitado (está habilitado por defecto)
-- 2. Si no funciona, puedes usar polling como alternativa (ver README.md)

