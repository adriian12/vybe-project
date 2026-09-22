import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';
import { isVibeLevel, VibeLevel } from '@/lib/vibe';
import type { Json } from '@/integrations/supabase/types';

/**
 * La noche en directo (migración 042): sorteos, retos, tarjeta de sellos,
 * canciones, Lista Vybe, termómetro, «¿dónde seguimos?» e informe semanal.
 *
 * Todo pasa por funciones de la base de datos que comprueban dentro quién
 * pregunta: quien está en el evento ve lo suyo; el local, lo de su local.
 */

/** Errores de estas funciones a claves de traducción. */
const ERRORS: Record<string, string> = {
  NOT_AUTHORIZED: 'venue.errors.notAuthorized',
  NOT_AT_EVENT: 'night.errors.notAtEvent',
  EVENT_ENDED: 'night.errors.eventEnded',
  DRAW_AFTER_END: 'night.errors.drawAfterEnd',
  SONGS_DISABLED: 'night.errors.songsDisabled',
  TOO_MANY_SONGS: 'night.errors.tooManySongs',
  INVALID_SONG: 'night.errors.invalidSong',
  STAMPS_DISABLED: 'night.errors.stampsDisabled',
  NOT_ENOUGH_STAMPS: 'night.errors.notEnoughStamps',
  CHALLENGE_NOT_DONE: 'night.errors.challengeNotDone',
  PLAN_UPGRADE_REQUIRED: 'venue.plan.errors.upgradeRequired',
  ALREADY_CLAIMED: 'night.errors.alreadyClaimed',
  PROMOTION_ENDED: 'night.errors.promotionEnded',
  PROMOTION_NOT_STARTED: 'night.errors.promotionNotStarted',
};

const fail = (message: string | undefined): ApiError => {
  const code = Object.keys(ERRORS).find((key) => message?.includes(key));
  return new ApiError(code ?? 'NIGHT_FAILED', code ? ERRORS[code] : 'errors.generic');
};

// ============================================================================
// Tipos
// ============================================================================

export type RaffleStatus = 'scheduled' | 'drawn' | 'cancelled' | 'no_participants';

export interface Raffle {
  id: string;
  prize: string;
  description: string | null;
  drawAt: string | null;
  status: RaffleStatus;
  winnerName: string | null;
  isMe: boolean;
  ticketCode: string | null;
  drawnAt: string | null;
  /** «VY-4F2A9C»: lo ven el ganador (para enseñarlo) y el local (para comprobarlo). */
  winnerCode: string | null;
}

export type ChallengeType = 'early_bird' | 'matches' | 'group' | 'stay_until' | 'first_visit';

export interface Challenge {
  promotionId: string;
  title: string;
  description: string | null;
  type: ChallengeType;
  progress: number;
  target: number;
  done: boolean;
  ticketCode: string | null;
  validated: boolean;
  endsAt: string | null;
  deadline: string | null;
}

export interface StampCard {
  venueId: string;
  venueName: string;
  eventCounts: boolean;
  stamps: number;
  required: number;
  rewardTitle: string;
  rewardDescription: string | null;
  canClaim: boolean;
}

export interface VenueStampCard {
  enabled: boolean;
  required: number;
  rewardTitle: string;
  rewardDescription: string | null;
  completed: number;
  collectors: number;
}

export interface SongRequest {
  id: string;
  title: string;
  artist: string | null;
  coverUrl: string | null;
  votes: number;
  myVote: boolean;
  mine: boolean;
  playedAt: string | null;
}

export interface SongResult {
  deezerId: number;
  title: string;
  artist: string | null;
  cover: string | null;
}

export interface IntentPerson {
  profileId: string;
  firstName: string;
  age: number | null;
  gender: string | null;
  avatar: string | null;
  markedAt: string;
  arrived: boolean;
}

export interface NextParty {
  eventId: string;
  eventName: string;
  venueName: string;
  venueType: string;
  city: string | null;
  startDate: string;
  endDate: string;
  posterUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  subscribed: boolean;
  vibeLevel: VibeLevel | null;
}

