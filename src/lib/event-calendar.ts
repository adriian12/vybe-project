import { registerPlugin } from '@capacitor/core';
import { eventPath, publicLink } from '@/lib/share';
import { openExternal, platform } from '@/services/native';
import type { Event } from '@/types/venue';

/**
 * El `.ics` de una fiesta lo sirve la Edge Function `event-calendar` (129). Se
 * abre fuera de la app (`openExternal(…, { system: true })`): el navegador del
 * sistema se lo pasa al calendario. Vale sin cuenta.
 */
export const eventCalendarUrl = (eventId: string): string => {
  const base = `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')}/functions/v1/event-calendar`;
  return `${base}?${new URLSearchParams({ event: eventId }).toString()}`;
};

/** Plugin propio: `FiesteaCalendarPlugin.java` (sólo Android). */
const FiesteaCalendar = registerPlugin<{
  addEvent(options: { title: string; start: number; end: number; location: string; description: string }): Promise<void>;
}>('FiesteaCalendar');

/**
 * «Al calendario». En Android abre la pantalla de «Nuevo evento» del
 * calendario ya rellena: con el `.ics` salía el navegador con la URL de
 * Supabase y un fichero descargado que había que abrir. En iOS y en la web, el
 * `.ics` (Safari lo enseña como hoja de «Añadir» sin descargar nada). Si el
 * plugin falta (una APK vieja) o no hay calendario, también el `.ics`.
 */
export const addEventToCalendar = async (event: Event): Promise<void> => {
  if (platform() === 'android') {
    try {
      await FiesteaCalendar.addEvent({
        title: event.name,
        start: new Date(event.startDate).getTime(),
        end: new Date(event.endDate).getTime(),
        location: [event.placeName ?? event.venueName, event.location?.address].filter(Boolean).join(', '),
        description: publicLink(eventPath(event)),
      });
      return;
    } catch {
      // Sigue con el .ics.
    }
  }
  await openExternal(eventCalendarUrl(event.id), { system: true });
};
