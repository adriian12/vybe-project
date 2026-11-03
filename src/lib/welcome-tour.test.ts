import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }));

import { TOUR_DEVICE_KEY, deviceSeenAt, deviceSeenRecently, markDeviceSeen } from './welcome-tour';

describe('tutorial de bienvenida', () => {
  beforeEach(() => window.localStorage.clear());

  it('sale en un móvil que no lo ha visto', () => {
    expect(deviceSeenAt()).toBeNull();
  });

  it('el móvil recuerda cuándo se vio', () => {
    markDeviceSeen(1_000);
    expect(window.localStorage.getItem(TOUR_DEVICE_KEY)).toBe('1000');
    expect(deviceSeenAt()).toBe(1_000);
  });

  it('la cuenta que entra justo después lo hereda; un día más tarde, no', () => {
    const visto = Date.UTC(2026, 10, 3, 22);
    expect(deviceSeenRecently(visto, visto + 10 * 60_000)).toBe(true);
    expect(deviceSeenRecently(visto, visto + 25 * 60 * 60_000)).toBe(false);
    expect(deviceSeenRecently(null, visto)).toBe(false);
  });
});
