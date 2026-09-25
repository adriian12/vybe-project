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
      account_type_changes: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          to_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          to_type: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          to_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_type_changes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      admin_notices: {
        Row: {
          key: string
          sent_at: string
        }
        Insert: {
          key: string
          sent_at?: string
        }
        Update: {
          key?: string
          sent_at?: string
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
      apple_transactions: {
        Row: {
          created_at: string
          currency: string | null
          environment: string
          event_id: string | null
          expires_date: string | null
          original_transaction_id: string
          price_cents: number | null
          product_id: string
          profile_id: string | null
          purchase_date: string
          quantity: number
          revoked_at: string | null
          transaction_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          environment: string
          event_id?: string | null
          expires_date?: string | null
          original_transaction_id: string
          price_cents?: number | null
          product_id: string
          profile_id?: string | null
          purchase_date: string
          quantity?: number
          revoked_at?: string | null
          transaction_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          environment?: string
          event_id?: string | null
          expires_date?: string | null
          original_transaction_id?: string
          price_cents?: number | null
          product_id?: string
          profile_id?: string | null
          purchase_date?: string
          quantity?: number
          revoked_at?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apple_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apple_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_throttle: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
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
          audience: string
          body: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          recipients: number | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          title: string
          url: string | null
          venue_id: string | null
        }
        Insert: {
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          recipients?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          title: string
          url?: string | null
          venue_id?: string | null
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          recipients?: number | null
          scheduled_at?: string | null
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
      email_events: {
        Row: {
          created_at: string
          detail: Json | null
          email: string
          event: string
          id: string
          message_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          email: string
          event: string
          id?: string
          message_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json | null
          email?: string
          event?: string
          id?: string
          message_id?: string | null
        }
        Relationships: []
      }
      event_attendance: {
        Row: {
          checked_in_at: string
          code_id: string | null
          event_id: string
          id: string
          last_seen_at: string
          latitude: number | null
          left_at: string | null
          longitude: number | null
          mode: string | null
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
          left_at?: string | null
          longitude?: number | null
          mode?: string | null
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
          left_at?: string | null
          longitude?: number | null
          mode?: string | null
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
      event_boosts: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          event_id: string
          id: string
          stripe_session_id: string | null
          venue_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          event_id: string
          id?: string
          stripe_session_id?: string | null
          venue_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          event_id?: string
          id?: string
          stripe_session_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_boosts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_boosts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_codes: {
        Row: {
          active: boolean | null
          code: string
          commission_type: string | null
          commission_value: number | null
          created_at: string | null
          event_id: string | null
          expires_at: string
          id: string
          kind: string
          label: string | null
          max_uses: number | null
          promoter_name: string | null
          rotates_every_minutes: number | null
          team_link_id: string | null
          uses: number
          venue_id: string
        }
        Insert: {
          active?: boolean | null
          code: string
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string | null
          event_id?: string | null
          expires_at: string
          id?: string
          kind?: string
          label?: string | null
          max_uses?: number | null
          promoter_name?: string | null
          rotates_every_minutes?: number | null
          team_link_id?: string | null
          uses?: number
          venue_id: string
        }
        Update: {
          active?: boolean | null
          code?: string
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string | null
          event_id?: string | null
          expires_at?: string
          id?: string
          kind?: string
          label?: string | null
          max_uses?: number | null
          promoter_name?: string | null
          rotates_every_minutes?: number | null
          team_link_id?: string | null
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
            foreignKeyName: "event_codes_team_link_id_fkey"
            columns: ["team_link_id"]
            isOneToOne: false
            referencedRelation: "venue_team_links"
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
      event_counter_links: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          expires_at: string
          id: string
          label: string | null
          last_used_at: string | null
          revoked_at: string | null
          token: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          expires_at: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          token?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_counter_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_headcount: {
        Row: {
          event_id: string
          total: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          event_id: string
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          event_id?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_headcount_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_headcount_log: {
        Row: {
          at: string
          delta: number | null
          event_id: string
          id: number
          source: string
          total: number
        }
        Insert: {
          at?: string
          delta?: number | null
          event_id: string
          id?: number
          source: string
          total: number
        }
        Update: {
          at?: string
          delta?: number | null
          event_id?: string
          id?: number
          source?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_headcount_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      event_raffles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          draw_at: string | null
          drawn_at: string | null
          entries_closed_at: string | null
          event_id: string
          id: string
          prize: string
          promotion_id: string | null
          status: string
          venue_id: string
          winner_code: string | null
          winner_profile_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          draw_at?: string | null
          drawn_at?: string | null
          entries_closed_at?: string | null
          event_id: string
          id?: string
          prize: string
          promotion_id?: string | null
          status?: string
          venue_id: string
          winner_code?: string | null
          winner_profile_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          draw_at?: string | null
          drawn_at?: string | null
          entries_closed_at?: string | null
          event_id?: string
          id?: string
          prize?: string
          promotion_id?: string | null
          status?: string
          venue_id?: string
          winner_code?: string | null
          winner_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_raffles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_raffles_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_raffles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_raffles_winner_profile_id_fkey"
            columns: ["winner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ratings: {
        Row: {
          atmosphere: number | null
          comment: string | null
          created_at: string
          event_id: string
          id: string
          music: number | null
          overall: number
          price: number | null
          profile_id: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          atmosphere?: number | null
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          music?: number | null
          overall: number
          price?: number | null
          profile_id: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          atmosphere?: number | null
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          music?: number | null
          overall?: number
          price?: number | null
          profile_id?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ratings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ratings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ratings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
          city: string | null
          created_at: string | null
          description: string | null
          dress_code: string | null
          end_date: string
          entry_closed_at: string | null
          featured_until: string | null
          followers_notified_at: string | null
          guest_list_enabled: boolean
          guest_list_message: string | null
          id: string
          latitude: number | null
          longitude: number | null
          max_age: number | null
          max_capacity: number | null
          min_age: number | null
          name: string
          now_playing: string | null
          now_playing_at: string | null
          poster_url: string | null
          price: number | null
          qr_code: string | null
          queue_level: string | null
          queue_updated_at: string | null
          recurrence: string
          recurrence_parent_id: string | null
          region: string | null
          requires_location: boolean
          song_requests_enabled: boolean
          sponsor_logo_url: string | null
          sponsor_name: string | null
          sponsor_url: string | null
          stamps_enabled: boolean
          start_date: string
          test_lab: boolean
          theme: string | null
          ticket_provider: string | null
          tickets_available: boolean
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          booking_url?: string | null
          capacity_alert_ratio?: number
          city?: string | null
          created_at?: string | null
          description?: string | null
          dress_code?: string | null
          end_date: string
          entry_closed_at?: string | null
          featured_until?: string | null
          followers_notified_at?: string | null
          guest_list_enabled?: boolean
          guest_list_message?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_age?: number | null
          max_capacity?: number | null
          min_age?: number | null
          name: string
          now_playing?: string | null
          now_playing_at?: string | null
          poster_url?: string | null
          price?: number | null
          qr_code?: string | null
          queue_level?: string | null
          queue_updated_at?: string | null
          recurrence?: string
          recurrence_parent_id?: string | null
          region?: string | null
          requires_location?: boolean
          song_requests_enabled?: boolean
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          sponsor_url?: string | null
          stamps_enabled?: boolean
          start_date: string
          test_lab?: boolean
          theme?: string | null
          ticket_provider?: string | null
          tickets_available?: boolean
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          booking_url?: string | null
          capacity_alert_ratio?: number
          city?: string | null
          created_at?: string | null
          description?: string | null
          dress_code?: string | null
          end_date?: string
          entry_closed_at?: string | null
          featured_until?: string | null
          followers_notified_at?: string | null
          guest_list_enabled?: boolean
          guest_list_message?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_age?: number | null
          max_capacity?: number | null
          min_age?: number | null
          name?: string
          now_playing?: string | null
          now_playing_at?: string | null
          poster_url?: string | null
          price?: number | null
          qr_code?: string | null
          queue_level?: string | null
          queue_updated_at?: string | null
          recurrence?: string
          recurrence_parent_id?: string | null
          region?: string | null
          requires_location?: boolean
          song_requests_enabled?: boolean
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          sponsor_url?: string | null
          stamps_enabled?: boolean
          start_date?: string
          test_lab?: boolean
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
      guest_list_entries: {
        Row: {
          added_by: string | null
          admitted: number
          companions: number
          created_at: string
          event_id: string
          id: string
          list_id: string
          name: string
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          admitted?: number
          companions?: number
          created_at?: string
          event_id: string
          id?: string
          list_id: string
          name: string
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          admitted?: number
          companions?: number
          created_at?: string
          event_id?: string
          id?: string
          list_id?: string
          name?: string
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_list_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_list_entries_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "guest_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_list_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_lists: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          kind: string
          name: string
          team_link_id: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          kind: string
          name: string
          team_link_id?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          kind?: string
          name?: string
          team_link_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_lists_team_link_id_fkey"
            columns: ["team_link_id"]
            isOneToOne: false
            referencedRelation: "venue_team_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_lists_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
          event_id: string | null
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
          event_id?: string | null
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
          event_id?: string | null
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
            foreignKeyName: "moderation_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
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
          apple_original_transaction_id: string | null
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
          apple_original_transaction_id?: string | null
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
          apple_original_transaction_id?: string | null
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
      profile_boosts: {
        Row: {
          event_id: string
          expires_at: string
          id: string
          profile_id: string
          started_at: string
        }
        Insert: {
          event_id: string
          expires_at: string
          id?: string
          profile_id: string
          started_at?: string
        }
        Update: {
          event_id?: string
          expires_at?: string
          id?: string
          profile_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_boosts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_boosts_profile_id_fkey"
            columns: ["profile_id"]
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
          account_type: string
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
          profile_completed_at: string | null
          role: string
          staff_only: boolean
          status: string
          suspended_until: string | null
          suspension_reason: string | null
          updated_at: string | null
          user_id: string
          wants: string
        }
        Insert: {
          account_type?: string
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
          profile_completed_at?: string | null
          role?: string
          staff_only?: boolean
          status?: string
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id: string
          wants?: string
        }
        Update: {
          account_type?: string
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
          profile_completed_at?: string | null
          role?: string
          staff_only?: boolean
          status?: string
          suspended_until?: string | null
          suspension_reason?: string | null
          updated_at?: string | null
          user_id?: string
          wants?: string
        }
        Relationships: []
      }
      promoter_payouts: {
        Row: {
          amount_cents: number
          code_id: string
          event_id: string
          paid_at: string
          paid_by: string | null
          venue_id: string
        }
        Insert: {
          amount_cents: number
          code_id: string
          event_id: string
          paid_at?: string
          paid_by?: string | null
          venue_id: string
        }
        Update: {
          amount_cents?: number
          code_id?: string
          event_id?: string
          paid_at?: string
          paid_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promoter_payouts_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: true
            referencedRelation: "event_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promoter_payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promoter_payouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
          challenge_deadline: string | null
          challenge_target: number | null
          challenge_type: string | null
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
          template_key: string | null
          title: string
          venue_id: string
        }
        Insert: {
          active?: boolean
          challenge_deadline?: string | null
          challenge_target?: number | null
          challenge_type?: string | null
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
          template_key?: string | null
          title: string
          venue_id: string
        }
        Update: {
          active?: boolean
          challenge_deadline?: string | null
          challenge_target?: number | null
          challenge_type?: string | null
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
          template_key?: string | null
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
      song_requests: {
        Row: {
          artist: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          deezer_id: number | null
          event_id: string
          id: string
          normalized: string
          played_at: string | null
          title: string
        }
        Insert: {
          artist?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          deezer_id?: number | null
          event_id: string
          id?: string
          normalized: string
          played_at?: string | null
          title: string
        }
        Update: {
          artist?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          deezer_id?: number | null
          event_id?: string
          id?: string
          normalized?: string
          played_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      song_votes: {
        Row: {
          created_at: string
          profile_id: string
          request_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          request_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_votes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "song_requests"
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
      stamp_rewards: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          profile_id: string
          promotion_id: string | null
          stamps_used: number
          ticket_code: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          profile_id: string
          promotion_id?: string | null
          stamps_used: number
          ticket_code?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          profile_id?: string
          promotion_id?: string | null
          stamps_used?: number
          ticket_code?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stamp_rewards_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_rewards_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_rewards_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_rewards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_notices: {
        Row: {
          expires_at: string
          kind: string
          sent_at: string
          target_id: string
        }
        Insert: {
          expires_at: string
          kind: string
          sent_at?: string
          target_id: string
        }
        Update: {
          expires_at?: string
          kind?: string
          sent_at?: string
          target_id?: string
        }
        Relationships: []
      }
      supercrush_ledger: {
        Row: {
          amount_cents: number | null
          created_at: string
          delta: number
          event_id: string | null
          id: string
          profile_id: string
          reason: string
          stripe_session_id: string | null
          swiped_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          delta: number
          event_id?: string | null
          id?: string
          profile_id: string
          reason: string
          stripe_session_id?: string | null
          swiped_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          delta?: number
          event_id?: string | null
          id?: string
          profile_id?: string
          reason?: string
          stripe_session_id?: string | null
          swiped_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supercrush_ledger_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supercrush_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supercrush_ledger_swiped_id_fkey"
            columns: ["swiped_id"]
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
      ticket_orders: {
        Row: {
          add_to_account: boolean
          amount_cents: number
          application_fee_cents: number
          buyer_email: string | null
          created_at: string
          download_token: string | null
          email_sent_at: string | null
          event_id: string
          holders: Json | null
          id: string
          marketing_opt_in: boolean
          paid_at: string | null
          payment_intent_id: string | null
          profile_id: string | null
          quantity: number
          refunded_at: string | null
          refunded_by: string | null
          status: string
          stripe_account_id: string | null
          stripe_session_id: string | null
          terms_accepted_at: string | null
          ticket_type_id: string
          unit_cents: number
          venue_id: string
        }
        Insert: {
          add_to_account?: boolean
          amount_cents: number
          application_fee_cents?: number
          buyer_email?: string | null
          created_at?: string
          download_token?: string | null
          email_sent_at?: string | null
          event_id: string
          holders?: Json | null
          id?: string
          marketing_opt_in?: boolean
          paid_at?: string | null
          payment_intent_id?: string | null
          profile_id?: string | null
          quantity: number
          refunded_at?: string | null
          refunded_by?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_session_id?: string | null
          terms_accepted_at?: string | null
          ticket_type_id: string
          unit_cents: number
          venue_id: string
        }
        Update: {
          add_to_account?: boolean
          amount_cents?: number
          application_fee_cents?: number
          buyer_email?: string | null
          created_at?: string
          download_token?: string | null
          email_sent_at?: string | null
          event_id?: string
          holders?: Json | null
          id?: string
          marketing_opt_in?: boolean
          paid_at?: string | null
          payment_intent_id?: string | null
          profile_id?: string | null
          quantity?: number
          refunded_at?: string | null
          refunded_by?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_session_id?: string | null
          terms_accepted_at?: string | null
          ticket_type_id?: string
          unit_cents?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_orders_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          active: boolean
          capacity: number | null
          created_at: string
          description: string | null
          event_id: string
          guests: number | null
          id: string
          kind: string
          max_per_order: number
          min_spend_cents: number | null
          name: string
          price_cents: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id: string
          guests?: number | null
          id?: string
          kind: string
          max_per_order?: number
          min_spend_cents?: number | null
          name: string
          price_cents: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          description?: string | null
          event_id?: string
          guests?: number | null
          id?: string
          kind?: string
          max_per_order?: number
          min_spend_cents?: number | null
          name?: string
          price_cents?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_types_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          code: string
          created_at: string
          event_id: string
          holder_birthdate: string | null
          holder_email: string | null
          holder_name: string | null
          holder_phone: string | null
          id: string
          order_id: string
          profile_id: string | null
          status: string
          ticket_type_id: string
          used_at: string | null
          used_by: string | null
          venue_id: string
        }
        Insert: {
          code: string
          created_at?: string
          event_id: string
          holder_birthdate?: string | null
          holder_email?: string | null
          holder_name?: string | null
          holder_phone?: string | null
          id?: string
          order_id: string
          profile_id?: string | null
          status?: string
          ticket_type_id: string
          used_at?: string | null
          used_by?: string | null
          venue_id: string
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string
          holder_birthdate?: string | null
          holder_email?: string | null
          holder_name?: string | null
          holder_phone?: string | null
          id?: string
          order_id?: string
          profile_id?: string | null
          status?: string
          ticket_type_id?: string
          used_at?: string | null
          used_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ticket_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
      venue_followers: {
        Row: {
          created_at: string
          profile_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_followers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_followers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
      venue_stamp_cards: {
        Row: {
          enabled: boolean
          reward_description: string | null
          reward_title: string
          stamps_required: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          enabled?: boolean
          reward_description?: string | null
          reward_title?: string
          stamps_required?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          enabled?: boolean
          reward_description?: string | null
          reward_title?: string
          stamps_required?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_stamp_cards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
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
      venue_team_links: {
        Row: {
          commission_type: string | null
          commission_value: number | null
          created_at: string
          created_by: string | null
          event_id: string | null
          expires_at: string | null
          id: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          role: string
          token: string
          token_hash: string
          venue_id: string
        }
        Insert: {
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          role: string
          token: string
          token_hash: string
          venue_id: string
        }
        Update: {
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          role?: string
          token?: string
          token_hash?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_team_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_team_links_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_weekly_reports: {
        Row: {
          created_at: string
          data: Json
          id: string
          seen_at: string | null
          venue_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          seen_at?: string | null
          venue_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          seen_at?: string | null
          venue_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_weekly_reports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          avg_spend: number | null
          business_terms: string | null
          city: string | null
          contact_email: string | null
          created_at: string | null
          description: string | null
          documents: string[] | null
          email: string
          event_radius: number | null
          id: string
          instagram: string | null
          is_platform: boolean
          is_verified: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          opening_hours: Json | null
          phone: string | null
          platform_fee_percent: number
          region: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          stripe_requirements: Json | null
          stripe_updated_at: string | null
          tax_id: string | null
          type: string
          updated_at: string | null
          venue_id: string
          verification_status: string
          website: string | null
        }
        Insert: {
          address?: string | null
          avg_spend?: number | null
          business_terms?: string | null
          city?: string | null
          contact_email?: string | null
          created_at?: string | null
          description?: string | null
          documents?: string[] | null
          email: string
          event_radius?: number | null
          id?: string
          instagram?: string | null
          is_platform?: boolean
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          opening_hours?: Json | null
          phone?: string | null
          platform_fee_percent?: number
          region?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json | null
          stripe_updated_at?: string | null
          tax_id?: string | null
          type: string
          updated_at?: string | null
          venue_id: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          avg_spend?: number | null
          business_terms?: string | null
          city?: string | null
          contact_email?: string | null
          created_at?: string | null
          description?: string | null
          documents?: string[] | null
          email?: string
          event_radius?: number | null
          id?: string
          instagram?: string | null
          is_platform?: boolean
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          platform_fee_percent?: number
          region?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_requirements?: Json | null
          stripe_updated_at?: string | null
          tax_id?: string | null
          type?: string
          updated_at?: string | null
          venue_id?: string
          verification_status?: string
          website?: string | null
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
      active_event_of: { Args: { p_profile_id: string }; Returns: string }
      adjust_event_headcount: {
        Args: { p_delta: number; p_event_id: string }
        Returns: number
      }
      admin_add_supercrush: {
        Args: { p_profile_id: string; p_quantity: number }
        Returns: number
      }
      admin_create_event: {
        Args: {
          p_capacity?: number
          p_city?: string
          p_description?: string
          p_end: string
          p_latitude?: number
          p_longitude?: number
          p_name: string
          p_price?: number
          p_region?: string
          p_requires_location?: boolean
          p_start: string
          p_theme?: string
          p_venue_id?: string
        }
        Returns: string
      }
      admin_expiring_targets: {
        Args: { p_days?: number; p_kind: string }
        Returns: {
          email: string
          expires_at: string
          locale: string
          name: string
          notified: boolean
          plan: string
          target_id: string
        }[]
      }
      admin_house_venue: { Args: never; Returns: string }
      admin_is_staff_only: { Args: never; Returns: boolean }
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          account_type: string
          age: number
          check_ins: number
          created_at: string
          email: string
          is_verified: boolean
          name: string
          profile_id: string
          role: string
          staff_only: boolean
          status: string
          subscription_cancel_at_period_end: boolean
          subscription_event_id: string
          subscription_expires_at: string
          subscription_renews: boolean
          subscription_type: string
          supercrush: number
          total_count: number
        }[]
      }
      admin_list_venues: {
        Args: { p_search?: string }
        Returns: {
          address: string
          city: string
          created_at: string
          email: string
          events_total: number
          events_upcoming: number
          followers: number
          is_verified: boolean
          members: number
          name: string
          phone: string
          plan: string
          plan_cancel_at_period_end: boolean
          plan_expires_at: string
          plan_renews: boolean
          plan_status: string
          platform_fee_percent: number
          stripe_charges_enabled: boolean
          stripe_connected: boolean
          stripe_payouts_enabled: boolean
          tax_id: string
          type: string
          venue_id: string
          verification_status: string
        }[]
      }
      admin_reset_test_lab: {
        Args: {
          p_latitude: number
          p_longitude: number
          p_reset_my_swipes?: boolean
        }
        Returns: {
          access_code: string
          event_id: string
          event_name: string
          likes_for_you: number
          people_inside: number
        }[]
      }
      admin_set_subscription: {
        Args: { p_days?: number; p_profile_id: string; p_type: string }
        Returns: string
      }
      admin_set_venue_fee: {
        Args: { p_percent: number; p_venue_id: string }
        Returns: undefined
      }
      admin_set_venue_plan: {
        Args: { p_days?: number; p_plan: string; p_venue_id: string }
        Returns: string
      }
      admin_venue_events: {
        Args: { p_venue_id: string }
        Returns: {
          check_ins: number
          end_date: string
          event_id: string
          featured_until: string
          intents: number
          matches: number
          max_capacity: number
          name: string
          start_date: string
        }[]
      }
      admit_guests: {
        Args: { p_count: number; p_entry_id: string }
        Returns: {
          admitted: number
          total: number
        }[]
      }
      app_guest_list: { Args: { p_event_id: string }; Returns: string }
      apply_event_headcount: {
        Args: {
          p_by: string
          p_delta: number
          p_event_id: string
          p_source: string
          p_total: number
        }
        Returns: number
      }
      are_connected: {
        Args: { p_profile_a: string; p_profile_b: string }
        Returns: boolean
      }
      audience_members: {
        Args: { p_audience: string; p_event_id: string; p_venue_id: string }
        Returns: {
          profile_id: string
        }[]
      }
      broadcast_recipients: {
        Args: { p_broadcast_id: string }
        Returns: {
          profile_id: string
        }[]
      }
      build_weekly_report: {
        Args: { p_venue_id: string; p_week_start: string }
        Returns: Json
      }
      can_count_event: { Args: { p_event_id: string }; Returns: boolean }
      can_handle_sos: { Args: { p_event_id: string }; Returns: boolean }
      can_read_event_metrics: { Args: { p_event_id: string }; Returns: boolean }
      can_read_venue_metrics: { Args: { p_venue_id: string }; Returns: boolean }
      cancel_broadcast: { Args: { p_broadcast_id: string }; Returns: undefined }
      cancel_raffle: { Args: { p_raffle_id: string }; Returns: undefined }
      cancel_ticket_order: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      challenge_progress: {
        Args: { p_profile_id: string; p_promotion_id: string }
        Returns: {
          done: boolean
          progress: number
          target: number
        }[]
      }
      claim_promotion: {
        Args: { p_promotion_id: string }
        Returns: {
          ticket_code: string
          title: string
        }[]
      }
      claim_stamp_reward: { Args: { p_event_id: string }; Returns: string }
      cleanup_expired_event_codes: { Args: never; Returns: number }
      complete_my_profile: {
        Args: {
          p_age: number
          p_bio?: string
          p_gender: string
          p_tonight_plan?: string
          p_wants: string
        }
        Returns: undefined
      }
      confirm_phone_code: { Args: { p_code: string }; Returns: boolean }
      consume_anon_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: { p_action: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      count_broadcast_audience: {
        Args: { p_audience: string; p_event_id?: string }
        Returns: number
      }
      count_pending_moderation: { Args: never; Returns: number }
      counter_link_apply: {
        Args: { p_delta?: number; p_token_hash: string; p_total?: number }
        Returns: {
          capacity: number
          event_id: string
          event_name: string
          expires_at: string
          inside: number
          total: number
          updated_at: string
          venue_name: string
        }[]
      }
      create_counter_link: {
        Args: { p_event_id: string; p_label?: string }
        Returns: {
          expires_at: string
          id: string
          token: string
        }[]
      }
      create_group: {
        Args: { p_event_id: string; p_name: string }
        Returns: {
          group_id: string
          join_code: string
        }[]
      }
      create_guest_list: {
        Args: { p_event_id: string; p_name: string }
        Returns: string
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
      create_raffle: {
        Args: {
          p_description?: string
          p_draw_at?: string
          p_event_id: string
          p_prize: string
        }
        Returns: string
      }
      create_team_link: {
        Args: {
          p_commission_type?: string
          p_commission_value?: number
          p_event_id?: string
          p_label: string
          p_role: string
        }
        Returns: {
          id: string
          token: string
        }[]
      }
      create_ticket_order: {
        Args: {
          p_add_to_account?: boolean
          p_buyer_email?: string
          p_holders?: Json
          p_marketing?: boolean
          p_profile_id: string
          p_quantity: number
          p_type_id: string
        }
        Returns: {
          amount_cents: number
          event_name: string
          kind: string
          order_id: string
          type_name: string
          unit_cents: number
        }[]
      }
      credit_supercrush_purchase: {
        Args: {
          p_amount_cents: number
          p_profile_id: string
          p_quantity: number
          p_session_id: string
        }
        Returns: boolean
      }
      current_group_id: { Args: { p_event_id: string }; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      current_venue_id: { Args: never; Returns: string }
      current_venue_role: { Args: never; Returns: string }
      delete_guest_entry: { Args: { p_entry_id: string }; Returns: undefined }
      delete_guest_list: { Args: { p_list_id: string }; Returns: undefined }
      demographics_min_bucket: { Args: never; Returns: number }
      draw_raffle: { Args: { p_raffle_id: string }; Returns: string }
      enter_platform_event: {
        Args: { p_event_id: string; p_latitude: number; p_longitude: number }
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
      event_trend: { Args: { p_event_id: string }; Returns: string }
      event_women_share: { Args: { p_event_id: string }; Returns: number }
      export_my_data: { Args: never; Returns: Json }
      filling_up_threshold: { Args: never; Returns: number }
      fresh_headcount: {
        Args: { p_event_id: string }
        Returns: {
          total: number
          updated_at: string
        }[]
      }
      fulfill_ticket_order: {
        Args: { p_order_id: string; p_session_id: string }
        Returns: number
      }
      generate_recurring_events: { Args: never; Returns: number }
      generate_weekly_report: {
        Args: { p_venue_id: string; p_week_start: string }
        Returns: string
      }
      generate_weekly_reports: { Args: never; Returns: number }
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
      get_counter_link_token: { Args: { p_link_id: string }; Returns: string }
      get_distance: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      get_email_problems: {
        Args: { p_days?: number }
        Returns: {
          email: string
          event: string
          ocurrencias: number
          ultima: string
        }[]
      }
      get_event_attendees_preview: {
        Args: { p_event_id: string }
        Returns: {
          avatar: string
          id: string
          name: string
        }[]
      }
      get_event_challenges: {
        Args: { p_event_id: string }
        Returns: {
          challenge_type: string
          deadline: string
          description: string
          done: boolean
          ends_at: string
          progress: number
          promotion_id: string
          starts_at: string
          target: number
          ticket_code: string
          title: string
          validated: boolean
        }[]
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
      get_event_forecast: {
        Args: { p_event_id: string }
        Returns: {
          capacity: number
          confidence: string
          expected_checkins: number
          expected_total: number
          full_risk: boolean
          high: number
          intents: number
          low: number
          past_nights: number
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
      get_event_intent_list: {
        Args: { p_event_id: string }
        Returns: {
          age: number
          arrived: boolean
          avatar: string
          first_name: string
          gender: string
          marked_at: string
          profile_id: string
        }[]
      }
      get_event_occupancy: {
        Args: { p_event_id: string }
        Returns: {
          alert: boolean
          capacity: number
          headcount: number
          headcount_at: string
          inside: number
          ratio: number
          total_check_ins: number
          vybe_share: number
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
      get_event_raffles: {
        Args: { p_event_id: string }
        Returns: {
          description: string
          draw_at: string
          drawn_at: string
          entries_closed_at: string
          id: string
          is_me: boolean
          participants: number
          prize: string
          status: string
          ticket_code: string
          winner_code: string
          winner_name: string
        }[]
      }
      get_event_rating: {
        Args: { p_event_id: string }
        Returns: {
          event_avg: number
          event_count: number
          my_rating: number
          venue_avg: number
          venue_count: number
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
      get_event_ticket_types: {
        Args: { p_event_id: string }
        Returns: {
          description: string
          guests: number
          id: string
          kind: string
          max_per_order: number
          min_spend_cents: number
          name: string
          price_cents: number
          remaining: number
        }[]
      }
      get_events_activity: {
        Args: { p_event_ids: string[] }
        Returns: {
          entry_closed: boolean
          event_id: string
          friends_going: number
          going: number
          inside: number
          now_playing: string
          queue_level: string
          trend: string
          vibe_at: string
          vibe_level: string
          women_share: number
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
      get_guest_list_entries: {
        Args: { p_event_id: string }
        Returns: {
          admitted: number
          companions: number
          created_at: string
          from_app: boolean
          id: string
          list_id: string
          name: string
        }[]
      }
      get_guest_list_info: {
        Args: { p_event_id: string }
        Returns: {
          enabled: boolean
          message: string
          my_admitted: number
          my_companions: number
          my_name: string
        }[]
      }
      get_guest_lists: {
        Args: { p_event_id: string }
        Returns: {
          admitted: number
          enabled: boolean
          entries: number
          id: string
          kind: string
          message: string
          name: string
          people: number
        }[]
      }
      get_headcount_curve: {
        Args: { p_event_id: string }
        Returns: {
          bucket: string
          total: number
          vybe: number
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
          mode: string
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
      get_my_stamp_card: {
        Args: { p_event_id: string }
        Returns: {
          can_claim: boolean
          enabled: boolean
          event_counts: boolean
          reward_description: string
          reward_title: string
          stamps: number
          stamps_required: number
          venue_id: string
          venue_name: string
        }[]
      }
      get_my_ticket_order: {
        Args: { p_order_id: string }
        Returns: {
          add_to_account: boolean
          amount_cents: number
          download_token: string
          event_name: string
          kind: string
          order_id: string
          quantity: number
          start_date: string
          status: string
          tickets: Json
          type_name: string
          venue_name: string
        }[]
      }
      get_my_venue_membership: {
        Args: never
        Returns: {
          role: string
          venue: Json
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
      get_next_parties: {
        Args: {
          p_after: string
          p_exclude_event?: string
          p_latitude?: number
          p_longitude?: number
        }
        Returns: {
          city: string
          distance_meters: number
          end_date: string
          event_id: string
          event_name: string
          latitude: number
          longitude: number
          poster_url: string
          start_date: string
          subscribed: boolean
          venue_id: string
          venue_name: string
          venue_type: string
          vibe_level: string
        }[]
      }
      get_passed_profiles: {
        Args: { p_event_id: string }
        Returns: {
          age: number
          avatar: string
          id: string
          name: string
          passed_at: string
          photos: string[]
        }[]
      }
      get_pending_moderation: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          event_name: string
          id: string
          kind: string
          profile_id: string
          profile_name: string
          score: number
          urgent: boolean
          url: string
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
      get_promoter_settlement: {
        Args: { p_event_id: string }
        Returns: {
          check_ins: number
          code: string
          code_id: string
          commission_cents: number
          commission_type: string
          commission_value: number
          kind: string
          label: string
          paid_at: string
          paid_cents: number
          promoter_name: string
          ticket_revenue_cents: number
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
      get_signup_funnel: {
        Args: { p_days?: number }
        Returns: {
          accounts: number
          confirmed: number
          face_verified: number
          fully_verified: number
          with_photo: number
        }[]
      }
      get_song_ranking: {
        Args: { p_event_id: string }
        Returns: {
          artist: string
          cover_url: string
          id: string
          mine: boolean
          my_vote: boolean
          played_at: string
          title: string
          votes: number
        }[]
      }
      get_ticket_checkout: {
        Args: { p_type_id: string }
        Returns: {
          description: string
          dress_code: string
          end_date: string
          event_id: string
          event_name: string
          guests: number
          kind: string
          max_per_order: number
          min_age: number
          min_spend_cents: number
          name: string
          payments_enabled: boolean
          price_cents: number
          remaining: number
          start_date: string
          type_id: string
          venue_logo: string
          venue_name: string
          venue_terms: string
        }[]
      }
      get_ticket_orders: {
        Args: { p_event_id: string }
        Returns: {
          amount_cents: number
          buyer: string
          id: string
          kind: string
          net_cents: number
          paid_at: string
          quantity: number
          refundable: boolean
          refunded_at: string
          status: string
          type_name: string
          used: number
        }[]
      }
      get_ticket_sales: {
        Args: { p_event_id: string }
        Returns: {
          active: boolean
          capacity: number
          description: string
          guests: number
          id: string
          kind: string
          max_per_order: number
          min_spend_cents: number
          name: string
          price_cents: number
          revenue_cents: number
          sold: number
          used: number
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
      get_venue_events_public: {
        Args: { p_venue_id: string }
        Returns: {
          end_date: string
          featured: boolean
          id: string
          name: string
          poster_url: string
          price: number
          start_date: string
          theme: string
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
      get_venue_followers_summary: {
        Args: never
        Returns: {
          last_week: number
          total: number
        }[]
      }
      get_venue_payments_status: {
        Args: never
        Returns: {
          charges_enabled: boolean
          connected: boolean
          details_submitted: boolean
          payouts_enabled: boolean
          pending_fields: number
          updated_at: string
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
      get_venue_profile: {
        Args: { p_venue_id: string }
        Returns: {
          address: string
          city: string
          contact_email: string
          description: string
          followers: number
          i_follow: boolean
          id: string
          instagram: string
          latitude: number
          logo_url: string
          longitude: number
          name: string
          opening_hours: Json
          phone: string
          region: string
          subscribed: boolean
          type: string
          website: string
        }[]
      }
      get_venue_ratings: { Args: never; Returns: Json }
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
          event_id: string
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
      get_venue_stamp_card: {
        Args: never
        Returns: {
          collectors: number
          completed: number
          enabled: boolean
          reward_description: string
          reward_title: string
          stamps_required: number
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
      get_venue_terms: {
        Args: { p_venue_id: string }
        Returns: {
          terms: string
          venue_name: string
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
      get_weekly_reports: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          data: Json
          id: string
          seen_at: string
          week_start: string
        }[]
      }
      heartbeat_event_attendance: {
        Args: { p_event_id: string; p_latitude?: number; p_longitude?: number }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_current_user_verified: { Args: never; Returns: boolean }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_guest_profile: { Args: { p_profile_id: string }; Returns: boolean }
      is_premium: { Args: { p_profile_id?: string }; Returns: boolean }
      is_premium_for_event: {
        Args: { p_event_id: string; p_profile_id: string }
        Returns: boolean
      }
      is_profile_active: { Args: { p_profile_id: string }; Returns: boolean }
      is_test_lab_event: { Args: { p_event_id: string }; Returns: boolean }
      is_user_blocked: {
        Args: { p_other_user_id: string; p_user_id: string }
        Returns: boolean
      }
      issue_prize_ticket: {
        Args: { p_profile_id: string; p_promotion_id: string }
        Returns: string
      }
      join_group: { Args: { p_join_code: string }; Returns: string }
      join_guest_list: {
        Args: { p_companions: number; p_event_id: string; p_name: string }
        Returns: undefined
      }
      keep_connection: { Args: { p_connection_id: string }; Returns: boolean }
      last_week_start: { Args: never; Returns: string }
      leave_event: { Args: { p_event_id: string }; Returns: undefined }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      leave_guest_list: { Args: { p_event_id: string }; Returns: undefined }
      likes_for_preview: {
        Args: { p_profile_id: string }
        Returns: {
          age: number
          event_name: string
          liked_at: string
          name: string
          photo_url: string
          profile_id: string
          swipe_type: string
        }[]
      }
      list_counter_links: {
        Args: { p_event_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          label: string
          last_used_at: string
          revoked_at: string
        }[]
      }
      list_team_links: {
        Args: never
        Returns: {
          commission_type: string
          commission_value: number
          created_at: string
          event_id: string
          event_name: string
          event_start: string
          expires_at: string
          id: string
          label: string
          last_used_at: string
          revoked_at: string
          role: string
          token: string
        }[]
      }
      mark_broadcast_sent: {
        Args: { p_broadcast_id: string; p_recipients: number }
        Returns: undefined
      }
      mark_event_push_sent: {
        Args: { p_event_id: string; p_kind: string; p_profile_id: string }
        Returns: undefined
      }
      mark_promoter_paid: {
        Args: { p_code_id: string; p_paid: boolean }
        Returns: undefined
      }
      mark_song_played: { Args: { p_request_id: string }; Returns: undefined }
      mark_ticket_order_refunded: {
        Args: { p_by?: string; p_order_id: string }
        Returns: undefined
      }
      mark_weekly_report_seen: {
        Args: { p_report_id: string }
        Returns: undefined
      }
      my_account_type_status: {
        Args: never
        Returns: {
          account_type: string
          changes_used: number
          max_changes: number
          needs_profile: boolean
          next_allowed_at: string
        }[]
      }
      my_boost: { Args: { p_event_id: string }; Returns: string }
      my_pending_rating: {
        Args: never
        Returns: {
          event_id: string
          event_name: string
          start_date: string
          venue_name: string
        }[]
      }
      my_premium_status: {
        Args: never
        Returns: {
          active_event_id: string
          cancel_at_period_end: boolean
          event_id: string
          expires_at: string
          is_premium: boolean
          store: string
          subscription_id: string
          subscription_type: string
        }[]
      }
      my_supercrush: {
        Args: never
        Returns: {
          balance: number
          event_id: string
          included_available: boolean
        }[]
      }
      my_tickets: {
        Args: never
        Returns: {
          code: string
          download_token: string
          end_date: string
          event_id: string
          event_name: string
          guests: number
          holder_name: string
          id: string
          kind: string
          min_spend_cents: number
          order_id: string
          start_date: string
          status: string
          type_name: string
          unit_cents: number
          used_at: string
          venue_name: string
        }[]
      }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      normalize_song: {
        Args: { p_artist: string; p_title: string }
        Returns: string
      }
      notify_followers: { Args: { p_event_id: string }; Returns: boolean }
      owner_business_for_event: {
        Args: { p_event_id: string; p_feature: string }
        Returns: string
      }
      pending_event_pushes: {
        Args: never
        Returns: {
          event_id: string
          event_name: string
          inside: number
          kind: string
          locale: string
          profile_id: string
          venue_name: string
          vibe_level: string
          vybes: number
        }[]
      }
      perform_raffle_draw: { Args: { p_raffle_id: string }; Returns: string }
      purge_auth_throttle: { Args: never; Returns: number }
      purge_email_events: { Args: never; Returns: number }
      purge_ended_event_photos: {
        Args: { p_limit?: number }
        Returns: {
          path: string
        }[]
      }
      purge_expired_connections: { Args: never; Returns: number }
      purge_finished_groups: { Args: never; Returns: number }
      purge_rate_limits: { Args: never; Returns: number }
      push_webhook: { Args: { p_body: Json }; Returns: undefined }
      queue_audience_broadcast: {
        Args: {
          p_audience: string
          p_body: string
          p_event_id?: string
          p_scheduled_at?: string
          p_title: string
        }
        Returns: string
      }
      queue_broadcast: {
        Args: {
          p_body: string
          p_event_id?: string
          p_scheduled_at?: string
          p_title: string
          p_url?: string
        }
        Returns: string
      }
      queue_followers_notice: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      raffle_participant_count: {
        Args: { p_raffle_id: string }
        Returns: number
      }
      raffle_participants: {
        Args: { p_raffle_id: string }
        Returns: {
          profile_id: string
        }[]
      }
      rate_event: {
        Args: {
          p_atmosphere?: number
          p_comment?: string
          p_event_id: string
          p_music?: number
          p_overall: number
          p_price?: number
        }
        Returns: undefined
      }
      recompute_my_verification: { Args: never; Returns: boolean }
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
      request_song: {
        Args: {
          p_artist?: string
          p_cover_url?: string
          p_deezer_id?: number
          p_event_id: string
          p_title: string
        }
        Returns: string
      }
      reset_raffle: { Args: { p_raffle_id: string }; Returns: boolean }
      resolve_sos_alert: { Args: { p_alert_id: string }; Returns: undefined }
      review_photo: {
        Args: { p_approve: boolean; p_item_id: string; p_reason?: string }
        Returns: undefined
      }
      revoke_counter_link: { Args: { p_link_id: string }; Returns: undefined }
      revoke_event_checkin: {
        Args: { p_event_id: string; p_profile_id: string }
        Returns: undefined
      }
      revoke_team_link: { Args: { p_link_id: string }; Returns: undefined }
      rotate_event_code_if_needed: {
        Args: { p_venue_id: string }
        Returns: {
          code: string
          expires_at: string
          rotated: boolean
        }[]
      }
      run_due_raffles: { Args: never; Returns: number }
      save_guest_entry: {
        Args: {
          p_companions: number
          p_entry_id: string
          p_list_id: string
          p_name: string
        }
        Returns: string
      }
      save_native_push_token: {
        Args: { p_device_model?: string; p_platform: string; p_token: string }
        Returns: undefined
      }
      save_ticket_type: {
        Args: {
          p_active?: boolean
          p_capacity: number
          p_description: string
          p_event_id: string
          p_guests?: number
          p_id: string
          p_kind: string
          p_max_per_order?: number
          p_min_spend_cents?: number
          p_name: string
          p_price_cents: number
        }
        Returns: string
      }
      set_account_type: { Args: { p_type: string }; Returns: undefined }
      set_code_commission: {
        Args: { p_code_id: string; p_type: string; p_value: number }
        Returns: undefined
      }
      set_event_entry: {
        Args: { p_event_id: string; p_open: boolean }
        Returns: string
      }
      set_event_headcount: {
        Args: { p_event_id: string; p_total: number }
        Returns: number
      }
      set_event_live_info: {
        Args: {
          p_event_id: string
          p_now_playing?: string
          p_queue_level?: string
        }
        Returns: undefined
      }
      set_event_mode: {
        Args: { p_event_id: string; p_mode: string }
        Returns: undefined
      }
      set_event_photo: {
        Args: { p_event_id: string; p_photo_url: string }
        Returns: undefined
      }
      set_event_songs: {
        Args: { p_enabled: boolean; p_event_id: string }
        Returns: undefined
      }
      set_event_stamps: {
        Args: { p_enabled: boolean; p_event_id: string }
        Returns: undefined
      }
      set_face_verified: { Args: { p_profile_id: string }; Returns: undefined }
      set_guest_list_settings: {
        Args: { p_enabled: boolean; p_event_id: string; p_message: string }
        Returns: undefined
      }
      set_my_gender: { Args: { p_gender: string }; Returns: undefined }
      set_raffle_entries: {
        Args: { p_closed: boolean; p_raffle_id: string }
        Returns: string
      }
      set_venue_avg_spend: { Args: { p_amount: number }; Returns: undefined }
      set_venue_stamp_card: {
        Args: {
          p_enabled: boolean
          p_reward_description?: string
          p_reward_title: string
          p_stamps_required: number
        }
        Returns: undefined
      }
      shares_active_event: {
        Args: { p_profile_a: string; p_profile_b: string }
        Returns: boolean
      }
      signup_availability: {
        Args: { p_email: string; p_phone: string }
        Returns: {
          email_taken: boolean
          phone_taken: boolean
        }[]
      }
      stamps_of: {
        Args: { p_profile_id: string; p_venue_id: string }
        Returns: number
      }
      start_boost: { Args: { p_event_id: string }; Returns: string }
      supercrush_balance: { Args: { p_profile_id: string }; Returns: number }
      suspend_profile: {
        Args: { p_days?: number; p_profile_id: string; p_reason?: string }
        Returns: undefined
      }
      team_link_action: {
        Args: { p_action: string; p_args?: Json; p_token_hash: string }
        Returns: Json
      }
      ticket_type_taken: { Args: { p_type_id: string }; Returns: number }
      toggle_song_vote: { Args: { p_request_id: string }; Returns: boolean }
      toggle_venue_follow: { Args: { p_venue_id: string }; Returns: boolean }
      trigger_event_notifications: { Args: never; Returns: undefined }
      undo_pass: {
        Args: { p_event_id: string; p_profile_id: string }
        Returns: boolean
      }
      unmatch: { Args: { p_other: string }; Returns: undefined }
      update_user_location: {
        Args: { p_latitude: number; p_longitude: number; p_profile_id: string }
        Returns: undefined
      }
      validate_event_ticket: {
        Args: { p_code: string }
        Returns: {
          already_used: boolean
          event_name: string
          guests: number
          holder_name: string
          kind: string
          type_name: string
          used_at: string
        }[]
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
      venue_has_feature:
        | { Args: { p_feature: string; p_venue_id?: string }; Returns: boolean }
        | { Args: { p_key: string; p_venue: string }; Returns: boolean }
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
      venue_scheduled_broadcast_limit: {
        Args: { p_venue_id: string }
        Returns: number
      }
      verify_from_event_photo: {
        Args: { p_profile_id: string; p_url: string }
        Returns: undefined
      }
      vibe_level_for: {
        Args: { p_capacity: number; p_count: number }
        Returns: string
      }
      vybe_inside: { Args: { p_event_id: string }; Returns: number }
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
