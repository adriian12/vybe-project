
import { User, Message, Connection } from "@/types/user";
import { Venue, Event, EventCode } from "@/types/venue";
import { supabase } from "@/integrations/supabase/client";

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
    eventRadius: 100
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

// Eventos de ejemplo
const MOCK_EVENTS: Event[] = [
  {
    id: "e1",
    name: "Noche Electrónica",
    venueId: "v1",
    startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
    minAge: 18,
    maxAge: null,
    theme: "Electrónica",
    dressCode: "Casual elegante",
    price: 15.00,
    bookingUrl: "https://example.com/booking/e1"
  },
  {
    id: "e2",
    name: "Festival de Verano",
    venueId: "v2",
    startDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
    minAge: 16,
    maxAge: null,
    theme: "Música variada",
    dressCode: "Ropa cómoda",
    price: 45.00,
    bookingUrl: "https://example.com/booking/e2"
  }
];

// Mensajes de ejemplo
const MOCK_MESSAGES: Record<string, Message[]> = {
  "1": [
    {
      id: "m1",
      senderId: "2",
      receiverId: "1",
      content: "¡Hola! Nos vemos en el evento de esta noche?",
      read: true,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "m2",
      senderId: "1",
      receiverId: "2",
      content: "¡Claro! Estaré allí a las 10pm",
      read: false,
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    }
  ]
};

export const api = {
  // Simula verificar un código de evento
  verifyEventCode: async (code: string): Promise<{isValid: boolean, eventType: string}> => {
    return new Promise(resolve => {
      setTimeout(() => {
        // Simula que ciertos códigos corresponden a festivales
        const eventType = code.toLowerCase().includes('fest') ? 'festival' : 'discoteca';
        resolve({
          isValid: code.length >= 6,
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

  // Simula obtener mensajes
  getMessages: async (userId: string): Promise<Record<string, Message[]>> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(MOCK_MESSAGES);
      }, 800);
    });
  },
  
  // Simula enviar un mensaje
  sendMessage: async (senderId: string, receiverId: string, content: string): Promise<Message> => {
    return new Promise(resolve => {
      setTimeout(() => {
        const newMessage = {
          id: `m${Math.random().toString(36).slice(2, 11)}`,
          senderId,
          receiverId,
          content,
          read: false,
          createdAt: new Date().toISOString()
        };
        
        if (!MOCK_MESSAGES[senderId]) {
          MOCK_MESSAGES[senderId] = [];
        }
        
        MOCK_MESSAGES[senderId].push(newMessage);
        
        resolve(newMessage);
      }, 500);
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
  
  // Simula verificar un código SMS/email
  verifyCode: async (code: string, type: 'phone' | 'email'): Promise<boolean> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(code.length === 6);
      }, 1000);
    });
  },

  // Simula verificar una imagen facial
  verifyFace: async (imageData: string): Promise<boolean> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(imageData.length > 100);
      }, 2000);
    });
  },

  // Simula generar un código QR para un local
  generateQRCode: async (venueId: string): Promise<{qrCode: string, manualCode: string}> => {
    return new Promise(resolve => {
      setTimeout(() => {
        // En un caso real, se generaría un código QR único
        const manualCode = Math.floor(100000 + Math.random() * 900000).toString();
        const qrCode = `VYBE-${venueId}-${manualCode}`;
        resolve({ 
          qrCode, 
          manualCode 
        });
      }, 1000);
    });
  },
  
  // Simula obtener eventos
  getEvents: async (): Promise<Event[]> => {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(MOCK_EVENTS);
      }, 1000);
    });
  },
  
  // Simula crear un evento
  createEvent: async (eventData: Omit<Event, 'id'>): Promise<Event> => {
    return new Promise(resolve => {
      setTimeout(() => {
        const newEvent = {
          id: `e${Math.random().toString(36).slice(2, 11)}`,
          ...eventData
        };
        
        MOCK_EVENTS.push(newEvent);
        
        resolve(newEvent);
      }, 1500);
    });
  }
};
