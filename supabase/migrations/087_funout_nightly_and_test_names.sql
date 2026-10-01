-- 087: Funout se sincroniza una vez al día, a las 23:00 de Madrid, y los datos
-- de prueba dejan de llamarse «Vybe».
--
-- pg_cron trabaja en GMT y Madrid cambia de hora en verano, así que el trabajo
-- se lanza a las 21:00 y a las 22:00 GMT y sólo llama a la función la vez que
-- en Madrid son las 23:00. Además, el panel sigue actualizando con «Actualizar».

DO $$
BEGIN
    PERFORM cron.unschedule('fiestea-funout') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fiestea-funout');
    PERFORM cron.schedule(
        'fiestea-funout',
        '0 21,22 * * *',
        $cron$SELECT public.trigger_funout_sync() WHERE EXTRACT(HOUR FROM now() AT TIME ZONE 'Europe/Madrid') = 23$cron$
    );
END $$;

-- Datos de prueba: nada visible puede decir «Vybe».
UPDATE public.venues SET name = 'Fiestea · Sala de pruebas'
 WHERE name IN ('Vybes · Sala de pruebas', 'Vybe · Sala de pruebas');
UPDATE public.events SET name = 'Fiestea Test Night'
 WHERE name IN ('Vybes Test Night', 'Vybe Test Night');
UPDATE public.promotions SET description = replace(description, 'usuario de Vybe', 'usuario de Fiestea')
 WHERE description ILIKE '%usuario de Vybe%';
