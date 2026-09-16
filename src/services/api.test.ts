import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El cliente de Supabase se sustituye por un doble para poder probar la lógica
 * de `api` sin red: lo que nos interesa aquí es cómo traducimos errores y cómo
 * derivamos rutas de Storage, que es donde estaban los fallos reales.
 */
const rpc = vi.fn();
const storageRemove = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: 'profile-1' } }) }),
      }),
    }),
    storage: { from: () => ({ remove: (...args: unknown[]) => storageRemove(...args) }) },
  },
}));

const { api, ApiError } = await import('./api');

beforeEach(() => {
  rpc.mockReset();
  storageRemove.mockReset();
});

describe('redeemEventCode', () => {
  const row = {
    event_id: 'e1',
    event_name: 'Noche Techno',
    venue_id: 'v1',
    venue_name: 'Pacha',
    venue_type: 'discoteca',
    event_radius: 100,
    start_date: '2026-01-01T22:00:00Z',
    end_date: '2026-01-02T06:00:00Z',
    distance_meters: 42,
  };

  it('mapea la fila del RPC al modelo de dominio', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });

    await expect(api.redeemEventCode('100001', 39.57, 2.65)).resolves.toEqual({
      eventId: 'e1',
      eventName: 'Noche Techno',
      venueId: 'v1',
      venueName: 'Pacha',
      venueType: 'discoteca',
      eventRadius: 100,
      startDate: row.start_date,
      endDate: row.end_date,
      distanceMeters: 42,
    });
  });

  it('envía las coordenadas al servidor, que es quien valida la geocerca', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    await api.redeemEventCode('100001', 39.57, 2.65);

    expect(rpc).toHaveBeenCalledWith('redeem_event_code', {
      p_code: '100001',
      p_latitude: 39.57,
      p_longitude: 2.65,
    });
  });

  it('traduce TOO_FAR a un error de dominio con su código', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TOO_FAR' } });

    await expect(api.redeemEventCode('100001')).rejects.toMatchObject({
      code: 'TOO_FAR',
    });
  });

  it('traduce INVALID_CODE', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'INVALID_CODE' } });
    await expect(api.redeemEventCode('000000')).rejects.toBeInstanceOf(ApiError);
  });

  it('trata una respuesta vacía como código no válido', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(api.redeemEventCode('000000')).rejects.toMatchObject({
      code: 'INVALID_CODE',
    });
  });
});

describe('storagePathFromUrl', () => {
  it('extrae la ruta de una URL pública de Storage', () => {
    const url =
      'https://proyecto.supabase.co/storage/v1/object/public/event-photos/uid-1/1700000000-foto.jpg';

    expect(api.storagePathFromUrl('event-photos', url)).toBe('uid-1/1700000000-foto.jpg');
  });

  it('descarta la query string', () => {
    const url =
      'https://proyecto.supabase.co/storage/v1/object/public/avatars/uid-1/a.jpg?width=200';

    expect(api.storagePathFromUrl('avatars', url)).toBe('uid-1/a.jpg');
  });

  it('devuelve null si la URL no pertenece al bucket', () => {
    expect(api.storagePathFromUrl('avatars', 'https://example.com/foto.jpg')).toBeNull();
  });

  it('decodifica los caracteres escapados del nombre', () => {
    const url =
      'https://proyecto.supabase.co/storage/v1/object/public/avatars/uid-1/mi%20foto.jpg';

    expect(api.storagePathFromUrl('avatars', url)).toBe('uid-1/mi foto.jpg');
  });
});

describe('deleteFile', () => {
  it('borra el objeto del bucket', async () => {
    storageRemove.mockResolvedValue({ error: null });
    await api.deleteFile('avatars', 'uid-1/a.jpg');

    expect(storageRemove).toHaveBeenCalledWith(['uid-1/a.jpg']);
  });
});
