import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';
import type { TicketKind, ValidatedTicket } from '@/services/tickets';

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

const ERRORES_ENTRADA: Record<string, string> = {
  TICKET_NOT_FOUND: 'sales.errors.ticketNotFound',
  TICKET_REFUNDED: 'sales.errors.ticketRefunded',
  PLAN_REQUIRED: 'sales.errors.planRequired',
  INVALID_LINK: 'counter.errors.INVALID_LINK',
};

const llamarEntradas = async <T,>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<T>('door-counter', { body });
  if (error) {
    let code = 'UNKNOWN';
    if (error instanceof FunctionsHttpError) {
      const detail = (await error.context.json().catch(() => null)) as { error?: string } | null;
      code = detail?.error ?? code;
    }
    throw new ApiError(code, ERRORES_ENTRADA[code] ?? 'errors.generic');
  }
  return data as T;
};

/**
 * Validar entradas con el enlace del contador (migración 118): el botón fijo
 * «Escanear entrada» de `/contador/:token`.
 */
export const linkTickets = (token: string) => ({
  /** Si el plan del local vende entradas; sin él, el botón no sale. */
  enabled: async (): Promise<boolean> => {
    try {
      const r = await llamarEntradas<{ tickets?: boolean }>({ token, action: 'tickets' });
      return Boolean(r?.tickets);
    } catch {
      return false;
    }
  },
  validate: async (code: string): Promise<ValidatedTicket> => {
    const r = await llamarEntradas<{
      kind: TicketKind;
      type_name: string;
      holder_name: string;
      event_name: string;
      guests: number | null;
      already_used: boolean;
      used_at: string | null;
    }>({ token, action: 'ticket', code });
    return {
      kind: r.kind,
      typeName: r.type_name,
      holderName: r.holder_name,
      eventName: r.event_name,
      guests: r.guests,
      alreadyUsed: r.already_used,
      usedAt: r.used_at,
    };
  },
});
