-- 121: administración enciende o apaga funciones en varias fiestas a la vez.
--
-- Eventos → «Activar funciones»: se marcan varias fiestas y se elige, para cada
-- función, encender, apagar o dejarla como está (NULL). Antes había que abrir
-- las fiestas una a una (con cientos importadas del escáner, imposible).
-- `events_swipe_needs_entry` sigue mandando: sin «Entrar al evento» no hay
-- swipe, aunque se pida.

CREATE OR REPLACE FUNCTION public.admin_set_events_features(
    p_ids UUID[],
    p_entry BOOLEAN DEFAULT NULL,
    p_swipe BOOLEAN DEFAULT NULL,
    p_headcount BOOLEAN DEFAULT NULL,
    p_gender BOOLEAN DEFAULT NULL,
    p_guest_list BOOLEAN DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_n INTEGER;
BEGIN
    IF NOT COALESCE(public.is_admin(), FALSE) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
        RETURN 0;
    END IF;
    IF cardinality(p_ids) > 2000 THEN
        RAISE EXCEPTION 'TOO_MANY';
    END IF;

    UPDATE public.events
    SET entry_enabled = COALESCE(p_entry, entry_enabled),
        swipe_enabled = COALESCE(p_swipe, swipe_enabled),
        show_headcount = COALESCE(p_headcount, show_headcount),
        show_gender_split = COALESCE(p_gender, show_gender_split),
        guest_list_enabled = COALESCE(p_guest_list, guest_list_enabled)
    WHERE id = ANY (p_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_events_features(UUID[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_events_features(UUID[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
