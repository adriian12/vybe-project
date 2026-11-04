import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/** Un id que no es de ninguna fiesta: la ficha enseña «no encontrada». */
const NINGUNA = '00000000-0000-0000-0000-000000000000';

/**
 * El id de la fiesta de la URL, venga como `/event/:eventId` o con la URL
 * legible `/event/:placeSlug/:eventSlug` (migración 133). Mientras se busca el
 * slug, `undefined`.
 */
export const useEventIdParam = (): string | undefined => {
  const { eventId, placeSlug, eventSlug } = useParams<{ eventId: string; placeSlug: string; eventSlug: string }>();
  const [resuelto, setResuelto] = useState<{ clave: string; id: string } | null>(null);
  const clave = `${placeSlug ?? ''}/${eventSlug ?? ''}`;

  useEffect(() => {
    if (eventId || !placeSlug || !eventSlug) return;
    let vivo = true;
    void supabase
      .rpc('get_event_id_by_slug' as never, { p_place_slug: placeSlug, p_slug: eventSlug } as never)
      .then(({ data, error }) => {
        if (vivo) setResuelto({ clave, id: !error && typeof data === 'string' ? data : NINGUNA });
      });
    return () => {
      vivo = false;
    };
  }, [eventId, placeSlug, eventSlug, clave]);

  if (eventId) return eventId;
  return resuelto?.clave === clave ? resuelto.id : undefined;
};
