import { describe, expect, it } from 'vitest';
import { buildIcs, icsEscape, icsFileName, icsFold } from '../../supabase/functions/_shared/ics';

describe('«Añadir al calendario» (.ics)', () => {
  const fiesta = {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Aurora Sessions; techno, house',
    start: new Date(Date.UTC(2026, 10, 7, 22, 30)),
    end: new Date(Date.UTC(2026, 10, 8, 5)),
    location: 'Sala Aurora, Carrer de Sant Miquel 1, Palma',
    description: 'Sala Aurora\nhttps://app.fiestea.es/event/1',
    url: 'https://app.fiestea.es/event/1',
    latitude: 39.5696,
    longitude: 2.6502,
    alarmMinutes: 120,
  };

  it('lleva las horas en UTC, el aviso y un UID fijo', () => {
    const ics = buildIcs(fiesta, new Date(Date.UTC(2026, 10, 3, 12)));
    expect(ics).toContain('DTSTART:20261107T223000Z');
    expect(ics).toContain('DTEND:20261108T050000Z');
    expect(ics).toContain('DTSTAMP:20261103T120000Z');
    expect(ics).toContain('UID:11111111-2222-3333-4444-555555555555@fiestea.es');
    expect(ics).toContain('TRIGGER:-PT120M');
    expect(ics).toContain('GEO:39.569600;2.650200');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('escapa comas, puntos y coma y saltos de línea', () => {
    expect(icsEscape('a;b,c\nd\\e')).toBe('a\\;b\\,c\\nd\\\\e');
    expect(buildIcs(fiesta)).toContain('SUMMARY:Aurora Sessions\\; techno\\, house');
  });

  it('corta las líneas largas sin partir una letra', () => {
    const larga = `DESCRIPTION:${'ñ'.repeat(80)}`;
    const partes = icsFold(larga).split('\r\n');
    expect(partes.length).toBeGreaterThan(1);
    for (const parte of partes) expect(new TextEncoder().encode(parte).length).toBeLessThanOrEqual(75);
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(larga);
  });

  it('sin aviso ni coordenadas, no los pone', () => {
    const ics = buildIcs({ ...fiesta, alarmMinutes: 0, latitude: null, longitude: null });
    expect(ics).not.toContain('VALARM');
    expect(ics).not.toContain('GEO:');
  });

  it('nombre de fichero sin tildes ni símbolos', () => {
    expect(icsFileName('Noche Ñu · Bailá!')).toBe('noche-nu-baila.ics');
    expect(icsFileName('···')).toBe('fiesta.ics');
  });
});
