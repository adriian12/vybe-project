import { User, Message, Report, ReportType, MatchConnection } from '@/types/user';
import { Venue, VenueType, Event, EventAccess, VenueStats } from '@/types/venue';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { calculateDistance } from '@/services/geo';

type ProfileRow = Tables<'profiles'>;
type EventRow = Tables<'events'>;
type VenueRow = Tables<'venues'>;
type MessageRow = Tables<'messages'>;

/** Mensajes recientes que se cargan al arrancar, entre todas las conversaciones. */
const RECENT_MESSAGES_LIMIT = 200;
/** Tamaño de página al desplazarse hacia atrás dentro de un chat. */
const CONVERSATION_PAGE_SIZE = 50;

export type StorageBucket = 'avatars' | 'event-photos' | 'documents';

/** Error de dominio con un código estable que la UI puede traducir. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const profileToUser = (profile: ProfileRow, distance?: number): User => ({
  id: profile.id,
  name: profile.name,
  age: profile.age,
  bio: profile.bio || '',
  photos: profile.photos || [],
  avatar: profile.avatar || undefined,
  email: profile.email || undefined,
  role: profile.role === 'admin' ? 'admin' : 'user',
  isVerified: profile.is_verified,
  isInvisible: profile.is_invisible,
  languages: profile.languages ?? [],
  planTonight: profile.plan_tonight ?? undefined,
  gender: (profile.gender as User['gender']) ?? undefined,
  wants: (profile.wants as User['wants']) ?? 'all',
  status: profile.status as User['status'],
  notifyMatches: profile.notify_matches,
  notifyMessages: profile.notify_messages,
  phone: profile.phone || undefined,
  phoneVerified: profile.phone_verified,
  faceVerified: profile.face_verified,
  distance,
  location:
    profile.latitude !== null && profile.longitude !== null
      ? { latitude: profile.latitude, longitude: profile.longitude }
      : undefined,
});

const venueRowToVenue = (venue: VenueRow): Venue => ({
  id: venue.id,
  name: venue.name,
  email: venue.email,
  type: venue.type as VenueType,
  isVerified: venue.is_verified,
  verificationStatus: venue.verification_status as Venue['verificationStatus'],
  eventRadius: venue.event_radius,
  phone: venue.phone || undefined,
  taxId: venue.tax_id || undefined,
  postalAddress: venue.address || undefined,
  documents: venue.documents || [],
  createdAt: venue.created_at,
  location:
    venue.latitude !== null && venue.longitude !== null
      ? { latitude: venue.latitude, longitude: venue.longitude }
      : undefined,
});

const dbEventToEvent = (dbEvent: EventRow, venue?: VenueRow): Event => ({
  id: dbEvent.id,
  name: dbEvent.name,
  venueId: dbEvent.venue_id,
  venueName: venue?.name,
  venueType: venue?.type as VenueType | undefined,
  eventRadius: venue?.event_radius,
  city: venue?.city ?? undefined,
  region: venue?.region ?? undefined,
  startDate: dbEvent.start_date,
  endDate: dbEvent.end_date,
  minAge: dbEvent.min_age ?? undefined,
  maxAge: dbEvent.max_age ?? undefined,
  theme: dbEvent.theme ?? undefined,
  dressCode: dbEvent.dress_code ?? undefined,
  price: dbEvent.price !== null ? Number(dbEvent.price) : undefined,
  bookingUrl: dbEvent.booking_url ?? undefined,
  posterUrl: dbEvent.poster_url ?? undefined,
  qrCode: dbEvent.qr_code ?? undefined,
  description: dbEvent.description ?? undefined,
  maxCapacity: dbEvent.max_capacity ?? undefined,
  recurrence: (dbEvent.recurrence as Event['recurrence']) ?? 'none',
  // La dirección es la del local: el evento no tiene columna propia, y la
  // tarjeta de «Cómo llegar» la necesita escrita, no sólo el punto del mapa.
  location:
    dbEvent.latitude !== null && dbEvent.longitude !== null
      ? { latitude: dbEvent.latitude, longitude: dbEvent.longitude, address: venue?.address ?? undefined }
      : venue?.latitude !== null && venue?.latitude !== undefined && venue?.longitude !== null
        ? {
            latitude: venue.latitude,
            longitude: venue.longitude as number,
            address: venue.address ?? undefined,
          }
        : undefined,
});

const dbMessageToMessage = (dbMessage: MessageRow): Message => ({
  id: dbMessage.id,
  senderId: dbMessage.sender_id,
  receiverId: dbMessage.receiver_id,
  content: dbMessage.content,
  read: dbMessage.read,
  createdAt: dbMessage.created_at,
});

/** Id de auth del usuario con sesión activa, o null. */
const authUserId = async (): Promise<string | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};

/** Id del perfil (tabla profiles) del usuario con sesión activa. */
const currentProfileId = async (): Promise<string | null> => {
  const userId = await authUserId();
  if (!userId) return null;

  const { data } = await supabase.from('profiles').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
};

const requireProfileId = async (): Promise<string> => {
  const profileId = await currentProfileId();
  if (!profileId) throw new ApiError('PROFILE_NOT_FOUND', 'No se encontró tu perfil');
  return profileId;
};

