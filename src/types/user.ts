
export interface User {
  id: string;
  name: string;
  age: number;
  bio: string;
  photos: string[];
  distance?: number;
  lastActive?: string;
  isVerified: boolean;
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
