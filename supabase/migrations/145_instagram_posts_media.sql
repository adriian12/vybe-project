-- 145: la sección «Instagram» del panel abre cada pieza en grande para revisarla
-- antes de que salga: el vídeo del reel, todas las fotos del carrusel o la
-- historia, y el texto que se publica. La NAS manda las URL públicas (bucket
-- «promo») y el pie de foto en instagram_sync.

ALTER TABLE public.instagram_posts
    ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ "tipo": "video"|"imagen", "url": "…" }]
    ADD COLUMN IF NOT EXISTS caption TEXT;

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
        (id, dia, scheduled_at, tipo, lado, titulo, detalle, manual, estado, media_id, permalink, preview_url,
         media, caption, synced_at)
    SELECT r.id, r.dia, r.scheduled_at, r.tipo, r.lado, r.titulo, r.detalle, COALESCE(r.manual, FALSE),
           COALESCE(r.estado, 'pendiente'), r.media_id, r.permalink, r.preview_url,
           COALESCE(r.media, '[]'::jsonb), r.caption, NOW()
    FROM jsonb_to_recordset(p_rows) AS r(
        id TEXT, dia INTEGER, scheduled_at TIMESTAMPTZ, tipo TEXT, lado TEXT, titulo TEXT, detalle TEXT,
        manual BOOLEAN, estado TEXT, media_id TEXT, permalink TEXT, preview_url TEXT, media JSONB, caption TEXT)
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
        media = EXCLUDED.media,
        caption = EXCLUDED.caption,
        synced_at = NOW();
    GET DIAGNOSTICS v_n = ROW_COUNT;

    DELETE FROM public.instagram_posts
    WHERE id NOT IN (SELECT r->>'id' FROM jsonb_array_elements(p_rows) r);

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.instagram_sync(JSONB) FROM PUBLIC, anon, authenticated;

-- RETURNS SETOF instagram_posts se resuelve al crear la función: hay que
-- recrearla para que devuelva las columnas nuevas.
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
