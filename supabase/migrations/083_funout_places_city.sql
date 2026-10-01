-- La ciudad de cada sala de Funout, del buscador de mapas: algunas direcciones
-- de Funout no la traen («Gremi des Fusters, 44, 07009»).
ALTER TABLE public.funout_places ADD COLUMN IF NOT EXISTS city TEXT;

-- Las salas sin coordenadas se guardaron vacías en la primera pasada (el
-- buscador bloqueaba a Supabase): se borran para que se vuelvan a buscar.
DELETE FROM public.funout_places WHERE latitude IS NULL OR longitude IS NULL;
