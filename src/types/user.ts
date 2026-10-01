export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  age: number;
  bio: string;
  photos: string[];
  avatar?: string;
  email?: string;
  role?: UserRole;
  /** Cuenta que sólo administra: no sale de fiesta ni aparece en tablones. */
  staffOnly?: boolean;
  distance?: number;
  lastActive?: string;
  /** Slugs de intereses; se traducen en el cliente. */
  interests?: string[];
  /** Intereses en común con quien mira el perfil. */
  sharedInterests?: number;
  languages?: string[];
  planTonight?: string;
  /** Género, elegido en el registro y no modificable después. */
  gender?: 'man' | 'woman';
  /** A quién quiere ver. Sí se puede cambiar. */
  wants?: 'men' | 'women' | 'all';
  /** `vyber` (tablón) o `guest` (sólo fiestas, ofertas y avisos). */
  accountType?: 'vyber' | 'guest';
  /** Ha rellenado la ficha de fiester@ (edad, género, a quién ve…). */
  profileCompleted?: boolean;
  status?: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  notifyMatches?: boolean;
  notifyMessages?: boolean;
  isVerified: boolean;
  isInvisible?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  faceVerified?: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  read: boolean;
  createdAt: string;
}

export interface Connection {
  id: string;
  userId1: string;
  userId2: string;
  connectionType: 'vybe_check' | 'match';
  createdAt: string;
}

export type ReportType =
  | 'inappropriate_content'
  | 'harassment'
  | 'fake_profile'
  | 'spam'
  | 'other';

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reportedName?: string;
  reporterName?: string;
  reportType: ReportType;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: string;
}

/** Una conexión con su metadato de caducidad, para el chat efímero. */
export interface MatchConnection {
  connectionId: string;
  user: User;
  eventId?: string;
  /** null cuando ambas partes han decidido conservarla. */
  expiresAt?: string;
  keptByMe: boolean;
  keptByOther: boolean;
  createdAt: string;
}
