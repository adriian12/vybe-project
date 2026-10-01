import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Las alertas de ayuda en el panel del local.
 *
 * Lo que se fija aquí:
 *
 *   · una alerta nueva sin atender hace saltar la ventana, y sólo una vez;
 *   · «Voy para allá» la deja atendida (sigue en Puerta, sin ventana);
 *   · «Resuelta» la cierra y desaparece: era el fallo de administración, que
 *     marcaba resuelta una alerta que volvía a salir.
 */

vi.mock('@/integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { name?: string }) => (options?.name ? `${key}:${options.name}` : key),
      i18n: { resolvedLanguage: 'es', changeLanguage: vi.fn() },
    }),
  };
});

type Alerta = import('@/services/venue-service').VenueSosAlert;

let abiertas: Alerta[] = [];

vi.mock('@/services/venue-service', () => ({
  venueService: {
    getSosAlerts: vi.fn(async () => abiertas.map((a) => ({ ...a }))),
    acknowledgeSosAlert: vi.fn(async (id: string) => {
      abiertas = abiertas.map((a) => (a.id === id ? { ...a, handledAt: new Date().toISOString() } : a));
    }),
    resolveSosAlert: vi.fn(async (id: string) => {
      abiertas = abiertas.filter((a) => a.id !== id);
    }),
  },
}));

const { useVenueSos } = await import('@/hooks/use-venue-sos');
const VenueSosAlerts = (await import('./venue-sos-alerts')).default;
const VenueSosAlarm = (await import('./venue-sos-alarm')).default;
const { venueService } = await import('@/services/venue-service');

const alerta = (over: Partial<Alerta> = {}): Alerta => ({
  id: 'a1',
  eventId: 'e1',
  profileName: 'Laura',
  profilePhoto: null,
  eventName: 'Aurora Sessions',
  note: 'Me encuentro mal',
  latitude: 39.57,
  longitude: 2.65,
  createdAt: new Date().toISOString(),
  handledAt: null,
  ...over,
});

const Panel = ({ onOpenDoor = () => {} }: { onOpenDoor?: () => void }) => {
  const sos = useVenueSos('venue-1');
  return (
    <>
      <VenueSosAlerts sos={sos} />
      <VenueSosAlarm sos={sos} onOpenDoor={onOpenDoor} />
    </>
  );
};

describe('alertas de ayuda del local', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    abiertas = [];
  });

  it('sin alertas sólo dice que está vigilando', async () => {
    render(<Panel />);
    expect(await screen.findByText('venue.safety.none')).toBeTruthy();
    expect(screen.queryByText('venue.safety.alarmTitle')).toBeNull();
  });

  it('una alerta nueva salta en una ventana y «Voy para allá» la deja atendida', async () => {
    abiertas = [alerta()];
    const onOpenDoor = vi.fn();
    render(<Panel onOpenDoor={onOpenDoor} />);

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('venue.safety.alarmTitle');

    const botones = screen.getAllByRole('button', { name: /venue\.safety\.acknowledge/ });
    fireEvent.click(botones[botones.length - 1]);

    await waitFor(() => expect(venueService.acknowledgeSosAlert).toHaveBeenCalledWith('a1'));
    expect(onOpenDoor).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByText('venue.safety.beingHandled')).toBeTruthy();
    // Sigue en Puerta hasta que se resuelva.
    expect(screen.getByText('venue.safety.needsHelp:Laura')).toBeTruthy();
  });

  it('una alerta ya atendida no hace saltar la ventana', async () => {
    abiertas = [alerta({ handledAt: new Date().toISOString() })];
    render(<Panel />);
    expect(await screen.findByText('venue.safety.beingHandled')).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('«Resuelta» la cierra y desaparece del panel', async () => {
    abiertas = [alerta({ handledAt: new Date().toISOString() })];
    render(<Panel />);

    fireEvent.click(await screen.findByRole('button', { name: /venue\.safety\.resolve$/ }));

    await waitFor(() => expect(venueService.resolveSosAlert).toHaveBeenCalledWith('a1'));
    expect(await screen.findByText('venue.safety.none')).toBeTruthy();
    expect(screen.queryByText('venue.safety.needsHelp:Laura')).toBeNull();
  });
});
