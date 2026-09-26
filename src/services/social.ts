import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';
import { User } from '@/types/user';
import { isVibeLevel, VibeLevel } from '@/lib/vibe';

export interface Interest {
  id: string;
  slug: string;
  category: string;
}

/** Un like recibido tal como lo ve quien no es premium. */
export interface LikePreview {
  key: string;
  /** PNG de 10 × 12 en `data:`, o null si no había foto. */
  preview: string | null;
  /** Sólo en un super like: se ve tal cual, con nombre y foto. */
  profileId: string | null;
  name: string | null;
  age: number | null;
  photo: string | null;
  swipeType: 'like' | 'super_like';
  eventName: string | null;
  likedAt: string;
}

export interface LikeReceived {
  id: string;
  name: string;
  age: number;
  bio: string;
  photos: string[];
  avatar?: string;
  swipeType: 'like' | 'super_like';
  eventName?: string;
  likedAt: string;
}

/** Lo que se sabe de un evento en este momento, sin datos privados del local. */
export interface EventActivity {
  /** Gente con Vybe que ha marcado «voy a ir». */
  going: number;
  /** Gente con Vybe dentro ahora. */
  inside: number;
  /** Ambiente según el total del local; null si no cuenta o el dato es viejo. */
  vibeLevel: VibeLevel | null;
  /** Cuándo actualizó el local su total. */
  vibeAt: string | null;
  /** Conexiones guardadas de quien pregunta que van a ir. */
  friendsGoing: number;
  /** Termómetro: si la sala se llena o se vacía (null si no se sabe). */
  trend: 'up' | 'down' | 'steady' | null;
  /**
   * % de mujeres entre la gente con la app dentro, en decenas (null con menos
   * de 10, o si el negocio no lo publica: `show_gender_split`).
   */
  womenShare: number | null;
  /** Cola en la puerta según el local (de los últimos 45 min). */
  queueLevel: 'none' | 'short' | 'long' | null;
  /** Lo que suena, según el local (de la última media hora). */
  nowPlaying: string | null;
  /** La puerta está cerrada: ya no entra nadie nuevo. */
  entryClosed: boolean;
  /**
   * Cuánta gente hay dentro ahora, sólo si el negocio lo publica
   * (`show_headcount`) y la fiesta está en marcha: el total de la puerta o, si
   * no lo lleva, quien entró con la app.
   */
  headcount: number | null;
  /** Si en esta fiesta se puede conocer gente (tablón y swipe). */
  swipeEnabled: boolean;
}

export const EMPTY_ACTIVITY: EventActivity = {
  going: 0,
  inside: 0,
  vibeLevel: null,
  vibeAt: null,
  friendsGoing: 0,
  trend: null,
  womenShare: null,
  queueLevel: null,
  nowPlaying: null,
  entryClosed: false,
  headcount: null,
  swipeEnabled: true,
};

export interface Reputation {
  eventsAttended: number;
  connectionsMade: number;
  reportsReceived: number;
  memberSince: string;
  isVerified: boolean;
}

export interface EventHistoryItem {
  eventId: string;
  eventName: string;
  venueName: string;
  startDate: string;
  checkedInAt: string;
  connectionsMade: number;
}

export interface Group {
  groupId: string;
  name: string;
  memberCount: number;
  avatars: string[];
  isMine: boolean;
}

export interface GroupMessage {
  id: string;
  profileId: string;
  authorName: string;
  authorPhoto: string | null;
  content: string;
  createdAt: string;
}

export interface GroupMember {
  profileId: string;
  name: string;
  photo: string | null;
  isOwner: boolean;
  joinedAt: string;
}

export interface EventOffer {
  id: string;
  title: string;
  description: string | null;
  kind: 'offer' | 'voucher' | 'ticket' | 'prize' | 'challenge';
  endsAt: string | null;
  premiumOnly: boolean;
}

export interface ClaimedOffer {
  id: string;
  promotionId: string;
  ticketCode: string;
  claimedAt: string;
  /** Cuándo lo validó el personal. Hasta entonces sigue sirviendo. */
  validatedAt: string | null;
}

export interface DiscoveryFilters {
  minAge?: number;
  maxAge?: number;
  interestSlugs?: string[];
}

/** Mapea los errores de las funciones de grupo a claves de traducción. */
const GROUP_ERROR_KEYS: Record<string, string> = {
  ALREADY_IN_GROUP: 'groups.errors.alreadyInGroup',
  GROUP_NOT_FOUND: 'groups.errors.notFound',
  NOT_AT_EVENT: 'groups.errors.notAtEvent',
  GROUP_FULL: 'groups.errors.full',
  PREMIUM_REQUIRED: 'groups.errors.premiumRequired',
  NOT_A_MEMBER: 'groups.errors.notAMember',
  NOT_AUTHORIZED: 'groups.errors.notOwner',
  CANNOT_REMOVE_OWNER: 'groups.errors.cannotRemoveOwner',
  RATE_LIMITED_MESSAGES: 'errors.rateLimited',
};

