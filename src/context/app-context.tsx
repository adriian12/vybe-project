
import { createContext, useState, useContext, ReactNode, useEffect } from "react";
import { User } from "@/types/user";
import { api } from "@/services/api";
import { useToast } from "@/components/ui/use-toast";

interface AppContextType {
  isLoggedIn: boolean;
  isLocationVerified: boolean;
  isEventVerified: boolean;
  currentUser: User | null;
  nearbyProfiles: User[];
  matches: User[];
  currentProfile: User | null;
  setIsLoggedIn: (value: boolean) => void;
  verifyLocation: () => Promise<boolean>;
  verifyEventCode: (code: string) => Promise<boolean>;
  handleSwipeLeft: (userId: string) => void;
  handleSwipeRight: (userId: string) => void;
  loadNextProfile: () => void;
  login: (phone: string) => Promise<boolean>;
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [nearbyProfiles, setNearbyProfiles] = useState<User[]>([]);
  const [matches, setMatches] = useState<User[]>([]);
  const [currentProfile, setCurrentProfile] = useState<User | null>(null);
  
  // Efectos para cargar datos iniciales
  useEffect(() => {
    if (isLoggedIn && isLocationVerified && isEventVerified) {
      loadProfiles();
      loadMatches();
    }
  }, [isLoggedIn, isLocationVerified, isEventVerified]);
  
  // Simula cargar el perfil actual si hay perfiles cercanos
  useEffect(() => {
    if (nearbyProfiles.length > 0 && !currentProfile) {
      setCurrentProfile(nearbyProfiles[0]);
    }
  }, [nearbyProfiles, currentProfile]);

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

  const loadMatches = async () => {
    try {
      const matchesData = await api.getMatches();
      setMatches(matchesData);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar tus conexiones",
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
      const isValid = await api.verifyEventCode(code);
      setIsEventVerified(isValid);
      return isValid;
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

  const handleSwipeRight = async (userId: string) => {
    try {
      const isMatch = await api.likeProfile(userId);
      
      // Si hay match, añadirlo a la lista de matches
      if (isMatch) {
        const matchedUser = nearbyProfiles.find(p => p.id === userId);
        if (matchedUser) {
          setMatches(prev => [...prev, matchedUser]);
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
        // Aquí simularíamos cargar los datos del usuario
        setCurrentUser({
          id: result.userId || "user123",
          name: "Tú",
          age: 28,
          bio: "Tu perfil",
          photos: ["https://i.pravatar.cc/300?img=32"],
          isVerified: true
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

  const logout = () => {
    setIsLoggedIn(false);
    setIsLocationVerified(false);
    setIsEventVerified(false);
    setCurrentUser(null);
    setNearbyProfiles([]);
    setMatches([]);
    setCurrentProfile(null);
  };

  const value = {
    isLoggedIn,
    isLocationVerified,
    isEventVerified,
    currentUser,
    nearbyProfiles,
    matches,
    currentProfile,
    setIsLoggedIn,
    verifyLocation,
    verifyEventCode,
    handleSwipeLeft,
    handleSwipeRight,
    loadNextProfile,
    login,
    logout
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
