import { describe, expect, it } from 'vitest';
import { showGoing, signalLine, signalTags } from './event-signals';
import type { EventSignals } from '@/services/social';

const base: EventSignals = {
  viewsWeek: 0,
  ticketClicksDay: 0,
  followers: 0,
  venueName: null,
  isNew: false,
  popularCity: null,
  fillsUp: false,
  lastTickets: false,
  featured: false,
};

describe('señales de una fiesta', () => {
  it('no enseña cuántos van por debajo de 10', () => {
    expect(showGoing({ going: 0 })).toBe(false);
    expect(showGoing({ going: 9 })).toBe(false);
    expect(showGoing({ going: 10 })).toBe(true);
  });

  it('elige el dato real más fuerte', () => {
    expect(signalLine({ ...base, viewsWeek: 38, ticketClicksDay: 5 })).toEqual({ key: 'views', count: 38 });
    expect(signalLine({ ...base, viewsWeek: 4, ticketClicksDay: 5 })).toEqual({ key: 'clicks', count: 5 });
    expect(signalLine({ ...base, followers: 120, venueName: 'Amok' })).toEqual({
      key: 'followers',
      count: 120,
      venue: 'Amok',
    });
  });

  it('sin datos: «Recién añadida» si es nueva y si no «Sé de los primeros»', () => {
    expect(signalLine({ ...base, isNew: true })).toEqual({ key: 'new' });
    expect(signalLine(base)).toEqual({ key: 'beFirst' });
    expect(signalLine(undefined)).toEqual({ key: 'beFirst' });
  });

  it('etiquetas en orden de urgencia', () => {
    expect(signalTags({ ...base, fillsUp: true, popularCity: 'Palma', lastTickets: true })).toEqual([
      { key: 'lastTickets' },
      { key: 'fillsUp' },
      { key: 'popular', city: 'Palma' },
    ]);
    expect(signalTags({ ...base, featured: true })).toEqual([]);
    expect(signalTags({ ...base, featured: true }, { featured: true })).toEqual([{ key: 'featured' }]);
  });
});
