import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/**
 * Lo que Premium añade a una noche concreta.
 *
 * Se separa de `social.ts` porque estas cuatro cosas comparten una idea que el
 * resto de la aplicación no tiene: valen sólo mientras dura el evento, y por eso
 * la gente paga. Después no sirven para nada.
 *
 *   · rescatar una conexión antes de que caduque;
 *   · ver quién ha dicho que va, antes de ir;
 *   · recuperar a quien descartaste por error;
 *   · destacar una hora dentro del evento.
 *
 * Todas las comprobaciones están en la base de datos: aquí sólo se traduce el
 * error para poder ofrecer Premium en vez de enseñar un fallo.
 */

/** La base de datos responde `PREMIUM_REQUIRED` cuando falta la suscripción. */
export const isPremiumRequired = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'PREMIUM_REQUIRED';

const fail = (error: { message: string } | null, code: string, mensaje: string): never => {
  if (error?.message?.includes('PREMIUM_REQUIRED')) {
    throw new ApiError('PREMIUM_REQUIRED', 'premium.required');
  }
  if (error?.message?.includes('NOT_AT_EVENT')) {
    throw new ApiError('NOT_AT_EVENT', 'premium.boost.notInside');
  }
  if (error?.message?.includes('BOOST_ALREADY_USED')) {
    throw new ApiError('BOOST_ALREADY_USED', 'premium.boost.alreadyUsed');
  }
  throw new ApiError(code, mensaje);
};

/** Alguien que ha dicho que va: sólo el nombre y la foto. */
export interface Attendee {
  id: string;
  name: string;
  avatar?: string;
}

/** Alguien a quien descartaste y todavía está en el evento. */
export interface PassedProfile {
  id: string;
  name: string;
  age: number;
  avatar?: string;
  photos: string[];
  passedAt: string;
}

export const premiumNight = {
  /**
   * Guarda una conexión para que deje de caducar.
   *
   * Devuelve `true` si ya está a salvo y `false` si todavía hace falta que la
   * otra persona la guarde también. Con Premium siempre devuelve `true`: ése es
   * exactamente el valor que se está vendiendo.
   */
  keepConnection: async (connectionId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('keep_connection', {
      p_connection_id: connectionId,
    });

    if (error) fail(error, 'KEEP_FAILED', 'errors.generic');
    return data === true;
  },

  /**
   * Quién va al evento.
   *
   * Sólo nombre y foto, y sin quien tenga el modo invisible con Premium. Es
   * para decidir si merece la pena salir de casa, no para husmear perfiles.
   */
  attendees: async (eventId: string): Promise<Attendee[]> => {
    const { data, error } = await supabase.rpc('get_event_attendees_preview', {
      p_event_id: eventId,
    });

    if (error) fail(error, 'ATTENDEES_FAILED', 'errors.generic');

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar ?? undefined,
    }));
  },

  /** A quién descartaste en este evento. */
  passed: async (eventId: string): Promise<PassedProfile[]> => {
    const { data, error } = await supabase.rpc('get_passed_profiles', {
      p_event_id: eventId,
    });

    if (error) fail(error, 'PASSED_FAILED', 'errors.generic');

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      age: row.age,
      avatar: row.avatar ?? undefined,
      photos: row.photos ?? [],
      passedAt: row.passed_at,
    }));
  },

  /** Devuelve a alguien al tablón. */
  undoPass: async (profileId: string, eventId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('undo_pass', {
      p_profile_id: profileId,
      p_event_id: eventId,
    });

    if (error) fail(error, 'UNDO_FAILED', 'errors.generic');
    return data === true;
  },

  /** Pone tu tarjeta la primera durante una hora. Devuelve cuándo termina. */
  startBoost: async (eventId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('start_boost', { p_event_id: eventId });

    if (error) fail(error, 'BOOST_FAILED', 'errors.generic');
    return data as string;
  },

  /** Cuándo termina el impulso en marcha, o `null` si no hay ninguno. */
  currentBoost: async (eventId: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('my_boost', { p_event_id: eventId });

    if (error) {
      console.error('Error reading boost:', error);
      return null;
    }

    return (data as string | null) ?? null;
  },
};
