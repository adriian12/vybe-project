import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Valoraciones del panel: los comentarios salen de uno en uno, con el total
 * junto al título, flechas para pasar y «Leer más» en los largos.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'es', changeLanguage: vi.fn() } }),
  };
});

const largo = 'Carrasco no le ha entrado a la amiga de tu novia. '.repeat(6);
const datos = {
  summary: { count: 3, overall: 3.5, music: 4, atmosphere: 3.5, price: 4, last30: null, prev30: null },
  distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: stars === 5 ? 2 : 1 })),
  nights: [{ eventId: 'e1', name: 'Sonfe Halloween fest', startDate: '2026-10-31T22:00:00Z', avg: 3.5, count: 2 }],
  comments: [
    { overall: 2, comment: largo, createdAt: '2026-11-01T02:00:00Z', eventName: 'Sonfe Halloween fest' },
    { overall: 5, comment: 'Muy buena música', createdAt: '2026-11-02T02:00:00Z', eventName: 'Otra fiesta' },
    { overall: 4, comment: 'Bien', createdAt: '2026-11-03T02:00:00Z', eventName: 'Tercera' },
  ],
};
vi.mock('@/services/ratings', async () => {
  const actual = await vi.importActual<typeof import('@/services/ratings')>('@/services/ratings');
  return { ...actual, ratingsService: { getVenue: vi.fn(async () => datos) } };
});

const VenueRatings = (await import('./venue-ratings')).default;

describe('VenueRatings · comentarios', () => {
  it('enseña uno, el total, «Leer más» y pasa con las flechas', async () => {
    render(<VenueRatings plan={{ plan: 'business' } as never} />);

    const titulo = await screen.findByText('rating.venue.comments');
    expect(titulo.nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(screen.queryByText('Muy buena música')).toBeNull();

    fireEvent.click(screen.getByText('rating.venue.readMore'));
    expect(screen.getByText('rating.venue.readLess')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('rating.venue.nextComment'));
    expect(screen.getByText('Muy buena música')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.queryByText('rating.venue.readMore')).toBeNull();

    // Del primero hacia atrás se va al último.
    fireEvent.click(screen.getByLabelText('rating.venue.prevComment'));
    fireEvent.click(screen.getByLabelText('rating.venue.prevComment'));
    expect(screen.getByText('Bien')).toBeTruthy();
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });
});