export interface WeeklyReportData {
  from: string;
  to: string;
  events: number;
  check_ins: number;
  check_ins_prev: number;
  unique_people: number;
  returning_people: number;
  intents: number;
  intents_arrived: number;
  matches: number;
  peak_hour: number | null;
  best_event: string | null;
  best_event_check_ins: number | null;
  top_code: string | null;
  top_code_check_ins: number | null;
  headcount_peak: number | null;
  promos_claimed: number;
  promos_validated: number;
  raffles: number;
  stamp_cards_completed: number;
  songs_requested: number;
  benchmark_check_ins_per_event: number | null;
  brought_people?: number;
  brought_by_intent?: number;
  brought_by_code?: number;
  brought_by_follow?: number;
  avg_spend?: number | null;
  estimated_revenue?: number | null;
  followers_total?: number;
  followers_new?: number;
  boosts?: number;
}

export interface WeeklyReport {
  id: string;
  weekStart: string;
  data: WeeklyReportData;
  createdAt: string;
  seenAt: string | null;
}

export type QueueLevel = 'none' | 'short' | 'long';

/** Un día del horario del local: 0 = lunes … 6 = domingo. */
export interface OpeningDay {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

export interface VenueProfile {
  id: string;
  name: string;
  type: string;
  city: string | null;
  region: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  openingHours: OpeningDay[];
  followers: number;
  iFollow: boolean;
  subscribed: boolean;
}

export interface VenueEventSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  posterUrl: string | null;
  price: number | null;
  theme: string | null;
  featured: boolean;
}

const leerHorario = (value: unknown): OpeningDay[] =>
  Array.isArray(value)
    ? value
        .filter((d): d is OpeningDay => typeof d === 'object' && d !== null && typeof (d as OpeningDay).day === 'number')
        .sort((a, b) => a.day - b.day)
    : [];

// ============================================================================
// Servicio
// ============================================================================

