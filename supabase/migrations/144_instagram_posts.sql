-- 144: Campaña de Instagram en el panel de administración.
--
-- El notificador de la NAS (Z:\fiestea\avisos\avisos.mjs) publica los reels,
-- carruseles e historias y manda por Telegram lo que hay que subir a mano.
-- Cada vez que cambia algo, envía la agenda entera con su estado por la
-- Management API (`instagram_sync`, sólo el servidor) y el panel la enseña en
-- la sección «Instagram» (`admin_get_instagram_posts`). Lo que se sube a mano
-- se marca como hecho desde el panel (`admin_mark_instagram_done`); la NAS no
-- toca esa marca.

CREATE TABLE IF NOT EXISTS public.instagram_posts (
    id TEXT PRIMARY KEY,                    -- el de la agenda: «6-reel», «1-h2»…
    dia INTEGER NOT NULL,                   -- día de campaña (1-30)
    scheduled_at TIMESTAMPTZ NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('reel', 'carrusel', 'historia', 'fijar')),
    lado TEXT CHECK (lado IN ('fiesteros', 'negocios')),
    titulo TEXT NOT NULL,
    detalle TEXT,                           -- qué sticker poner, qué hacer
    manual BOOLEAN NOT NULL DEFAULT FALSE,  -- lo sube la persona, no la NAS
    estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'publicado', 'enviado', 'fallo', 'caducado')),
    media_id TEXT,
    permalink TEXT,
    preview_url TEXT,
    done_at TIMESTAMPTZ,                    -- marcado a mano en el panel
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS instagram_posts_scheduled_idx ON public.instagram_posts (scheduled_at);

ALTER TABLE public.instagram_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_posts FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_api_rate_guard ON public.instagram_posts;
CREATE TRIGGER a_api_rate_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.instagram_posts
    FOR EACH STATEMENT EXECUTE FUNCTION public.api_rate_guard_trigger();

-- La NAS manda la agenda completa; lo que ya no está en ella se borra.
CREATE OR REPLACE FUNCTION public.instagram_sync(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'p_rows debe ser una lista';
    END IF;

    INSERT INTO public.instagram_posts AS ip
        (id, dia, scheduled_at, tipo, lado, titulo, detalle, manual, estado, media_id, permalink, preview_url, synced_at)
    SELECT r.id, r.dia, r.scheduled_at, r.tipo, r.lado, r.titulo, r.detalle, COALESCE(r.manual, FALSE),
           COALESCE(r.estado, 'pendiente'), r.media_id, r.permalink, r.preview_url, NOW()
    FROM jsonb_to_recordset(p_rows) AS r(
        id TEXT, dia INTEGER, scheduled_at TIMESTAMPTZ, tipo TEXT, lado TEXT, titulo TEXT, detalle TEXT,
        manual BOOLEAN, estado TEXT, media_id TEXT, permalink TEXT, preview_url TEXT)
    ON CONFLICT (id) DO UPDATE SET
        dia = EXCLUDED.dia,
        scheduled_at = EXCLUDED.scheduled_at,
        tipo = EXCLUDED.tipo,
        lado = EXCLUDED.lado,
        titulo = EXCLUDED.titulo,
        detalle = EXCLUDED.detalle,
        manual = EXCLUDED.manual,
        estado = EXCLUDED.estado,
        media_id = EXCLUDED.media_id,
        permalink = COALESCE(EXCLUDED.permalink, ip.permalink),
        preview_url = EXCLUDED.preview_url,
        synced_at = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT;

    DELETE FROM public.instagram_posts
    WHERE id NOT IN (SELECT r->>'id' FROM jsonb_array_elements(p_rows) r);

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.instagram_sync(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_instagram_posts()
RETURNS SETOF public.instagram_posts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_ADMIN';
    END IF;
    RETURN QUERY SELECT * FROM public.instagram_posts ORDER BY scheduled_at, id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_instagram_posts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_instagram_posts() TO authenticated;

-- Marca (o desmarca) como subido a mano algo que la NAS no puede publicar.
CREATE OR REPLACE FUNCTION public.admin_mark_instagram_done(p_id TEXT, p_done BOOLEAN DEFAULT TRUE)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_done TIMESTAMPTZ;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_ADMIN';
    END IF;
    UPDATE public.instagram_posts
    SET done_at = CASE WHEN p_done THEN NOW() ELSE NULL END
    WHERE id = p_id AND manual
    RETURNING done_at INTO v_done;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND';
    END IF;
    RETURN v_done;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_instagram_done(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_instagram_done(TEXT, BOOLEAN) TO authenticated;
