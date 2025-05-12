
import { User } from "@/types/user";
import { Venue } from "@/types/venue";

// Usuarios de ejemplo
const MOCK_USERS: User[] = [
  {
    id: "1",
    name: "Laura",
    age: 25,
    bio: "Amante de la música electrónica y los cócteles creativos",
    photos: ["https://i.pravatar.cc/300?img=1"],
    distance: 15,
    isVerified: true,
    lastActive: "Hace 5 min"
  },
  {
    id: "2",
    name: "Carlos",
    age: 29,
    bio: "DJ ocasional, siempre buscando la mejor fiesta de la ciudad",
    photos: ["https://i.pravatar.cc/300?img=11"],
    distance: 25,
    isVerified: true,
    lastActive: "Hace 15 min"
  },
  {
    id: "3",
    name: "Elena",
    age: 27,
    bio: "Bartender profesional. Me encanta bailar toda la noche",
    photos: ["https://i.pravatar.cc/300?img=5"],
    distance: 10,
    isVerified: true,
    lastActive: "Hace 30 min"
  },
  {
    id: "4",
    name: "Miguel",
    age: 31,
    bio: "Organizador de eventos. Siempre con buena vibra",
    photos: ["https://i.pravatar.cc/300?img=13"],
    distance: 30,
    isVerified: true,
    lastActive: "Hace 1 hora"
  },
  {
    id: "5",
    name: "Sofía",
    age: 24,
    bio: "Amante del house y el techno. Buscando gente con buena energía",
    photos: ["https://i.pravatar.cc/300?img=9"],
    distance: 20,
    isVerified: true,
    lastActive: "Hace 2 horas"
  },
];

// Locales de ejemplo
const MOCK_VENUES: Venue[] = [
  {
    id: "v1",
    name: "Pachá Mallorca",
    email: "info@pachamallorca.com",
    type: "discoteca",
    isVerified: true,
    location: {
      latitude: 39.5696,
      longitude: 2.6502,
      address: "Paseo Marítimo, 42, Palma"
    },
    eventRadius: 50
  },
  {
    id: "v2",
    name: "Festival Mallorca Live",
    email: "contacto@mallorcalive.com",
    type: "festival",
    isVerified: true,
    location: {
      latitude: 39.5307,
      longitude: 2.7338,
      address: "Calvià, Mallorca"
    },
    eventRadius: 500
  }
];

export const api = {
  // Simula verificar un código de evento
  verifyEventCode: async (code: string): Promise<{isValid: boolean, eventType: string}> => {
    return new Promise(resolve => {
      setTimeout(() => {
        // Simula que ciertos códigos corresponden a festivales
        const eventType = code.toLowerCase().includes('fest') ? 'festival' : 'discoteca';
        resolve({
          isValid: code.length > 5,
          eventType
        });
      }, 1000);
    });
  },

  // Simula verificar la ubicación
  verifyLocation: async (latitude: number, longitude: number): Promise<boolean> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(true);
      }, 1000);
    });
  },

  // Simula obtener perfiles cercanos
  getNearbyProfiles: async (): Promise<User[]> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(MOCK_USERS);
      }, 1000);
    });
  },
  
  // Simula una acción de like
  likeProfile: async (userId: string): Promise<boolean> => {
    return new Promise(resolve => {
      setTimeout(() => {
        // 40% de probabilidad de match
        resolve(Math.random() < 0.4);
      }, 500);
    });
  },
  
  // Simula obtener matches
  getMatches: async (): Promise<User[]> => {
    return new Promise(resolve => {
      setTimeout(() => {
        // Devolvemos algunos usuarios aleatorios como matches
        const randomUsers = [...MOCK_USERS]
          .sort(() => 0.5 - Math.random())
          .slice(0, 3);
        resolve(randomUsers);
      }, 1000);
    });
  },

  // Simula iniciar sesión
  login: async (phone: string): Promise<{success: boolean, userId?: string}> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({success: true, userId: "user123"});
      }, 1500);
    });
  },

  // Simula generar un código QR para un local
  generateQRCode: async (venueId: string): Promise<string> => {
    return new Promise(resolve => {
      setTimeout(() => {
        // En un caso real, se generaría un código QR único
        resolve(`VYBE-${venueId}-${new Date().toISOString().split('T')[0]}`);
      }, 1000);
    });
  }
};
