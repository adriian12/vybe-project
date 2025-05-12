
export interface User {
  id: string;
  name: string;
  age: number;
  bio: string;
  photos: string[];
  distance?: number;
  lastActive?: string;
  isVerified: boolean;
}
