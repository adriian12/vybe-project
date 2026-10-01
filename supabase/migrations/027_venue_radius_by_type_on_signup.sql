-- ============================================================================
-- 027. El radio del local vuelve a depender de su tipo
-- ============================================================================
-- La migración 006 calculaba `event_radius` a partir de `venue_type` al dar de
-- alta. La 015 reescribió `handle_new_user()` para añadir género y preferencias
-- y, al hacerlo, se dejó ese cálculo por el camino: desde entonces todos los
-- locales nacían con el valor por defecto de la columna, 50 metros.
--
-- No saltaba a la vista porque 50 es el radio correcto para un bar, que es lo
-- que se probaba. Un festival, que necesita 500, se quedaba en 50: la geocerca
-- rechazaba a casi todo el mundo dentro del recinto y no había forma de
-- relacionarlo con el alta.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_account_type TEXT := COALESCE(NEW.raw_user_meta_data->>'account_type', 'user');
    v_venue_type TEXT;
    v_radius INTEGER;
BEGIN
    IF v_account_type = 'venue' THEN
        v_venue_type := COALESCE(NULLIF(NEW.raw_user_meta_data->>'venue_type', ''), 'local');

        v_radius := CASE v_venue_type
            WHEN 'discoteca' THEN 100
            WHEN 'festival' THEN 500
            WHEN 'evento_empresarial' THEN 250
            ELSE 50
        END;

        INSERT INTO public.venues (
            venue_id, name, email, type, phone, tax_id, address, event_radius
        )
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'venue_name', split_part(NEW.email, '@', 1)),
            NEW.email,
            v_venue_type,
            NEW.raw_user_meta_data->>'phone',
            NULLIF(NEW.raw_user_meta_data->>'tax_id', ''),
            NULLIF(NEW.raw_user_meta_data->>'address', ''),
            v_radius
        )
        ON CONFLICT (venue_id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (user_id, name, email, age, phone, gender, wants)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
            NEW.email,
            GREATEST(18, COALESCE((NEW.raw_user_meta_data->>'age')::INTEGER, 18)),
            NEW.raw_user_meta_data->>'phone',
            CASE WHEN NEW.raw_user_meta_data->>'gender' IN ('man', 'woman')
                 THEN NEW.raw_user_meta_data->>'gender' END,
            CASE WHEN NEW.raw_user_meta_data->>'wants' IN ('men', 'women', 'all')
                 THEN NEW.raw_user_meta_data->>'wants' ELSE 'all' END
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- Corrige los locales existentes que se quedaron con el radio por defecto.
UPDATE public.venues
SET event_radius = CASE type
        WHEN 'discoteca' THEN 100
        WHEN 'festival' THEN 500
        WHEN 'evento_empresarial' THEN 250
        ELSE 50
    END
WHERE event_radius = 50
  AND type IN ('discoteca', 'festival', 'evento_empresarial');
