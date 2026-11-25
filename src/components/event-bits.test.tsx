import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttendeeStack, SignalTags } from './event-bits';
import { EMPTY_ACTIVITY, type EventSignals } from '@/services/social';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));

const senales: EventSignals = {
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

describe('AttendeeStack con poca gente', () => {
  it('nunca enseña «0 van a ir»: sale «Recién añadida»', () => {
    render(<AttendeeStack activity={{ ...EMPTY_ACTIVITY, signals: { ...senales, isNew: true } }} />);
    expect(screen.getByText('signals.new')).toBeTruthy();
    expect(screen.queryByText(/goingPlus/)).toBeNull();
  });

  it('con 3 que van enseña las visitas reales en vez de la cifra', () => {
    render(<AttendeeStack activity={{ ...EMPTY_ACTIVITY, going: 3, signals: { ...senales, viewsWeek: 38 } }} />);
    expect(screen.getByText(/signals.views.*38/)).toBeTruthy();
    expect(screen.queryByText(/goingPlus/)).toBeNull();
  });

  it('desde 10 sí dice cuántos van', () => {
    render(<AttendeeStack activity={{ ...EMPTY_ACTIVITY, going: 12 }} />);
    expect(screen.getByText(/home.goingPlus.*12/)).toBeTruthy();
  });

  it('las etiquetas de una sala conocida', () => {
    render(<SignalTags signals={{ ...senales, fillsUp: true, popularCity: 'Palma' }} />);
    expect(screen.getByText('signals.tags.fillsUp')).toBeTruthy();
    expect(screen.getByText(/signals.tags.popular.*Palma/)).toBeTruthy();
  });
});
