import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * El contador de la puerta, por dentro.
 *
 * Lo que se fija aquí es lo que hace falta en una puerta de discoteca y no se ve
 * probando con buena cobertura:
 *
 *   · que la cifra suba al instante y las pulsaciones salgan agrupadas, no una
 *     petición por toque;
 *   · que sin red no se pierda ninguna: quedan guardadas y salen al volver;
 *   · que un enlace caducado deje el contador bloqueado y lo diga.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { count?: number }) =>
        options?.count !== undefined ? `${key}:${options.count}` : key,
      i18n: { resolvedLanguage: 'es', changeLanguage: vi.fn() },
    }),
  };
});

const DoorCounter = (await import('./door-counter')).default;
const { CounterError } = await import('@/services/door-counter');

type Transport = import('@/services/door-counter').CounterTransport;

const makeTransport = (start = 10) => {
  let total = start;
  const transport = {
    key: 'test',
    load: vi.fn(async () => ({ total, capacity: 100, inside: 4, updatedAt: new Date().toISOString() })),
    adjust: vi.fn(async (delta: number) => {
      total += delta;
      return { total, updatedAt: new Date().toISOString() };
    }),
    set: vi.fn(async (value: number) => {
      total = value;
      return { total, updatedAt: new Date().toISOString() };
    }),
  };
  return transport satisfies Transport;
};

const cifra = () => screen.getByText((_, el) => el?.getAttribute('aria-live') === 'polite').textContent;

beforeEach(() => {
  window.localStorage.clear();
});

describe('contador de puerta', () => {
  it('sube al momento y manda las pulsaciones agrupadas', async () => {
    const transport = makeTransport(10);
    render(<DoorCounter transport={transport} />);

    const sumar = await screen.findByRole('button', { name: 'counter.add' });
    fireEvent.click(sumar);
    fireEvent.click(sumar);
    fireEvent.click(sumar);

    // Sin esperar al servidor.
    expect(cifra()).toBe('13');

    await waitFor(() => expect(transport.adjust).toHaveBeenCalledWith(3), { timeout: 3000 });
    expect(transport.adjust).toHaveBeenCalledTimes(1);
    expect(cifra()).toBe('13');
  });

  it('sin red guarda las pulsaciones y las manda al volver', async () => {
    const transport = makeTransport(10);
    transport.adjust.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<DoorCounter transport={transport} />);

    const sumar = await screen.findByRole('button', { name: 'counter.add' });
    fireEvent.click(sumar);
    fireEvent.click(sumar);

    await screen.findByText('counter.offline:2', {}, { timeout: 3000 });
    expect(window.localStorage.getItem('vybe_counter_test')).toBe('2');
    expect(cifra()).toBe('12');

    // El siguiente intento sale bien: se vacía la cola y queda al día.
    await waitFor(() => expect(window.localStorage.getItem('vybe_counter_test')).toBeNull(), {
      timeout: 3000,
    });
    expect(transport.adjust).toHaveBeenLastCalledWith(2);
    expect(cifra()).toBe('12');
  });

  it('con el enlace caducado se bloquea y lo dice', async () => {
    const transport = makeTransport(10);
    transport.load.mockRejectedValue(new CounterError('INVALID_LINK'));
    const onFatal = vi.fn();
    render(<DoorCounter transport={transport} onFatal={onFatal} />);

    await waitFor(() => expect(onFatal).toHaveBeenCalledWith('INVALID_LINK'));
    expect(screen.getByRole('alert')).toHaveTextContent('counter.errors.INVALID_LINK');
    expect(screen.getByRole('button', { name: 'counter.add' })).toBeDisabled();
  });

  it('no baja de cero', async () => {
    const transport = makeTransport(0);
    render(<DoorCounter transport={transport} />);

    const restar = await screen.findByRole('button', { name: 'counter.remove' });
    expect(restar).toBeDisabled();
  });
});
