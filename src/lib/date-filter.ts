import { useSyncExternalStore } from 'react';
import type { Event } from '@/types/venue';
import { isEventLive } from '@/hooks/use-events-feed';

/**
 * Filtro de fecha de las fiestas (inicio y mapa comparten el mismo).
 *
 * El «día de fiesta» va de 6:00 a 6:00: una fiesta que empieza a la 1:00 del
 * sábado es de la noche del viernes, y «Hoy» a las 2 de la mañana sigue
 * siendo la noche en la que estás.
 */

export type DateMode = 'today' | 'tomorrow' | 'weekend' | 'week' | 'date';

export interface DateSelection {
  mode: DateMode;
  /** Sólo con `date`: la noche elegida, `YYYY-MM-DD`. */
  date?: string;
}

const CORTE_HORAS = 6;

/** La noche a la que pertenece un instante: `YYYY-MM-DD` (hora local). */
export const nightOf = (value: Date | string): string => {
  const d = new Date(value);
  d.setHours(d.getHours() - CORTE_HORAS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** `YYYY-MM-DD` → Date a mediodía (para sumar días sin líos de horario). */
const aFecha = (night: string) => new Date(`${night}T12:00:00`);

export const addNights = (night: string, days: number): string => {
  const d = aFecha(night);
  d.setDate(d.getDate() + days);
  return nightOf(new Date(d.getTime() + CORTE_HORAS * 3_600_000));
};

export const tonight = () => nightOf(new Date());

const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000);

/** Las noches que cubre la selección (en orden). */
export const nightsOf = (sel: DateSelection): string[] => {
  const hoy = tonight();
  switch (sel.mode) {
    case 'today':
      return [hoy];
    case 'tomorrow':
      return [addNights(hoy, 1)];
    case 'week':
      return Array.from({ length: 7 }, (_, i) => addNights(hoy, i));
    case 'weekend': {
      // Viernes, sábado y domingo de esta semana (desde hoy si ya es finde).
      const dia = aFecha(hoy).getDay(); // 0 domingo … 6 sábado
      const hastaViernes = dia === 0 ? -2 : dia === 6 ? -1 : 5 - dia;
      const inicio = Math.max(0, hastaViernes);
      const fin = dia === 0 ? 0 : hastaViernes + 2;
      return Array.from({ length: fin - inicio + 1 }, (_, i) => addNights(hoy, inicio + i));
    }
    case 'date':
      return [sel.date ?? hoy];
  }
};

/** ¿Está la fiesta en la selección? Las que están en marcha cuentan como «hoy». */
export const matchesDate = (event: Pick<Event, 'startDate' | 'endDate'>, sel: DateSelection): boolean => {
  const noches = nightsOf(sel);
  if (noches.includes(nightOf(event.startDate))) return true;
  return noches.includes(tonight()) && isEventLive(event as Event);
};

/** Fiestas «cerca de esa fecha»: hasta dos noches antes o después, sin las ya pasadas. */
export const isNearDate = (event: Pick<Event, 'startDate'>, sel: DateSelection): boolean => {
  if (sel.mode !== 'date' || !sel.date) return false;
  const noche = nightOf(event.startDate);
  const d = Math.abs(diasEntre(sel.date, noche));
  return d > 0 && d <= 2 && diasEntre(tonight(), noche) >= 0;
};

// ---------------------------------------------------------------- estado
// Compartido entre inicio y mapa (y guardado en la sesión): si eliges
// «sábado» en inicio y abres el mapa, ya sale el sábado.

const CLAVE = 'fiestea_date_filter';
let actual: DateSelection = (() => {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE) ?? 'null') as DateSelection | null;
    if (guardado?.mode === 'date' && guardado.date && guardado.date < tonight()) return { mode: 'today' };
    return guardado ?? { mode: 'today' };
  } catch {
    return { mode: 'today' };
  }
})();
const oyentes = new Set<() => void>();

export const setDateSelection = (sel: DateSelection) => {
  actual = sel;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(sel));
  } catch {
    // Sin almacenamiento: se queda en memoria.
  }
  oyentes.forEach((f) => f());
};

export const useDateSelection = (): DateSelection =>
  useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => actual,
  );
