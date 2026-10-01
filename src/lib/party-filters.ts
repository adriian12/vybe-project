import type { Event } from '@/types/venue';

/** Franjas de la fiesta, según la hora a la que empieza. */
export type Franja = 'tardeo' | 'nocheo' | 'after';

export const FRANJAS: Franja[] = ['tardeo', 'nocheo', 'after'];

/**
 * ¿En qué franja cae un evento? Se mira la hora de inicio (la del móvil):
 *
 *   · tardeo: de 17:00 a 22:59 (planes de tarde, hasta medianoche)
 *   · nocheo: de 23:00 a 04:59 (la noche de siempre, hasta las 4 o las 6)
 *   · after:  de 05:00 a 13:59 (lo que empieza cuando cierra lo demás)
 *
 * Lo que empieza entre las 14:00 y las 17:00 no entra en ninguna: son eventos
 * de día y salen igual sin filtro.
 */
export const franjaDe = (event: Pick<Event, 'startDate'>): Franja | null => {
  const hora = new Date(event.startDate).getHours();
  if (hora >= 17 && hora < 23) return 'tardeo';
  if (hora >= 23 || hora < 5) return 'nocheo';
  if (hora >= 5 && hora < 14) return 'after';
  return null;
};

/** Aplica los dos filtros a una lista con eventos. */
export const aplicarFiltros = <T extends { event: Pick<Event, 'startDate' | 'theme'> }>(
  lista: T[],
  theme: string | null,
  franja: Franja | null,
): T[] =>
  lista.filter(
    ({ event }) => (!theme || event.theme === theme) && (!franja || franjaDe(event) === franja),
  );
