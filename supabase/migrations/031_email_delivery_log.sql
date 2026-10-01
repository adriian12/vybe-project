-- ============================================================================
-- 031. Registro de entrega del correo
-- ============================================================================
-- Hasta ahora, mandar un correo y que Resend devolviera 200 se daba por bueno.
-- Pero el 200 sólo dice que Resend lo aceptó: lo que pasa después —que el
-- servidor de destino lo rechace, que rebote, que el buzón no exista— llega
-- sólo por webhook, y no había ninguno.
--
-- Sin esto, alguien que no recibe el correo de verificación es indistinguible
-- de alguien que no se ha registrado, y no hay forma de saber cuál de las dos
-- cosas está pasando ni cuántas veces.
--
-- Lo escribe la Edge Function `resend-webhook`, que valida la firma de Svix.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- El identificador que devuelve Resend al aceptar el envío.
    message_id TEXT,
    email TEXT NOT NULL,
    -- sent, delivered, delivery_delayed, bounced, complained…
    event TEXT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_email ON public.email_events(email);
CREATE INDEX IF NOT EXISTS idx_email_events_created ON public.email_events(created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Sólo administración lo lee; lo escribe la Edge Function con service role.
DROP POLICY IF EXISTS "Admins read email events" ON public.email_events;
CREATE POLICY "Admins read email events"
    ON public.email_events FOR SELECT TO authenticated
    USING (public.is_admin());

/**
 * Cuántos correos han salido mal últimamente y a quién.
 *
 * Es lo que hay que mirar cuando alguien dice «no me llega nada»: distingue
 * entre no haber salido, haber rebotado y haber llegado.
 */
CREATE OR REPLACE FUNCTION public.get_email_problems(p_days INTEGER DEFAULT 7)
RETURNS TABLE (email TEXT, event TEXT, ocurrencias BIGINT, ultima TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_ADMIN';
    END IF;

    RETURN QUERY
    SELECT e.email, e.event, COUNT(*)::BIGINT, MAX(e.created_at)
    FROM public.email_events e
    WHERE e.created_at >= NOW() - MAKE_INTERVAL(days => GREATEST(p_days, 1))
      AND e.event IN ('bounced', 'complained', 'delivery_delayed', 'failed')
    GROUP BY e.email, e.event
    ORDER BY MAX(e.created_at) DESC
    LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_problems(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_email_problems(INTEGER) TO authenticated;

/** Limpia el registro: no hace falta guardarlo para siempre. */
CREATE OR REPLACE FUNCTION public.purge_email_events()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.email_events WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_email_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_email_events() TO service_role;

COMMENT ON TABLE public.email_events IS
    'Qué le pasa a cada correo después de que Resend lo acepte. Lo escribe el webhook de Resend.';
