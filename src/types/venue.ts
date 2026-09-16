export interface Venue {
  id: string;
  name: string;
  email: string;
  type: VenueType;
  isVerified: boolean;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  eventRadius: number;
  city?: string;
  region?: string;
  qrCode?: string;
  phone?: string;
  phoneVerified?: boolean;
  /** CIF/NIF del titular: lo que administración contrasta antes de aprobar. */
  taxId?: string;
  /** Dirección del establecimiento, tal y como la escribió el local. */
  postalAddress?: string;
  documents?: string[];
  createdAt?: string;
}

export type VenueType =
  | 'discoteca'
  | 'bar'
  | 'festival'
  | 'fiesta_privada'
  | 'evento_empresarial'
  | 'local';

/** Radio de visibilidad en metros según el tipo de local. */
export const VENUE_RADIUS: Record<VenueType, number> = {
  discoteca: 100,
  bar: 50,
  local: 50,
  fiesta_privada: 50,
  evento_empresarial: 250,
  festival: 500,
};

export interface Event {
  id: string;
  name: string;
  venueId: string;
  venueName?: string;
  venueType?: VenueType;
  /** Localidad y comunidad del local, para filtrar la lista de eventos. */
  city?: string;
  region?: string;
  startDate: string;
  endDate: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  eventRadius?: number;
  minAge?: number;
  maxAge?: number;
  theme?: string;
  dressCode?: string;
  price?: number;
  bookingUrl?: string;
  /**
   * Cartel del evento.
   *
   * La columna `poster_url` existía en la base de datos desde el principio y
   * no la leía ni la escribía nadie, así que todas las tarjetas salían sin
   * imagen. Es lo primero que mira quien decide a qué fiesta va.
   */
  posterUrl?: string;
  qrCode?: string;
  description?: string;
  maxCapacity?: number;
  /**
   * Repetición. Con `weekly` o `biweekly` la base de datos crea la siguiente
   * edición sola (`generate_recurring_events()`).
   */
  recurrence?: 'none' | 'weekly' | 'biweekly';
}

export interface EventCode {
  id: string;
  venueId: string;
  eventId?: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}

/** Resultado del canjeo de un código de acceso, validado en servidor. */
export interface EventAccess {
  eventId: string;
  eventName: string;
  venueId: string;
  venueName: string;
  venueType: VenueType;
  eventRadius: number;
  startDate: string;
  endDate: string;
  distanceMeters: number | null;
  /** Foto que la persona se hizo al entrar. Sin ella no sale en el tablón. */
  photoUrl?: string | null;
}

export interface VenueStats {
  scans: number;
  activeUsers: number;
  eventsCount: number;
  avgAttendance: number;
}
