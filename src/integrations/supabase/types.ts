export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      connections: {
        Row: {
          connection_type: string
          created_at: string
          id: string
          user_id_1: string
          user_id_2: string
        }
        Insert: {
          connection_type?: string
          created_at?: string
          id?: string
          user_id_1: string
          user_id_2: string
        }
        Update: {
          connection_type?: string
          created_at?: string
          id?: string
          user_id_1?: string
          user_id_2?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_user_id_1_fkey"
            columns: ["user_id_1"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_user_id_2_fkey"
            columns: ["user_id_2"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string
          id: string
          venue_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          venue_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_codes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          booking_url: string | null
          created_at: string
          description: string | null
          dress_code: string | null
          end_date: string
          id: string
          location: unknown | null
          max_age: number | null
          max_capacity: number | null
          min_age: number | null
          name: string
          price: number | null
          qr_code: string | null
          start_date: string
          theme: string | null
          venue_id: string
        }
        Insert: {
          booking_url?: string | null
          created_at?: string
          description?: string | null
          dress_code?: string | null
          end_date: string
          id?: string
          location?: unknown | null
          max_age?: number | null
          max_capacity?: number | null
          min_age?: number | null
          name: string
          price?: number | null
          qr_code?: string | null
          start_date: string
          theme?: string | null
          venue_id: string
        }
        Update: {
          booking_url?: string | null
          created_at?: string
          description?: string | null
          dress_code?: string | null
          end_date?: string
          id?: string
          location?: unknown | null
          max_age?: number | null
          max_capacity?: number | null
          min_age?: number | null
          name?: string
          price?: number | null
          qr_code?: string | null
          start_date?: string
          theme?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read: boolean
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read?: boolean
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number
          avatar: string | null
          bio: string | null
          created_at: string
          face_verified: boolean | null
          id: string
          is_verified: boolean
          last_location: unknown | null
          name: string
          phone: string | null
          phone_verified: boolean | null
          photos: string[]
          user_id: string
        }
        Insert: {
          age: number
          avatar?: string | null
          bio?: string | null
          created_at?: string
          face_verified?: boolean | null
          id?: string
          is_verified?: boolean
          last_location?: unknown | null
          name: string
          phone?: string | null
          phone_verified?: boolean | null
          photos?: string[]
          user_id: string
        }
        Update: {
          age?: number
          avatar?: string | null
          bio?: string | null
          created_at?: string
          face_verified?: boolean | null
          id?: string
          is_verified?: boolean
          last_location?: unknown | null
          name?: string
          phone?: string | null
          phone_verified?: boolean | null
          photos?: string[]
          user_id?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          created_at: string
          documents: string[]
          email: string
          event_radius: number
          id: string
          is_verified: boolean
          location: unknown | null
          name: string
          type: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          documents?: string[]
          email: string
          event_radius?: number
          id?: string
          is_verified?: boolean
          location?: unknown | null
          name: string
          type: string
          venue_id: string
        }
        Update: {
          created_at?: string
          documents?: string[]
          email?: string
          event_radius?: number
          id?: string
          is_verified?: boolean
          location?: unknown | null
          name?: string
          type?: string
          venue_id?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
          user_type: string
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
          user_type: string
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
          user_type?: string
          verified?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
