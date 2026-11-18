-- 138: «Reportar error» desde Ajustes.
--
-- Cualquiera con sesión (fiester@, invitado o negocio) manda un título, una
-- descripción y, si quiere, una captura. Llega a administración → Reportes.
-- No va en `reports`, que es para denunciar a una persona (`reported_id`
-- obligatorio y otros motivos).
--
--   · `bug_reports`: sin acceso directo; todo por funciones.
--   · Bucket privado `bug-reports`: cada uno sube a su carpeta (`<uid>/…`),
--     sólo administración y el autor leen.
--   · `submit_bug_report`: como mucho 5 por hora y persona.
--   · `admin_list_bug_reports` / `admin_set_bug_report_status`.

CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 4000),
    image_path TEXT,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS bug_reports_user_created_idx ON public.bug_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_created_idx ON public.bug_reports (created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bug_reports FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.bug_reports;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.bug_reports
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- ------------------------------------------------------------------ capturas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bug-reports', 'bug-reports', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload own bug captures" ON storage.objects;
CREATE POLICY "Users upload own bug captures" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'bug-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users read own bug captures" ON storage.objects;
CREATE POLICY "Users read own bug captures" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'bug-reports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Admins read bug captures" ON storage.objects;
CREATE POLICY "Admins read bug captures" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'bug-reports' AND public.is_admin());

-- ------------------------------------------------------------------- enviar
CREATE OR REPLACE FUNCTION public.submit_bug_report(
    p_title TEXT,
    p_message TEXT,
    p_image_path TEXT DEFAULT NULL,
    p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_title TEXT := btrim(COALESCE(p_title, ''));
    v_message TEXT := btrim(COALESCE(p_message, ''));
    v_path TEXT := NULLIF(btrim(COALESCE(p_image_path, '')), '');
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED';
    END IF;
    IF char_length(v_title) < 3 OR char_length(v_title) > 120 THEN
        RAISE EXCEPTION 'INVALID_TITLE';
    END IF;
    IF char_length(v_message) < 10 OR char_length(v_message) > 4000 THEN
        RAISE EXCEPTION 'INVALID_MESSAGE';
    END IF;
    -- La captura tiene que ser suya: nadie adjunta la de otro.
    IF v_path IS NOT NULL AND split_part(v_path, '/', 1) <> v_uid::text THEN
        RAISE EXCEPTION 'INVALID_IMAGE';
    END IF;
    IF (SELECT COUNT(*) FROM public.bug_reports
         WHERE user_id = v_uid AND created_at > NOW() - INTERVAL '1 hour') >= 5 THEN
        RAISE EXCEPTION 'TOO_MANY_REPORTS';
    END IF;

    INSERT INTO public.bug_reports (user_id, title, message, image_path, context)
    VALUES (
        v_uid, v_title, v_message, v_path,
        CASE WHEN jsonb_typeof(p_context) = 'object' AND length(p_context::text) <= 2000
             THEN p_context ELSE '{}'::jsonb END
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_bug_report(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_bug_report(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ------------------------------------------------------------ administración
CREATE OR REPLACE FUNCTION public.admin_list_bug_reports()
RETURNS TABLE (
    id UUID,
    title TEXT,
    message TEXT,
    image_path TEXT,
    context JSONB,
    status TEXT,
    created_at TIMESTAMPTZ,
    reporter_name TEXT,
    reporter_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT b.id, b.title, b.message, b.image_path, b.context, b.status, b.created_at,
           COALESCE(p.name, v.name)::TEXT,
           u.email::TEXT
      FROM public.bug_reports b
      LEFT JOIN auth.users u ON u.id = b.user_id
      LEFT JOIN public.profiles p ON p.user_id = b.user_id
      LEFT JOIN LATERAL (
          SELECT v2.name FROM public.venues v2 WHERE v2.venue_id = b.user_id LIMIT 1
      ) v ON TRUE
     ORDER BY (b.status = 'pending') DESC, b.created_at DESC
     LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_bug_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_bug_reports() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_bug_report_status(p_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_status NOT IN ('pending', 'resolved', 'dismissed') THEN
        RAISE EXCEPTION 'INVALID_STATUS';
    END IF;

    UPDATE public.bug_reports
       SET status = p_status,
           reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE NOW() END,
           reviewed_by = CASE WHEN p_status = 'pending' THEN NULL ELSE auth.uid() END
     WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_bug_report_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_bug_report_status(UUID, TEXT) TO authenticated;
