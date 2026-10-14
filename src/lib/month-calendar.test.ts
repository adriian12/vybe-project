import { describe, expect, it } from 'vitest';
import { dayKey, groupByDay, monthCells, parseDayKey } from './month-calendar';

describe('monthCells', () => {
  it('octubre de 2026 empieza en jueves y ocupa cinco semanas', () => {
    const cells = monthCells(2026, 9);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]?.getDate()).toBe(1);
    expect(cells.length).toBe(35);
    expect(cells.filter(Boolean).length).toBe(31);
  });

  it('un mes que empieza en lunes no deja hueco delante', () => {
    // Junio de 2026 empieza en lunes.
    expect(monthCells(2026, 5)[0]?.getDate()).toBe(1);
  });
});

describe('dayKey y parseDayKey', () => {
  it('ida y vuelta', () => {
    const d = parseDayKey('2026-10-17');
    expect(d && dayKey(d)).toBe('2026-10-17');
    expect(parseDayKey('2026-02-30')).toBeNull();
    expect(parseDayKey('basura')).toBeNull();
  });
});

describe('groupByDay', () => {
  it('junta dos fiestas del mismo día', () => {
    const a = { id: 'a', startDate: new Date(2026, 9, 17, 18).toISOString() };
    const b = { id: 'b', startDate: new Date(2026, 9, 17, 23, 30).toISOString() };
    const c = { id: 'c', startDate: new Date(2026, 9, 18, 1).toISOString() };
    const map = groupByDay([a, b, c]);
    expect(map.get('2026-10-17')?.map((e) => e.id)).toEqual(['a', 'b']);
    expect(map.get('2026-10-18')?.map((e) => e.id)).toEqual(['c']);
  });
});
