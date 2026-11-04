/**
 * El `.ics` de una fiesta lo sirve la Edge Function `event-calendar` (129). Se
 * abre fuera de la app (`openExternal(…, { system: true })`): el navegador del
 * sistema se lo pasa al calendario. Vale sin cuenta.
 */
export const eventCalendarUrl = (eventId: string): string => {
  const base = `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')}/functions/v1/event-calendar`;
  return `${base}?${new URLSearchParams({ event: eventId }).toString()}`;
};