export const nightService = {
  // --------------------------------------------------------- ficha del local
  getVenueProfile: async (venueId: string): Promise<VenueProfile | null> => {
    const { data, error } = await supabase.rpc('get_venue_profile', { p_venue_id: venueId });
    const row = data?.[0];
    if (error || !row) return null;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      city: row.city,
      region: row.region,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      description: row.description,
      openingHours: leerHorario(row.opening_hours),
      followers: Number(row.followers),
      iFollow: row.i_follow,
      subscribed: row.subscribed,
    };
  },

  getVenueEvents: async (venueId: string): Promise<VenueEventSummary[]> => {
    const { data, error } = await supabase.rpc('get_venue_events_public', { p_venue_id: venueId });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      posterUrl: row.poster_url,
      price: row.price !== null ? Number(row.price) : null,
      theme: row.theme,
      featured: row.featured,
    }));
  },

  /** Seguir o dejar de seguir. Devuelve si ahora se sigue. */
  toggleFollow: async (venueId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('toggle_venue_follow', { p_venue_id: venueId });
    if (error) throw fail(error.message);
    return Boolean(data);
  },

  // ------------------------------------------------------- panel del local
  getFollowersSummary: async (): Promise<{ total: number; lastWeek: number }> => {
    const { data } = await supabase.rpc('get_venue_followers_summary');
    const row = data?.[0];
    return { total: Number(row?.total ?? 0), lastWeek: Number(row?.last_week ?? 0) };
  },

  /** Avisa a los seguidores de un evento. Devuelve false si ya se les avisó. */
  notifyFollowers: async (eventId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('notify_followers', { p_event_id: eventId });
    if (error) throw fail(error.message);
    return Boolean(data);
  },

  setAvgSpend: async (amount: number | null): Promise<void> => {
    const { error } = await supabase.rpc('set_venue_avg_spend', { p_amount: amount });
    if (error) throw fail(error.message);
  },

  /** Descripción, horario y gasto medio del local (lo edita el propietario). */
  updateVenueDetails: async (
    venueId: string,
    details: { description: string | null; openingHours: OpeningDay[] },
  ): Promise<void> => {
    const { error } = await supabase
      .from('venues')
      .update({ description: details.description, opening_hours: details.openingHours as unknown as Json })
      .eq('id', venueId);
    if (error) throw fail(error.message);
  },

  getVenueDetails: async (
    venueId: string,
  ): Promise<{ description: string | null; openingHours: OpeningDay[]; avgSpend: number | null }> => {
    const { data } = await supabase
      .from('venues')
      .select('description, opening_hours, avg_spend')
      .eq('id', venueId)
      .maybeSingle();
    return {
      description: data?.description ?? null,
      openingHours: leerHorario(data?.opening_hours),
      avgSpend: data?.avg_spend !== null && data?.avg_spend !== undefined ? Number(data.avg_spend) : null,
    };
  },

  /** Pago para destacar un evento. Devuelve la dirección de Stripe o null si no hay cobro configurado. */
  startBoostCheckout: async (eventId: string): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>('stripe-checkout', {
      body: { plan: 'event_boost', eventId, returnUrl: `${window.location.origin}/venue/dashboard` },
    });
    if (error) throw new ApiError('CHECKOUT_FAILED', 'venue.plan.checkoutFailed');
    if (data?.error === 'STRIPE_NOT_CONFIGURED') return null;
    if (!data?.url) throw new ApiError('CHECKOUT_FAILED', 'venue.plan.checkoutFailed');
    return data.url;
  },

  /** Qué tiene activado el evento: canciones y sellos. */
  getEventFlags: async (eventId: string): Promise<{ songs: boolean; stamps: boolean }> => {
    const { data } = await supabase
      .from('events')
      .select('song_requests_enabled, stamps_enabled')
      .eq('id', eventId)
      .maybeSingle();
    return { songs: Boolean(data?.song_requests_enabled), stamps: Boolean(data?.stamps_enabled) };
  },

  /** Estado de la noche para el panel: puerta, canciones, cola, lo que suena y precio. */
  getEventLive: async (
    eventId: string,
  ): Promise<{
    entryClosedAt: string | null;
    songs: boolean;
    stamps: boolean;
    queueLevel: QueueLevel | null;
    nowPlaying: string | null;
    price: number | null;
    ticketed: boolean;
  }> => {
    const { data } = await supabase
      .from('events')
      .select('entry_closed_at, song_requests_enabled, stamps_enabled, queue_level, now_playing, price, ticket_provider, booking_url')
      .eq('id', eventId)
      .maybeSingle();
    return {
      entryClosedAt: data?.entry_closed_at ?? null,
      songs: Boolean(data?.song_requests_enabled),
      stamps: Boolean(data?.stamps_enabled),
      queueLevel: (data?.queue_level as QueueLevel | null) ?? null,
      nowPlaying: data?.now_playing ?? null,
      price: data?.price !== null && data?.price !== undefined ? Number(data.price) : null,
      ticketed: Boolean(data?.ticket_provider || data?.booking_url),
    };
  },

  // ------------------------------------------------------------------ sorteos
  getRaffles: async (eventId: string): Promise<Raffle[]> => {
    const { data, error } = await supabase.rpc('get_event_raffles', { p_event_id: eventId });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      prize: row.prize,
      description: row.description,
      drawAt: row.draw_at,
      status: row.status as RaffleStatus,
      winnerName: row.winner_name,
      isMe: row.is_me,
      ticketCode: row.ticket_code,
      drawnAt: row.drawn_at,
      winnerCode: row.winner_code ?? null,
    }));
  },

  createRaffle: async (eventId: string, prize: string, description?: string, drawAt?: string): Promise<void> => {
    const { error } = await supabase.rpc('create_raffle', {
      p_event_id: eventId,
      p_prize: prize,
      p_description: description ?? null,
      p_draw_at: drawAt ?? null,
    });
    if (error) throw fail(error.message);
  },

  cancelRaffle: async (raffleId: string): Promise<void> => {
    const { error } = await supabase.rpc('cancel_raffle', { p_raffle_id: raffleId });
    if (error) throw fail(error.message);
  },

  /** Devuelve el nombre de pila de quien gana, o null si no había nadie dentro. */
  drawRaffle: async (raffleId: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('draw_raffle', { p_raffle_id: raffleId });
    if (error) throw fail(error.message);
    return (data as string | null) ?? null;
  },

  // -------------------------------------------------------------------- retos
  getChallenges: async (eventId: string): Promise<Challenge[]> => {
    const { data, error } = await supabase.rpc('get_event_challenges', { p_event_id: eventId });
    if (error || !data) return [];
    return data.map((row) => ({
      promotionId: row.promotion_id,
      title: row.title,
      description: row.description,
      type: row.challenge_type as ChallengeType,
      progress: row.progress,
      target: row.target,
      done: row.done,
      ticketCode: row.ticket_code,
      validated: row.validated,
      endsAt: row.ends_at,
      deadline: row.deadline,
    }));
  },

  /** El vale de un reto cumplido (usa `claim_promotion`, que lo comprueba). */
  claimChallenge: async (promotionId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('claim_promotion', { p_promotion_id: promotionId });
    if (error) throw fail(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('NIGHT_FAILED', 'errors.generic');
    return row.ticket_code;
  },

  // ------------------------------------------------------- tarjeta de sellos
  getMyStampCard: async (eventId: string): Promise<StampCard | null> => {
    const { data, error } = await supabase.rpc('get_my_stamp_card', { p_event_id: eventId });
    const row = data?.[0];
    if (error || !row) return null;
    return {
      venueId: row.venue_id,
      venueName: row.venue_name,
      eventCounts: row.event_counts,
      stamps: row.stamps,
      required: row.stamps_required,
      rewardTitle: row.reward_title,
      rewardDescription: row.reward_description,
      canClaim: row.can_claim,
    };
  },

  claimStampReward: async (eventId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('claim_stamp_reward', { p_event_id: eventId });
    if (error) throw fail(error.message);
    return data as string;
  },

  getVenueStampCard: async (): Promise<VenueStampCard | null> => {
    const { data, error } = await supabase.rpc('get_venue_stamp_card');
    const row = data?.[0];
    if (error || !row) return null;
    return {
      enabled: row.enabled,
      required: row.stamps_required,
      rewardTitle: row.reward_title,
      rewardDescription: row.reward_description,
      completed: Number(row.completed),
      collectors: Number(row.collectors),
    };
  },

  setVenueStampCard: async (card: {
    enabled: boolean;
    required: number;
    rewardTitle: string;
    rewardDescription?: string;
  }): Promise<void> => {
    const { error } = await supabase.rpc('set_venue_stamp_card', {
      p_enabled: card.enabled,
      p_stamps_required: card.required,
      p_reward_title: card.rewardTitle,
      p_reward_description: card.rewardDescription ?? null,
    });
    if (error) throw fail(error.message);
  },

  setEventStamps: async (eventId: string, enabled: boolean): Promise<void> => {
    const { error } = await supabase.rpc('set_event_stamps', { p_event_id: eventId, p_enabled: enabled });
    if (error) throw fail(error.message);
  },

  // ---------------------------------------------------------------- canciones
  searchSongs: async (query: string): Promise<SongResult[]> => {
    if (query.trim().length < 2) return [];
    const { data, error } = await supabase.functions.invoke<{ results: SongResult[] }>('song-search', {
      body: { q: query.trim() },
    });
    if (error || !data) return [];
    return data.results;
  },

  requestSong: async (
    eventId: string,
    song: { title: string; artist?: string | null; deezerId?: number | null; cover?: string | null },
  ): Promise<void> => {
    const { error } = await supabase.rpc('request_song', {
      p_event_id: eventId,
      p_title: song.title,
      p_artist: song.artist ?? null,
      p_deezer_id: song.deezerId ?? null,
      p_cover_url: song.cover ?? null,
    });
    if (error) throw fail(error.message);
  },

  toggleSongVote: async (requestId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('toggle_song_vote', { p_request_id: requestId });
    if (error) throw fail(error.message);
    return Boolean(data);
  },

  getSongRanking: async (eventId: string): Promise<SongRequest[]> => {
    const { data, error } = await supabase.rpc('get_song_ranking', { p_event_id: eventId });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      coverUrl: row.cover_url,
      votes: Number(row.votes),
      myVote: row.my_vote,
      mine: row.mine ?? false,
      playedAt: row.played_at,
    }));
  },

  markSongPlayed: async (requestId: string): Promise<void> => {
    const { error } = await supabase.rpc('mark_song_played', { p_request_id: requestId });
    if (error) throw fail(error.message);
  },

  setEventSongs: async (eventId: string, enabled: boolean): Promise<void> => {
    const { error } = await supabase.rpc('set_event_songs', { p_event_id: eventId, p_enabled: enabled });
    if (error) throw fail(error.message);
  },

  // --------------------------------------------------------------- Lista Vybe
  getIntentList: async (eventId: string): Promise<IntentPerson[]> => {
    const { data, error } = await supabase.rpc('get_event_intent_list', { p_event_id: eventId });
    if (error || !data) return [];
    return data.map((row) => ({
      profileId: row.profile_id,
      firstName: row.first_name,
      age: row.age,
      gender: row.gender,
      avatar: row.avatar,
      markedAt: row.marked_at,
      arrived: row.arrived,
    }));
  },

  // ------------------------------------------------------ puerta y termómetro
  /** Abre o cierra la entrada. Devuelve cuándo se cerró, o null si está abierta. */
  setEntry: async (eventId: string, open: boolean): Promise<string | null> => {
    const { data, error } = await supabase.rpc('set_event_entry', { p_event_id: eventId, p_open: open });
    if (error) throw fail(error.message);
    return (data as string | null) ?? null;
  },

  setLiveInfo: async (eventId: string, info: { queue?: QueueLevel; nowPlaying?: string }): Promise<void> => {
    const { error } = await supabase.rpc('set_event_live_info', {
      p_event_id: eventId,
      p_queue_level: info.queue ?? null,
      p_now_playing: info.nowPlaying ?? null,
    });
    if (error) throw fail(error.message);
  },

  // --------------------------------------------------------- ¿dónde seguimos?
  getNextParties: async (
    after: string,
    position: { latitude: number; longitude: number } | null,
    excludeEventId?: string,
  ): Promise<NextParty[]> => {
    const { data, error } = await supabase.rpc('get_next_parties', {
      p_after: after,
      p_latitude: position?.latitude ?? null,
      p_longitude: position?.longitude ?? null,
      p_exclude_event: excludeEventId ?? null,
    });
    if (error || !data) return [];
    return data.map((row) => ({
      eventId: row.event_id,
      eventName: row.event_name,
      venueName: row.venue_name,
      venueType: row.venue_type,
      city: row.city,
      startDate: row.start_date,
      endDate: row.end_date,
      posterUrl: row.poster_url,
      latitude: row.latitude,
      longitude: row.longitude,
      distance: row.distance_meters,
      subscribed: row.subscribed,
      vibeLevel: isVibeLevel(row.vibe_level) ? row.vibe_level : null,
    }));
  },

  // ---------------------------------------------------------- informe semanal
  getWeeklyReports: async (limit = 8): Promise<WeeklyReport[]> => {
    const { data, error } = await supabase.rpc('get_weekly_reports', { p_limit: limit });
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      weekStart: row.week_start,
      data: row.data as unknown as WeeklyReportData,
      createdAt: row.created_at,
      seenAt: row.seen_at,
    }));
  },

  markReportSeen: async (reportId: string): Promise<void> => {
    await supabase.rpc('mark_weekly_report_seen', { p_report_id: reportId });
  },
};
