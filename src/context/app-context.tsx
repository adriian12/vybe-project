import { createContext, useState, useContext, ReactNode, useEffect } from "react";
import { User, Message, Connection } from "@/types/user";
import { Venue, Event, EventCode, VenueType } from "@/types/venue";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AppContextType {
  isLoggedIn: boolean;
  isLocationVerified: boolean;
  isEventVerified: boolean;
  userType: 'user' | 'venue' | null;
  currentUser: User | null;
  currentVenue: Venue | null;
  nearbyProfiles: User[];
  connections: User[];
  currentProfile: User | null;
  messages: Record<string, Message[]>;
  events: Event[];
  setIsLoggedIn: (value: boolean) => void;
  verifyLocation: () => Promise<boolean>;
  verifyEventCode: (code: string) => Promise<boolean>;
  handleSwipeLeft: (userId: string) => void;
  handleSwipeRight: (userId: string) => Promise<boolean>;
  loadNextProfile: () => void;
  login: (phone: string) => Promise<boolean>;
  verifyPhoneCode: (code: string) => Promise<boolean>;
  verifyFace: (imageData: string) => Promise<boolean>;
  loginVenue: (email: string, name: string, type: VenueType) => Promise<boolean>;
  createEvent: (eventData: Omit<Event, 'id'>) => Promise<Event | null>;
  sendMessage: (receiverId: string, content: string) => Promise<boolean>;
  generateQRCode: () => Promise<{qrCode: string, manualCode: string} | null>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext debe ser usado dentro de un AppProvider");
  }
  return context;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLocationVerified, setIsLocationVerified] = useState(false);
  const [isEventVerified, setIsEventVerified] = useState(false);
  const [userType, setUserType] = useState<'user' | 'venue' | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentVenue, setCurrentVenue] = useState<Venue | null>(null);
  const [nearbyProfiles, setNearbyProfiles] = useState<User[]>([]);
  const [connections, setConnections] = useState<User[]>([]);
  const [currentProfile, setCurrentProfile] = useState<User | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [events, setEvents] = useState<Event[]>([]);
  const [eventRadius, setEventRadius] = useState(50); // Radio en metros (default 50m)
  
  // Efectos para cargar datos iniciales
  useEffect(() => {
    if (isLoggedIn && userType === 'user' && isLocationVerified && isEventVerified) {
      loadProfiles();
      loadConnections();
    }
  }, [isLoggedIn, userType, isLocationVerified, isEventVerified]);
  
  // Simula cargar el perfil actual si hay perfiles cercanos
  useEffect(() => {
    if (nearbyProfiles.length > 0 && !currentProfile) {
      setCurrentProfile(nearbyProfiles[0]);
    }
  }, [nearbyProfiles, currentProfile]);

  // Carga eventos para usuarios y locales
  useEffect(() => {
    if (isLoggedIn) {
      loadEvents();
    }
  }, [isLoggedIn]);

  // Carga mensajes para usuarios
  useEffect(() => {
    if (isLoggedIn && userType === 'user' && currentUser) {
      loadMessages();
    }
  }, [isLoggedIn, userType, currentUser]);

  const loadProfiles = async () => {
    try {
      const profiles = await api.getNearbyProfiles();
      setNearbyProfiles(profiles);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los perfiles cercanos",
        variant: "destructive",
      });
    }
  };

  const loadConnections = async () => {
    try {
      const connectionsData = await api.getMatches();
      setConnections(connectionsData);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar tus conexiones",
        variant: "destructive",
      });
    }
  };

  const loadMessages = async () => {
    if (!currentUser) return;
    
    try {
      const messagesData = await api.getMessages(currentUser.id);
      setMessages(messagesData);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar tus mensajes",
        variant: "destructive",
      });
    }
  };

  const loadEvents = async () => {
    try {
      const eventsData = await api.getEvents();
      setEvents(eventsData);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los eventos",
        variant: "destructive",
      });
    }
  };

  const verifyLocation = async () => {
    try {
      // En un caso real, obtendríamos las coordenadas del usuario
      const isValid = await api.verifyLocation(40.416775, -3.70379);
      setIsLocationVerified(isValid);
      return isValid;
    } catch (error) {
      toast({
        title: "Error de ubicación",
        description: "No se pudo verificar tu ubicación",
        variant: "destructive",
      });
      return false;
    }
  };

  const verifyEventCode = async (code: string) => {
    try {
      // Aquí verificaríamos si el código corresponde a un festival para ajustar el radio
      const eventData = await api.verifyEventCode(code);
      
      if (eventData.isValid) {
        setIsEventVerified(true);
        // Ajusta el radio dependiendo del tipo de evento
        if (eventData.eventType === 'festival') {
          setEventRadius(500); // 500m para festivales
        } else {
          setEventRadius(50); // 50m para el resto de eventos
        }
        return true;
      }
      return false;
    } catch (error) {
      toast({
        title: "Error de código",
        description: "El código del evento no es válido",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleSwipeLeft = (userId: string) => {
    // Eliminar el perfil de la lista
    setNearbyProfiles(profiles => profiles.filter(p => p.id !== userId));
    loadNextProfile();
  };

  const handleSwipeRight = async (userId: string): Promise<boolean> => {
    try {
      const isMatch = await api.likeProfile(userId);
      
      // Si hay match, añadirlo a la lista de connections
      if (isMatch) {
        const matchedUser = nearbyProfiles.find(p => p.id === userId);
        if (matchedUser) {
          setConnections(prev => [...prev, matchedUser]);
          toast({
            title: "¡Nueva conexión!",
            description: `Has conectado con ${matchedUser.name}`,
          });
        }
      }
      
      // Eliminar el perfil de la lista
      setNearbyProfiles(profiles => profiles.filter(p => p.id !== userId));
      loadNextProfile();
      
      return isMatch;
    } catch (error) {
      toast({
        title: "Error",
        description: "Hubo un problema al procesar tu acción",
        variant: "destructive",
      });
      return false;
    }
  };

  const loadNextProfile = () => {
    if (nearbyProfiles.length > 0) {
      setCurrentProfile(nearbyProfiles[0]);
    } else {
      setCurrentProfile(null);
    }
  };

  const login = async (phone: string) => {
    try {
      const result = await api.login(phone);
      if (result.success) {
        setIsLoggedIn(true);
        setUserType('user');
        // Aquí simularíamos cargar los datos del usuario
        setCurrentUser({
          id: result.userId || "user123",
          name: "Tú",
          age: 28,
          bio: "Tu perfil",
          photos: ["https://i.pravatar.cc/300?img=32"],
          isVerified: true,
          phone: phone
        });
        return true;
      }
      return false;
    } catch (error) {
      toast({
        title: "Error de inicio de sesión",
        description: "No se pudo iniciar sesión. Intenta de nuevo más tarde.",
        variant: "destructive",
      });
      return false;
    }
  };

  const verifyPhoneCode = async (code: string): Promise<boolean> => {
    try {
      const isValid = await api.verifyCode(code, 'phone');
      
      if (isValid && currentUser) {
        setCurrentUser({
          ...currentUser,
          phoneVerified: true
        });
        
        toast({
          title: "Teléfono verificado",
          description: "Tu número de teléfono ha sido verificado correctamente",
        });
      }
      
      return isValid;
    } catch (error) {
      toast({
        title: "Error de verificación",
        description: "No se pudo verificar el código. Intenta de nuevo.",
        variant: "destructive",
      });
      return false;
    }
  };

  const verifyFace = async (imageData: string): Promise<boolean> => {
    try {
      const isValid = await api.verifyFace(imageData);
      
      if (isValid && currentUser) {
        setCurrentUser({
          ...currentUser,
          faceVerified: true
        });
        
        toast({
          title: "Identidad verificada",
          description: "Tu identidad ha sido verificada correctamente",
        });
      }
      
      return isValid;
    } catch (error) {
      toast({
        title: "Error de verificación",
        description: "No se pudo verificar tu identidad. Intenta de nuevo.",
        variant: "destructive",
      });
      return false;
    }
  };

  const loginVenue = async (email: string, name: string, type: VenueType) => {
    try {
      // Determinamos el radio basado en el tipo
      let radius = 50;
      switch (type) {
        case 'discoteca':
          radius = 100;
          break;
        case 'festival':
          radius = 500;
          break;
        case 'evento_empresarial':
          radius = 250;
          break;
        default:
          radius = 50;
      }
      
      // Simulamos el registro/login de un local
      setIsLoggedIn(true);
      setUserType('venue');
      setCurrentVenue({
        id: "venue123",
        name: name,
        email: email,
        type: type,
        isVerified: false, // Inicialmente no verificado
        eventRadius: radius
      });
      
      toast({
        title: "¡Bienvenido!",
        description: "Tu local está en proceso de verificación.",
      });
      
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo completar el registro. Intenta más tarde.",
        variant: "destructive",
      });
      return false;
    }
  };

  const createEvent = async (eventData: Omit<Event, 'id'>): Promise<Event | null> => {
    if (!currentVenue) return null;
    
    try {
      const newEvent = await api.createEvent(eventData);
      
      setEvents(prev => [...prev, newEvent]);
      
      toast({
        title: "Evento creado",
        description: "Tu evento ha sido creado correctamente",
      });
      
      return newEvent;
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo crear el evento. Intenta más tarde.",
        variant: "destructive",
      });
      return null;
    }
  };

  const sendMessage = async (receiverId: string, content: string): Promise<boolean> => {
    if (!currentUser) return false;
    
    try {
      const message = await api.sendMessage(currentUser.id, receiverId, content);
      
      // Actualizamos los mensajes localmente
      setMessages(prev => {
        const receiverMessages = prev[receiverId] || [];
        return {
          ...prev,
          [receiverId]: [...receiverMessages, message]
        };
      });
      
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo enviar el mensaje. Intenta más tarde.",
        variant: "destructive",
      });
      return false;
    }
  };

  const generateQRCode = async (): Promise<{qrCode: string, manualCode: string} | null> => {
    if (!currentVenue) return null;
    
    try {
      const { qrCode, manualCode } = await api.generateQRCode(currentVenue.id);
      
      // Actualizamos el local con el código QR
      setCurrentVenue({
        ...currentVenue,
        qrCode
      });
      
      return { qrCode, manualCode };
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo generar el código QR. Intenta más tarde.",
        variant: "destructive",
      });
      return null;
    }
  };

  const logout = () => {
    setIsLoggedIn(false);
    setIsLocationVerified(false);
    setIsEventVerified(false);
    setUserType(null);
    setCurrentUser(null);
    setCurrentVenue(null);
    setNearbyProfiles([]);
    setConnections([]);
    setCurrentProfile(null);
    setMessages({});
    setEvents([]);
  };

  const value = {
    isLoggedIn,
    isLocationVerified,
    isEventVerified,
    userType,
    currentUser,
    currentVenue,
    nearbyProfiles,
    connections,
    currentProfile,
    messages,
    events,
    setIsLoggedIn,
    verifyLocation,
    verifyEventCode,
    handleSwipeLeft,
    handleSwipeRight,
    loadNextProfile,
    login,
    verifyPhoneCode,
    verifyFace,
    loginVenue,
    createEvent,
    sendMessage,
    generateQRCode,
    logout
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
