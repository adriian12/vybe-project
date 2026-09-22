-- =============================================================================
-- 052 · Borrar la cuenta no se atasca en referencias de auditoría
-- =============================================================================
-- «Eliminar cuenta» borra el usuario de auth y el resto cae en cascada. Pero
-- algunas columnas de auditoría apuntaban a auth.users sin regla de borrado
-- (quién revisó una foto o un reporte, quién validó un vale, quién atendió un
-- aviso de ayuda, quién creó un aviso del local): si la persona había hecho
-- alguna de esas cosas, el borrado fallaba. Ahora esas columnas se vacían y el
-- registro se queda, sin nombre.
-- =============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname, c.conrelid::regclass AS tabla, a.attname AS columna
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND c.confrelid = 'auth.users'::regclass
          AND c.confdeltype = 'a'
          AND c.connamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
        EXECUTE format(
            'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
            r.tabla, r.conname, r.columna
        );
    END LOOP;
END $$;
