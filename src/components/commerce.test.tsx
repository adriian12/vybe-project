import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Entradas, valoraciones y ventas (migración 068), por dentro:
 *
 *   · la ficha no pinta nada si el local no vende entradas, y al comprar lleva
 *     a la pantalla de compra con la cantidad elegida;
 *   · valorar exige elegir estrellas y manda la nota;
 *   · «Ventas» se bloquea fuera de Business.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

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

const openExternal = vi.fn(async () => undefined);
const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/services/native', () => ({ openExternal, isNative: () => false }));

let tipos: import('@/services/tickets').TicketType[] = [];
const startCheckout = vi.fn(async () => 'https://checkout.stripe.test/x');
vi.mock('@/services/tickets', async () => {
  const actual = await vi.importActual<typeof import('@/services/tickets')>('@/services/tickets');
  return {
    ...actual,
    ticketsService: {
      getEventTypes: vi.fn(async () => tipos),
      startCheckout,
      getSales: vi.fn(async () => []),
      getOrders: vi.fn(async () => []),
      getSettlement: vi.fn(async () => []),
    },
  };
});

const rate = vi.fn(async () => undefined);
vi.mock('@/services/ratings', async () => {
  const actual = await vi.importActual<typeof import('@/services/ratings')>('@/services/ratings');
  return { ...actual, ratingsService: { rate } };
});

const EventTickets = (await import('./event-tickets')).default;
const { RatePartySheet } = await import('./rate-party');
const VenueSales = (await import('./venue/venue-sales')).default;

describe('entradas en la ficha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tipos = [];
  });

  it('sin entradas a la venta no pinta nada', async () => {
    const { container } = render(<EventTickets eventId="e1" />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('compra la cantidad elegida', async () => {
    tipos = [
      {
        id: 't1',
        kind: 'entry',
        name: 'Entrada general',
        description: null,
        priceCents: 1500,
        remaining: 10,
        guests: null,
        minSpendCents: null,
        maxPerOrder: 6,
      },
    ];
    render(<EventTickets eventId="e1" />);
    expect(await screen.findByText('Entrada general')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '+1' }));
    fireEvent.click(screen.getByRole('button', { name: 'tickets.buy.buy' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/tickets/buy/t1?qty=2'));
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it('agotada no deja comprar', async () => {
    tipos = [
      {
        id: 't2',
        kind: 'table',
        name: 'Mesa VIP',
        description: null,
        priceCents: 10000,
        remaining: 0,
        guests: 6,
        minSpendCents: 30000,
        maxPerOrder: 1,
      },
    ];
    render(<EventTickets eventId="e1" />);
    expect(await screen.findByText('tickets.buy.soldOut')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'tickets.buy.reserve' })).toBeNull();
  });
});

describe('valorar la fiesta', () => {
  it('exige estrellas y envía la nota', async () => {
    const onOpenChange = vi.fn();
    render(
      <RatePartySheet
        pending={{ eventId: 'e1', eventName: 'Aurora', venueName: 'Sala', startDate: new Date().toISOString() }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    const enviar = screen.getByRole('button', { name: 'rating.send' }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);

    const general = screen.getByRole('radiogroup', { name: 'rating.overall' });
    fireEvent.click(general.querySelectorAll('button')[3]);
    fireEvent.click(enviar);

    await waitFor(() =>
      expect(rate).toHaveBeenCalledWith('e1', { overall: 4, music: null, atmosphere: null, price: null, comment: null }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ventas del local', () => {
  it('fuera de Business no se enseña', () => {
    const { container } = render(<VenueSales events={[]} plan={{ plan: 'pro' } as never} />);
    expect(container.innerHTML).toBe('');
  });
});
