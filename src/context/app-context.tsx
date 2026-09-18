import {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { User, Message, ReportType, MatchConnection } from '@/types/user';
import { Venue, Event, EventAccess } from '@/types/venue';
import { api, ApiError } from '@/services/api';
import { socialService, DiscoveryFilters } from '@/services/social';
import { identifyUser } from '@/lib/observability';
import { getCurrentPosition, Coordinates } from '@/services/geo';
import { markMatchCelebrated, unregisterNativePush } from '@/services/native-push';
import { onAppResume } from '@/services/native';
import type { VenueRole } from '@/services/venue-service';
import { siteMode } from '@/lib/hosts';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

export type UserType = 'user' | 'venue' | 'admin';

const ACTIVE_EVENT_KEY = 'vybe_activeEvent';

/** Cada cuánto refrescamos la asistencia mientras el usuario está en el evento. */
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

const readStoredEvent = (): EventAccess | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_EVENT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as EventAccess;
    // Un evento terminado deja de dar acceso, aunque siga en localStorage.
    if (new Date(parsed.endDate) < new Date()) {
      localStorage.removeItem(ACTIVE_EVENT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

interface AppContextType {
  isLoading: boolean;
  isLoggedIn: boolean;
  userType: UserType | null;
  currentUser: User | null;
  currentVenue: Venue | null;
  /**
   * Papel en el local: `owner` para la cuenta del local; `staff` o `marketing`
   * para el equipo, que en `app.vybes.es` entra al panel con su propia cuenta.
   */
  venueRole: VenueRole | null;

  activeEvent: EventAccess | null;
  isEventVerified: boolean;

  nearbyProfiles: User[];
  currentProfile: User | null;
  filters: DiscoveryFilters;
  setFilters: (filters: DiscoveryFilters) => void;
  connections: MatchConnection[];
  messages: Record<string, Message[]>;
  events: Event[];

  redeemEventCode: (code: string, coords?: Coordinates) => Promise<EventAccess>;
  leaveEvent: () => void;
  refreshActiveEvent: () => Promise<void>;
  refreshLocation: () => Promise<Coordinates>;

  loadProfiles: () => Promise<void>;
  handleSwipeLeft: (userId: string) => Promise<void>;
  handleSwipeRight: (userId: string) => Promise<boolean>;
  handleSuperLike: (userId: string) => Promise<boolean>;

  sendMessage: (receiverId: string, content: string) => Promise<boolean>;
  markMessagesAsRead: (senderId: string) => Promise<void>;

  reportUser: (userId: string, type: ReportType, description?: string) => Promise<boolean>;
  blockUser: (userId: string) => Promise<boolean>;

  /**
   * Vuelve a resolver quién ha iniciado sesión.
   *
   * La pantalla de acceso la espera antes de navegar: si navegara antes, la
   * guarda de rutas vería todavía «sin sesión» y devolvería al formulario.
   */
  refreshSession: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshConnections: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  createEvent: (eventData: Omit<Event, 'id'>) => Promise<Event | null>;

  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext debe ser usado dentro de un AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(true);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(null);
  const [venueRole, setVenueRole] = useState<VenueRole | null>(null);

  const [activeEvent, setActiveEvent] = useState<EventAccess | null>(readStoredEvent);

  const [nearbyProfiles, setNearbyProfiles] = useState<User[]>([]);
  const [filters, setFilters] = useState<DiscoveryFilters>({});
  const [currentProfile, setCurrentProfile] = useState<User | null>(null);
  const [connections, setConnections] = useState<MatchConnection[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [events, setEvents] = useState<Event[]>([]);

  const lastKnownPosition = useRef<Coordinates | null>(null);

  const isLoggedIn = userType !== null;

  // ==========================================================================
  // SESIÓN
  // ==========================================================================

  /**
   * Averigua quién está usando la aplicación.
   *
   * `silent` existe por el refresco de token, que ocurre solo cada hora: sin él
   * la pantalla se pondría en blanco con el cargador en mitad de lo que
   * estuvieras haciendo. Al iniciar sesión sí se marca como cargando, y ésa es
   * la corrección importante: `ProtectedRoute` decide con `isLoading` y
   * `userType`, y mientras esta función estaba a medias veía `isLoading = false`
   * con `userType = null`, o sea «no ha iniciado sesión», y devolvía a /auth.
   * Por eso había que meter las credenciales dos veces: la segunda vez el
   * contexto ya estaba cargado.
   */
  // Con qué cuenta se cargó la sesión por última vez (ver `SIGNED_IN` abajo).
  const usuarioCargado = useRef<string | null>(null);

  const cargarSesion = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    usuarioCargado.current = session?.user?.id ?? null;

    if (!session?.user) {
      setUserType(null);
      setCurrentUser(null);
      setCurrentVenue(null);
      setVenueRole(null);
      setIsLoading(false);
      return;
    }

    // Un usuario es o perfil o venue, nunca los dos.
    const profile = await api.getCurrentProfile();

    // En app.vybes.es no hay parte de clubber: quien es del equipo de un local
    // (personal, marketing) entra al panel de ese local con su propia cuenta.
    // En la app del móvil sigue siendo un clubber más.
    if (profile && profile.role !== 'admin' && siteMode() === 'app') {
      const membership = await api.getMyVenueMembership();
      if (membership) {
        setCurrentUser(profile);
        setCurrentVenue(membership.venue);
        setVenueRole(membership.role);
        setUserType('venue');
        setIsLoading(false);
        return;
      }
    }

    if (profile) {
      setVenueRole(null);
      setCurrentUser(profile);
      setCurrentVenue(null);
      setUserType(profile.role === 'admin' ? 'admin' : 'user');
      identifyUser(profile.id, profile.role);

      // Si el check-in sigue vivo en el servidor, se vuelve a entrar solo. El
      // localStorage no basta: se borra al cerrar sesión y no viaja de un
      // teléfono a otro.
      const ongoing = await api.getActiveEvent();
      setActiveEvent(ongoing);

      setIsLoading(false);
      return;
    }

    const venue = await api.getCurrentVenue();
    if (venue) {
      setCurrentVenue(venue);
      setCurrentUser(null);
      setVenueRole('owner');
      setUserType('venue');
      setIsLoading(false);
      return;
    }

    // Sesión válida sin fila asociada: el trigger de alta aún no ha corrido.
    setUserType(null);
    setCurrentUser(null);
    setCurrentVenue(null);
    setIsLoading(false);
  }, []);

  const loadSession = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        await cargarSesion(options);
      } catch (error) {
        // Un fallo aquí (almacenamiento nativo, red) no puede dejar la app en el
        // cargador para siempre: se sigue sin sesión y queda rastro en Sentry.
        console.error('No se pudo cargar la sesión:', error);
        setIsLoading(false);
      }
    },
    [cargarSesion],
  );

  useEffect(() => {
    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        identifyUser(null);
        setUserType(null);
        setCurrentUser(null);
        setCurrentVenue(null);
        setNearbyProfiles([]);
        setConnections([]);
        setMessages({});
        setEvents([]);
        setActiveEvent(null);
        localStorage.removeItem(ACTIVE_EVENT_KEY);
        return;
      }

      // Supabase vuelve a emitir SIGNED_IN cada vez que la pestaña recupera el
      // foco. Con la misma cuenta se recarga en silencio: con el cargador, la
      // pantalla (el panel del local) se desmontaba y se perdía lo que estabas
      // haciendo al cambiar de pestaña y volver.
      if (event === 'SIGNED_IN') {
        const misma = session?.user?.id !== undefined && session.user.id === usuarioCargado.current;
        void loadSession({ silent: misma });
        return;
      }

      // El token se refresca solo cada hora: recargar en silencio evita que la
      // pantalla se ponga en blanco en mitad de una conversación.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadSession({ silent: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [loadSession]);

  // Persistimos el evento activo para que un refresco no eche al usuario fuera.
  useEffect(() => {
    if (activeEvent) {
      localStorage.setItem(ACTIVE_EVENT_KEY, JSON.stringify(activeEvent));
    } else {
      localStorage.removeItem(ACTIVE_EVENT_KEY);
    }
  }, [activeEvent]);

  // ==========================================================================
  // UBICACIÓN
  // ==========================================================================

  const refreshLocation = useCallback(async (): Promise<Coordinates> => {
    const coords = await getCurrentPosition();
    lastKnownPosition.current = coords;
    await api.updateLocation(coords.latitude, coords.longitude);
    return coords;
  }, []);

  // ==========================================================================
  // ACCESO A EVENTOS
  // ==========================================================================

  const redeemEventCode = useCallback(
    async (code: string, coords?: Coordinates): Promise<EventAccess> => {
      const position = coords ?? lastKnownPosition.current ?? undefined;
      const access = await api.redeemEventCode(code, position?.latitude, position?.longitude);
      setActiveEvent(access);
      return access;
    },
    [],
  );

  /** Vuelve a preguntar al servidor por el evento en curso y su foto. */
  const refreshActiveEvent = useCallback(async () => {
    setActiveEvent(await api.getActiveEvent());
  }, []);

  const leaveEvent = useCallback(() => {
    setActiveEvent(null);
    setNearbyProfiles([]);
    setCurrentProfile(null);
  }, []);

  // Mantiene viva la asistencia mientras la pestaña está abierta.
  useEffect(() => {
    if (!activeEvent || userType !== 'user') return;

    const beat = () => {
      const coords = lastKnownPosition.current;
      void api.heartbeatAttendance(activeEvent.eventId, coords?.latitude, coords?.longitude);
    };

    beat();
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeEvent, userType]);

  // Expulsa automáticamente cuando el evento termina.
  useEffect(() => {
    if (!activeEvent) return;

    const remaining = new Date(activeEvent.endDate).getTime() - Date.now();
    if (remaining <= 0) {
      leaveEvent();
      return;
    }

    const timeout = setTimeout(() => {
      leaveEvent();
      toast({ title: t('home.empty'), description: t('eventAccess.notFoundBody') });
    }, Math.min(remaining, 2 ** 31 - 1));

    return () => clearTimeout(timeout);
  }, [activeEvent, leaveEvent, toast, t]);

  // ==========================================================================
  // DATOS
  // ==========================================================================

  const loadProfiles = useCallback(async () => {
    if (!activeEvent) return;

    try {
      const coords = lastKnownPosition.current ?? (await getCurrentPosition().catch(() => null));
      if (coords) lastKnownPosition.current = coords;

      const origin = coords ?? currentUser?.location;
      if (!origin) {
        toast({
          title: t('location.title'),
          description: t('location.bodyTwo'),
          variant: 'destructive',
        });
        return;
      }

      const profiles = await socialService.getNearbyProfiles(
        origin.latitude,
        origin.longitude,
        activeEvent.eventRadius,
        activeEvent.eventId,
        filters,
      );

      setNearbyProfiles(profiles);
      setCurrentProfile(profiles[0] ?? null);
    } catch (error) {
      console.error('Error loading profiles:', error);
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    }
  }, [activeEvent, currentUser?.location, filters, toast, t]);

  const loadConnections = useCallback(async () => {
    setConnections(await api.getMatches());
  }, []);

  const loadMessages = useCallback(async () => {
    setMessages(await api.getMessages());
  }, []);

  const refreshEvents = useCallback(async () => {
    setEvents(await api.getEvents());
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await api.getCurrentProfile();
    if (profile) setCurrentUser(profile);
  }, []);

  useEffect(() => {
    if (userType === 'user' || userType === 'admin') {
      void loadConnections();
      void loadMessages();
      void refreshEvents();
    } else if (userType === 'venue') {
      void refreshEvents();
    }
  }, [userType, loadConnections, loadMessages, refreshEvents]);

  useEffect(() => {
    if (activeEvent && (userType === 'user' || userType === 'admin')) {
      void loadProfiles();
    }
  }, [activeEvent, userType, loadProfiles]);

  // ==========================================================================
  // REALTIME
  // ==========================================================================

  const applyRealtimeMessage = useCallback(
    (payload: { eventType: string; new: MessageRecord }, profileId: string) => {
      const record = payload.new;
      if (!record) return;

      const otherUserId = record.sender_id === profileId ? record.receiver_id : record.sender_id;

      setMessages((prev) => {
        const existing = prev[otherUserId] ?? [];

        if (payload.eventType === 'INSERT') {
          if (existing.some((m) => m.id === record.id)) return prev;
          return {
            ...prev,
            [otherUserId]: [
              ...existing,
              {
                id: record.id,
                senderId: record.sender_id,
                receiverId: record.receiver_id,
                content: record.content,
                read: record.read,
                createdAt: record.created_at,
              },
            ],
          };
        }

        if (payload.eventType === 'UPDATE') {
          return {
            ...prev,
            [otherUserId]: existing.map((m) =>
              m.id === record.id ? { ...m, read: record.read } : m,
            ),
          };
        }

        return prev;
      });
    },
    [],
  );

  useEffect(() => {
    if (!currentUser || (userType !== 'user' && userType !== 'admin')) return;

    const profileId = currentUser.id;
    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel(`vybe:${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${profileId}` },
        (payload) => applyRealtimeMessage(payload as never, profileId),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${profileId}` },
        (payload) => applyRealtimeMessage(payload as never, profileId),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'connections' },
        () => {
          void loadConnections();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime no disponible; el chat funcionará sin actualización automática.');
        }
      });

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [currentUser, userType, applyRealtimeMessage, loadConnections]);

  // Realtime sólo entrega lo que pasa con la conexión abierta. Con la app en
  // segundo plano el sistema la corta y lo que llegó entretanto no se repite:
  // al volver (por ejemplo, tocando el aviso de un mensaje) la conversación
  // salía sin ese mensaje. Se recarga al volver a primer plano.
  const sesionDeClubber = Boolean(currentUser) && (userType === 'user' || userType === 'admin');

  useEffect(() => {
    if (!sesionDeClubber) return;

    return onAppResume(() => {
      void loadMessages();
      void loadConnections();
    });
  }, [sesionDeClubber, loadMessages, loadConnections]);

  // ==========================================================================
  // ACCIONES
  // ==========================================================================

  const advanceProfile = useCallback((swipedId: string) => {
    setNearbyProfiles((profiles) => {
      const remaining = profiles.filter((p) => p.id !== swipedId);
      setCurrentProfile(remaining[0] ?? null);
      return remaining;
    });
  }, []);

  const registerSwipe = useCallback(
    async (userId: string, type: 'like' | 'dislike' | 'super_like'): Promise<boolean> => {
      try {
        const isMatch = await api.swipe(userId, type, activeEvent?.eventId);

        if (isMatch) {
          // Esta pantalla ya lo celebra: el aviso push del mismo match sobra.
          markMatchCelebrated(userId);
          const matched = nearbyProfiles.find((p) => p.id === userId);
          await loadConnections();
          if (matched) {
            toast({
              title: t('match.newConnection'),
              description: t('match.connectedWith', { name: matched.name }),
            });
          }
        }

        advanceProfile(userId);
        return isMatch;
      } catch (error) {
        toast({
          title: t('common.error'),
          description: error instanceof ApiError ? error.message : t('errors.generic'),
          variant: 'destructive',
        });
        return false;
      }
    },
    [activeEvent?.eventId, nearbyProfiles, advanceProfile, loadConnections, toast, t],
  );

  const handleSwipeLeft = useCallback(
    async (userId: string) => {
      await registerSwipe(userId, 'dislike');
    },
    [registerSwipe],
  );

  const handleSwipeRight = useCallback(
    (userId: string) => registerSwipe(userId, 'like'),
    [registerSwipe],
  );

  const handleSuperLike = useCallback(
    (userId: string) => registerSwipe(userId, 'super_like'),
    [registerSwipe],
  );

  const sendMessage = useCallback(
    async (receiverId: string, content: string): Promise<boolean> => {
      try {
        const message = await api.sendMessage(receiverId, content);

        setMessages((prev) => {
          const existing = prev[receiverId] ?? [];
          if (existing.some((m) => m.id === message.id)) return prev;
          return { ...prev, [receiverId]: [...existing, message] };
        });

        return true;
      } catch (error) {
        toast({
          title: t('common.error'),
          description: error instanceof ApiError ? error.message : t('errors.generic'),
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast],
  );

  const markMessagesAsRead = useCallback(async (senderId: string) => {
    const updated = await api.markMessagesAsRead(senderId);
    if (!updated) return;

    setMessages((prev) => ({
      ...prev,
      [senderId]: (prev[senderId] ?? []).map((msg) => ({ ...msg, read: true })),
    }));
  }, []);

  const reportUser = useCallback(
    async (userId: string, type: ReportType, description?: string) => {
      const ok = await api.reportUser(userId, type, description);
      toast(
        ok
          ? { title: t('report.sent'), description: t('report.sentBody') }
          : { title: t('common.error'), description: t('errors.generic'), variant: 'destructive' },
      );
      return ok;
    },
    [toast, t],
  );

  const blockUser = useCallback(
    async (userId: string) => {
      const ok = await api.blockUser(userId);
      if (ok) {
        setConnections((prev) => prev.filter((c) => c.user.id !== userId));
        advanceProfile(userId);
        toast({ title: t('report.blocked'), description: t('report.blockedBody') });
      } else {
        toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
      }
      return ok;
    },
    [advanceProfile, toast, t],
  );

  const createEvent = useCallback(
    async (eventData: Omit<Event, 'id'>): Promise<Event | null> => {
      try {
        const newEvent = await api.createEvent(eventData);
        setEvents((prev) => [...prev, newEvent]);
        toast({ title: t('venue.events.created'), description: t('venue.events.createdBody') });
        return newEvent;
      } catch (error) {
        toast({
          title: t('common.error'),
          description: error instanceof ApiError ? error.message : t('errors.generic'),
          variant: 'destructive',
        });
        return null;
      }
    },
    [toast, t],
  );

  const logout = useCallback(async () => {
    // Antes de cerrar la sesión: sin ella el servidor no sabe de quién es el
    // token y quien entrase después en este móvil recibiría estos avisos.
    await unregisterNativePush();
    await supabase.auth.signOut();
    localStorage.removeItem(ACTIVE_EVENT_KEY);
    setUserType(null);
    setCurrentUser(null);
    setCurrentVenue(null);
    setVenueRole(null);
    setActiveEvent(null);
    setNearbyProfiles([]);
    setCurrentProfile(null);
    setConnections([]);
    setMessages({});
    setEvents([]);
  }, []);

  const value: AppContextType = {
    isLoading,
    isLoggedIn,
    userType,
    currentUser,
    currentVenue,
    venueRole,
    activeEvent,
    isEventVerified: activeEvent !== null,
    nearbyProfiles,
    currentProfile,
    filters,
    setFilters,
    connections,
    messages,
    events,
    redeemEventCode,
    leaveEvent,
    refreshActiveEvent,
    refreshLocation,
    loadProfiles,
    handleSwipeLeft,
    handleSwipeRight,
    handleSuperLike,
    sendMessage,
    markMessagesAsRead,
    reportUser,
    blockUser,
    refreshSession: loadSession,
    refreshProfile,
    refreshConnections: loadConnections,
    refreshEvents,
    createEvent,
    logout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

interface MessageRecord {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}
