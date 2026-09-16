-- ============================================================================
-- Vybe App - Políticas de Storage
--
-- El workflow .github/workflows/run-storage-policies.yml ejecuta este archivo,
-- que hasta ahora no existía en el repositorio.
--
-- Crea los tres buckets que usa la app y sus políticas de acceso.
-- Convención de rutas: <bucket>/<auth.uid()>/<archivo>
-- Así la primera carpeta identifica al propietario y las policies pueden
-- comprobarla con storage.foldername(name)[1].
-- ============================================================================

-- ============================================================================
-- BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars', 'avatars', TRUE, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'event-photos', 'event-photos', TRUE, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Documentación de verificación de venues: privado.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents', 'documents', FALSE, 10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- AVATARS (público en lectura, escritura sólo del propietario)
-- ============================================================================

DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

CREATE POLICY "Avatars are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update own avatar"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own avatar"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- ============================================================================
-- EVENT-PHOTOS (fotos tomadas dentro del evento)
-- ============================================================================

DROP POLICY IF EXISTS "Event photos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own event photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own event photos" ON storage.objects;

CREATE POLICY "Event photos are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'event-photos');

CREATE POLICY "Users can upload own event photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'event-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own event photos"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'event-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- ============================================================================
-- DOCUMENTS (privado: sólo el propietario y los administradores)
-- ============================================================================

DROP POLICY IF EXISTS "Owners can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;

CREATE POLICY "Owners can read own documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Admins can read all documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'documents' AND public.is_admin());

CREATE POLICY "Users can upload own documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete own documents"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
