import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Piezas de «la noche» que se pintan a partir de datos: el termómetro, los
 * retos del vyber y las plantillas del local. Lo que se fija es lo que no se ve
 * a simple vista: que el termómetro no dice nada si no hay datos, que un reto
 * cumplido ofrece el premio y que una plantilla crea la promoción con su reto.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const createPromotion = vi.fn(async () => undefined);
vi.mock('@/services/venue-service', () => ({
  venueService: {
    createPromotion: (...args: unknown[]) => createPromotion(...(args as [])),
    schedulePromotion: vi.fn(),
    setPromotionActive: vi.fn(),
  },
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { resolvedLanguage: 'es', changeLanguage: vi.fn() },
    }),
  };
});

const LiveThermometer = (await import('@/components/live-thermometer')).default;
const NightChallenges = (await import('./night-challenges')).default;
const VenuePromoTemplates = (await import('@/components/venue/venue-promo-templates')).default;
const { EMPTY_ACTIVITY } = await import('@/services/social');

describe('termómetro en vivo', () => {
  it('sin datos no pinta nada', () => {
    const { container } = render(<LiveThermometer activity={EMPTY_ACTIVITY} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('enseña ambiente, tendencia, cola y puerta cerrada, nunca una cifra del local', () => {
    render(
      <LiveThermometer
        activity={{
          ...EMPTY_ACTIVITY,
          vibeLevel: 'almost_full',
          vibeAt: new Date().toISOString(),
          trend: 'up',
          queueLevel: 'long',
          entryClosed: true,
        }}
      />,
    );
    expect(screen.getByText('vibe.levels.almostFull')).toBeInTheDocument();
    expect(screen.getByText('thermometer.trend.up')).toBeInTheDocument();
    expect(screen.getByText('thermometer.queue.long')).toBeInTheDocument();
    expect(screen.getByText('thermometer.entryClosed')).toBeInTheDocument();
  });
});

describe('retos de la noche', () => {
  it('un reto cumplido ofrece recoger el premio; uno a medias, no', () => {
    render(
      <NightChallenges
        onChange={vi.fn()}
        challenges={[
          {
            promotionId: 'a',
            title: 'Tu primer vybe',
            description: null,
            type: 'matches',
            progress: 1,
            target: 1,
            done: true,
            ticketCode: null,
            validated: false,
            endsAt: null,
            deadline: null,
          },
          {
            promotionId: 'b',
            title: 'Tres vybes',
            description: null,
            type: 'matches',
            progress: 1,
            target: 3,
            done: false,
            ticketCode: null,
            validated: false,
            endsAt: null,
            deadline: null,
          },
        ]}
      />,
    );
    expect(screen.getAllByRole('button', { name: /night.challenges.claim/ })).toHaveLength(1);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });
});

describe('plantillas de promociones', () => {
  it('activar un reto crea la promoción con su tipo, objetivo y hora límite', async () => {
    const start = '2026-09-19T22:00:00.000Z';
    render(
      <VenuePromoTemplates
        event={{ id: 'ev', startDate: start, endDate: '2026-09-20T05:00:00.000Z' }}
        venueId="venue"
        promotions={[]}
        canUse
        onUpgrade={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'venue.templates.earlyBird.title' }));

    await waitFor(() => expect(createPromotion).toHaveBeenCalled());
    const [venueId, input] = createPromotion.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(venueId).toBe('venue');
    expect(input).toMatchObject({
      eventId: 'ev',
      kind: 'challenge',
      challengeType: 'early_bird',
      templateKey: 'earlyBird',
      challengeDeadline: '2026-09-19T23:00:00.000Z',
    });
  });
});
