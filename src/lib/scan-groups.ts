import { nightOf } from '@/lib/date-filter';

/** Lo que necesita el agrupador de cada fiesta escaneada. */
export interface Scannable {
  id: string;
  source: string;
  title: string;
  startAt: string;
  placeName: string | null;
}

/** «SÁBADO: Halloween #CUENCAclub» → «sabadohalloweencuencaclub». */
export const clave = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const DOS_HORAS = 2 * 3_600_000;

/**
 * ¿Son la misma fiesta publicada en dos webs distintas? Tienen que ser de la
 * misma noche y de webs distintas, y además: el mismo nombre, uno contenido
 * en el otro (de 6 letras o más), o la misma sala con menos de 2 h de
 * diferencia en la hora de empezar.
 */
export const mismaFiesta = (a: Scannable, b: Scannable): boolean => {
  if (a.source === b.source) return false;
  if (nightOf(a.startAt) !== nightOf(b.startAt)) return false;
  const ta = clave(a.title);
  const tb = clave(b.title);
  if (ta && ta === tb) return true;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (corto.length >= 6 && largo.includes(corto)) return true;
  const pa = clave(a.placeName);
  const pb = clave(b.placeName);
  return Boolean(pa) && pa === pb && Math.abs(new Date(a.startAt).getTime() - new Date(b.startAt).getTime()) <= DOS_HORAS;
};

/**
 * Agrupa las fiestas que son la misma (cierre transitivo). Cada grupo sale
 * en el orden en que llegan sus fiestas; los grupos, por la primera.
 */
export const agrupar = <T extends Scannable>(lista: T[]): T[][] => {
  const padre = lista.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  // Sólo se comparan las de la misma noche.
  const porNoche = new Map<string, number[]>();
  lista.forEach((e, i) => {
    const n = nightOf(e.startAt);
    porNoche.set(n, [...(porNoche.get(n) ?? []), i]);
  });
  for (const indices of porNoche.values()) {
    for (let x = 0; x < indices.length; x++) {
      for (let y = x + 1; y < indices.length; y++) {
        const i = indices[x];
        const j = indices[y];
        if (raiz(i) !== raiz(j) && mismaFiesta(lista[i], lista[j])) padre[raiz(j)] = raiz(i);
      }
    }
  }
  const grupos = new Map<number, T[]>();
  lista.forEach((e, i) => {
    const r = raiz(i);
    grupos.set(r, [...(grupos.get(r) ?? []), e]);
  });
  return [...grupos.values()];
};
