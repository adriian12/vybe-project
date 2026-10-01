import { afterEach, describe, expect, it, vi } from 'vitest';
import { addNights, isNearDate, matchesDate, nightOf, nightsOf } from './date-filter';

const evento = (start: string, horas = 6) => ({
  startDate: new Date(start).toISOString(),
  endDate: new Date(new Date(start).getTime() + horas * 3_600_000).toISOString(),
});

afterEach(() => vi.useRealTimers());

describe('filtro de fecha', () => {
  it('la madrugada cuenta como la noche anterior', () => {
    expect(nightOf(new Date('2026-09-26T01:30:00'))).toBe('2026-09-25');
    expect(nightOf(new Date('2026-09-26T06:30:00'))).toBe('2026-09-26');
  });

  it('suma noches sin saltarse días', () => {
    expect(addNights('2026-09-30', 1)).toBe('2026-10-01');
    expect(addNights('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('«hoy» a las 2:00 sigue siendo la noche en la que estás', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T02:00:00'));
    expect(matchesDate(evento('2026-09-25T23:30:00'), { mode: 'today' })).toBe(true);
    expect(matchesDate(evento('2026-09-26T23:30:00'), { mode: 'today' })).toBe(false);
    expect(matchesDate(evento('2026-09-26T23:30:00'), { mode: 'tomorrow' })).toBe(true);
  });

  it('el finde es de viernes a domingo, desde hoy si ya ha empezado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T12:00:00')); // miércoles
    expect(nightsOf({ mode: 'weekend' })).toEqual(['2026-09-25', '2026-09-26', '2026-09-27']);
    vi.setSystemTime(new Date('2026-09-26T12:00:00')); // sábado
    expect(nightsOf({ mode: 'weekend' })).toEqual(['2026-09-26', '2026-09-27']);
  });

  it('«cerca de esa fecha» son dos noches antes o después, nunca pasadas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00'));
    const sel = { mode: 'date' as const, date: '2026-09-26' };
    expect(isNearDate(evento('2026-09-28T23:00:00'), sel)).toBe(true);
    expect(isNearDate(evento('2026-09-29T23:00:00'), sel)).toBe(false);
    expect(isNearDate(evento('2026-09-24T23:00:00'), sel)).toBe(false);
    expect(isNearDate(evento('2026-09-26T23:00:00'), sel)).toBe(false);
  });
});
