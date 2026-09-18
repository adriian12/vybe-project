import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lo que enseña un contador de puerta, venga del panel o del enlace del portero.
 * El total real sólo lo ven el local y quien tiene el enlace.
 */
export interface CounterState {
  total: number;
  capacity: number | null;
  /** Gente con Vybe dentro. */
  inside: number;
  updatedAt: string | null;
  eventName?: string;
  venueName?: string;
  expiresAt?: string;
}

/**
 * Cómo habla el contador con el servidor. El panel usa las funciones de la base
 * de datos con la sesión del local; el portero, la Edge Function con su enlace.
 * Así el mismo componente sirve para los dos.
 */
export interface CounterTransport {
  /** Identifica la cola de pulsaciones pendientes en este navegador. */
  key: string;
  load: () => Promise<CounterState>;
  adjust: (delta: number) => Promise<Partial<CounterState>>;
  set: (total: number) => Promise<Partial<CounterState>>;
}

/**
 * Error que el contador tiene que enseñar y que no se arregla reintentando: el
 * enlace ya no vale, el evento terminó, falta el aforo… Los fallos de red no
 * lo son: esos se reintentan.
 */
export class CounterError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CounterError';
  }
}

const FINAL_CODES = ['INVALID_LINK', 'EVENT_NOT_LIVE', 'CAPACITY_REQUIRED', 'INVALID_TOTAL', 'INVALID_DELTA'];

interface LinkResponse {
  eventName: string;
  venueName: string;
  total: number;
  capacity: number | null;
  inside: number;
  updatedAt: string | null;
  expiresAt: string;
}

const callLink = async (body: Record<string, unknown>): Promise<CounterState> => {
  const { data, error } = await supabase.functions.invoke<LinkResponse>('door-counter', { body });

  if (error) {
    // La función contesta con `{ error: CÓDIGO }` y un 4xx: se lee para saber
    // si merece la pena reintentar.
    if (error instanceof FunctionsHttpError) {
      const detail = (await error.context.json().catch(() => null)) as { error?: string } | null;
      const code = detail?.error ?? 'UNKNOWN';
      if (FINAL_CODES.includes(code)) throw new CounterError(code);
      if (code === 'TOO_MANY_REQUESTS') throw new Error(code);
    }
    throw error;
  }

  if (!data) throw new Error('EMPTY_RESPONSE');
  return {
    total: data.total,
    capacity: data.capacity,
    inside: data.inside,
    updatedAt: data.updatedAt,
    eventName: data.eventName,
    venueName: data.venueName,
    expiresAt: data.expiresAt,
  };
};

/** El contador del enlace del portero (`/contador/:token`), sin sesión. */
export const linkTransport = (token: string): CounterTransport => ({
  key: `link:${token.slice(0, 8)}`,
  load: () => callLink({ token, action: 'state' }),
  adjust: (delta) => callLink({ token, action: 'adjust', delta }),
  set: (total) => callLink({ token, action: 'set', total }),
});