/** Traduce los errores que lanza redeem_event_code() a mensajes para el usuario. */
const REDEEM_ERRORS: Record<string, string> = {
  PROFILE_NOT_FOUND: 'No se encontró tu perfil. Vuelve a iniciar sesión.',
  INVALID_CODE: 'El código no es válido o ya ha caducado.',
  VENUE_NOT_VERIFIED: 'El local todavía no está verificado por Vybe.',
  NO_ACTIVE_EVENT: 'Este local no tiene ningún evento activo ahora mismo.',
  EVENT_ENDED: 'El evento ya ha terminado.',
  TOO_FAR: 'Estás demasiado lejos del evento. Acércate para poder entrar.',
};

const parseRedeemError = (message: string): ApiError => {
  const code = Object.keys(REDEEM_ERRORS).find((key) => message.includes(key));
  return code
    ? new ApiError(code, REDEEM_ERRORS[code])
    : new ApiError('REDEEM_FAILED', 'No se pudo validar el código. Inténtalo de nuevo.');
};

export const api = {
  // ==========================================================================
  // ACCESO A EVENTOS
  // ==========================================================================

  /**
   * Canjea un código de acceso.
   *
   * Toda la validación (vigencia del código, venue verificado, evento en curso
   * y geocerca) ocurre en el servidor dentro de redeem_event_code(). El cliente
   * ya no puede leer la tabla event_codes ni saltarse la comprobación.
   */
  /**
   * Evento en el que el usuario sigue estando, según el servidor.
   *
   * El check-in vive en `event_attendance`, no en el navegador, así que cerrar
   * sesión o cambiar de teléfono ya no te deja fuera de una fiesta que sigue en
   * marcha.
   */
  getActiveEvent: async (): Promise<EventAccess | null> => {
    const { data, error } = await supabase.rpc('get_my_active_event');
    if (error || !data?.[0]) return null;

    const row = data[0];
    return {
      eventId: row.event_id,
      eventName: row.event_name,
      venueId: row.venue_id,
      venueName: row.venue_name,
      venueType: row.venue_type as VenueType,
      eventRadius: row.event_radius,
      startDate: row.start_date,
      endDate: row.end_date,
      distanceMeters: null,
      photoUrl: row.photo_url,
    };
  },

  /** Guarda la foto que la persona se hace al entrar al evento. */
  setEventPhoto: async (eventId: string, photoUrl: string): Promise<void> => {
    const { error } = await supabase.rpc('set_event_photo', {
      p_event_id: eventId,
      p_photo_url: photoUrl,
    });
    if (error) throw new ApiError('EVENT_PHOTO_FAILED', 'errors.generic');
  },

  redeemEventCode: async (
    code: string,
    latitude?: number,
    longitude?: number,
  ): Promise<EventAccess> => {
    const { data, error } = await supabase.rpc('redeem_event_code', {
      p_code: code,
      p_latitude: latitude ?? null,
      p_longitude: longitude ?? null,
    });

    if (error) throw parseRedeemError(error.message);
    const row = data?.[0];
    if (!row) throw new ApiError('INVALID_CODE', REDEEM_ERRORS.INVALID_CODE);

    return {
      eventId: row.event_id,
      eventName: row.event_name,
      venueId: row.venue_id,
      venueName: row.venue_name,
      venueType: row.venue_type as VenueType,
      eventRadius: row.event_radius,
      startDate: row.start_date,
      endDate: row.end_date,
      distanceMeters: row.distance_meters,
    };
  },

  /** Refresca la asistencia para que el usuario siga contando como presente. */
  heartbeatAttendance: async (
    eventId: string,
    latitude?: number,
    longitude?: number,
  ): Promise<void> => {
    await supabase.rpc('heartbeat_event_attendance', {
      p_event_id: eventId,
      p_latitude: latitude ?? null,
      p_longitude: longitude ?? null,
    });
  },

  /** Eventos a los que el usuario ha hecho check-in y siguen vigentes. */
  getMyActiveEventIds: async (): Promise<string[]> => {
    const profileId = await currentProfileId();
    if (!profileId) return [];

    const { data } = await supabase
      .from('event_attendance')
      .select('event_id, events!inner(end_date)')
      .eq('profile_id', profileId)
      .gt('events.end_date', new Date().toISOString());

    return (data ?? []).map((row) => row.event_id);
  },

  /** Guarda la última ubicación conocida del usuario. */
  updateLocation: async (latitude: number, longitude: number): Promise<boolean> => {
    const profileId = await currentProfileId();
    if (!profileId) return false;

    const { error } = await supabase
      .from('profiles')
      .update({ latitude, longitude })
      .eq('id', profileId);

    if (error) {
      console.error('Error updating location:', error);
      return false;
    }
    return true;
  },

  calculateDistance,

  // ==========================================================================
  // DESCUBRIMIENTO Y SWIPES
  // ==========================================================================

  getNearbyProfiles: async (
    latitude: number,
    longitude: number,
    radiusMeters = 5000,
    eventId?: string,
  ): Promise<User[]> => {
    const profileId = await currentProfileId();
    if (!profileId) return [];

    const { data, error } = await supabase.rpc('get_nearby_profiles', {
      p_user_id: profileId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_meters: radiusMeters,
      p_event_id: eventId ?? null,
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
    }));
  },

  /** Registra un swipe. Devuelve true si ha resultado en match. */
  swipe: async (
    swipedId: string,
    swipeType: 'like' | 'dislike' | 'super_like',
    eventId?: string,
  ): Promise<boolean> => {
    const profileId = await requireProfileId();

    const { error: swipeError } = await supabase.from('swipes').insert({
      swiper_id: profileId,
      swiped_id: swipedId,
      swipe_type: swipeType,
      event_id: eventId ?? null,
    });

    // 23505 = swipe duplicado; no es un fallo real, el usuario ya había pasado.
    if (swipeError && swipeError.code !== '23505') {
      console.error('Error creating swipe:', swipeError);
      throw new ApiError('SWIPE_FAILED', 'No se pudo registrar tu decisión');
    }

    if (swipeType === 'dislike') return false;

    // El trigger check_match() crea la conexión; sólo comprobamos si existe.
    const { data: connection } = await supabase
      .from('connections')
      .select('id')
      .or(
        `and(user_id_1.eq.${profileId},user_id_2.eq.${swipedId}),and(user_id_1.eq.${swipedId},user_id_2.eq.${profileId})`,
      )
      .maybeSingle();

    return Boolean(connection);
  },

  getMatches: async (): Promise<MatchConnection[]> => {
    const profileId = await currentProfileId();
    if (!profileId) return [];

    const { data: connections, error } = await supabase
      .from('connections')
      .select(
        `
        id,
        user_id_1,
        user_id_2,
        event_id,
        expires_at,
        kept_by_1,
        kept_by_2,
        created_at,
        profile1:profiles!connections_user_id_1_fkey(*),
        profile2:profiles!connections_user_id_2_fkey(*)
      `,
      )
      .or(`user_id_1.eq.${profileId},user_id_2.eq.${profileId}`)
      .order('created_at', { ascending: false });

    if (error || !connections) {
      if (error) console.error('Error getting matches:', error);
      return [];
    }

    return connections
      .map((conn): MatchConnection | null => {
        const isFirst = conn.user_id_1 === profileId;
        const other = isFirst ? conn.profile2 : conn.profile1;
        if (!other) return null;

        return {
          connectionId: conn.id,
          user: profileToUser(other as ProfileRow),
          eventId: conn.event_id ?? undefined,
          expiresAt: conn.expires_at ?? undefined,
          keptByMe: isFirst ? conn.kept_by_1 : conn.kept_by_2,
          keptByOther: isFirst ? conn.kept_by_2 : conn.kept_by_1,
          createdAt: conn.created_at,
        };
      })
      .filter((c): c is MatchConnection => c !== null);
  },

  // ==========================================================================
  // MENSAJES
  // ==========================================================================

  /**
   * Últimos mensajes de todas las conversaciones.
   *
   * Antes se traía el historial completo del usuario en cada arranque, sin
   * paginar: con muchas conversaciones activas eso es una consulta enorme.
   * Ahora se limita y el detalle se carga al abrir cada chat.
   */
  getMessages: async (limit = RECENT_MESSAGES_LIMIT): Promise<Record<string, Message[]>> => {
    const profileId = await currentProfileId();
    if (!profileId) return {};

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !messages) {
      if (error) console.error('Error getting messages:', error);
      return {};
    }

    return messages.reverse().reduce<Record<string, Message[]>>((grouped, msg) => {
      const otherUserId = msg.sender_id === profileId ? msg.receiver_id : msg.sender_id;
      (grouped[otherUserId] ??= []).push(dbMessageToMessage(msg));
      return grouped;
    }, {});
  },

  /** Página de una conversación concreta, de la más reciente hacia atrás. */
  getConversation: async (
    otherProfileId: string,
    options: { before?: string; limit?: number } = {},
  ): Promise<{ messages: Message[]; hasMore: boolean }> => {
    const profileId = await currentProfileId();
    if (!profileId) return { messages: [], hasMore: false };

    const limit = options.limit ?? CONVERSATION_PAGE_SIZE;

    let query = supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${profileId},receiver_id.eq.${otherProfileId}),and(sender_id.eq.${otherProfileId},receiver_id.eq.${profileId})`,
      )
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (options.before) query = query.lt('created_at', options.before);

    const { data, error } = await query;
    if (error || !data) return { messages: [], hasMore: false };

    const hasMore = data.length > limit;
    const page = hasMore ? data.slice(0, limit) : data;

    return { messages: page.reverse().map(dbMessageToMessage), hasMore };
  },

  sendMessage: async (receiverId: string, content: string): Promise<Message> => {
    const profileId = await requireProfileId();

    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: profileId, receiver_id: receiverId, content: content.trim() })
      .select()
      .single();

    if (error || !data) {
      console.error('Error sending message:', error);
      throw new ApiError('SEND_FAILED', 'No se pudo enviar el mensaje');
    }

    return dbMessageToMessage(data);
  },

  markMessagesAsRead: async (senderId: string): Promise<boolean> => {
    const profileId = await currentProfileId();
    if (!profileId) return false;

    const { error } = await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', senderId)
      .eq('receiver_id', profileId)
      .eq('read', false);

    return !error;
  },

  // ==========================================================================
  // PERFIL
  // ==========================================================================

  getCurrentProfile: async (): Promise<User | null> => {
    const userId = await authUserId();
    if (!userId) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    return profile ? profileToUser(profile) : null;
  },

  updateProfile: async (updates: {
    name?: string;
    age?: number;
    bio?: string;
    photos?: string[];
    avatar?: string;
    isInvisible?: boolean;
    languages?: string[];
    planTonight?: string;
    locale?: string;
    /** `gender` no está aquí a propósito: la base de datos impide cambiarlo. */
    wants?: 'men' | 'women' | 'all';
  }): Promise<User | null> => {
    const profileId = await requireProfileId();

    const payload: TablesUpdate<'profiles'> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.age !== undefined) payload.age = updates.age;
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.photos !== undefined) payload.photos = updates.photos;
    if (updates.avatar !== undefined) payload.avatar = updates.avatar;
    if (updates.isInvisible !== undefined) payload.is_invisible = updates.isInvisible;
    if (updates.languages !== undefined) payload.languages = updates.languages;
    if (updates.wants !== undefined) payload.wants = updates.wants;
    if (updates.planTonight !== undefined) payload.plan_tonight = updates.planTonight;
    if (updates.locale !== undefined) payload.locale = updates.locale;

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', profileId)
      .select()
      .single();

    if (error || !data) {
      console.error('Error updating profile:', error);
      throw new ApiError('UPDATE_FAILED', 'No se pudo guardar tu perfil');
    }

    return profileToUser(data);
  },

  /**
   * Un perfil queda verificado cuando tiene al menos una foto tomada en el
   * momento y ha pasado la verificación facial. Sólo los perfiles verificados
   * aparecen en el descubrimiento.
   */
  refreshVerificationStatus: async (): Promise<boolean> => {
    // La regla vive en la base de datos y la columna está protegida contra
    // escrituras del navegador: si la decidiera aquí, cualquiera podría
    // marcarse como verificado desde la consola con la anon key.
    const { data, error } = await supabase.rpc('recompute_my_verification');

    if (error) {
      console.error('Error recomputing verification:', error);
      return false;
    }

    return data === true;
  },

  // ==========================================================================
  // SUBIDA DE ARCHIVOS
  // ==========================================================================

  /** Sube un fichero y devuelve su ruta y su URL pública (o firmada si es privado). */
  uploadFile: async (
    bucket: StorageBucket,
    file: Blob,
    fileName: string,
  ): Promise<{ path: string; url: string }> => {
    const userId = await authUserId();
    if (!userId) throw new ApiError('NOT_AUTHENTICATED', 'Debes iniciar sesión');

    // La primera carpeta debe ser el uid: las policies de storage lo exigen.
    const path = `${userId}/${Date.now()}-${fileName}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('Error uploading file:', error);
      throw new ApiError('UPLOAD_FAILED', 'No se pudo subir el archivo');
    }

    if (bucket === 'documents') {
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      return { path, url: signed?.signedUrl ?? path };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);
    return { path, url: publicUrl };
  },

  /**
   * Enlace temporal para ver un documento de un local.
   *
   * El bucket `documents` es privado, así que la ruta guardada en
   * `venues.documents` no se puede abrir tal cual: hay que firmarla en el
   * momento. Se firma corto —una hora— porque el enlace lo abre administración
   * para mirarlo, no para guardarlo en ningún sitio.
   *
   * Acepta también una URL completa: las altas anteriores a este cambio
   * guardaban la URL firmada entera en lugar de la ruta.
   */
  signedDocumentUrl: async (pathOrUrl: string): Promise<string | null> => {
    if (pathOrUrl.startsWith('http')) return pathOrUrl;

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(pathOrUrl, 60 * 60);

    if (error) {
      console.error('Error signing document url:', error);
      return null;
    }

    return data?.signedUrl ?? null;
  },

  /**
   * Borra el fichero de Storage.
   *
   * Quitar la URL del array de `photos` no bastaba: el bucket es público, así
   * que la foto seguía siendo accesible para siempre con su enlace.
   */
  deleteFile: async (bucket: StorageBucket, path: string): Promise<void> => {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) console.error('Error deleting file:', error);
  },

  /** Deriva la ruta dentro del bucket a partir de una URL pública. */
  storagePathFromUrl: (bucket: StorageBucket, url: string): string | null => {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
  },

  /**
   * Sube una foto de perfil y la deja en la cola de moderación.
   *
   * Nada llega al perfil sin revisión: antes cualquiera publicaba al instante
   * en un bucket público.
   */
  /**
   * Sube la foto que la persona se hace al entrar al evento.
   *
   * Es la que se ve al deslizar, y por eso no vale la del perfil: la idea es
   * reconocer a alguien por la ropa que lleva esta noche. Pasa por la misma
   * moderación que las del perfil, pero no se añade a `profiles.photos`.
   */
  submitEventPhoto: async (
    eventId: string,
    file: Blob,
  ): Promise<{ published: boolean; reason?: string }> => {
    const profileId = await requireProfileId();
    const { path, url } = await api.uploadFile('event-photos', file, `event-${eventId}.jpg`);

    const { data: item, error } = await supabase
      .from('moderation_queue')
      .insert({ profile_id: profileId, bucket: 'event-photos', path, url, kind: 'event_photo' })
      .select('id')
      .single();

    if (error || !item) {
      await api.deleteFile('event-photos', path);
      throw new ApiError('MODERATION_FAILED', 'errors.generic');
    }

    try {
      const { data } = await supabase.functions.invoke('moderate-photo', {
        body: { itemId: item.id, url },
      });
      const result = data as { decision?: 'approved' | 'rejected'; reason?: string } | null;

      if (result?.decision === 'rejected') {
        await api.deleteFile('event-photos', path);
        return { published: false, reason: result.reason };
      }
    } catch (moderationError) {
      console.error('Automatic moderation unavailable:', moderationError);
    }

    await api.setEventPhoto(eventId, url);
    return { published: true };
  },

  submitPhotoForReview: async (
    file: Blob,
    fileName: string,
  ): Promise<{ published: boolean; reason?: string }> => {
    const profileId = await requireProfileId();
    const { path, url } = await api.uploadFile('event-photos', file, fileName);

    const { data: item, error } = await supabase
      .from('moderation_queue')
      .insert({ profile_id: profileId, bucket: 'event-photos', path, url, kind: 'photo' })
      .select('id')
      .single();

    if (error || !item) {
      await api.deleteFile('event-photos', path);
      throw new ApiError('MODERATION_FAILED', 'No se pudo enviar la foto a revisión');
    }

    // Moderación automática. Si está configurada decide al momento.
    //
    // Cuando no responde, la foto se queda pendiente de revisión manual y no se
    // publica. Antes se publicaba igual «para no bloquear al usuario en la
    // puerta de la discoteca», y eso convertía cualquier caída de Sightengine
    // en barra libre: bastaba con provocar un fallo para publicar lo que fuera.
    // La pantalla ya cuenta cuántas fotos están pendientes.
    try {
      const { data } = await supabase.functions.invoke('moderate-photo', {
        body: { itemId: item.id, url },
      });

      const result = data as { decision?: 'approved' | 'rejected'; reason?: string } | null;

      if (result?.decision === 'rejected') {
        await api.deleteFile('event-photos', path);
        return { published: false, reason: result.reason };
      }

      if (result?.decision === 'approved') return { published: true };
    } catch (moderationError) {
      console.error('Automatic moderation unavailable:', moderationError);
    }

    return { published: false, reason: 'pending_review' };
  },

  /** Fotos del usuario pendientes de aprobación. */
  getPendingPhotoCount: async (): Promise<number> => {
    const profileId = await currentProfileId();
    if (!profileId) return 0;

    const { count } = await supabase
      .from('moderation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('status', 'pending');

    return count ?? 0;
  },

  /** Quita una foto del perfil y borra también el fichero. */
  removePhoto: async (photoUrl: string): Promise<User | null> => {
    const profileId = await requireProfileId();

    const { data: profile } = await supabase
      .from('profiles')
      .select('photos, avatar')
      .eq('id', profileId)
      .maybeSingle();

    if (!profile) return null;

    const photos = (profile.photos ?? []).filter((p) => p !== photoUrl);
    const avatar = profile.avatar === photoUrl ? (photos[0] ?? null) : profile.avatar;

    const { data, error } = await supabase
      .from('profiles')
      .update({ photos, avatar })
      .eq('id', profileId)
      .select()
      .single();

    if (error || !data) throw new ApiError('UPDATE_FAILED', 'No se pudo eliminar la foto');

    const path = api.storagePathFromUrl('event-photos', photoUrl)
      ?? api.storagePathFromUrl('avatars', photoUrl);
    if (path) {
      await api.deleteFile(photoUrl.includes('/avatars/') ? 'avatars' : 'event-photos', path);
    }

    return profileToUser(data);
  },

  /** Convierte un data URL de canvas en Blob para poder subirlo. */
  dataUrlToBlob: async (dataUrl: string): Promise<Blob> => {
    const response = await fetch(dataUrl);
    return response.blob();
  },

  // ==========================================================================
  // VERIFICACIÓN
  // ==========================================================================

  /**
   * Marca la verificación facial como superada y guarda la selfie.
   *
   * La comprobación de que hay una cara real la hace el componente
   * FaceVerification en el cliente (FaceDetector API cuando está disponible).
   * Si se configura VITE_FACE_VERIFICATION_URL, la imagen se envía además a ese
   * servicio externo y su veredicto es el que manda.
   */
  /**
   * Verificación facial.
   *
   * La decisión la toma el servidor: la foto entra en la cola de moderación y
   * `moderate-photo` la manda a Sightengine, que dice cuántas caras hay. Si hay
   * exactamente una y no hay nada que rechazar, esa función —y sólo ella,
   * porque corre con la clave de servicio— marca `face_verified`.
   *
   * Antes el navegador decidía y escribía la columna. La comprobación de cara
   * que hacía era la del propio navegador, así que saltársela era una línea en
   * la consola; y aunque el servicio externo dijera que no, bastaba con
   * escribir la columna a mano.
   */
  verifyFace: async (imageDataUrl: string): Promise<boolean> => {
    const profileId = await requireProfileId();
    const blob = await api.dataUrlToBlob(imageDataUrl);

    const { path, url } = await api.uploadFile('event-photos', blob, 'face-verification.jpg');

    const { data: item, error } = await supabase
      .from('moderation_queue')
      .insert({
        profile_id: profileId,
        bucket: 'event-photos',
        path,
        url,
        kind: 'face_verification',
      })
      .select('id')
      .single();

    if (error || !item) {
      await api.deleteFile('event-photos', path);
      throw new ApiError('VERIFY_FAILED', 'No se pudo enviar la verificación');
    }

    const { data } = await supabase.functions.invoke('moderate-photo', {
      body: { itemId: item.id, url },
    });

    const result = data as { decision?: 'approved' | 'rejected'; reason?: string } | null;

    if (result?.decision !== 'approved') {
      // La foto de verificación no se guarda si no sirve: es un documento de
      // identidad de hecho, y no hay razón para conservarlo.
      await api.deleteFile('event-photos', path);
      return false;
    }

    return true;
  },

  /**
   * Pide un código por SMS. El código lo genera y almacena la Edge Function;
   * el cliente nunca lo conoce hasta que llega el mensaje.
   */
  requestPhoneVerification: async (phoneNumber: string): Promise<void> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new ApiError('NOT_AUTHENTICATED', 'Debes iniciar sesión');

    const { data, error } = await supabase.functions.invoke('send-sms-verification', {
      body: { phoneNumber },
    });

    if (error) {
      const detail = (data as { error?: string } | null)?.error;
      throw new ApiError('SMS_FAILED', detail ?? 'No se pudo enviar el SMS de verificación');
    }
  },

  /**
   * Comprueba el código del SMS.
   *
   * La comprobación entera ocurre en el servidor. Antes el navegador leía la
   * tabla de códigos, decidía si coincidía y escribía él mismo
   * `phone_verified`: quien supiera usar la consola podía darse el teléfono por
   * verificado sin recibir ningún SMS.
   */
  verifyPhoneCode: async (code: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('confirm_phone_code', { p_code: code });

    if (error) {
      console.error('Error confirming phone code:', error);
      return false;
    }

    return data === true;
  },

  // ==========================================================================
  // EVENTOS
  // ==========================================================================

  /** Eventos vigentes de locales verificados. */
  getEvents: async (): Promise<Event[]> => {
    const { data: events, error } = await supabase
      .from('events')
      .select('*, venues!inner(*)')
      .gt('end_date', new Date().toISOString())
      .order('start_date', { ascending: true });

    if (error || !events) {
      if (error) console.error('Error getting events:', error);
      return [];
    }

    return events.map((row) => {
      const { venues, ...eventRow } = row as EventRow & { venues: VenueRow };
      return dbEventToEvent(eventRow as EventRow, venues);
    });
  },

  getEventById: async (eventId: string): Promise<Event | null> => {
    const { data, error } = await supabase
      .from('events')
      .select('*, venues!inner(*)')
      .eq('id', eventId)
      .maybeSingle();

    if (error || !data) return null;

    const { venues, ...eventRow } = data as EventRow & { venues: VenueRow };
    return dbEventToEvent(eventRow as EventRow, venues);
  },

  createEvent: async (eventData: Omit<Event, 'id'>): Promise<Event> => {
    const userId = await authUserId();
    if (!userId) throw new ApiError('NOT_AUTHENTICATED', 'Debes iniciar sesión');

    const { data: venue } = await supabase
      .from('venues')
      .select('*')
      .eq('venue_id', userId)
      .maybeSingle();

    if (!venue) throw new ApiError('VENUE_NOT_FOUND', 'No se encontró tu local');

    const { data, error } = await supabase
      .from('events')
      .insert({
        venue_id: venue.id,
        name: eventData.name,
        description: eventData.description ?? null,
        start_date: eventData.startDate,
        end_date: eventData.endDate,
        latitude: eventData.location?.latitude ?? venue.latitude,
        longitude: eventData.location?.longitude ?? venue.longitude,
        theme: eventData.theme ?? null,
        dress_code: eventData.dressCode ?? null,
        min_age: eventData.minAge ?? null,
        max_age: eventData.maxAge ?? null,
        price: eventData.price ?? null,
        booking_url: eventData.bookingUrl ?? null,
        poster_url: eventData.posterUrl ?? null,
        max_capacity: eventData.maxCapacity ?? null,
        recurrence: eventData.recurrence ?? 'none',
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating event:', error);
      throw new ApiError('CREATE_EVENT_FAILED', error?.message ?? 'No se pudo crear el evento');
    }

    return dbEventToEvent(data, venue);
  },

  updateEvent: async (eventId: string, updates: Partial<Omit<Event, 'id'>>): Promise<void> => {
    const { error } = await supabase
      .from('events')
      .update({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.startDate !== undefined && { start_date: updates.startDate }),
        ...(updates.endDate !== undefined && { end_date: updates.endDate }),
        ...(updates.theme !== undefined && { theme: updates.theme }),
        ...(updates.dressCode !== undefined && { dress_code: updates.dressCode }),
        ...(updates.minAge !== undefined && { min_age: updates.minAge }),
        ...(updates.price !== undefined && { price: updates.price }),
        ...(updates.bookingUrl !== undefined && { booking_url: updates.bookingUrl }),
        ...(updates.posterUrl !== undefined && { poster_url: updates.posterUrl }),
        ...(updates.location !== undefined && {
          latitude: updates.location?.latitude,
          longitude: updates.location?.longitude,
        }),
      })
      .eq('id', eventId);

    if (error) throw new ApiError('UPDATE_EVENT_FAILED', 'No se pudo actualizar el evento');
  },

  deleteEvent: async (eventId: string): Promise<void> => {
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) throw new ApiError('DELETE_EVENT_FAILED', 'No se pudo eliminar el evento');
  },

  // ==========================================================================
  // VENUES
  // ==========================================================================

  getCurrentVenue: async (): Promise<Venue | null> => {
    const userId = await authUserId();
    if (!userId) return null;

    const { data: venue } = await supabase
      .from('venues')
      .select('*')
      .eq('venue_id', userId)
      .maybeSingle();

    return venue ? venueRowToVenue(venue) : null;
  },

  updateVenueLocation: async (latitude: number, longitude: number): Promise<boolean> => {
    const userId = await authUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('venues')
      .update({ latitude, longitude })
      .eq('venue_id', userId);

    return !error;
  },

  /** Genera un código de acceso para un evento concreto del local. */
  generateEventCode: async (
    venueId: string,
    eventId: string | null,
    expiresAt: Date,
  ): Promise<{ qrCode: string; manualCode: string; expiresAt: string }> => {
    const userId = await authUserId();
    if (!userId) throw new ApiError('NOT_AUTHENTICATED', 'Debes iniciar sesión');

    // Desactiva los códigos anteriores del mismo evento para que sólo haya uno vivo.
    const previous = supabase.from('event_codes').update({ active: false }).eq('venue_id', venueId);
    await (eventId ? previous.eq('event_id', eventId) : previous.is('event_id', null));

    // 6 dígitos, con reintento si colisiona con un código ya existente.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const manualCode = Math.floor(100000 + Math.random() * 900000).toString();

      const { error } = await supabase.from('event_codes').insert({
        venue_id: venueId,
        event_id: eventId,
        code: manualCode,
        expires_at: expiresAt.toISOString(),
        active: true,
      });

      if (!error) {
        return {
          qrCode: manualCode,
          manualCode,
          expiresAt: expiresAt.toISOString(),
        };
      }

      if (error.code !== '23505') {
        console.error('Error generating event code:', error);
        throw new ApiError('CODE_FAILED', 'No se pudo generar el código');
      }
    }

    throw new ApiError('CODE_FAILED', 'No se pudo generar un código único');
  },

  /** Código activo del local, si lo hay, para no regenerarlo en cada visita. */
  getActiveEventCode: async (
    venueId: string,
  ): Promise<{ manualCode: string; expiresAt: string; eventId: string | null } | null> => {
    const { data } = await supabase
      .from('event_codes')
      .select('code, expires_at, event_id')
      .eq('venue_id', venueId)
      .eq('active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data
      ? { manualCode: data.code, expiresAt: data.expires_at, eventId: data.event_id }
      : null;
  },

  getVenueStats: async (venueId: string, since?: Date): Promise<VenueStats> => {
    const { data, error } = await supabase.rpc('get_venue_stats', {
      p_venue_id: venueId,
      p_since: since?.toISOString() ?? null,
    });

    if (error || !data?.[0]) {
      if (error) console.error('Error getting venue stats:', error);
      return { scans: 0, activeUsers: 0, eventsCount: 0, avgAttendance: 0 };
    }

    const row = data[0];
    return {
      scans: Number(row.scans_count),
      activeUsers: Number(row.active_users_count),
      eventsCount: Number(row.events_count),
      avgAttendance: Number(row.avg_attendance),
    };
  },

  getEventStats: async (
    eventId: string,
  ): Promise<{ scans: number; activeUsers: number; matches: number }> => {
    const { data, error } = await supabase.rpc('get_event_stats', { p_event_id: eventId });

    if (error || !data?.[0]) return { scans: 0, activeUsers: 0, matches: 0 };

    return {
      scans: Number(data[0].scans_count),
      activeUsers: Number(data[0].active_users_count),
      matches: Number(data[0].matches_count),
    };
  },

  // ==========================================================================
  // MODERACIÓN
  // ==========================================================================

  reportUser: async (
    reportedId: string,
    reportType: ReportType,
    description?: string,
  ): Promise<boolean> => {
    const profileId = await requireProfileId();

    const { error } = await supabase.from('reports').insert({
      reporter_id: profileId,
      reported_id: reportedId,
      report_type: reportType,
      description: description ?? null,
    });

    if (error) console.error('Error reporting user:', error);
    return !error;
  },

  blockUser: async (blockedId: string): Promise<boolean> => {
    const profileId = await requireProfileId();

    const { error } = await supabase
      .from('blocks')
      .insert({ blocker_id: profileId, blocked_id: blockedId });

    if (error && error.code !== '23505') {
      console.error('Error blocking user:', error);
      return false;
    }

    // Al bloquear se elimina la conexión para que desaparezca del chat.
    await supabase
      .from('connections')
      .delete()
      .or(
        `and(user_id_1.eq.${profileId},user_id_2.eq.${blockedId}),and(user_id_1.eq.${blockedId},user_id_2.eq.${profileId})`,
      );

    return true;
  },

  unblockUser: async (blockedId: string): Promise<boolean> => {
    const profileId = await requireProfileId();
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', profileId)
      .eq('blocked_id', blockedId);
    return !error;
  },

  // ==========================================================================
  // ADMINISTRACIÓN
  // ==========================================================================

  isAdmin: async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc('is_admin');
    return !error && data === true;
  },

  getPendingVenues: async (): Promise<Venue[]> => {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: true });

    if (error || !data) {
      if (error) console.error('Error getting pending venues:', error);
      return [];
    }

    return data.map(venueRowToVenue);
  },

  reviewVenue: async (venueId: string, approve: boolean): Promise<void> => {
    const { error } = await supabase
      .from('venues')
      .update({
        is_verified: approve,
        verification_status: approve ? 'approved' : 'rejected',
      })
      .eq('id', venueId);

    if (error) throw new ApiError('REVIEW_FAILED', 'No se pudo actualizar el local');
  },

  getAllEventsForAdmin: async (): Promise<Event[]> => {
    const { data, error } = await supabase
      .from('events')
      .select('*, venues(*)')
      .order('start_date', { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return data.map((row) => {
      const { venues, ...eventRow } = row as EventRow & { venues: VenueRow | null };
      return dbEventToEvent(eventRow as EventRow, venues ?? undefined);
    });
  },

  getReports: async (): Promise<Report[]> => {
    const { data, error } = await supabase
      .from('reports')
      .select(
        `
        *,
        reporter:profiles!reports_reporter_id_fkey(name),
        reported:profiles!reports_reported_id_fkey(name)
      `,
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) {
      if (error) console.error('Error getting reports:', error);
      return [];
    }

    return data.map((row) => {
      const record = row as Tables<'reports'> & {
        reporter: { name: string } | null;
        reported: { name: string } | null;
      };
      return {
        id: record.id,
        reporterId: record.reporter_id,
        reportedId: record.reported_id,
        reporterName: record.reporter?.name,
        reportedName: record.reported?.name,
        reportType: record.report_type as ReportType,
        description: record.description ?? undefined,
        status: record.status as Report['status'],
        createdAt: record.created_at,
      };
    });
  },

  resolveReport: async (reportId: string, status: 'resolved' | 'dismissed'): Promise<void> => {
    const userId = await authUserId();
    const { error } = await supabase
      .from('reports')
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: userId })
      .eq('id', reportId);

    if (error) throw new ApiError('RESOLVE_FAILED', 'No se pudo actualizar el reporte');
  },

  // ==========================================================================
  // PREMIUM
  // ==========================================================================

  getActiveSubscription: async (): Promise<Tables<'premium_subscriptions'> | null> => {
    const profileId = await currentProfileId();
    if (!profileId) return null;

    const { data } = await supabase
      .from('premium_subscriptions')
      .select('*')
      .eq('user_id', profileId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      await supabase.from('premium_subscriptions').update({ status: 'expired' }).eq('id', data.id);
      return null;
    }

    return data;
  },

  /**
   * Abre la pasarela de pago.
   *
   * La suscripción no se activa aquí: la crea el webhook de Stripe cuando el
   * cobro se confirma. Si Stripe no está configurado devolvemos null y el
   * llamante decide qué hacer.
   */
  startCheckout: async (
    type: 'monthly' | 'event' | 'lifetime',
    eventId?: string,
  ): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: {
        plan: type,
        eventId: eventId ?? null,
        returnUrl: `${window.location.origin}/profile`,
      },
    });

    if (error) {
      const detail = (data as { error?: string } | null)?.error;
      if (detail === 'STRIPE_NOT_CONFIGURED') return null;
      throw new ApiError('CHECKOUT_FAILED', 'No se pudo abrir la pasarela de pago');
    }

    return (data as { url?: string } | null)?.url ?? null;
  },

  createSubscription: async (
    type: 'monthly' | 'event' | 'lifetime',
    eventId?: string,
  ): Promise<Tables<'premium_subscriptions'>> => {
    const profileId = await requireProfileId();

    const expiresAt = new Date();
    if (type === 'monthly') expiresAt.setMonth(expiresAt.getMonth() + 1);
    else if (type === 'event') expiresAt.setHours(expiresAt.getHours() + 12);

    const { data, error } = await supabase
      .from('premium_subscriptions')
      .upsert(
        {
          user_id: profileId,
          subscription_type: type,
          event_id: eventId ?? null,
          status: 'active',
          started_at: new Date().toISOString(),
          expires_at: type === 'lifetime' ? null : expiresAt.toISOString(),
        },
        { onConflict: 'user_id,event_id,subscription_type' },
      )
      .select()
      .single();

    if (error || !data) {
      console.error('Error creating subscription:', error);
      throw new ApiError('SUBSCRIPTION_FAILED', 'No se pudo activar Premium');
    }

    return data;
  },

  cancelSubscription: async (subscriptionId: string): Promise<void> => {
    const { error } = await supabase
      .from('premium_subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', subscriptionId);

    if (error) throw new ApiError('CANCEL_FAILED', 'No se pudo cancelar la suscripción');
  },
};
