-- ============================================================================
-- 014 — El límite de uso sólo se aplica a peticiones con sesión
--
-- `consume_rate_limit()` devuelve FALSE cuando `current_profile_id()` es NULL,
-- y los triggers de `swipes` y `messages` interpretan ese FALSE como «te has
-- pasado del límite». Pero el identificador es NULL en dos situaciones muy
-- distintas:
--
--   · nadie ha iniciado sesión, y entonces las policies ya rechazan el INSERT
--     antes de llegar aquí;
--   · la escritura viene del propio servidor (service role, una Edge Function,
--     un script de datos o una migración), donde no hay `auth.uid()`.
--
-- El segundo caso hacía imposible insertar un swipe o un mensaje desde el
-- servidor: siempre respondía `RATE_LIMITED_SWIPES`, un mensaje además
-- engañoso, porque no había ningún límite superado.
--
-- El límite tiene sentido contra un usuario con sesión que automatiza la app
-- con su propia clave. Sin sesión no hay a quién limitar, así que se deja
-- pasar: quien llega hasta aquí sin sesión es el servidor, y el servidor ya
-- tiene permiso para todo por definición.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_swipe_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Sin perfil en sesión no hay usuario a quien contar: es el servidor.
    IF public.current_profile_id() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT public.consume_rate_limit('swipe', 300, 3600) THEN
        RAISE EXCEPTION 'RATE_LIMITED_SWIPES';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_message_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF public.current_profile_id() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT public.consume_rate_limit('message', 200, 3600) THEN
        RAISE EXCEPTION 'RATE_LIMITED_MESSAGES';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_swipe_limit IS
    'Límite de swipes por hora. Sólo se aplica cuando hay sesión: sin ella la escritura viene del servidor, y las policies ya cubren el resto.';
COMMENT ON FUNCTION public.enforce_message_limit IS
    'Límite de mensajes por hora. Misma salvedad que enforce_swipe_limit().';
