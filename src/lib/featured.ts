import type { Event } from '@/types/venue';

/** El local ha pagado para destacar este evento y el destacado sigue vigente. */
export const isFeatured = (event: Pick<Event, 'featuredUntil'>, now = Date.now()): boolean =>
  Boolean(event.featuredUntil && new Date(event.featuredUntil).getTime() > now);

/**
 * Orden estable con los destacados delante: dentro de cada grupo se respeta el
 * orden que ya traía la lista (distancia, fecha…).
 */
export const featuredFirst = <T extends { event: Pick<Event, 'featuredUntil'> }>(items: T[]): T[] => {
  const now = Date.now();
  return [...items].sort((a, b) => Number(isFeatured(b.event, now)) - Number(isFeatured(a.event, now)));
};
