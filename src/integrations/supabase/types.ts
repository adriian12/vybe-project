export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          id: number
          name: string
          profile_id: string | null
          props: Json
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
          profile_id?: string | null
          props?: Json
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
          profile_id?: string | null
          props?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_clicks: {
        Row: {
          created_at: string
          event_id: string
          id: string
          profile_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          profile_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_clicks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_clicks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          recipients: number | null
          sent_at: string | null
          status: string
          title: string
          url: string | null
          venue_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          recipients?: number | null
          sent_at?: string | null
          status?: string
          title: string
          url?: string | null
          venue_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          recipients?: number | null
          sent_at?: string | null
          status?: string
          title?: string
          url?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          connection_type: string | null
          created_at: string | null
          event_id: string | null
          expires_at: string | null
          id: string
          kept_by_1: boolean
          kept_by_2: boolean
          updated_at: string | null
          user_id_1: string
          user_id_2: string
        }
        Insert: {
          connection_type?: string | null
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          kept_by_1?: boolean
          kept_by_2?: boolean
          updated_at?: string | null
          user_id_1: string
          user_id_2: string
        }
        Update: {
          connection_type?: string | null
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          kept_by_1?: boolean
          kept_by_2?: boolean
          updated_at?: string | null
          user_id_1?: string
          user_id_2?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
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
      event_attendance: {
        Row: {
          checked_in_at: string
          code_id: string | null
          event_id: string
          id: string
          last_seen_at: string
          latitude: number | null
          longitude: number | null
          photo_taken_at: string | null
          photo_url: string | null
          profile_id: string
        }
        Insert: {
          checked_in_at?: string
          code_id?: string | null
          event_id: string
          id?: string
          last_seen_at?: string
          latitude?: number | null
          longitude?: number | null
          photo_taken_at?: string | null
          photo_url?: string | null
          profile_id: string
        }
        Update: {
          checked_in_at?: string
          code_id?: string | null
          event_id?: string
          id?: string
          last_seen_at?: string
          latitude?: number | null
          longitude?: number | null
          photo_taken_at?: string | null
          photo_url?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "event_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance_legacy: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      event_codes: {
        Row: {
          active: boolean | null
          code: string
          created_at: string | null
          event_id: string | null
          expires_at: string
          id: string
          kind: string
          label: string | null
          max_uses: number | null
          promoter_name: string | null
          rotates_every_minutes: number | null
          uses: number
          venue_id: string
        }
        Insert: {
          active?: boolean | null
          code: string
          created_at?: string | null
          event_id?: string | null
          expires_at: string
          id?: string
          kind?: string
          label?: string | null
          max_uses?: number | null
          promoter_name?: string | null
          rotates_every_minutes?: number | null
          uses?: number
          venue_id: string
        }
        Update: {
          active?: boolean | null
          code?: string
          created_at?: string | null
          event_id?: string | null
          expires_at?: string
          id?: string
          kind?: string
          label?: string | null
          max_uses?: number | null
          promoter_name?: string | null
          rotates_every_minutes?: number | null
          uses?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_codes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_codes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_intents: {
        Row: {
          created_at: string
          event_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_intents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_intents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_push_log: {
        Row: {
          event_id: string
          id: string
          kind: string
          profile_id: string
          sent_at: string
        }
        Insert: {
          event_id: string
          id?: string
          kind: string
          profile_id: string
          sent_at?: string
        }
        Update: {
          event_id?: string
          id?: string
          kind?: string
          profile_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_push_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_push_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_stats: {
        Row: {
          active_users_count: number | null
          event_id: string
          id: string
          matches_count: number | null
          recorded_at: string | null
          scans_count: number | null
          venue_id: string
        }
        Insert: {
          active_users_count?: number | null
          event_id: string
          id?: string
          matches_count?: number | null
          recorded_at?: string | null
          scans_count?: number | null
          venue_id: string
        }
        Update: {
          active_users_count?: number | null
          event_id?: string
          id?: string
          matches_count?: number | null
          recorded_at?: string | null
          scans_count?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_stats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_stats_venue_id_fkey"
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
          capacity_alert_ratio: number
          created_at: string | null
          description: string | null
          dress_code: string | null
          end_date: string
          id: string
          latitude: number | null
          longitude: number | null
          max_age: number | null
          max_capacity: number | null
          min_age: number | null
          name: string
          poster_url: string | null
          price: number | null
          qr_code: string | null
          recurrence: string
          recurrence_parent_id: string | null
          sponsor_logo_url: string | null
          sponsor_name: string | null
          sponsor_url: string | null
          start_date: string
          theme: string | null
          ticket_provider: string | null
          tickets_available: boolean
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          booking_url?: string | null
          capacity_alert_ratio?: number
          created_at?: string | null
          description?: string | null
          dress_code?: string | null
          end_date: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_age?: number | null
          max_capacity?: number | null
          min_age?: number | null
          name: string
          poster_url?: string | null
          price?: number | null
          qr_code?: string | null
          recurrence?: string
          recurrence_parent_id?: string | null
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          sponsor_url?: string | null
          start_date: string
          theme?: string | null
          ticket_provider?: string | null
          tickets_available?: boolean
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          booking_url?: string | null
          capacity_alert_ratio?: number
          created_at?: string | null
          description?: string | null
          dress_code?: string | null
          end_date?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_age?: number | null
          max_capacity?: number | null
          min_age?: number | null
          name?: string
          poster_url?: string | null
          price?: number | null
          qr_code?: string | null
          recurrence?: string
          recurrence_parent_id?: string | null
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          sponsor_url?: string | null
          start_date?: string
          theme?: string | null
          ticket_provider?: string | null
          tickets_available?: boolean
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          profile_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          profile_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          event_id: string
          id: string
          join_code: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          join_code: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          join_code?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interests: {
        Row: {
          category: string
          id: string
          slug: string
          sort_order: number
        }
        Insert: {
          category: string
          id?: string
          slug: string
          sort_order?: number
        }
        Update: {
          category?: string
          id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          read: boolean | null
          receiver_id: string
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          receiver_id: string
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          read?: boolean | null
          receiver_id?: string
          sender_id?: string
          updated_at?: string | null
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
      moderation_queue: {
        Row: {
          bucket: string
          created_at: string
          id: string
          kind: string
          path: string
          profile_id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          status: string
          url: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
          kind?: string
          path: string
          profile_id: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          status?: string
          url: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
          kind?: string
          path?: string
          profile_id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          status?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_queue_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          message: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      premium_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string | null
          event_id: string | null
          expires_at: string | null
          id: string
          plan_type: string
          started_at: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          plan_type?: string
          started_at?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          plan_type?: string
          started_at?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "premium_subscriptions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "premium_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_interests: {
        Row: {
          interest_id: string
          profile_id: string
        }
        Insert: {
          interest_id: string
          profile_id: string
        }
        Update: {
          interest_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_interests_interest_id_fkey"
            columns: ["interest_id"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_interests_profile_id_fkey"
            columns: ["profile_id"]
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
          created_at: string | null
          deletion_requested_at: string | null
          email: string | null
          face_verified: boolean | null
          gender: string | null
          id: string
          is_invisible: boolean
          is_verified: boolean | null
          languages: string[]
          latitude: number | null
          locale: string
          longitude: number | null
          name: string
          notify_events: boolean
          notify_matches: boolean
          notify_messages: boolean
          phone: string | null
          phone_verified: boolean | null
          photos: string[] | null
          plan_tonight: string | null
          role: string
          status: string
          suspended_until: string | null
          suspension_reason: string | null
          updated_at: string | null
          user_id: string
          wants: string
        }
        Insert: {
          age: number
          avatar?: string | null
          bio?: string | null
          created_at?: string | null
          deletion_requested_at?: string | null
          email?: string | null
          face_verified?: boolean | null
          gender?: string | null
          id?: string
          is_invisible?: boolean
          is_verified?: boolean | null
          languages?: string[]
          latitude?: number | null
          locale?: string
          longitude?: number | null
          name: string
          notify_events?: boolean
          notify_matches?: boolean
          notify_messages?: boolean
          phone?: string | null
          phone_verified?: boolean | null
          photos?: string[] | null
          plan_tonight?: string | null
          role?: string
          status?: string
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id: string
          wants?: string
        }
        Update: {
          age?: number
          avatar?: string | null
          bio?: string | null
          created_at?: string | null
          deletion_requested_at?: string | null
          email?: string | null
          face_verified?: boolean | null
          gender?: string | null
          id?: string
          is_invisible?: boolean
          is_verified?: boolean | null
          languages?: string[]
          latitude?: number | null
          locale?: string
          longitude?: number | null
          name?: string
          notify_events?: boolean
          notify_matches?: boolean
          notify_messages?: boolean
          phone?: string | null
          phone_verified?: boolean | null
          photos?: string[] | null
          plan_tonight?: string | null
          role?: string
          status?: string
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id?: string
          wants?: string
        }
        Relationships: []
      }
      promotion_redemptions: {
        Row: {
          claimed_at: string
          id: string
          profile_id: string
          promotion_id: string
          ticket_code: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          claimed_at?: string
          id?: string
          profile_id: string
          promotion_id: string
          ticket_code: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          claimed_at?: string
          id?: string
          profile_id?: string
          promotion_id?: string
          ticket_code?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_redemptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          ends_at: string | null
          event_id: string
          id: string
          kind: string
          max_per_person: number
          max_redemptions: number | null
          premium_only: boolean
          starts_at: string | null
          title: string
          venue_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_id: string
          id?: string
          kind?: string
          max_per_person?: number
          max_redemptions?: number | null
          premium_only?: boolean
          starts_at?: string | null
          title: string
          venue_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_id?: string
          id?: string
          kind?: string
          max_per_person?: number
          max_redemptions?: number | null
          premium_only?: boolean
          starts_at?: string | null
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          device_model: string | null
          endpoint: string
          id: string
          last_used_at: string | null
          native_token: string | null
          p256dh: string | null
          platform: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth?: string | null
          created_at?: string
          device_model?: string | null
          endpoint: string
          id?: string
          last_used_at?: string | null
          native_token?: string | null
          p256dh?: string | null
          platform?: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string | null
          created_at?: string
          device_model?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string | null
          native_token?: string | null
          p256dh?: string | null
          platform?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action: string
          count: number
          profile_id: string
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          profile_id: string
          window_start: string
        }
        Update: {
          action?: string
          count?: number
          profile_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          report_type: string
          reported_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          report_type: string
          reported_id: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          report_type?: string
          reported_id?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_alerts: {
        Row: {
          created_at: string
          event_id: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          latitude: number | null
          longitude: number | null
          note: string | null
          profile_id: string
          resolved_at: string | null
          status: string
          venue_notified_at: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          profile_id: string
          resolved_at?: string | null
          status?: string
          venue_notified_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          profile_id?: string
          resolved_at?: string | null
          status?: string
          venue_notified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sos_alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      swipes: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string
          swipe_type: string
          swiped_id: string
          swiper_id: string
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          swipe_type: string
          swiped_id: string
          swiper_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          swipe_type?: string
          swiped_id?: string
          swiper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_swiped_id_fkey"
            columns: ["swiped_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_swiper_id_fkey"
            columns: ["swiper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trusted_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          profile_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          profile_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trusted_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          accepted: boolean
          accepted_at: string
          document: string
          id: string
          user_id: string
          version: string
        }
        Insert: {
          accepted?: boolean
          accepted_at?: string
          document: string
          id?: string
          user_id: string
          version: string
        }
        Update: {
          accepted?: boolean
          accepted_at?: string
          document?: string
          id?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string | null
          id: string
          interested_in: string | null
          max_age: number | null
          max_distance: number | null
          min_age: number | null
          preferred_venues: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          interested_in?: string | null
          max_age?: number | null
          max_distance?: number | null
          min_age?: number | null
          preferred_venues?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          interested_in?: string | null
          max_age?: number | null
          max_distance?: number | null
          min_age?: number | null
          preferred_venues?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_approved: boolean | null
          is_super_admin: boolean | null
          is_verified: boolean | null
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_approved?: boolean | null
          is_super_admin?: boolean | null
          is_verified?: boolean | null
          role: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_approved?: boolean | null
          is_super_admin?: boolean | null
          is_verified?: boolean | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      venue_events: {
        Row: {
          access_code: string | null
          access_radius: number | null
          created_at: string | null
          description: string | null
          enable_guest_list: boolean | null
          enable_tickets: boolean | null
          end_time: string
          entry_price: number | null
          event_date: string
          event_name: string
          id: string
          is_activated: boolean | null
          max_capacity: number | null
          poster_url: string | null
          qr_code: string | null
          start_time: string
          status: string
          ticket_url: string | null
          updated_at: string | null
          venue_address: string
          venue_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          access_code?: string | null
          access_radius?: number | null
          created_at?: string | null
          description?: string | null
          enable_guest_list?: boolean | null
          enable_tickets?: boolean | null
          end_time: string
          entry_price?: number | null
          event_date: string
          event_name: string
          id?: string
          is_activated?: boolean | null
          max_capacity?: number | null
          poster_url?: string | null
          qr_code?: string | null
          start_time: string
          status: string
          ticket_url?: string | null
          updated_at?: string | null
          venue_address: string
          venue_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          access_code?: string | null
          access_radius?: number | null
          created_at?: string | null
          description?: string | null
          enable_guest_list?: boolean | null
          enable_tickets?: boolean | null
          end_time?: string
          entry_price?: number | null
          event_date?: string
          event_name?: string
          id?: string
          is_activated?: boolean | null
          max_capacity?: number | null
          poster_url?: string | null
          qr_code?: string | null
          start_time?: string
          status?: string
          ticket_url?: string | null
          updated_at?: string | null
          venue_address?: string
          venue_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_leads: {
        Row: {
          city: string
          consent_at: string
          contact: string
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          ip_hash: string | null
          locale: string | null
          message: string | null
          source: string
          status: string
          venue_name: string
          venue_type: string | null
        }
        Insert: {
          city: string
          consent_at?: string
          contact: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip_hash?: string | null
          locale?: string | null
          message?: string | null
          source?: string
          status?: string
          venue_name: string
          venue_type?: string | null
        }
        Update: {
          city?: string
          consent_at?: string
          contact?: string
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip_hash?: string | null
          locale?: string | null
          message?: string | null
          source?: string
          status?: string
          venue_name?: string
          venue_type?: string | null
        }
        Relationships: []
      }
      venue_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          role: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_members_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_profiles: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
          venue_address: string
          venue_capacity: number | null
          venue_description: string | null
          venue_name: string
          venue_phone: string | null
          venue_type: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          updated_at?: string | null
          venue_address: string
          venue_capacity?: number | null
          venue_description?: string | null
          venue_name: string
          venue_phone?: string | null
          venue_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
          venue_address?: string
          venue_capacity?: number | null
          venue_description?: string | null
          venue_name?: string
          venue_phone?: string | null
          venue_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          expires_at: string | null
          id: string
          plan: string
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: string
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_subscriptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          documents: string[] | null
          email: string
          event_radius: number | null
          id: string
          is_verified: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          region: string | null
          tax_id: string | null
          type: string
          updated_at: string | null
          venue_id: string
          verification_status: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          documents?: string[] | null
          email: string
          event_radius?: number | null
          id?: string
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          region?: string | null
          tax_id: string | null
          type: string
          updated_at?: string | null
          venue_id: string
          verification_status?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          documents?: string[] | null
          email?: string
          event_radius?: number | null
          id?: string
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          region?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string | null
          venue_id?: string
          verification_status?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          id: string
          user_id: string
          user_type: string
          verified: boolean | null
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          user_id: string
          user_type: string
          verified?: boolean | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          user_id?: string
          user_type?: string
          verified?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_sos_alert: {
        Args: { p_alert_id: string }
        Returns: undefined
      }
      admin_reset_test_lab: {
        Args: { p_latitude: number; p_longitude: number; p_reset_my_swipes?: boolean }
        Returns: {
          access_code: string
          event_id: string
          event_name: string
          likes_for_you: number
          people_inside: number
        }[]
      }
      are_connected: {
        Args: { p_profile_a: string; p_profile_b: string }
        Returns: boolean
      }
      broadcast_recipients: {
        Args: { p_broadcast_id: string }
        Returns: {
          profile_id: string
        }[]
      }
      can_read_event_metrics: { Args: { p_event_id: string }; Returns: boolean }
      can_read_venue_metrics: { Args: { p_venue_id: string }; Returns: boolean }
      claim_promotion: {
        Args: { p_promotion_id: string }
        Returns: {
          ticket_code: string
          title: string
        }[]
      }
      cleanup_expired_event_codes: { Args: never; Returns: number }
      consume_rate_limit: {
        Args: { p_action: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      create_group: {
        Args: { p_event_id: string; p_name: string }
        Returns: {
          group_id: string
          join_code: string
        }[]
      }
      create_labeled_code: {
        Args: {
          p_event_id: string
          p_kind: string
          p_label: string
          p_max_uses?: number
          p_promoter_name?: string
        }
        Returns: {
          code: string
          id: string
        }[]
      }
      current_group_id: { Args: { p_event_id: string }; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      current_venue_id: { Args: never; Returns: string }
      current_venue_role: { Args: never; Returns: string }
      demographics_min_bucket: { Args: never; Returns: number }
      export_my_data: { Args: never; Returns: Json }
      filling_up_threshold: { Args: never; Returns: number }
      generate_recurring_events: { Args: never; Returns: number }
      get_code_attribution: {
        Args: { p_event_id: string }
        Returns: {
          check_ins: number
          code: string
          code_id: string
          kind: string
          label: string
          matches: number
          promoter_name: string
          still_inside: number
        }[]
      }
      get_distance: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      get_event_demographics: {
        Args: { p_event_id: string }
        Returns: {
          bucket: string
          gender: string
          people: number
        }[]
      }
      get_event_dropoff: {
        Args: { p_event_id: string }
        Returns: {
          arrived: number
          hour: string
          left_count: number
          present: number
        }[]
      }
      get_event_funnel: {
        Args: { p_event_id: string }
        Returns: {
          active_swipers: number
          booking_clicks: number
          check_ins: number
          intents: number
          matches: number
          swipes: number
        }[]
      }
      get_event_groups: {
        Args: { p_event_id: string }
        Returns: {
          avatars: string[]
          group_id: string
          is_mine: boolean
          member_count: number
          name: string
        }[]
      }
      get_event_hourly: {
        Args: { p_event_id: string }
        Returns: {
          check_ins: number
          hour: string
          matches: number
        }[]
      }
      get_event_occupancy: {
        Args: { p_event_id: string }
        Returns: {
          alert: boolean
          capacity: number
          inside: number
          ratio: number
          total_check_ins: number
        }[]
      }
      get_event_places: {
        Args: never
        Returns: {
          city: string
          events: number
          region: string
        }[]
      }
      get_event_stats: {
        Args: { p_event_id: string }
        Returns: {
          active_users_count: number
          matches_count: number
          scans_count: number
        }[]
      }
      get_events_activity: {
        Args: { p_event_ids: string[] }
        Returns: {
          event_id: string
          going: number
          inside: number
        }[]
      }
      get_group_members: {
        Args: { p_group_id: string }
        Returns: {
          is_owner: boolean
          joined_at: string
          name: string
          photo: string
          profile_id: string
        }[]
      }
      get_group_messages: {
        Args: { p_group_id: string }
        Returns: {
          author_name: string
          author_photo: string
          content: string
          created_at: string
          id: string
          profile_id: string
        }[]
      }
      get_likes_received: {
        Args: never
        Returns: {
          age: number
          avatar: string
          bio: string
          event_name: string
          id: string
          liked_at: string
          name: string
          photos: string[]
          swipe_type: string
        }[]
      }
      get_my_active_event: {
        Args: never
        Returns: {
          checked_in_at: string
          end_date: string
          event_id: string
          event_name: string
          event_radius: number
          latitude: number
          longitude: number
          photo_url: string
          start_date: string
          venue_id: string
          venue_name: string
          venue_type: string
        }[]
      }
      get_my_event_history: {
        Args: never
        Returns: {
          checked_in_at: string
          connections_made: number
          event_id: string
          event_name: string
          start_date: string
          venue_name: string
        }[]
      }
      get_nearby_profiles: {
        Args: {
          p_event_id?: string
          p_interest_slugs?: string[]
          p_latitude: number
          p_longitude: number
          p_max_age?: number
          p_min_age?: number
          p_radius_meters?: number
          p_user_id: string
        }
        Returns: {
          age: number
          avatar: string
          bio: string
          distance_meters: number
          gender: string
          id: string
          interests: string[]
          is_verified: boolean
          name: string
          photos: string[]
          shared_interests: number
        }[]
      }
      get_profile_reputation: {
        Args: { p_profile_id: string }
        Returns: {
          connections_made: number
          events_attended: number
          is_verified: boolean
          member_since: string
          reports_received: number
        }[]
      }
      get_promotion_stats: {
        Args: { p_event_id: string }
        Returns: {
          claimed: number
          kind: string
          max_redemptions: number
          promotion_id: string
          title: string
          validated: number
        }[]
      }
      get_user_conversations: {
        Args: { p_user_id: string }
        Returns: {
          last_message_content: string
          last_message_time: string
          other_user_id: string
          other_user_name: string
          unread_count: number
        }[]
      }
      get_venue_events_summary: {
        Args: { p_since?: string; p_venue_id: string }
        Returns: {
          booking_clicks: number
          check_ins: number
          end_date: string
          event_id: string
          event_name: string
          intents: number
          matches: number
          start_date: string
          swipes: number
        }[]
      }
      get_venue_plan_status: {
        Args: never
        Returns: {
          active_events: number
          cancel_at_period_end: boolean
          csv_export: boolean
          demographics: boolean
          expires_at: string
          max_active_events: number
          max_team_members: number
          plan: string
          promoter_codes: boolean
          promotions: boolean
          status: string
          team_members: number
        }[]
      }
      get_venue_reports: {
        Args: { p_event_id: string }
        Returns: {
          created_at: string
          description: string
          report_id: string
          report_type: string
          reported_name: string
          reported_photo: string
          reported_profile_id: string
          reports_total: number
        }[]
      }
      get_venue_sos_alerts: {
        Args: never
        Returns: {
          created_at: string
          event_name: string
          handled_at: string
          id: string
          latitude: number
          longitude: number
          note: string
          profile_name: string
          profile_photo: string
        }[]
      }
      get_venue_stats: {
        Args: { p_since?: string; p_venue_id: string }
        Returns: {
          active_users_count: number
          avg_attendance: number
          events_count: number
          scans_count: number
        }[]
      }
      get_venue_weekday_stats: {
        Args: { p_since?: string; p_venue_id: string }
        Returns: {
          avg_check_ins: number
          avg_matches: number
          best_theme: string
          events: number
          weekday: number
        }[]
      }
      heartbeat_event_attendance: {
        Args: { p_event_id: string; p_latitude?: number; p_longitude?: number }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_current_user_verified: { Args: never; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_premium: { Args: { p_profile_id?: string }; Returns: boolean }
      is_profile_active: { Args: { p_profile_id: string }; Returns: boolean }
      is_user_blocked: {
        Args: { p_other_user_id: string; p_user_id: string }
        Returns: boolean
      }
      join_group: { Args: { p_join_code: string }; Returns: string }
      keep_connection: { Args: { p_connection_id: string }; Returns: boolean }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      mark_broadcast_sent: {
        Args: { p_broadcast_id: string; p_recipients: number }
        Returns: undefined
      }
      mark_event_push_sent: {
        Args: { p_event_id: string; p_kind: string; p_profile_id: string }
        Returns: undefined
      }
      pending_event_pushes: {
        Args: never
        Returns: {
          event_id: string
          event_name: string
          inside: number
          kind: string
          profile_id: string
          venue_name: string
        }[]
      }
      purge_expired_connections: { Args: never; Returns: number }
      purge_finished_groups: { Args: never; Returns: number }
      purge_rate_limits: { Args: never; Returns: number }
      queue_broadcast: {
        Args: {
          p_body: string
          p_event_id?: string
          p_title: string
          p_url?: string
        }
        Returns: string
      }
      redeem_event_code: {
        Args: { p_code: string; p_latitude?: number; p_longitude?: number }
        Returns: {
          distance_meters: number
          end_date: string
          event_id: string
          event_name: string
          event_radius: number
          start_date: string
          venue_id: string
          venue_name: string
          venue_type: string
        }[]
      }
      reinstate_profile: { Args: { p_profile_id: string }; Returns: undefined }
      remove_group_member: {
        Args: { p_group_id: string; p_profile_id: string }
        Returns: undefined
      }
      remove_native_push_token: {
        Args: { p_token: string }
        Returns: undefined
      }
      request_account_deletion: { Args: never; Returns: undefined }
      recompute_my_verification: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      confirm_phone_code: {
        Args: { p_code: string }
        Returns: boolean
      }
      set_face_verified: {
        Args: { p_profile_id: string }
        Returns: undefined
      }
      get_pending_moderation: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          profile_id: string
          profile_name: string | null
          url: string
          kind: string | null
          score: number | null
          created_at: string
          event_name: string | null
          urgent: boolean | null
        }[]
      }
      get_signup_funnel: {
        Args: { p_days?: number }
        Returns: {
          accounts: number
          confirmed: number
          with_photo: number
          face_verified: number
          fully_verified: number
        }[]
      }
      get_event_attendees_preview: {
        Args: { p_event_id: string }
        Returns: { id: string; name: string; avatar: string | null }[]
      }
      get_passed_profiles: {
        Args: { p_event_id: string }
        Returns: {
          id: string
          name: string
          age: number
          avatar: string | null
          photos: string[] | null
          passed_at: string
        }[]
      }
      undo_pass: {
        Args: { p_profile_id: string; p_event_id: string }
        Returns: boolean
      }
      start_boost: {
        Args: { p_event_id: string }
        Returns: string
      }
      my_boost: {
        Args: { p_event_id: string }
        Returns: string | null
      }
      review_photo: {
        Args: { p_approve: boolean; p_item_id: string; p_reason?: string }
        Returns: undefined
      }
      revoke_event_checkin: {
        Args: { p_event_id: string; p_profile_id: string }
        Returns: undefined
      }
      rotate_event_code_if_needed: {
        Args: { p_venue_id: string }
        Returns: {
          code: string
          expires_at: string
          rotated: boolean
        }[]
      }
      save_native_push_token: {
        Args: { p_device_model?: string; p_platform: string; p_token: string }
        Returns: undefined
      }
      set_event_photo: {
        Args: { p_event_id: string; p_photo_url: string }
        Returns: undefined
      }
      shares_active_event: {
        Args: { p_profile_a: string; p_profile_b: string }
        Returns: boolean
      }
      suspend_profile: {
        Args: { p_days?: number; p_profile_id: string; p_reason?: string }
        Returns: undefined
      }
      update_user_location: {
        Args: { p_latitude: number; p_longitude: number; p_profile_id: string }
        Returns: undefined
      }
      validate_promotion_ticket: {
        Args: { p_ticket_code: string }
        Returns: {
          already_used: boolean
          claimed_at: string
          holder_name: string
          title: string
        }[]
      }
      venue_has_feature: {
        Args: { p_feature: string; p_venue_id?: string }
        Returns: boolean
      }
      venue_plan: { Args: { p_venue_id?: string }; Returns: string }
      venue_plan_limits: {
        Args: { p_plan: string }
        Returns: {
          csv_export: boolean
          demographics: boolean
          max_active_events: number
          max_team_members: number
          promoter_codes: boolean
          promotions: boolean
        }[]
      }
      wants_gender: {
        Args: { p_gender: string; p_wants: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
