import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Plan del local: con Business ya pagado sale un resumen discreto con el
 * destacado a 9,99 € (19,99 € tachado) y la comparativa plegada; con Gratis,
 * las tarjetas de los planes a la vista.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'es', changeLanguage: vi.fn() } }),
  };
});
vi.mock('@/services/night', () => ({ nightService: { getIncludedBoostsLeft: vi.fn(async () => 1) } }));

const VenuePlan = (await import('./venue-plan')).default;

const base = {
  status: 'active',
  expiresAt: '2026-11-22T00:00:00Z',
  cancelAtPeriodEnd: false,
  activeEvents: 1,
  teamMembers: 0,
  maxActiveEvents: null,
  maxTeamMembers: null,
};

describe('plan del local', () => {
  it('con Business pagado, resumen y precio del destacado tachado', async () => {
    render(<VenuePlan plan={{ ...base, plan: 'business' } as never} onUpgrade={vi.fn()} />);

    expect(screen.getByText('19,99 €').className).toContain('line-through');
    expect(screen.getByText('19,99 €').parentElement?.textContent).toBe('19,99 €9,99 €');
    expect(await screen.findByText('venue.plan.boostsLeft')).toBeTruthy();
    expect(screen.queryByText('venue.plan.taglines.free')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /venue.plan.compareShow/ }));
    expect(screen.getByText('venue.plan.taglines.free')).toBeTruthy();
  });

  it('con Gratis, las tarjetas de los planes a la vista', () => {
    render(
      <VenuePlan plan={{ ...base, plan: 'free', expiresAt: null, maxActiveEvents: 3, maxTeamMembers: 3 } as never} onUpgrade={vi.fn()} />,
    );
    expect(screen.getByText('venue.plan.taglines.business')).toBeTruthy();
    expect(screen.queryByText('venue.plan.compareShow')).toBeNull();
  });
});