/** Errores de las ofertas del local. */
const OFFER_ERROR_KEYS = {
  NOT_AT_EVENT: 'offers.errors.notAtEvent',
  ALREADY_CLAIMED: 'offers.errors.alreadyClaimed',
  PROMOTION_EXHAUSTED: 'offers.errors.exhausted',
  PROMOTION_ENDED: 'offers.errors.ended',
  PROMOTION_NOT_STARTED: 'offers.errors.notStarted',
  PREMIUM_REQUIRED: 'offers.errors.premiumRequired',
  PROMOTION_NOT_FOUND: 'offers.errors.notFound',
} as const;

const offerError = (message: string): ApiError => {
  const code = Object.keys(OFFER_ERROR_KEYS).find((key) => message.includes(key));
  return new ApiError(
    code ?? 'OFFER_FAILED',
    code ? OFFER_ERROR_KEYS[code as keyof typeof OFFER_ERROR_KEYS] : 'errors.generic',
  );
};

const groupError = (message: string): ApiError => {
  const code = Object.keys(GROUP_ERROR_KEYS).find((key) => message.includes(key));
  return new ApiError(code ?? 'GROUP_FAILED', code ? GROUP_ERROR_KEYS[code] : 'errors.generic');
};

export const socialService = {
  // ==========================================================================
  // INTERESES
  // ==========================================================================

  getInterests: async (): Promise<Interest[]> => {
    const { data, error } = await supabase
      .from('interests')
      .select('id, slug, category')
      .order('sort_order');

    if (error || !data) return [];
    return data;
  },

  getMyInterests: async (): Promise<string[]> => {
    const { data } = await supabase
      .from('profile_interests')
      .select('interest_id, interests!inner(slug)');

    return (data ?? []).map((row) => (row.interests as { slug: string }).slug);
  },

  setMyInterests: async (interestIds: string[]): Promise<void> => {
    const { data: profile } = await supabase.rpc('current_profile_id');
    if (!profile) throw new ApiError('PROFILE_NOT_FOUND', 'errors.generic');

    // Reemplazo completo: es más simple y el conjunto siempre es pequeño.
    await supabase.from('profile_interests').delete().eq('profile_id', profile);

    if (interestIds.length > 0) {
      const { error } = await supabase
        .from('profile_interests')
        .insert(interestIds.map((id) => ({ profile_id: profile, interest_id: id })));

      if (error) throw new ApiError('SAVE_FAILED', 'errors.generic');
    }
  },

  // ==========================================================================
  // DESCUBRIMIENTO CON FILTROS
  // ==========================================================================

  getNearbyProfiles: async (
    latitude: number,
    longitude: number,
    radiusMeters: number,
    eventId: string | undefined,
    filters: DiscoveryFilters = {},
  ): Promise<User[]> => {
    const { data: profileId } = await supabase.rpc('current_profile_id');
    if (!profileId) return [];

    const { data, error } = await supabase.rpc('get_nearby_profiles', {
      p_user_id: profileId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_meters: radiusMeters,
      p_event_id: eventId ?? null,
      p_min_age: filters.minAge ?? null,
      p_max_age: filters.maxAge ?? null,
      p_interest_slugs: filters.interestSlugs?.length ? filters.interestSlugs : null,
    });

    if (error) {
      console.error('Error getting nearby profiles:', error);
      return [];
    }

    return (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      age: p.age,
      bio: p.bio || '',
      photos: p.photos || [],
      avatar: p.avatar || undefined,
      isVerified: p.is_verified,
      distance: Math.round(p.distance_meters),
      interests: p.interests || [],
      sharedInterests: p.shared_interests,
    }));
  },

  // ==========================================================================
  // QUIÉN TE HA DADO LIKE (Premium)
  // ==========================================================================

  /**
   * «Le gustas» sin premium: miniaturas pixeladas hechas en el servidor, sin
   * nombre ni id. La foto real no llega nunca al móvil.
   */
  getLikesPreview: async (): Promise<LikePreview[]> => {
    const { data, error } = await supabase.functions.invoke<{ likes?: LikePreview[] }>('likes-preview', {
      body: {},
    });
    if (error) {
      console.error('Error getting likes preview:', error);
      return [];
    }
    return data?.likes ?? [];
  },

  getLikesReceived: async (): Promise<LikeReceived[]> => {
    const { data, error } = await supabase.rpc('get_likes_received');

    if (error) {
      if (error.message.includes('PREMIUM_REQUIRED')) {
        throw new ApiError('PREMIUM_REQUIRED', 'likes.locked');
      }
      console.error('Error getting likes:', error);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      age: row.age,
      bio: row.bio || '',
      photos: row.photos || [],
      avatar: row.avatar || undefined,
      swipeType: row.swipe_type as 'like' | 'super_like',
      eventName: row.event_name || undefined,
      likedAt: row.liked_at,
    }));
  },

  // ==========================================================================
  // REPUTACIÓN E HISTORIAL
  // ==========================================================================

  getReputation: async (profileId: string): Promise<Reputation | null> => {
    const { data, error } = await supabase.rpc('get_profile_reputation', {
      p_profile_id: profileId,
    });

    if (error || !data?.[0]) return null;
    const row = data[0];

    return {
      eventsAttended: Number(row.events_attended),
      connectionsMade: Number(row.connections_made),
      reportsReceived: Number(row.reports_received),
      memberSince: row.member_since,
      isVerified: row.is_verified,
    };
  },

  getEventHistory: async (): Promise<EventHistoryItem[]> => {
    const { data, error } = await supabase.rpc('get_my_event_history');
    if (error || !data) return [];

    return data.map((row) => ({
      eventId: row.event_id,
      eventName: row.event_name,
      venueName: row.venue_name,
      startDate: row.start_date,
      checkedInAt: row.checked_in_at,
      connectionsMade: Number(row.connections_made),
    }));
  },

  // ==========================================================================
  // INTENCIÓN DE ASISTIR (problema de la sala vacía)
  // ==========================================================================

  /**
   * Cuánta gente con Vybe va y está dentro, y el ambiente que da el local.
   * El total real del local no llega nunca: sólo el nivel (`vibeLevel`).
   */
  getEventsActivity: async (eventIds: string[]): Promise<Record<string, EventActivity>> => {
    if (eventIds.length === 0) return {};

    const { data, error } = await supabase.rpc('get_events_activity', {
      p_event_ids: eventIds,
    });

    if (error || !data) return {};

    return data.reduce<Record<string, EventActivity>>((acc, row) => {
      acc[row.event_id] = {
        going: Number(row.going),
        inside: Number(row.inside),
        vibeLevel: isVibeLevel(row.vibe_level) ? row.vibe_level : null,
        vibeAt: row.vibe_at ?? null,
        friendsGoing: Number(row.friends_going ?? 0),
        trend: row.trend === 'up' || row.trend === 'down' || row.trend === 'steady' ? row.trend : null,
        womenShare: row.women_share ?? null,
        queueLevel:
          row.queue_level === 'none' || row.queue_level === 'short' || row.queue_level === 'long'
            ? row.queue_level
            : null,
        nowPlaying: row.now_playing ?? null,
        entryClosed: Boolean(row.entry_closed),
        headcount: row.headcount ?? null,
        swipeEnabled: row.swipe_enabled !== false,
      };
      return acc;
    }, {});
  },

  setIntent: async (eventId: string, going: boolean): Promise<void> => {
    const { data: profileId } = await supabase.rpc('current_profile_id');
    if (!profileId) throw new ApiError('PROFILE_NOT_FOUND', 'errors.generic');

    if (going) {
      await supabase
        .from('event_intents')
        .upsert({ event_id: eventId, profile_id: profileId }, { onConflict: 'event_id,profile_id' });
    } else {
      await supabase
        .from('event_intents')
        .delete()
        .eq('event_id', eventId)
        .eq('profile_id', profileId);
    }
  },

  getMyIntents: async (): Promise<string[]> => {
    const { data } = await supabase.from('event_intents').select('event_id');
    return (data ?? []).map((row) => row.event_id);
  },

  // ==========================================================================
  // GRUPOS
  // ==========================================================================

  createGroup: async (eventId: string, name: string): Promise<{ id: string; code: string }> => {
    const { data, error } = await supabase.rpc('create_group', {
      p_event_id: eventId,
      p_name: name,
    });

    if (error) throw groupError(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('GROUP_FAILED', 'errors.generic');

    return { id: row.group_id, code: row.join_code };
  },

  joinGroup: async (code: string): Promise<string> => {
    const { data, error } = await supabase.rpc('join_group', { p_join_code: code });
    if (error) throw groupError(error.message);
    return data as string;
  },

  leaveGroup: async (groupId: string): Promise<void> => {
    const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
    if (error) throw groupError(error.message);
  },

  getEventGroups: async (eventId: string): Promise<Group[]> => {
    const { data, error } = await supabase.rpc('get_event_groups', { p_event_id: eventId });
    if (error || !data) return [];

    return data.map((row) => ({
      groupId: row.group_id,
      name: row.name,
      memberCount: Number(row.member_count),
      avatars: (row.avatars || []).filter(Boolean),
      isMine: row.is_mine,
    }));
  },

  getGroupMessages: async (groupId: string): Promise<GroupMessage[]> => {
    const { data, error } = await supabase.rpc('get_group_messages', { p_group_id: groupId });
    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      authorName: row.author_name,
      authorPhoto: row.author_photo,
      content: row.content,
      createdAt: row.created_at,
    }));
  },

  sendGroupMessage: async (groupId: string, content: string): Promise<void> => {
    const { data: profileId } = await supabase.rpc('current_profile_id');
    if (!profileId) throw new ApiError('PROFILE_NOT_FOUND', 'errors.generic');

    const { error } = await supabase
      .from('group_messages')
      .insert({ group_id: groupId, profile_id: profileId, content: content.trim() });

    if (error) throw groupError(error.message);
  },

  getGroupMembers: async (groupId: string): Promise<GroupMember[]> => {
    const { data, error } = await supabase.rpc('get_group_members', { p_group_id: groupId });
    if (error || !data) return [];

    return data.map((row) => ({
      profileId: row.profile_id,
      name: row.name,
      photo: row.photo,
      isOwner: row.is_owner,
      joinedAt: row.joined_at,
    }));
  },

  removeGroupMember: async (groupId: string, profileId: string): Promise<void> => {
    const { error } = await supabase.rpc('remove_group_member', {
      p_group_id: groupId,
      p_profile_id: profileId,
    });
    if (error) throw groupError(error.message);
  },

  /**
   * Escucha los mensajes nuevos del grupo.
   *
   * Devuelve la función para dejar de escuchar; sin ella el canal sigue abierto
   * al cerrar el panel y los mensajes se duplican al volver a abrirlo.
   */
  subscribeToGroupMessages: (groupId: string, onMessage: () => void): (() => void) => {
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        () => onMessage(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  // ==========================================================================
  // OFERTAS DEL LOCAL
  // ==========================================================================

  /**
   * Ofertas visibles dentro del evento.
   *
   * La policy ya limita la consulta a quien ha hecho check-in, así que aquí no
   * hace falta filtrar por asistencia: si no estás dentro, no vuelve nada.
   */
  getEventOffers: async (eventId: string): Promise<EventOffer[]> => {
    const { data, error } = await supabase
      .from('promotions')
      .select('id, title, description, kind, ends_at, premium_only')
      .eq('event_id', eventId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    const now = Date.now();
    return data
      .filter((row) => !row.ends_at || new Date(row.ends_at).getTime() > now)
      .map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        kind: row.kind as EventOffer['kind'],
        endsAt: row.ends_at,
        premiumOnly: row.premium_only,
      }));
  },

  claimOffer: async (promotionId: string): Promise<{ ticketCode: string; title: string }> => {
    const { data, error } = await supabase.rpc('claim_promotion', {
      p_promotion_id: promotionId,
    });

    if (error) throw offerError(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('OFFER_FAILED', 'errors.generic');

    return { ticketCode: row.ticket_code, title: row.title };
  },

  getMyClaimedOffers: async (): Promise<ClaimedOffer[]> => {
    const { data, error } = await supabase
      .from('promotion_redemptions')
      .select('id, promotion_id, ticket_code, claimed_at, validated_at');

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      promotionId: row.promotion_id,
      ticketCode: row.ticket_code,
      claimedAt: row.claimed_at,
      validatedAt: row.validated_at,
    }));
  },

  getMyGroup: async (eventId: string): Promise<{ id: string; code: string } | null> => {
    const { data: groupId } = await supabase.rpc('current_group_id', { p_event_id: eventId });
    if (!groupId) return null;

    const { data } = await supabase
      .from('groups')
      .select('id, join_code')
      .eq('id', groupId as string)
      .maybeSingle();

    return data ? { id: data.id, code: data.join_code } : null;
  },

  // ==========================================================================
  // CHAT EFÍMERO
  // ==========================================================================

  // `keepConnection` vive ahora en `services/premium-night.ts`: con Premium
  // basta con que la guarde una de las dos personas, y esa función devuelve si
  // la conexión ya está a salvo o todavía espera a la otra.

  // ==========================================================================
  // TICKETING
  // ==========================================================================

  /** Registra el clic antes de abrir la web de reservas del local. */
  trackBookingClick: async (eventId: string): Promise<void> => {
    const { data: profileId } = await supabase.rpc('current_profile_id');
    await supabase.from('booking_clicks').insert({
      event_id: eventId,
      profile_id: (profileId as string | null) ?? null,
    });
  },
};
