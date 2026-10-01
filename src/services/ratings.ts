import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/**
 * Valoraciones de las fiestas (migración 068).
 *
 * Valora quien estuvo dentro, una vez por fiesta (puede cambiarla). En la
 * ficha sólo se enseña la media con tres valoraciones o más; el local ve el
 * detalle en Pro y Business, con los comentarios sin nombre.
 */

export interface RatingInput {
  overall: number;
  music?: number | null;
  atmosphere?: number | null;
  price?: number | null;
  comment?: string | null;
}

export interface PendingRating {
  eventId: string;
  eventName: string;
  venueName: string;
  startDate: string;
}

export interface EventRating {
  eventAvg: number | null;
  eventCount: number;
  venueAvg: number | null;
  venueCount: number;
  myRating: number | null;
}

export interface VenueRatings {
  summary: {
    count: number;
    overall: number | null;
    music: number | null;
    atmosphere: number | null;
    price: number | null;
    last30: number | null;
    prev30: number | null;
  };
  distribution: { stars: number; count: number }[];
  nights: { eventId: string; name: string; startDate: string; avg: number; count: number }[];
  comments: { overall: number; comment: string; createdAt: string; eventName: string }[];
}

/** «4,6». */
export const nota = (valor: number) =>
  valor.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export const ratingsService = {
  rate: async (eventId: string, input: RatingInput): Promise<void> => {
    const { error } = await supabase.rpc('rate_event', {
      p_event_id: eventId,
      p_overall: input.overall,
      p_music: input.music ?? null,
      p_atmosphere: input.atmosphere ?? null,
      p_price: input.price ?? null,
      p_comment: input.comment ?? null,
    } as never);
    if (error) {
      throw new ApiError(
        error.message.includes('NOT_ATTENDED') ? 'NOT_ATTENDED' : 'RATE_FAILED',
        error.message.includes('NOT_ATTENDED') ? 'rating.errors.notAttended' : 'errors.generic',
      );
    }
  },

  getPending: async (): Promise<PendingRating | null> => {
    const { data, error } = await supabase.rpc('my_pending_rating');
    const row = !error && data?.[0];
    if (!row) return null;
    return { eventId: row.event_id, eventName: row.event_name, venueName: row.venue_name, startDate: row.start_date };
  },

  getForEvent: async (eventId: string): Promise<EventRating | null> => {
    const { data, error } = await supabase.rpc('get_event_rating', { p_event_id: eventId });
    const row = !error && data?.[0];
    if (!row) return null;
    return {
      eventAvg: num(row.event_avg),
      eventCount: row.event_count ?? 0,
      venueAvg: num(row.venue_avg),
      venueCount: row.venue_count ?? 0,
      myRating: row.my_rating,
    };
  },

  /** Panel del local. Lanza `PLAN_REQUIRED` en el plan gratuito. */
  getVenue: async (): Promise<VenueRatings> => {
    const { data, error } = await supabase.rpc('get_venue_ratings');
    if (error) {
      const plan = error.message.includes('PLAN_REQUIRED');
      throw new ApiError(plan ? 'PLAN_REQUIRED' : 'RATINGS_FAILED', plan ? 'sales.errors.planRequired' : 'errors.generic');
    }
    const raw = (data ?? {}) as Record<string, unknown>;
    const s = (raw.summary ?? {}) as Record<string, unknown>;
    return {
      summary: {
        count: Number(s.count ?? 0),
        overall: num(s.overall),
        music: num(s.music),
        atmosphere: num(s.atmosphere),
        price: num(s.price),
        last30: num(s.last30),
        prev30: num(s.prev30),
      },
      distribution: ((raw.distribution ?? []) as { stars: number; count: number }[]).map((d) => ({
        stars: Number(d.stars),
        count: Number(d.count),
      })),
      nights: ((raw.nights ?? []) as Record<string, unknown>[]).map((n) => ({
        eventId: String(n.event_id),
        name: String(n.name),
        startDate: String(n.start_date),
        avg: Number(n.avg),
        count: Number(n.count),
      })),
      comments: ((raw.comments ?? []) as Record<string, unknown>[]).map((c) => ({
        overall: Number(c.overall),
        comment: String(c.comment),
        createdAt: String(c.created_at),
        eventName: String(c.event_name),
      })),
    };
  },
};
