/**
 * Cuentas del calendario de fiestas de la ficha del negocio. Las semanas
 * empiezan en lunes y cada fiesta cuenta el día en el que empieza (hora local).
 */

/** «2026-10-17» del día local de una fecha. */
export const dayKey = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** «2026-10-17» → Date a mediodía local (así ningún cambio de hora lo mueve de día). */
export const parseDayKey = (key: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return dayKey(d) === key ? d : null;
};

/**
 * Las casillas de un mes (`month` de 0 a 11): `null` para los huecos antes
 * del día 1 y hasta completar la última semana.
 */
export const monthCells = (year: number, month: number): (Date | null)[] => {
  const primero = new Date(year, month, 1, 12);
  const dias = new Date(year, month + 1, 0).getDate();
  const hueco = (primero.getDay() + 6) % 7;
  const cells: (Date | null)[] = Array.from({ length: hueco }, () => null);
  for (let d = 1; d <= dias; d++) cells.push(new Date(year, month, d, 12));
  while (cells.length % 7) cells.push(null);
  return cells;
};

/** Agrupa por día lo que tenga fecha de inicio, en el orden en que llega. */
export const groupByDay = <T extends { startDate: string }>(items: T[]): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(item.startDate);
    out.set(key, [...(out.get(key) ?? []), item]);
  }
  return out;
};

/** Nombres cortos de lunes a domingo en el idioma pedido («L», «M»… en español). */
export const weekdayInitials = (locale?: string): string[] =>
  // 2026-09-14 fue lunes.
  Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 8, 14 + i, 12).toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase(),
  );
