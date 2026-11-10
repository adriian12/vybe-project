import { supabase } from '@/integrations/supabase/client';

/**
 * El tutorial del panel de negocio sale una vez por persona, la primera vez que
 * entra al panel. Se recuerda en la cuenta (`user_metadata.venue_tour_seen_at`),
 * así no vuelve a salir en otro móvil u ordenador, y también en este
 * dispositivo por si no se pudiera guardar en la cuenta. Se vuelve a ver desde
 * el menú del panel → «Tutorial del panel».
 */
const CLAVE = 'venue_tour_seen_at';
const CLAVE_DISPOSITIVO = 'fiestea_venue_tour_seen';

export const venueTourSeen = async (): Promise<boolean> => {
  try {
    if (window.localStorage.getItem(CLAVE_DISPOSITIVO)) return true;
  } catch {
    // Sin almacenamiento: se mira la cuenta.
  }
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user?.user_metadata?.[CLAVE]);
};

export const markVenueTourSeen = async () => {
  try {
    window.localStorage.setItem(CLAVE_DISPOSITIVO, String(Date.now()));
  } catch {
    // Se guarda sólo en la cuenta.
  }
  try {
    await supabase.auth.updateUser({ data: { [CLAVE]: new Date().toISOString() } });
  } catch {
    // Si no se guarda en la cuenta, este dispositivo ya lo recuerda.
  }
};
