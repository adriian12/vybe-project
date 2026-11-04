import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Event } from '@/types/venue';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'es' } }),
  };
});

import EventCard from './event-card';

const fiesta = {
  id: 'e1',
  name: 'Aurora Sessions',
  venueName: 'Sala Aurora',
  city: 'Palma',
  startDate: '2026-11-07T22:30:00Z',
  endDate: '2026-11-08T05:00:00Z',
  price: 12,
} as unknown as Event;

const pintar = (variant: 'full' | 'grid' | 'row') => {
  const onOpen = vi.fn();
  const onToggleIntent = vi.fn();
  render(
    <EventCard
      variant={variant}
      event={fiesta}
      distance={1200}
      going={false}
      busy={false}
      live={false}
      onOpen={onOpen}
      onToggleIntent={onToggleIntent}
    />,
  );
  return { onOpen, onToggleIntent };
};

describe('vistas de la lista de Inicio', () => {
  it.each(['full', 'grid', 'row'] as const)('la vista %s enseña la fiesta y abre la ficha', (variant) => {
    const { onOpen, onToggleIntent } = pintar(variant);
    expect(screen.getByText('Aurora Sessions')).toBeTruthy();
    fireEvent.click(screen.getByText('Aurora Sessions'));
    expect(onOpen).toHaveBeenCalled();
    // «Voy a ir» no abre la ficha.
    fireEvent.click(screen.getAllByLabelText('home.imGoing')[0]);
    expect(onToggleIntent).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
