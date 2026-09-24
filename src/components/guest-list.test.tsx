import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Listas de invitados:
 *
 *   · al marcar «voy a ir» con la lista activada se pregunta; con «Sí» se ve
 *     el mensaje del local y se apunta con sus acompañantes;
 *   · en la puerta, «Adrián +10» con 5 dentro deja entrar sólo a los 6 que
 *     quedan.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

// El mismo `t` en cada render, como el real: si cambiara, los efectos que
// dependen de él se relanzarían sin fin.
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  const t = (key: string) => key;
  const traduccion = { t, i18n: { resolvedLanguage: 'es', changeLanguage: () => undefined } };
  return { ...actual, useTranslation: () => traduccion };
});

type Info = import('@/services/guest-lists').GuestListInfo;
let info: Info = { enabled: true, message: 'Lista gratis antes de las 19:00', mine: null };
const join = vi.fn(async () => undefined);
const admit = vi.fn(async () => ({ admitted: 11, total: 11 }));

vi.mock('@/services/guest-lists', () => ({
  guestListService: {
    getInfo: vi.fn(async () => info),
    join,
    leave: vi.fn(async () => undefined),
    getLists: vi.fn(async () => ({
      lists: [{ id: 'l1', name: 'Manolo', kind: 'promoter', entries: 1, people: 11, admitted: 5 }],
      settings: { enabled: true, message: null },
    })),
    getEntries: vi.fn(async () => [
      { id: 'g1', listId: 'l1', name: 'Adrián', companions: 10, admitted: 5, fromApp: false, createdAt: '' },
    ]),
    admit,
  },
}));

const GuestListJoin = (await import('./guest-list-join')).default;
const VenueGuestLists = (await import('./venue/venue-guest-lists')).default;

describe('apuntarse a la lista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    info = { enabled: true, message: 'Lista gratis antes de las 19:00', mine: null };
  });

  it('pregunta al marcar «voy a ir» y apunta con acompañantes', async () => {
    const { rerender } = render(<GuestListJoin eventId="e1" ask={0} defaultName="Adrián" />);
    await screen.findByText('guestList.available');

    rerender(<GuestListJoin eventId="e1" ask={1} defaultName="Adrián" />);
    fireEvent.click(await screen.findByRole('button', { name: 'guestList.yes' }));

    expect((await screen.findAllByText('Lista gratis antes de las 19:00')).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: '+1' }));
    fireEvent.click(screen.getByRole('button', { name: '+1' }));
    fireEvent.click(screen.getByRole('button', { name: 'guestList.join' }));

    await waitFor(() => expect(join).toHaveBeenCalledWith('e1', 'Adrián', 2));
  });

  it('con la lista cerrada no pregunta', async () => {
    info = { enabled: false, message: null, mine: null };
    const { rerender, container } = render(<GuestListJoin eventId="e1" ask={0} />);
    rerender(<GuestListJoin eventId="e1" ask={1} />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(screen.queryByText('guestList.askTitle')).toBeNull();
  });
});

describe('lista en la puerta', () => {
  it('deja entrar como mucho a los que quedan', async () => {
    render(<VenueGuestLists eventId="e1" />);
    expect(await screen.findByText('Adrián')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'guestList.venue.admit' }));
    // Por defecto propone los 6 que quedan; «+1» no pasa de ahí.
    const mas = screen.getAllByRole('button', { name: '+1' });
    fireEvent.click(mas[mas.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: 'guestList.venue.admitN' }));

    await waitFor(() => expect(admit).toHaveBeenCalledWith('g1', 6));
  });
});
