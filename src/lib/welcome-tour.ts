import { supabase } from '@/integrations/supabase/client';

/**
 * El tutorial de bienvenida sale una sola vez por persona.
 *
 *   · Sin cuenta (la bienvenida de la app instalada) se recuerda en el móvil.
 *   · Con cuenta se recuerda en `user_metadata.welcome_tour_seen_at`, que viaja
 *     con la persona: en un móvil nuevo no vuelve a salir.
 *
 * Quien lo vio en la bienvenida y se registra justo después no lo ve otra vez:
 * si el móvil lo vio hace menos de un día, se apunta en su cuenta sin enseñarlo.
 * Pasado ese tiempo, el móvil puede ser de otra persona y sí sale.
 */
export const TOUR_DEVICE_KEY = 'fiestea_welcome_tour_seen';
export const TOUR_METADATA_KEY = 'welcome_tour_seen_at';

/** Cuánto vale lo visto en el móvil para la cuenta que entra después. */
const HEREDA_MS = 24 * 60 * 60_000;

export const deviceSeenAt = (): number | null => {
  try {
    const raw = window.localStorage.getItem(TOUR_DEVICE_KEY);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
};

export const markDeviceSeen = (now = Date.now()) => {
  try {
    window.localStorage.setItem(TOUR_DEVICE_KEY, String(now));
  } catch {
    // Sin almacenamiento volvería a salir en la bienvenida; se puede saltar.
  }
};

/** ¿Lo vio este móvil hace poco, sin cuenta, la misma persona que entra ahora? */
export const deviceSeenRecently = (seenAt: number | null, now = Date.now()): boolean =>
  seenAt !== null && now - seenAt >= 0 && now - seenAt < HEREDA_MS;

/** ¿Lo tiene ya visto la cuenta? */
export const accountHasSeen = async (): Promise<boolean> => {
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user?.user_metadata?.[TOUR_METADATA_KEY]);
};

export const markAccountSeen = async () => {
  markDeviceSeen();
  try {
    await supabase.auth.updateUser({ data: { [TOUR_METADATA_KEY]: new Date().toISOString() } });
  } catch {
    // Si no se guarda en la cuenta, el móvil ya lo recuerda.
  }
};
