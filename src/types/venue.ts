
export interface Venue {
  id: string;
  name: string;
  email: string;
  type: string;
  isVerified: boolean;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  eventRadius: number;
  qrCode?: string;
}

export type VenueType = 'discoteca' | 'bar' | 'festival' | 'fiesta_privada' | 'evento';
