import type { EventActivity, EventSignals } from '@/services/social';

/**
 * Qué se enseña de una fiesta mientras hay poca gente con la app.
 *
 * Nunca se inventa una cifra: por debajo de `GOING_MIN` no se dice cuántos
 * van (un «2 van a ir» echa para atrás) y en su lugar sale el dato real más
 * fuerte que haya (visitas, gente mirando entradas, seguidores del local) o,
 * si no hay ninguno, «Recién añadida» o «Sé de los primeros en apuntarte».
 */

/** Desde aquí se enseña «N fiesteros van a ir». */
export const GOING_MIN = 10;
/** Mínimos para que un dato real merezca salir. */
export const VIEWS_MIN = 10;
export const CLICKS_MIN = 3;
export const FOLLOWERS_MIN = 10;

export type SignalLine =
  | { key: 'views'; count: number }
  | { key: 'clicks'; count: number }
  | { key: 'followers'; count: number; venue: string }
  | { key: 'new' }
  | { key: 'beFirst' };

/** La línea de la tarjeta cuando «van a ir» no llega al mínimo. */
export const signalLine = (signals: EventSignals | undefined): SignalLine => {
  if (signals) {
    if (signals.viewsWeek >= VIEWS_MIN) return { key: 'views', count: signals.viewsWeek };
    if (signals.ticketClicksDay >= CLICKS_MIN) return { key: 'clicks', count: signals.ticketClicksDay };
    if (signals.followers >= FOLLOWERS_MIN && signals.venueName) {
      return { key: 'followers', count: signals.followers, venue: signals.venueName };
    }
    if (signals.isNew) return { key: 'new' };
  }
  return { key: 'beFirst' };
};

/** ¿Hay suficiente gente para decir cuántos van? */
export const showGoing = (activity: Pick<EventActivity, 'going'> | undefined): boolean =>
  (activity?.going ?? 0) >= GOING_MIN;

export type SignalTag =
  | { key: 'lastTickets' }
  | { key: 'fillsUp' }
  | { key: 'popular'; city: string }
  | { key: 'featured' };

/** Las etiquetas de la fiesta, de la más urgente a la menos. */
export const signalTags = (signals: EventSignals | undefined, opciones: { featured?: boolean } = {}): SignalTag[] => {
  if (!signals) return [];
  const tags: SignalTag[] = [];
  if (signals.lastTickets) tags.push({ key: 'lastTickets' });
  if (signals.fillsUp) tags.push({ key: 'fillsUp' });
  if (signals.popularCity) tags.push({ key: 'popular', city: signals.popularCity });
  if (opciones.featured && signals.featured) tags.push({ key: 'featured' });
  return tags;
};
