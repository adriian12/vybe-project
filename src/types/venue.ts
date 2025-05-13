
export interface Venue {
  id: string;
  name: string;
  email: string;
  type: VenueType;
  isVerified: boolean;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  eventRadius: number;
  qrCode?: string;
  phone?: string;
  phoneVerified?: boolean;
  documents?: string[];
}

export type VenueType = 'discoteca' | 'bar' | 'festival' | 'fiesta_privada' | 'evento_empresarial' | 'local';

export interface Event {
  id: string;
  name: string;
  venueId: string;
  startDate: string;
  endDate: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  minAge?: number;
  maxAge?: number;
  theme?: string;
  dressCode?: string;
  price?: number;
  bookingUrl?: string;
  qrCode?: string;
}

export interface EventCode {
  id: string;
  venueId: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
}
