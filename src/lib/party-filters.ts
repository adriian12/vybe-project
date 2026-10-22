import type { Event } from '@/types/venue';
import { musicaDe } from '@/lib/music';

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

/**
 * Aplica los dos filtros a una lista con eventos. `musica` es una de las
 * cinco categorías de `lib/music` («techno», «otras»…), no el género tal cual.
 */
export const aplicarFiltros = <T extends { event: Pick<Event, 'startDate' | 'theme'> }>(
  lista: T[],
  musica: string | null,
  franja: Franja | null,
): T[] =>
  lista.filter(
    ({ event }) => (!musica || musicaDe(event.theme) === musica) && (!franja || franjaDe(event) === franja),
  );

/**
 * Si la fiesta deja entrar con la app (QR, código o ubicación). Apagado por el
 * negocio o administración (111), sólo «Voy a ir». Las de Fiestea, además,
 * con ubicación: no tienen QR ni código, se entra estando en el sitio.
 */
export const sePuedeEntrar = (event: Pick<Event, 'entryEnabled' | 'byPlatform' | 'location'>): boolean =>
  event.entryEnabled !== false && (!event.byPlatform || Boolean(event.location));

/**
 * «Con Flechazo»: en directo ahora y con el Flechazo (tablón) encendido. En
 * las fiestas de Fiestea, además, con ubicación: es como se entra en ellas.
 */
export const conFlechazo = (
  event: Pick<Event, 'startDate' | 'endDate' | 'swipeEnabled' | 'byPlatform' | 'location'>,
  ahora: number = Date.now(),
): boolean =>
  new Date(event.startDate).getTime() <= ahora &&
  new Date(event.endDate).getTime() > ahora &&
  event.swipeEnabled !== false &&
  (!event.byPlatform || Boolean(event.location));
