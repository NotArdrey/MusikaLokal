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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      address_verification_sessions: {
        Row: {
          address_matches: boolean | null
          archive_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          error_code: string | null
          error_message: string | null
          expected_address: string | null
          expected_name: string | null
          extracted_address: string | null
          extracted_name: string | null
          id: string
          issue_date: string | null
          issuer: string | null
          name_matches: boolean | null
          notes: string | null
          provider: string | null
          raw_response: Json | null
          session_id: string
          smile_user_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          verification_result: Json | null
          verified_at: string | null
        }
        Insert: {
          address_matches?: boolean | null
          archive_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error_code?: string | null
          error_message?: string | null
          expected_address?: string | null
          expected_name?: string | null
          extracted_address?: string | null
          extracted_name?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          name_matches?: boolean | null
          notes?: string | null
          provider?: string | null
          raw_response?: Json | null
          session_id: string
          smile_user_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          verification_result?: Json | null
          verified_at?: string | null
        }
        Update: {
          address_matches?: boolean | null
          archive_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error_code?: string | null
          error_message?: string | null
          expected_address?: string | null
          expected_name?: string | null
          extracted_address?: string | null
          extracted_name?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          name_matches?: boolean | null
          notes?: string | null
          provider?: string | null
          raw_response?: Json | null
          session_id?: string
          smile_user_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          verification_result?: Json | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "address_verification_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "address_verification_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_verification_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_verification_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_attendance_events: {
        Row: {
          booking_id: string
          created_at: string
          event_type: string
          id: string
          notes: string | null
          reporter_user_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          notes?: string | null
          reporter_user_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          notes?: string | null
          reporter_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_attendance_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attendance_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attendance_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attendance_events_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_attendance_events_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attendance_events_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_attendance_events_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_cancellation_policies: {
        Row: {
          created_at: string
          full_refund_hours_before: number
          id: string
          is_active: boolean
          late_cancel_penalty_pct: number
          name: string
          no_show_penalty_pct: number
          partial_refund_hours_before: number
          partial_refund_pct: number
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_refund_hours_before?: number
          id?: string
          is_active?: boolean
          late_cancel_penalty_pct?: number
          name?: string
          no_show_penalty_pct?: number
          partial_refund_hours_before?: number
          partial_refund_pct?: number
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_refund_hours_before?: number
          id?: string
          is_active?: boolean
          late_cancel_penalty_pct?: number
          name?: string
          no_show_penalty_pct?: number
          partial_refund_hours_before?: number
          partial_refund_pct?: number
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellation_policies_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellation_policies_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "booking_cancellation_policies_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellation_policies_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellation_policies_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_holds: {
        Row: {
          booking_date: string
          created_at: string
          end_time: string
          expires_at: string
          id: string
          start_time: string
          studio_id: string
          user_id: string
        }
        Insert: {
          booking_date: string
          created_at?: string
          end_time: string
          expires_at: string
          id?: string
          start_time: string
          studio_id: string
          user_id: string
        }
        Update: {
          booking_date?: string
          created_at?: string
          end_time?: string
          expires_at?: string
          id?: string
          start_time?: string
          studio_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_holds_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "booking_holds_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_holds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_incidents: {
        Row: {
          booking_id: string
          counterparty_notes: string | null
          counterparty_user_id: string
          created_at: string
          id: string
          issue_type: string
          penalty_event_id: string | null
          reporter_notes: string | null
          reporter_user_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          responded_at: string | null
          response_deadline_at: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          counterparty_notes?: string | null
          counterparty_user_id: string
          created_at?: string
          id?: string
          issue_type: string
          penalty_event_id?: string | null
          reporter_notes?: string | null
          reporter_user_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          responded_at?: string | null
          response_deadline_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          counterparty_notes?: string | null
          counterparty_user_id?: string
          created_at?: string
          id?: string
          issue_type?: string
          penalty_event_id?: string | null
          reporter_notes?: string | null
          reporter_user_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          responded_at?: string | null
          response_deadline_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_incidents_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_penalty_event_id_fkey"
            columns: ["penalty_event_id"]
            isOneToOne: false
            referencedRelation: "booking_penalty_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_penalty_event_id_fkey"
            columns: ["penalty_event_id"]
            isOneToOne: false
            referencedRelation: "booking_penalty_events_with_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_incidents_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_incidents_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_penalty_events: {
        Row: {
          beneficiary_user_id: string | null
          booking_id: string
          booking_total: number
          created_at: string
          id: string
          notes: string | null
          penalized_user_id: string
          penalty_amount: number
          penalty_type: string
          policy_snapshot: Json
          refund_amount: number
          refund_transaction_id: string | null
          wallet_transaction_id: string | null
        }
        Insert: {
          beneficiary_user_id?: string | null
          booking_id: string
          booking_total: number
          created_at?: string
          id?: string
          notes?: string | null
          penalized_user_id: string
          penalty_amount: number
          penalty_type: string
          policy_snapshot: Json
          refund_amount?: number
          refund_transaction_id?: string | null
          wallet_transaction_id?: string | null
        }
        Update: {
          beneficiary_user_id?: string | null
          booking_id?: string
          booking_total?: number
          created_at?: string
          id?: string
          notes?: string | null
          penalized_user_id?: string
          penalty_amount?: number
          penalty_type?: string
          policy_snapshot?: Json
          refund_amount?: number
          refund_transaction_id?: string | null
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          attachment_url: string | null
          created_at: string
          event_details: Json | null
          group_id: string | null
          id: string
          message: string | null
          receiver_id: string | null
          sender_id: string
          status: string | null
          studio_id: string | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          event_details?: Json | null
          group_id?: string | null
          id?: string
          message?: string | null
          receiver_id?: string | null
          sender_id: string
          status?: string | null
          studio_id?: string | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          event_details?: Json | null
          group_id?: string | null
          id?: string
          message?: string | null
          receiver_id?: string | null
          sender_id?: string
          status?: string | null
          studio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "booking_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "booking_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          is_muted: boolean
          joined_at: string | null
          last_read_at: string | null
          muted_until: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_muted?: boolean
          joined_at?: string | null
          last_read_at?: string | null
          muted_until?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_muted?: boolean
          joined_at?: string | null
          last_read_at?: string | null
          muted_until?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations_display_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          gig_application_id: string | null
          gig_id: string | null
          group_id: string | null
          id: string
          is_group: boolean | null
          studio_booking_id: string | null
          studio_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gig_application_id?: string | null
          gig_id?: string | null
          group_id?: string | null
          id?: string
          is_group?: boolean | null
          studio_booking_id?: string | null
          studio_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gig_application_id?: string | null
          gig_id?: string | null
          group_id?: string | null
          id?: string
          is_group?: boolean | null
          studio_booking_id?: string | null
          studio_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_gig_application_id_fkey"
            columns: ["gig_application_id"]
            isOneToOne: false
            referencedRelation: "gig_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_gig_application_id_fkey"
            columns: ["gig_application_id"]
            isOneToOne: false
            referencedRelation: "musician_performed_gigs"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "conversations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "conversations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "conversations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_studio_booking_id_fkey"
            columns: ["studio_booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_studio_booking_id_fkey"
            columns: ["studio_booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_studio_booking_id_fkey"
            columns: ["studio_booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "conversations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      didit_webhook_events: {
        Row: {
          created_at: string
          event_key: string
          payload_hash: string
          processed_at: string
          session_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          event_key: string
          payload_hash: string
          processed_at?: string
          session_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          event_key?: string
          payload_hash?: string
          processed_at?: string
          session_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      email_notifications: {
        Row: {
          created_at: string | null
          error_message: string | null
          html_content: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          status: string | null
          subject: string
          template_type: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          html_content?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          status?: string | null
          subject: string
          template_type?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          html_content?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          status?: string | null
          subject?: string
          template_type?: string | null
        }
        Relationships: []
      }
      external_platform_links: {
        Row: {
          click_count: number | null
          created_at: string
          id: string
          label: string | null
          linked_item_id: string | null
          linked_playlist_id: string | null
          owner_id: string
          platform: string
          url: string
        }
        Insert: {
          click_count?: number | null
          created_at?: string
          id?: string
          label?: string | null
          linked_item_id?: string | null
          linked_playlist_id?: string | null
          owner_id: string
          platform: string
          url: string
        }
        Update: {
          click_count?: number | null
          created_at?: string
          id?: string
          label?: string | null
          linked_item_id?: string | null
          linked_playlist_id?: string | null
          owner_id?: string
          platform?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_platform_links_linked_item_id_fkey"
            columns: ["linked_item_id"]
            isOneToOne: false
            referencedRelation: "playlist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_platform_links_linked_playlist_id_fkey"
            columns: ["linked_playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_platform_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "external_platform_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_platform_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_platform_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          gig_id: string | null
          group_id: string | null
          id: string
          profile_id: string | null
          studio_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          gig_id?: string | null
          group_id?: string | null
          id?: string
          profile_id?: string | null
          studio_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          gig_id?: string | null
          group_id?: string | null
          id?: string
          profile_id?: string | null
          studio_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "favorites_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "favorites_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "favorites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "favorites_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          author_id: string
          comment_count: number | null
          content: string | null
          created_at: string
          id: string
          is_hidden: boolean | null
          is_pinned: boolean | null
          is_reported: boolean | null
          linked_playlist_id: string | null
          linked_product_id: string | null
          post_type: string
          reaction_count: number | null
          share_count: number | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          comment_count?: number | null
          content?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          is_pinned?: boolean | null
          is_reported?: boolean | null
          linked_playlist_id?: string | null
          linked_product_id?: string | null
          post_type?: string
          reaction_count?: number | null
          share_count?: number | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          comment_count?: number | null
          content?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          is_pinned?: boolean | null
          is_reported?: boolean | null
          linked_playlist_id?: string | null
          linked_product_id?: string | null
          post_type?: string
          reaction_count?: number | null
          share_count?: number | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feed_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feed_posts_linked_playlist"
            columns: ["linked_playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feed_posts_linked_product"
            columns: ["linked_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feed_posts_linked_product"
            columns: ["linked_product_id"]
            isOneToOne: false
            referencedRelation: "products_with_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          followed_type: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          followed_type?: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          followed_type?: string
          follower_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_applications: {
        Row: {
          applicant_id: string
          cancellation_reason: string | null
          created_at: string
          cv_url: string | null
          gig_id: string
          group_id: string | null
          id: string
          is_solo_application: boolean | null
          leader_approval_status: string | null
          leader_reviewed_at: string | null
          note: string | null
          performer_snapshot: Json
          pitch_message: string | null
          production_roster_id: string | null
          production_team_id: string | null
          reconfirmation_due_at: string | null
          reconfirmation_required_at: string | null
          rejected_at: string | null
          reviewed_by_applicant: boolean | null
          reviewed_by_organizer: boolean | null
          show_on_profile: boolean
          slot_type: string | null
          status: string | null
          submitted_by_user_id: string | null
          system_status_reason: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          applicant_id: string
          cancellation_reason?: string | null
          created_at?: string
          cv_url?: string | null
          gig_id: string
          group_id?: string | null
          id?: string
          is_solo_application?: boolean | null
          leader_approval_status?: string | null
          leader_reviewed_at?: string | null
          note?: string | null
          performer_snapshot?: Json
          pitch_message?: string | null
          production_roster_id?: string | null
          production_team_id?: string | null
          reconfirmation_due_at?: string | null
          reconfirmation_required_at?: string | null
          rejected_at?: string | null
          reviewed_by_applicant?: boolean | null
          reviewed_by_organizer?: boolean | null
          show_on_profile?: boolean
          slot_type?: string | null
          status?: string | null
          submitted_by_user_id?: string | null
          system_status_reason?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          applicant_id?: string
          cancellation_reason?: string | null
          created_at?: string
          cv_url?: string | null
          gig_id?: string
          group_id?: string | null
          id?: string
          is_solo_application?: boolean | null
          leader_approval_status?: string | null
          leader_reviewed_at?: string | null
          note?: string | null
          performer_snapshot?: Json
          pitch_message?: string | null
          production_roster_id?: string | null
          production_team_id?: string | null
          reconfirmation_due_at?: string | null
          reconfirmation_required_at?: string | null
          rejected_at?: string | null
          reviewed_by_applicant?: boolean | null
          reviewed_by_organizer?: boolean | null
          show_on_profile?: boolean
          slot_type?: string | null
          status?: string | null
          submitted_by_user_id?: string | null
          system_status_reason?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_production_roster_id_fkey"
            columns: ["production_roster_id"]
            isOneToOne: false
            referencedRelation: "production_team_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_production_team_id_fkey"
            columns: ["production_team_id"]
            isOneToOne: false
            referencedRelation: "production_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gig_applications_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_availability_slots: {
        Row: {
          created_at: string
          day_of_week: number | null
          end_time: string
          gig_id: string
          id: string
          is_available: boolean
          slot_date: string | null
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          end_time: string
          gig_id: string
          id?: string
          is_available?: boolean
          slot_date?: string | null
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string
          gig_id?: string
          id?: string
          is_available?: boolean
          slot_date?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "gig_availability_slots_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_availability_slots_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_availability_slots_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_availability_slots_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_availability_slots_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_availability_slots_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_deletion_audit: {
        Row: {
          applicant_counts: Json
          deleted_at: string
          deleted_by: string | null
          gig_id: string
          gig_snapshot: Json
          id: string
          organizer_id: string | null
          reason: string | null
          related_counts: Json
          storage_cleanup: Json | null
        }
        Insert: {
          applicant_counts: Json
          deleted_at?: string
          deleted_by?: string | null
          gig_id: string
          gig_snapshot: Json
          id?: string
          organizer_id?: string | null
          reason?: string | null
          related_counts: Json
          storage_cleanup?: Json | null
        }
        Update: {
          applicant_counts?: Json
          deleted_at?: string
          deleted_by?: string | null
          gig_id?: string
          gig_snapshot?: Json
          id?: string
          organizer_id?: string | null
          reason?: string | null
          related_counts?: Json
          storage_cleanup?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "gig_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gig_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_deletion_audit_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gig_deletion_audit_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_deletion_audit_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_deletion_audit_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_media: {
        Row: {
          created_at: string
          gig_id: string
          id: string
          media_type: string
          media_url: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          gig_id: string
          id?: string
          media_type: string
          media_url: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          gig_id?: string
          id?: string
          media_type?: string
          media_url?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "gig_media_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_media_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_media_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_media_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_media_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_media_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_requirements: {
        Row: {
          created_at: string
          gig_id: string
          id: string
          requirement_key: string
          requirement_value: Json
        }
        Insert: {
          created_at?: string
          gig_id: string
          id?: string
          requirement_key: string
          requirement_value: Json
        }
        Update: {
          created_at?: string
          gig_id?: string
          id?: string
          requirement_key?: string
          requirement_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "gig_requirements_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_requirements_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_requirements_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_requirements_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_requirements_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_requirements_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_slot_fill_applicants: {
        Row: {
          applicant_id: string
          created_at: string
          gig_id: string
          slot_type: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          gig_id: string
          slot_type: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          gig_id?: string
          slot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gig_slot_fill_applicants_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_slot_fill_applicants_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_slot_fill_applicants_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_slot_fill_applicants_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_slot_fill_applicants_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_slot_fill_applicants_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_slot_fill_summary: {
        Row: {
          accepted_count: number
          gig_id: string
          slot_type: string
          updated_at: string
        }
        Insert: {
          accepted_count?: number
          gig_id: string
          slot_type: string
          updated_at?: string
        }
        Update: {
          accepted_count?: number
          gig_id?: string
          slot_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gig_slot_fill_summary_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_slot_fill_summary_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_slot_fill_summary_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_slot_fill_summary_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_slot_fill_summary_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_slot_fill_summary_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      gigs: {
        Row: {
          address_verification_completed_at: string | null
          address_verification_session_id: string | null
          address_verification_status: string | null
          address_verified_at: string | null
          budget: number | null
          business_permit_url: string | null
          contract_url: string | null
          created_at: string
          description: string | null
          embedding: string | null
          event_date: string | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          organizer_id: string
          permit_admin_notes: string | null
          permit_rejection_reason: string | null
          permit_resubmissions_used: number
          permit_reviewed_at: string | null
          permit_reviewed_by: string | null
          permit_status: string
          rate: number | null
          reapplication_cooldown_days: number | null
          status: string | null
          total_slots_filled: number | null
          verified_address: string | null
        }
        Insert: {
          address_verification_completed_at?: string | null
          address_verification_session_id?: string | null
          address_verification_status?: string | null
          address_verified_at?: string | null
          budget?: number | null
          business_permit_url?: string | null
          contract_url?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          event_date?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          organizer_id: string
          permit_admin_notes?: string | null
          permit_rejection_reason?: string | null
          permit_resubmissions_used?: number
          permit_reviewed_at?: string | null
          permit_reviewed_by?: string | null
          permit_status?: string
          rate?: number | null
          reapplication_cooldown_days?: number | null
          status?: string | null
          total_slots_filled?: number | null
          verified_address?: string | null
        }
        Update: {
          address_verification_completed_at?: string | null
          address_verification_session_id?: string | null
          address_verification_status?: string | null
          address_verified_at?: string | null
          budget?: number | null
          business_permit_url?: string | null
          contract_url?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          event_date?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          organizer_id?: string
          permit_admin_notes?: string | null
          permit_rejection_reason?: string | null
          permit_resubmissions_used?: number
          permit_reviewed_at?: string | null
          permit_reviewed_by?: string | null
          permit_status?: string
          rate?: number | null
          reapplication_cooldown_days?: number | null
          status?: string | null
          total_slots_filled?: number | null
          verified_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_availability_slots: {
        Row: {
          created_at: string
          day_of_week: number | null
          end_time: string
          group_id: string
          id: string
          is_available: boolean
          slot_date: string | null
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          end_time: string
          group_id: string
          id?: string
          is_available?: boolean
          slot_date?: string | null
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string
          group_id?: string
          id?: string
          is_available?: boolean
          slot_date?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_availability_slots_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_availability_slots_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_availability_slots_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_availability_slots_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_deletion_audit: {
        Row: {
          application_counts: Json
          deleted_at: string
          deleted_by: string | null
          group_id: string
          group_snapshot: Json
          id: string
          owner_id: string | null
          reason: string | null
          related_counts: Json
        }
        Insert: {
          application_counts: Json
          deleted_at?: string
          deleted_by?: string | null
          group_id: string
          group_snapshot: Json
          id?: string
          owner_id?: string | null
          reason?: string | null
          related_counts: Json
        }
        Update: {
          application_counts?: Json
          deleted_at?: string
          deleted_by?: string | null
          group_id?: string
          group_snapshot?: Json
          id?: string
          owner_id?: string | null
          reason?: string | null
          related_counts?: Json
        }
        Relationships: [
          {
            foreignKeyName: "group_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_media: {
        Row: {
          created_at: string
          group_id: string
          id: string
          media_type: string
          media_url: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          media_type?: string
          media_url: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          media_type?: string
          media_url?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_media_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_media_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_media_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_media_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string | null
          user_id?: string
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
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_playlists: {
        Row: {
          created_at: string
          group_id: string
          id: string
          playlist_id: string
          position: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          playlist_id: string
          position?: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          playlist_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_playlists_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_playlists_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_playlists_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_playlists_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_playlists_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      group_roster_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          group_id: string
          id: string
          instrument: string | null
          member_name: string
          member_role: string | null
          metadata: Json
          raw_member: Json | null
          sort_order: number
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          group_id: string
          id?: string
          instrument?: string | null
          member_name: string
          member_role?: string | null
          metadata?: Json
          raw_member?: Json | null
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          group_id?: string
          id?: string
          instrument?: string | null
          member_name?: string
          member_role?: string | null
          metadata?: Json
          raw_member?: Json | null
          sort_order?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_roster_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_roster_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_roster_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_roster_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_roster_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "group_roster_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_roster_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_roster_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          description: string | null
          embedding: string | null
          genre: string | null
          group_type: string | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          open_group_applications: boolean
          owner_id: string
          rate: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          genre?: string | null
          group_type?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          open_group_applications?: boolean
          owner_id: string
          rate?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          genre?: string | null
          group_type?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          open_group_applications?: boolean
          owner_id?: string
          rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_document_claims: {
        Row: {
          birth_date: string | null
          claim_metadata: Json
          created_at: string
          deleted_profile_at: string | null
          didit_session_id: string | null
          document_country: string
          document_fingerprint: string | null
          document_type: string | null
          document_type_key: string | null
          id: string
          last_seen_at: string
          manual_review_id: string | null
          normalized_email: string | null
          normalized_full_legal_name: string | null
          original_user_id: string | null
          role: string
          source: string
          status: string
          updated_at: string
          user_id: string | null
          verified_full_legal_name: string | null
        }
        Insert: {
          birth_date?: string | null
          claim_metadata?: Json
          created_at?: string
          deleted_profile_at?: string | null
          didit_session_id?: string | null
          document_country?: string
          document_fingerprint?: string | null
          document_type?: string | null
          document_type_key?: string | null
          id?: string
          last_seen_at?: string
          manual_review_id?: string | null
          normalized_email?: string | null
          normalized_full_legal_name?: string | null
          original_user_id?: string | null
          role: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_full_legal_name?: string | null
        }
        Update: {
          birth_date?: string | null
          claim_metadata?: Json
          created_at?: string
          deleted_profile_at?: string | null
          didit_session_id?: string | null
          document_country?: string
          document_fingerprint?: string | null
          document_type?: string | null
          document_type_key?: string | null
          id?: string
          last_seen_at?: string
          manual_review_id?: string | null
          normalized_email?: string | null
          normalized_full_legal_name?: string | null
          original_user_id?: string | null
          role?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_full_legal_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identity_document_claims_manual_review_id_fkey"
            columns: ["manual_review_id"]
            isOneToOne: false
            referencedRelation: "manual_identity_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_document_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "identity_document_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_document_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_document_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_transfer_requests: {
        Row: {
          created_at: string
          from_user_id: string
          group_id: string
          id: string
          message: string | null
          responded_at: string | null
          status: string | null
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          group_id: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: string | null
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          group_id?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: string | null
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadership_transfer_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leadership_transfer_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_identity_reviews: {
        Row: {
          back_image_path: string | null
          birth_date: string | null
          created_at: string
          decision_email_sent_at: string | null
          didit_session_id: string | null
          document_country: string
          document_fingerprint: string | null
          document_type: string
          document_type_key: string | null
          duplicate_match_count: number
          duplicate_reason: string | null
          expected_decision_by: string
          front_image_path: string | null
          id: string
          matched_on: string | null
          metadata: Json
          normalized_full_legal_name: string | null
          review_notes: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_image_path: string | null
          source: string
          status: string
          submitted_by_email: string
          submitted_role: string | null
          updated_at: string
          user_id: string
          verified_full_legal_name: string | null
        }
        Insert: {
          back_image_path?: string | null
          birth_date?: string | null
          created_at?: string
          decision_email_sent_at?: string | null
          didit_session_id?: string | null
          document_country?: string
          document_fingerprint?: string | null
          document_type: string
          document_type_key?: string | null
          duplicate_match_count?: number
          duplicate_reason?: string | null
          expected_decision_by?: string
          front_image_path?: string | null
          id?: string
          matched_on?: string | null
          metadata?: Json
          normalized_full_legal_name?: string | null
          review_notes?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_image_path?: string | null
          source?: string
          status?: string
          submitted_by_email: string
          submitted_role?: string | null
          updated_at?: string
          user_id: string
          verified_full_legal_name?: string | null
        }
        Update: {
          back_image_path?: string | null
          birth_date?: string | null
          created_at?: string
          decision_email_sent_at?: string | null
          didit_session_id?: string | null
          document_country?: string
          document_fingerprint?: string | null
          document_type?: string
          document_type_key?: string | null
          duplicate_match_count?: number
          duplicate_reason?: string | null
          expected_decision_by?: string
          front_image_path?: string | null
          id?: string
          matched_on?: string | null
          metadata?: Json
          normalized_full_legal_name?: string | null
          review_notes?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_image_path?: string | null
          source?: string
          status?: string
          submitted_by_email?: string
          submitted_role?: string | null
          updated_at?: string
          user_id?: string
          verified_full_legal_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_identity_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "manual_identity_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_identity_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_identity_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_identity_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "manual_identity_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_identity_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_identity_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          message_type: string | null
          read_at: string | null
          sender_id: string
        }
        Insert: {
          attachment_url?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          message_type?: string | null
          read_at?: string | null
          sender_id: string
        }
        Update: {
          attachment_url?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_type?: string | null
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations_display_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      normalization_exceptions: {
        Row: {
          approved_at: string
          approved_by_user_id: string | null
          column_name: string
          rationale: string
          table_name: string
        }
        Insert: {
          approved_at?: string
          approved_by_user_id?: string | null
          column_name: string
          rationale: string
          table_name: string
        }
        Update: {
          approved_at?: string
          approved_by_user_id?: string | null
          column_name?: string
          rationale?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "normalization_exceptions_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "normalization_exceptions_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalization_exceptions_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normalization_exceptions_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          awaiting_confirmation: boolean
          booking_confirmed: boolean
          created_at: string
          event_reminder: boolean
          leave_review: boolean
          push_enabled: boolean
          updated_at: string
          upload_required: boolean
          user_id: string
        }
        Insert: {
          awaiting_confirmation?: boolean
          booking_confirmed?: boolean
          created_at?: string
          event_reminder?: boolean
          leave_review?: boolean
          push_enabled?: boolean
          updated_at?: string
          upload_required?: boolean
          user_id: string
        }
        Update: {
          awaiting_confirmation?: boolean
          booking_confirmed?: boolean
          created_at?: string
          event_reminder?: boolean
          leave_review?: boolean
          push_enabled?: boolean
          updated_at?: string
          upload_required?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          image: string | null
          message: string
          meta: Json | null
          read: boolean | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image?: string | null
          message: string
          meta?: Json | null
          read?: boolean | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image?: string | null
          message?: string
          meta?: Json | null
          read?: boolean | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      order_fulfillments: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          fulfillment_type: string
          id: string
          notes: string | null
          order_id: string
          shipped_at: string | null
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          fulfillment_type?: string
          id?: string
          notes?: string | null
          order_id: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          fulfillment_type?: string
          id?: string
          notes?: string | null
          order_id?: string
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string
          product_title: string
          quantity: number
          unit_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_id: string
          product_title: string
          quantity?: number
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string
          product_title?: string
          quantity?: number
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_number: string
          payment_reference: string | null
          seller_id: string
          shipped_at: string | null
          shipping_address: Json | null
          shipping_fee: number | null
          shipping_profile_id: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          wallet_transaction_id: string | null
        }
        Insert: {
          buyer_id: string
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_reference?: string | null
          seller_id: string
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_fee?: number | null
          shipping_profile_id?: string | null
          status?: string
          subtotal: number
          total_amount: number
          updated_at?: string
          wallet_transaction_id?: string | null
        }
        Update: {
          buyer_id?: string
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_reference?: string | null
          seller_id?: string
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_fee?: number | null
          shipping_profile_id?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_profile_id_fkey"
            columns: ["shipping_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_methods: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string | null
          created_at: string
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_audit_log: {
        Row: {
          action: string
          admin_notes: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          new_status: string | null
          notes: string | null
          performed_by: string
          previous_status: string | null
          reason: string | null
          rejection_reason: string | null
        }
        Insert: {
          action: string
          admin_notes?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          performed_by: string
          previous_status?: string | null
          reason?: string | null
          rejection_reason?: string | null
        }
        Update: {
          action?: string
          admin_notes?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          performed_by?: string
          previous_status?: string | null
          reason?: string | null
          rejection_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "permit_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_items: {
        Row: {
          artist_name: string | null
          audio_url: string | null
          created_at: string
          duration_seconds: number | null
          external_link_id: string | null
          id: string
          playlist_id: string
          position: number
          teaser_asset_id: string | null
          title: string
        }
        Insert: {
          artist_name?: string | null
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_link_id?: string | null
          id?: string
          playlist_id: string
          position?: number
          teaser_asset_id?: string | null
          title: string
        }
        Update: {
          artist_name?: string | null
          audio_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          external_link_id?: string | null
          id?: string
          playlist_id?: string
          position?: number
          teaser_asset_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_playlist_items_external_link"
            columns: ["external_link_id"]
            isOneToOne: false
            referencedRelation: "external_platform_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_playlist_items_teaser_asset"
            columns: ["teaser_asset_id"]
            isOneToOne: false
            referencedRelation: "playlist_teaser_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_play_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          item_id: string | null
          platform: string | null
          playlist_id: string | null
          station_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          item_id?: string | null
          platform?: string | null
          playlist_id?: string | null
          station_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          item_id?: string | null
          platform?: string | null
          playlist_id?: string | null
          station_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playlist_play_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "playlist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_play_events_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_play_events_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_play_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "playlist_play_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_play_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_play_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_teaser_assets: {
        Row: {
          asset_type: string
          created_at: string
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          playlist_id: string
          screen_result: string | null
          storage_path: string
          uploader_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          playlist_id: string
          screen_result?: string | null
          storage_path: string
          uploader_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          playlist_id?: string
          screen_result?: string | null
          storage_path?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_teaser_assets_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_teaser_assets_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "playlist_teaser_assets_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_teaser_assets_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_teaser_assets_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          cover_image_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          genre: string | null
          id: string
          is_featured: boolean | null
          is_hidden: boolean | null
          title: string
          total_duration_seconds: number | null
          track_count: number | null
          updated_at: string
          visibility: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          genre?: string | null
          id?: string
          is_featured?: boolean | null
          is_hidden?: boolean | null
          title: string
          total_duration_seconds?: number | null
          track_count?: number | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          genre?: string | null
          id?: string
          is_featured?: boolean | null
          is_hidden?: boolean | null
          title?: string
          total_duration_seconds?: number | null
          track_count?: number | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "playlists_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_hidden: boolean | null
          moderated_at: string | null
          moderation_categories: Json
          moderation_metadata: Json
          moderation_provider: string | null
          moderation_reason: string | null
          moderation_score: number | null
          moderation_status: string
          parent_comment_id: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          moderated_at?: string | null
          moderation_categories?: Json
          moderation_metadata?: Json
          moderation_provider?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          moderated_at?: string | null
          moderation_categories?: Json
          moderation_metadata?: Json
          moderation_provider?: string | null
          moderation_reason?: string | null
          moderation_score?: number | null
          moderation_status?: string
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          created_at: string
          display_order: number | null
          duration_seconds: number | null
          height: number | null
          id: string
          is_cover: boolean
          media_type: string
          mime_type: string | null
          post_id: string
          safety_checked_at: string | null
          safety_context: string | null
          safety_metadata: Json
          safety_status: string
          storage_path: string
          thumbnail_path: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_cover?: boolean
          media_type: string
          mime_type?: string | null
          post_id: string
          safety_checked_at?: string | null
          safety_context?: string | null
          safety_metadata?: Json
          safety_status?: string
          storage_path: string
          thumbnail_path?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_cover?: boolean
          media_type?: string
          mime_type?: string | null
          post_id?: string
          safety_checked_at?: string | null
          safety_context?: string | null
          safety_metadata?: Json
          safety_status?: string
          storage_path?: string
          thumbnail_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_primary: boolean | null
          media_type: string
          mime_type: string | null
          product_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          media_type?: string
          mime_type?: string | null
          product_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          media_type?: string
          mime_type?: string | null
          product_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          is_available: boolean | null
          price_override: number | null
          product_id: string
          sku: string | null
          stock_quantity: number | null
          variant_label: string
          variant_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean | null
          price_override?: number | null
          product_id: string
          sku?: string | null
          stock_quantity?: number | null
          variant_label: string
          variant_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean | null
          price_override?: number | null
          product_id?: string
          sku?: string | null
          stock_quantity?: number | null
          variant_label?: string
          variant_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      production_team_members: {
        Row: {
          id: string
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "production_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "production_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      production_team_roster: {
        Row: {
          added_by_user_id: string | null
          created_at: string
          entity_kind: string
          group_id: string | null
          id: string
          profile_id: string | null
          team_id: string
        }
        Insert: {
          added_by_user_id?: string | null
          created_at?: string
          entity_kind: string
          group_id?: string | null
          id?: string
          profile_id?: string | null
          team_id: string
        }
        Update: {
          added_by_user_id?: string | null
          created_at?: string
          entity_kind?: string
          group_id?: string | null
          id?: string
          profile_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_team_roster_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "production_team_roster_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "production_team_roster_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "production_team_roster_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_team_roster_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "production_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      production_teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          open_production_applications: boolean
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          open_production_applications?: boolean
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          open_production_applications?: boolean
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "production_teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_teams_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          average_rating: number | null
          base_price: number
          category: string | null
          created_at: string
          currency: string
          description: string | null
          group_id: string | null
          id: string
          is_featured: boolean | null
          is_limited_edition: boolean | null
          limited_quantity: number | null
          product_type: string
          review_count: number | null
          seller_id: string
          status: string
          title: string
          total_sold: number | null
          updated_at: string
        }
        Insert: {
          average_rating?: number | null
          base_price: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_featured?: boolean | null
          is_limited_edition?: boolean | null
          limited_quantity?: number | null
          product_type?: string
          review_count?: number | null
          seller_id: string
          status?: string
          title: string
          total_sold?: number | null
          updated_at?: string
        }
        Update: {
          average_rating?: number | null
          base_price?: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          group_id?: string | null
          id?: string
          is_featured?: boolean | null
          is_limited_edition?: boolean | null
          limited_quantity?: number | null
          product_type?: string
          review_count?: number | null
          seller_id?: string
          status?: string
          title?: string
          total_sold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_genres: {
        Row: {
          created_at: string
          genre: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          genre: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          genre?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_genres_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_genres_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_genres_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_genres_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_portfolio_urls: {
        Row: {
          created_at: string
          id: string
          portfolio_url: string
          profile_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          portfolio_url: string
          profile_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          portfolio_url?: string
          profile_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_portfolio_urls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_portfolio_urls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_portfolio_urls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_portfolio_urls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_skills: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          skill: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          skill: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bio: string | null
          contact_number: string | null
          created_at: string
          didit_session_id: string | null
          email: string
          full_name: string | null
          id: string
          id_document_expiry: string | null
          id_verified_at: string | null
          interest_vector: string | null
          is_verified: boolean | null
          location: string | null
          role: string
          show_gig_statuses: boolean
          smile_user_id: string | null
          subscription_expires_at: string | null
          subscription_plan_id: string | null
          subscription_status: string | null
          verification_status: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          contact_number?: string | null
          created_at?: string
          didit_session_id?: string | null
          email: string
          full_name?: string | null
          id: string
          id_document_expiry?: string | null
          id_verified_at?: string | null
          interest_vector?: string | null
          is_verified?: boolean | null
          location?: string | null
          role: string
          show_gig_statuses?: boolean
          smile_user_id?: string | null
          subscription_expires_at?: string | null
          subscription_plan_id?: string | null
          subscription_status?: string | null
          verification_status?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bio?: string | null
          contact_number?: string | null
          created_at?: string
          didit_session_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          id_document_expiry?: string | null
          id_verified_at?: string | null
          interest_vector?: string | null
          is_verified?: boolean | null
          location?: string | null
          role?: string
          show_gig_statuses?: boolean
          smile_user_id?: string | null
          subscription_expires_at?: string | null
          subscription_plan_id?: string | null
          subscription_status?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string | null
          disabled_at: string | null
          disabled_reason: string | null
          id: string
          installation_id: string
          is_active: boolean
          last_seen_at: string
          platform: string | null
          project_id: string | null
          push_token: string
          token_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          id?: string
          installation_id: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string | null
          project_id?: string | null
          push_token: string
          token_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          id?: string
          installation_id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string | null
          project_id?: string | null
          push_token?: string
          token_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_notification_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_attempts: {
        Row: {
          action: string
          blocked: boolean
          created_at: string
          device_hash: string | null
          didit_session_id: string | null
          email_hash: string | null
          id: string
          ip_hash: string | null
          metadata: Json
          reason: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          action: string
          blocked?: boolean
          created_at?: string
          device_hash?: string | null
          didit_session_id?: string | null
          email_hash?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json
          reason?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          action?: string
          blocked?: boolean
          created_at?: string
          device_hash?: string | null
          didit_session_id?: string | null
          email_hash?: string | null
          id?: string
          ip_hash?: string | null
          metadata?: Json
          reason?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          escalated_at: string | null
          escalation_reason: string | null
          escalation_status: string
          id: string
          moderation_action: string
          moderation_notes: string | null
          reason: string
          reporter_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          escalation_status?: string
          id?: string
          moderation_action?: string
          moderation_notes?: string | null
          reason: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          escalation_status?: string
          id?: string
          moderation_action?: string
          moderation_notes?: string | null
          reason?: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      review_likes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "review_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          gig_application_id: string | null
          gig_id: string | null
          group_id: string | null
          id: string
          rating: number
          studio_booking_id: string | null
          studio_id: string | null
          user_id: string | null
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          gig_application_id?: string | null
          gig_id?: string | null
          group_id?: string | null
          id?: string
          rating: number
          studio_booking_id?: string | null
          studio_id?: string | null
          user_id?: string | null
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          gig_application_id?: string | null
          gig_id?: string | null
          group_id?: string | null
          id?: string
          rating?: number
          studio_booking_id?: string | null
          studio_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_application_id_fkey"
            columns: ["gig_application_id"]
            isOneToOne: false
            referencedRelation: "gig_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_application_id_fkey"
            columns: ["gig_application_id"]
            isOneToOne: false
            referencedRelation: "musician_performed_gigs"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_booking_id_fkey"
            columns: ["studio_booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_booking_id_fkey"
            columns: ["studio_booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_booking_id_fkey"
            columns: ["studio_booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_profiles: {
        Row: {
          base_fee: number | null
          created_at: string
          currency: string
          estimated_days_max: number | null
          estimated_days_min: number | null
          id: string
          is_default: boolean | null
          name: string
          regions: string[] | null
          seller_id: string
          shipping_type: string
        }
        Insert: {
          base_fee?: number | null
          created_at?: string
          currency?: string
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          is_default?: boolean | null
          name: string
          regions?: string[] | null
          seller_id: string
          shipping_type?: string
        }
        Update: {
          base_fee?: number | null
          created_at?: string
          currency?: string
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          is_default?: boolean | null
          name?: string
          regions?: string[] | null
          seller_id?: string
          shipping_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_profiles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "shipping_profiles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_profiles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_profiles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      social_activity_events: {
        Row: {
          actor_id: string
          comment_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          post_id: string | null
          target_user_id: string | null
        }
        Insert: {
          actor_id: string
          comment_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          post_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          actor_id?: string
          comment_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          post_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_activity_events_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_activity_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_activity_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "social_activity_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_activity_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_activity_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      station_playlist_slots: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          playlist_id: string
          position: number
          starts_at: string | null
          station_id: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          playlist_id: string
          position?: number
          starts_at?: string | null
          station_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          playlist_id?: string
          position?: number
          starts_at?: string | null
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_playlist_slots_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_playlist_slots_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          cover_image_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          genre: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          last_seen_live_at: string | null
          listener_count: number | null
          managed_group_id: string | null
          managed_profile_id: string | null
          name: string
          now_playing_artist: string | null
          now_playing_title: string | null
          rotation_interval_minutes: number
          stream_status: string
          stream_url: string | null
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          last_seen_live_at?: string | null
          listener_count?: number | null
          managed_group_id?: string | null
          managed_profile_id?: string | null
          name: string
          now_playing_artist?: string | null
          now_playing_title?: string | null
          rotation_interval_minutes?: number
          stream_status?: string
          stream_url?: string | null
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          last_seen_live_at?: string | null
          listener_count?: number | null
          managed_group_id?: string | null
          managed_profile_id?: string | null
          name?: string
          now_playing_artist?: string | null
          now_playing_title?: string | null
          rotation_interval_minutes?: number
          stream_status?: string
          stream_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_managed_group_id_fkey"
            columns: ["managed_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_managed_group_id_fkey"
            columns: ["managed_group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "stations_managed_group_id_fkey"
            columns: ["managed_group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_managed_group_id_fkey"
            columns: ["managed_group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_managed_profile_id_fkey"
            columns: ["managed_profile_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stations_managed_profile_id_fkey"
            columns: ["managed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_managed_profile_id_fkey"
            columns: ["managed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_managed_profile_id_fkey"
            columns: ["managed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_amenities: {
        Row: {
          amenity: string
          created_at: string
          id: string
          studio_id: string
        }
        Insert: {
          amenity: string
          created_at?: string
          id?: string
          studio_id: string
        }
        Update: {
          amenity?: string
          created_at?: string
          id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_amenities_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_amenities_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_amenities_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_amenities_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_amenities_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_availability_slots: {
        Row: {
          created_at: string
          day_of_week: number | null
          end_time: string
          id: string
          is_open: boolean
          slot_date: string | null
          start_time: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          end_time: string
          id?: string
          is_open?: boolean
          slot_date?: string | null
          start_time: string
          studio_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string
          id?: string
          is_open?: boolean
          slot_date?: string | null
          start_time?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_availability_slots_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_availability_slots_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_availability_slots_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_availability_slots_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_availability_slots_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_booking_slots: {
        Row: {
          booking_id: string
          created_at: string
          end_time: string
          id: string
          sort_order: number
          start_time: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          end_time: string
          id?: string
          sort_order?: number
          start_time: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          end_time?: string
          id?: string
          sort_order?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_bookings: {
        Row: {
          base_rate: number
          booking_date: string
          buffer_minutes: number | null
          cancellation_policy_id: string | null
          cancellation_policy_snapshot: Json | null
          cancellation_reason: string | null
          check_in_time: string | null
          checkout_session_id: string | null
          created_at: string
          end_time: string
          final_price: number
          hours: number
          id: string
          modifiers_applied: Json | null
          notes: string | null
          paid_at: string | null
          payment_amount: number | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_status: string | null
          payment_type: string | null
          payout_hold: boolean
          payout_hold_at: string | null
          payout_hold_reason: string | null
          payout_released_at: string | null
          proof_url: string | null
          refund_amount: number | null
          refund_id: string | null
          refunded_at: string | null
          relocation_expires_at: string | null
          relocation_proposed_date: string | null
          relocation_proposed_end_time: string | null
          relocation_proposed_start_time: string | null
          relocation_requested_at: string | null
          remaining_balance: number | null
          reviewed_by_customer: boolean | null
          reviewed_by_owner: boolean | null
          session_type: string | null
          start_time: string
          status: string | null
          studio_id: string
          subtotal: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_rate: number
          booking_date: string
          buffer_minutes?: number | null
          cancellation_policy_id?: string | null
          cancellation_policy_snapshot?: Json | null
          cancellation_reason?: string | null
          check_in_time?: string | null
          checkout_session_id?: string | null
          created_at?: string
          end_time: string
          final_price: number
          hours: number
          id?: string
          modifiers_applied?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_type?: string | null
          payout_hold?: boolean
          payout_hold_at?: string | null
          payout_hold_reason?: string | null
          payout_released_at?: string | null
          proof_url?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refunded_at?: string | null
          relocation_expires_at?: string | null
          relocation_proposed_date?: string | null
          relocation_proposed_end_time?: string | null
          relocation_proposed_start_time?: string | null
          relocation_requested_at?: string | null
          remaining_balance?: number | null
          reviewed_by_customer?: boolean | null
          reviewed_by_owner?: boolean | null
          session_type?: string | null
          start_time: string
          status?: string | null
          studio_id: string
          subtotal: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_rate?: number
          booking_date?: string
          buffer_minutes?: number | null
          cancellation_policy_id?: string | null
          cancellation_policy_snapshot?: Json | null
          cancellation_reason?: string | null
          check_in_time?: string | null
          checkout_session_id?: string | null
          created_at?: string
          end_time?: string
          final_price?: number
          hours?: number
          id?: string
          modifiers_applied?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          payment_type?: string | null
          payout_hold?: boolean
          payout_hold_at?: string | null
          payout_hold_reason?: string | null
          payout_released_at?: string | null
          proof_url?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refunded_at?: string | null
          relocation_expires_at?: string | null
          relocation_proposed_date?: string | null
          relocation_proposed_end_time?: string | null
          relocation_proposed_start_time?: string | null
          relocation_requested_at?: string | null
          remaining_balance?: number | null
          reviewed_by_customer?: boolean | null
          reviewed_by_owner?: boolean | null
          session_type?: string | null
          start_time?: string
          status?: string | null
          studio_id?: string
          subtotal?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_bookings_cancellation_policy_id_fkey"
            columns: ["cancellation_policy_id"]
            isOneToOne: false
            referencedRelation: "booking_cancellation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_date_overrides: {
        Row: {
          close_time: string | null
          id: string
          is_open: boolean
          open_time: string | null
          override_date: string
          reason: string | null
          slot_order: number
          studio_id: string
        }
        Insert: {
          close_time?: string | null
          id?: string
          is_open?: boolean
          open_time?: string | null
          override_date: string
          reason?: string | null
          slot_order?: number
          studio_id: string
        }
        Update: {
          close_time?: string | null
          id?: string
          is_open?: boolean
          open_time?: string | null
          override_date?: string
          reason?: string | null
          slot_order?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_date_overrides_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_date_overrides_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_date_overrides_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_date_overrides_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_date_overrides_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_deletion_audit: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          id: string
          owner_id: string | null
          reason: string | null
          related_counts: Json
          storage_cleanup: Json | null
          studio_id: string
          studio_snapshot: Json
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          owner_id?: string | null
          reason?: string | null
          related_counts: Json
          storage_cleanup?: Json | null
          studio_id: string
          studio_snapshot: Json
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          owner_id?: string | null
          reason?: string | null
          related_counts?: Json
          storage_cleanup?: Json | null
          studio_id?: string
          studio_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "studio_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studio_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_deletion_audit_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studio_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_deletion_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_instruments: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          instrument_name: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          instrument_name: string
          studio_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          instrument_name?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_instruments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_instruments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_instruments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_instruments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_instruments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_media: {
        Row: {
          created_at: string
          id: string
          media_type: string
          media_url: string
          sort_order: number
          studio_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: string
          media_url: string
          sort_order?: number
          studio_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          sort_order?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_media_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_media_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_media_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_media_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_media_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_open_dates: {
        Row: {
          created_at: string
          id: string
          is_open: boolean
          open_date: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_open?: boolean
          open_date: string
          studio_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_open?: boolean
          open_date?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_open_dates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_open_dates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_open_dates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_open_dates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_open_dates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_operating_hours: {
        Row: {
          close_time: string | null
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string | null
          reason: string | null
          slot_order: number | null
          studio_id: string
          weekly_schedule_dates: Json | null
          weekly_schedule_end_date: string | null
          weekly_schedule_scope: string | null
        }
        Insert: {
          close_time?: string | null
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string | null
          reason?: string | null
          slot_order?: number | null
          studio_id: string
          weekly_schedule_dates?: Json | null
          weekly_schedule_end_date?: string | null
          weekly_schedule_scope?: string | null
        }
        Update: {
          close_time?: string | null
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string | null
          reason?: string | null
          slot_order?: number | null
          studio_id?: string
          weekly_schedule_dates?: Json | null
          weekly_schedule_end_date?: string | null
          weekly_schedule_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_operating_hours_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_operating_hours_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_operating_hours_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_operating_hours_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_operating_hours_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_owner_penalties: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          owner_id: string
          penalty_points: number
          penalty_type: string
          reason: string
          studio_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          owner_id: string
          penalty_points?: number
          penalty_type: string
          reason: string
          studio_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          penalty_points?: number
          penalty_type?: string
          reason?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_owner_penalties_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_owner_penalties_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_promotions: {
        Row: {
          applies_to: string
          created_at: string
          criteria: string | null
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          id: string
          is_active: boolean
          is_permanent: boolean
          minimum_booking_hours: number | null
          minimum_spend: number | null
          name: string
          start_date: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          applies_to?: string
          created_at?: string
          criteria?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_permanent?: boolean
          minimum_booking_hours?: number | null
          minimum_spend?: number | null
          name: string
          start_date?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          criteria?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_permanent?: boolean
          minimum_booking_hours?: number | null
          minimum_spend?: number | null
          name?: string
          start_date?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_promotions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_promotions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_promotions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_promotions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_promotions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_settings: {
        Row: {
          booking_horizon_days: number | null
          buffer_minutes: number | null
          bulk_discount_percentage: number | null
          bulk_discount_threshold_hours: number | null
          created_at: string
          holiday_multiplier: number | null
          id: string
          late_night_multiplier: number | null
          lead_time_hours: number | null
          max_booking_duration_hours: number | null
          min_booking_duration_hours: number | null
          off_peak_dates: Json | null
          off_peak_multiplier: number | null
          peak_season_dates: Json | null
          peak_season_multiplier: number | null
          recording_hours_per_block: number
          recording_rate_negotiable: boolean
          recording_songs_per_block: number
          slot_increment_minutes: number | null
          studio_id: string
          time_zone: string
          updated_at: string
          weekend_multiplier: number | null
          weekly_schedule_dates: Json
          weekly_schedule_end_date: string | null
          weekly_schedule_scope: string
        }
        Insert: {
          booking_horizon_days?: number | null
          buffer_minutes?: number | null
          bulk_discount_percentage?: number | null
          bulk_discount_threshold_hours?: number | null
          created_at?: string
          holiday_multiplier?: number | null
          id?: string
          late_night_multiplier?: number | null
          lead_time_hours?: number | null
          max_booking_duration_hours?: number | null
          min_booking_duration_hours?: number | null
          off_peak_dates?: Json | null
          off_peak_multiplier?: number | null
          peak_season_dates?: Json | null
          peak_season_multiplier?: number | null
          recording_hours_per_block?: number
          recording_rate_negotiable?: boolean
          recording_songs_per_block?: number
          slot_increment_minutes?: number | null
          studio_id: string
          time_zone?: string
          updated_at?: string
          weekend_multiplier?: number | null
          weekly_schedule_dates?: Json
          weekly_schedule_end_date?: string | null
          weekly_schedule_scope?: string
        }
        Update: {
          booking_horizon_days?: number | null
          buffer_minutes?: number | null
          bulk_discount_percentage?: number | null
          bulk_discount_threshold_hours?: number | null
          created_at?: string
          holiday_multiplier?: number | null
          id?: string
          late_night_multiplier?: number | null
          lead_time_hours?: number | null
          max_booking_duration_hours?: number | null
          min_booking_duration_hours?: number | null
          off_peak_dates?: Json | null
          off_peak_multiplier?: number | null
          peak_season_dates?: Json | null
          peak_season_multiplier?: number | null
          recording_hours_per_block?: number
          recording_rate_negotiable?: boolean
          recording_songs_per_block?: number
          slot_increment_minutes?: number | null
          studio_id?: string
          time_zone?: string
          updated_at?: string
          weekend_multiplier?: number | null
          weekly_schedule_dates?: Json
          weekly_schedule_end_date?: string | null
          weekly_schedule_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_settings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_settings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_settings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_settings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_settings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_types: {
        Row: {
          created_at: string
          id: string
          studio_id: string
          studio_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          studio_id: string
          studio_type: string
        }
        Update: {
          created_at?: string
          id?: string
          studio_id?: string
          studio_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_types_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_types_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_types_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_types_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_types_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
        ]
      }
      studios: {
        Row: {
          address: string | null
          address_verification_completed_at: string | null
          address_verification_session_id: string | null
          address_verification_status: string | null
          address_verified_at: string | null
          business_permit_url: string | null
          contract_url: string | null
          created_at: string
          description: string | null
          embedding: string | null
          hourly_rate: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          owner_id: string
          pax: number | null
          permit_admin_notes: string | null
          permit_rejection_reason: string | null
          permit_resubmissions_used: number
          permit_reviewed_at: string | null
          permit_reviewed_by: string | null
          permit_status: string
          rate: number | null
          recording_rate: number | null
          rehearsal_rate: number | null
          studio_type: string | null
          verified_address: string | null
        }
        Insert: {
          address?: string | null
          address_verification_completed_at?: string | null
          address_verification_session_id?: string | null
          address_verification_status?: string | null
          address_verified_at?: string | null
          business_permit_url?: string | null
          contract_url?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          hourly_rate?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          owner_id: string
          pax?: number | null
          permit_admin_notes?: string | null
          permit_rejection_reason?: string | null
          permit_resubmissions_used?: number
          permit_reviewed_at?: string | null
          permit_reviewed_by?: string | null
          permit_status?: string
          rate?: number | null
          recording_rate?: number | null
          rehearsal_rate?: number | null
          studio_type?: string | null
          verified_address?: string | null
        }
        Update: {
          address?: string | null
          address_verification_completed_at?: string | null
          address_verification_session_id?: string | null
          address_verification_status?: string | null
          address_verified_at?: string | null
          business_permit_url?: string | null
          contract_url?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          hourly_rate?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          owner_id?: string
          pax?: number | null
          permit_admin_notes?: string | null
          permit_rejection_reason?: string | null
          permit_resubmissions_used?: number
          permit_reviewed_at?: string | null
          permit_reviewed_by?: string | null
          permit_status?: string
          rate?: number | null
          recording_rate?: number | null
          rehearsal_rate?: number | null
          studio_type?: string | null
          verified_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          billing_period_end: string
          billing_period_start: string
          checkout_session_id: string | null
          created_at: string
          id: string
          paid_at: string | null
          payment_intent_id: string | null
          payment_method: string | null
          status: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          amount: number
          billing_period_end: string
          billing_period_start: string
          checkout_session_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          status?: string
          subscription_id: string
          user_id: string
        }
        Update: {
          amount?: number
          billing_period_end?: string
          billing_period_start?: string
          checkout_session_id?: string | null
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          status?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscription_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number | null
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          checkout_session_id: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          payment_method: string | null
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          checkout_session_id?: string | null
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          payment_method?: string | null
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          checkout_session_id?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          payment_method?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_sessions: {
        Row: {
          created_at: string | null
          session_ref: string
          status: string | null
          verification_data: Json | null
        }
        Insert: {
          created_at?: string | null
          session_ref: string
          status?: string | null
          verification_data?: Json | null
        }
        Update: {
          created_at?: string | null
          session_ref?: string
          status?: string | null
          verification_data?: Json | null
        }
        Relationships: []
      }
      wallet_deposits: {
        Row: {
          amount: number
          checkout_session_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          checkout_session_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          checkout_session_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          is_credit: boolean | null
          reference_id: string | null
          reference_type: string | null
          status: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          is_credit?: boolean | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_credit?: boolean | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number | null
          created_at: string
          currency: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          fee: number | null
          id: string
          net_amount: number
          notes: string | null
          payout_account_name: string | null
          payout_account_number: string | null
          payout_bank_name: string | null
          payout_method_id: string | null
          payout_type: string | null
          processed_at: string | null
          processed_by: string | null
          reference_number: string | null
          status: string
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount: number
          notes?: string | null
          payout_account_name?: string | null
          payout_account_number?: string | null
          payout_bank_name?: string | null
          payout_method_id?: string | null
          payout_type?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reference_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount?: number
          notes?: string | null
          payout_account_name?: string | null
          payout_account_number?: string | null
          payout_bank_name?: string | null
          payout_method_id?: string | null
          payout_type?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reference_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_payout_method_id_fkey"
            columns: ["payout_method_id"]
            isOneToOne: false
            referencedRelation: "payout_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_permit_metrics: {
        Row: {
          admins: number | null
          gigs_approved: number | null
          gigs_pending: number | null
          gigs_rejected: number | null
          gigs_resubmitted: number | null
          musicians: number | null
          new_gigs_24h: number | null
          new_studios_24h: number | null
          recent_audit_actions: number | null
          studio_owners: number | null
          studios_approved: number | null
          studios_pending: number | null
          studios_rejected: number | null
          studios_resubmitted: number | null
          total_users: number | null
          venue_owners: number | null
        }
        Relationships: []
      }
      booking_penalty_events_with_summary: {
        Row: {
          beneficiary_user_id: string | null
          beneficiary_user_name: string | null
          booking_date: string | null
          booking_id: string | null
          booking_total: number | null
          created_at: string | null
          end_time: string | null
          id: string | null
          notes: string | null
          penalized_user_id: string | null
          penalized_user_name: string | null
          penalty_amount: number | null
          penalty_type: string | null
          policy_snapshot: Json | null
          refund_amount: number | null
          refund_transaction_id: string | null
          session_type: string | null
          start_time: string | null
          studio_name: string | null
          wallet_transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_beneficiary_user_id_fkey"
            columns: ["beneficiary_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "studio_bookings_with_cost"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_penalized_user_id_fkey"
            columns: ["penalized_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_penalty_events_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations_display_projection: {
        Row: {
          group_avatar_url: string | null
          group_id: string | null
          group_name: string | null
          id: string | null
          is_group: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_counts: {
        Row: {
          follower_count: number | null
          following_count: number | null
          user_id: string | null
        }
        Insert: {
          follower_count?: never
          following_count?: never
          user_id?: string | null
        }
        Update: {
          follower_count?: never
          following_count?: never
          user_id?: string | null
        }
        Relationships: []
      }
      gigs_availability_projection: {
        Row: {
          availability: Json | null
          gig_id: string | null
        }
        Insert: {
          availability?: never
          gig_id?: string | null
        }
        Update: {
          availability?: never
          gig_id?: string | null
        }
        Relationships: []
      }
      gigs_legacy_projection: {
        Row: {
          documents: string[] | null
          id: string | null
          images: string[] | null
          requirements: Json | null
        }
        Insert: {
          documents?: never
          id?: string | null
          images?: never
          requirements?: never
        }
        Update: {
          documents?: never
          id?: string | null
          images?: never
          requirements?: never
        }
        Relationships: []
      }
      gigs_slots_filled_projection: {
        Row: {
          gig_id: string | null
          slots_filled: Json | null
        }
        Insert: {
          gig_id?: string | null
          slots_filled?: never
        }
        Update: {
          gig_id?: string | null
          slots_filled?: never
        }
        Relationships: []
      }
      gigs_with_stats: {
        Row: {
          address_verification_completed_at: string | null
          address_verification_session_id: string | null
          address_verification_status: string | null
          address_verified_at: string | null
          availability: Json | null
          budget: number | null
          business_permit_url: string | null
          contract_url: string | null
          created_at: string | null
          description: string | null
          documents: string[] | null
          embedding: string | null
          event_date: string | null
          id: string | null
          images: string[] | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string | null
          organizer_id: string | null
          permit_admin_notes: string | null
          permit_rejection_reason: string | null
          permit_resubmissions_used: number | null
          permit_reviewed_at: string | null
          permit_reviewed_by: string | null
          permit_status: string | null
          rate: number | null
          rating: number | null
          requirements: Json | null
          review_count: number | null
          status: string | null
          verified_address: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      gigs_with_verification: {
        Row: {
          address_verification_completed_at: string | null
          address_verification_session_id: string | null
          address_verification_status: string | null
          address_verified_at: string | null
          budget: number | null
          business_permit_url: string | null
          contract_url: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          event_date: string | null
          extracted_address: string | null
          extracted_name: string | null
          id: string | null
          is_address_verified: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string | null
          organizer_id: string | null
          permit_admin_notes: string | null
          permit_rejection_reason: string | null
          permit_resubmissions_used: number | null
          permit_reviewed_at: string | null
          permit_reviewed_by: string | null
          permit_status: string | null
          rate: number | null
          reapplication_cooldown_days: number | null
          status: string | null
          total_slots_filled: number | null
          verification_issuer: string | null
          verification_notes: string | null
          verified_address: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gigs_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      groups_availability_projection: {
        Row: {
          availability: Json | null
          group_id: string | null
        }
        Insert: {
          availability?: never
          group_id?: string | null
        }
        Update: {
          availability?: never
          group_id?: string | null
        }
        Relationships: []
      }
      groups_legacy_projection: {
        Row: {
          id: string | null
          images: string[] | null
          members: Json | null
        }
        Insert: {
          id?: string | null
          images?: never
          members?: never
        }
        Update: {
          id?: string | null
          images?: never
          members?: never
        }
        Relationships: []
      }
      groups_with_stats: {
        Row: {
          availability: Json | null
          completion_rate: number | null
          created_at: string | null
          description: string | null
          genre: string | null
          group_type: string | null
          id: string | null
          images: string[] | null
          latitude: number | null
          location: string | null
          longitude: number | null
          members: Json | null
          name: string | null
          owner_id: string | null
          rate: number | null
          rating: number | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      musician_performed_gigs: {
        Row: {
          application_id: string | null
          applied_at: string | null
          event_date: string | null
          gig_budget: number | null
          gig_id: string | null
          gig_location: string | null
          gig_name: string | null
          gig_status: string | null
          group_id: string | null
          group_name: string | null
          musician_avatar: string | null
          musician_id: string | null
          musician_name: string | null
          musician_role: string | null
          performance_status: string | null
          show_on_profile: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["musician_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["musician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["musician_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_applicant_id_fkey"
            columns: ["musician_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      orders_with_summary: {
        Row: {
          buyer_avatar: string | null
          buyer_id: string | null
          buyer_name: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string | null
          currency: string | null
          delivered_at: string | null
          id: string | null
          item_count: number | null
          notes: string | null
          order_number: string | null
          payment_reference: string | null
          seller_id: string | null
          seller_name: string | null
          shipped_at: string | null
          shipping_address: Json | null
          shipping_fee: number | null
          shipping_profile_id: string | null
          status: string | null
          subtotal: number | null
          total_amount: number | null
          total_quantity: number | null
          updated_at: string | null
          wallet_transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_profile_id_fkey"
            columns: ["shipping_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      products_with_summary: {
        Row: {
          available_variants: number | null
          average_rating: number | null
          base_price: number | null
          category: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          group_id: string | null
          group_name: string | null
          id: string | null
          is_featured: boolean | null
          is_limited_edition: boolean | null
          limited_quantity: number | null
          primary_image: string | null
          product_type: string | null
          review_count: number | null
          seller_avatar: string | null
          seller_id: string | null
          seller_name: string | null
          status: string | null
          title: string | null
          total_sold: number | null
          total_stock: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_legacy_projection: {
        Row: {
          genres: string[] | null
          id: string | null
          portfolio_urls: string[] | null
          skills: string[] | null
        }
        Insert: {
          genres?: never
          id?: string | null
          portfolio_urls?: never
          skills?: never
        }
        Update: {
          genres?: never
          id?: string | null
          portfolio_urls?: never
          skills?: never
        }
        Relationships: []
      }
      profiles_with_stats: {
        Row: {
          avatar_url: string | null
          bio: string | null
          completion_rate: number | null
          created_at: string | null
          didit_session_id: string | null
          email: string | null
          full_name: string | null
          genres: string[] | null
          id: string | null
          id_document_expiry: string | null
          id_verified_at: string | null
          is_verified: boolean | null
          location: string | null
          portfolio_urls: string[] | null
          rating: number | null
          review_count: number | null
          role: string | null
          skills: string[] | null
          verification_status: string | null
        }
        Relationships: []
      }
      reviews_with_stats: {
        Row: {
          author_id: string | null
          content: string | null
          created_at: string | null
          gig_id: string | null
          group_id: string | null
          id: string | null
          likes_count: number | null
          rating: number | null
          studio_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_availability_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_slots_filled_projection"
            referencedColumns: ["gig_id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_availability_projection"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_bookings_legacy_projection: {
        Row: {
          id: string | null
          time_slots: Json | null
        }
        Insert: {
          id?: string | null
          time_slots?: never
        }
        Update: {
          id?: string | null
          time_slots?: never
        }
        Relationships: []
      }
      studio_bookings_with_cost: {
        Row: {
          base_rate: number | null
          booking_date: string | null
          buffer_minutes: number | null
          created_at: string | null
          duration_hours: number | null
          end_time: string | null
          final_price: number | null
          hours: number | null
          id: string | null
          modifiers_applied: Json | null
          notes: string | null
          start_time: string | null
          status: string | null
          studio_id: string | null
          studio_images: string[] | null
          studio_name: string | null
          studio_owner_id: string | null
          subtotal: number | null
          total_cost: number | null
          updated_at: string | null
          user_email: string | null
          user_full_name: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_availability_projection"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios_with_verification"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["studio_owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["studio_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["studio_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["studio_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      studios_availability_projection: {
        Row: {
          availability: Json | null
          open_dates: Json | null
          studio_id: string | null
        }
        Insert: {
          availability?: never
          open_dates?: never
          studio_id?: string | null
        }
        Update: {
          availability?: never
          open_dates?: never
          studio_id?: string | null
        }
        Relationships: []
      }
      studios_legacy_projection: {
        Row: {
          amenities: string[] | null
          id: string | null
          images: string[] | null
          instruments: Json | null
          types: string[] | null
        }
        Insert: {
          amenities?: never
          id?: string | null
          images?: never
          instruments?: never
          types?: never
        }
        Update: {
          amenities?: never
          id?: string | null
          images?: never
          instruments?: never
          types?: never
        }
        Relationships: []
      }
      studios_with_stats: {
        Row: {
          address: string | null
          amenities: string[] | null
          availability: Json | null
          completion_rate: number | null
          contract_url: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          has_seasonal_pricing: boolean | null
          has_special_dates: boolean | null
          holiday_multiplier: number | null
          hourly_rate: number | null
          id: string | null
          images: string[] | null
          instruments: Json | null
          latitude: number | null
          lead_time_hours: number | null
          location: string | null
          longitude: number | null
          name: string | null
          off_peak_dates: Json | null
          off_peak_multiplier: number | null
          open_dates: Json | null
          owner_id: string | null
          pax: number | null
          peak_season_dates: Json | null
          peak_season_multiplier: number | null
          permit_admin_notes: string | null
          permit_rejection_reason: string | null
          permit_resubmissions_used: number | null
          permit_reviewed_at: string | null
          permit_reviewed_by: string | null
          permit_status: string | null
          rate: number | null
          rating: number | null
          recording_rate: number | null
          rehearsal_rate: number | null
          review_count: number | null
          type: string | null
          types: string[] | null
          weekend_multiplier: number | null
        }
        Relationships: [
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
      studios_with_verification: {
        Row: {
          address: string | null
          address_verification_completed_at: string | null
          address_verification_session_id: string | null
          address_verification_status: string | null
          address_verified_at: string | null
          business_permit_url: string | null
          contract_url: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          extracted_address: string | null
          extracted_name: string | null
          hourly_rate: number | null
          id: string | null
          is_address_verified: boolean | null
          latitude: number | null
          longitude: number | null
          name: string | null
          owner_id: string | null
          pax: number | null
          permit_admin_notes: string | null
          permit_rejection_reason: string | null
          permit_resubmissions_used: number | null
          permit_reviewed_at: string | null
          permit_reviewed_by: string | null
          permit_status: string | null
          rate: number | null
          recording_rate: number | null
          rehearsal_rate: number | null
          verification_issuer: string | null
          verification_notes: string | null
          verified_address: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "follow_counts"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_legacy_projection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studios_permit_reviewed_by_fkey"
            columns: ["permit_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_with_stats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_gig_application_safely: {
        Args: {
          p_actor_user_id: string
          p_application_id: string
          p_new_status?: string
        }
        Returns: {
          applicant_id: string
          cancellation_reason: string | null
          created_at: string
          cv_url: string | null
          gig_id: string
          group_id: string | null
          id: string
          is_solo_application: boolean | null
          leader_approval_status: string | null
          leader_reviewed_at: string | null
          note: string | null
          performer_snapshot: Json
          pitch_message: string | null
          production_roster_id: string | null
          production_team_id: string | null
          reconfirmation_due_at: string | null
          reconfirmation_required_at: string | null
          rejected_at: string | null
          reviewed_by_applicant: boolean | null
          reviewed_by_organizer: boolean | null
          show_on_profile: boolean
          slot_type: string | null
          status: string | null
          submitted_by_user_id: string | null
          system_status_reason: string | null
          updated_at: string
          video_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gig_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_leadership_transfer: {
        Args: { request_id: string }
        Returns: undefined
      }
      admin_fetch_booking_incidents: {
        Args: { p_limit?: number; p_status_filter?: string }
        Returns: Json
      }
      admin_resolve_booking_incident: {
        Args: {
          p_admin_notes?: string
          p_incident_id: string
          p_resolution: string
        }
        Returns: Json
      }
      apply_booking_penalty: {
        Args: { p_booking_id: string; p_notes?: string; p_penalty_type: string }
        Returns: Json
      }
      apply_studio_promotion: {
        Args: {
          p_base_price?: number
          p_booking_date: string
          p_hours?: number
          p_session_type?: string
          p_studio_id: string
        }
        Returns: Json
      }
      are_slots_available: {
        Args: {
          p_booking_date: string
          p_exclude_booking_id?: string
          p_studio_id: string
          p_time_slots: Json
          p_user_id?: string
        }
        Returns: boolean
      }
      build_production_roster_snapshot: {
        Args: { p_roster_id: string }
        Returns: Json
      }
      calculate_booking_cancellation_penalty: {
        Args: { p_booking_id: string; p_cancellation_time?: string }
        Returns: Json
      }
      calculate_booking_cost: {
        Args: { p_end_time: string; p_start_time: string; p_studio_id: string }
        Returns: number
      }
      calculate_booking_price: {
        Args: {
          p_booking_date: string
          p_end_time: string
          p_start_time: string
          p_studio_id: string
          p_total_cart_hours?: number
        }
        Returns: {
          base_rate: number
          final_price: number
          hours: number
          modifiers: Json
          subtotal: number
        }[]
      }
      calculate_multi_slot_price: {
        Args: {
          p_booking_date: string
          p_studio_id: string
          p_time_slots: Json
        }
        Returns: {
          base_rate: number
          final_price: number
          modifiers: Json
          slot_breakdown: Json
          subtotal: number
          total_hours: number
        }[]
      }
      can_manage_production_team_members: {
        Args: { target_team_id: string }
        Returns: boolean
      }
      can_musician_reapply: {
        Args: { p_applicant_id: string; p_gig_id: string }
        Returns: boolean
      }
      can_view_gig_application_readonly_participant: {
        Args: { p_application_id: string }
        Returns: boolean
      }
      cancel_leadership_transfer: {
        Args: { request_id: string }
        Returns: undefined
      }
      check_verification_session: {
        Args: { p_session_ref: string }
        Returns: Json
      }
      claim_identity_document_approval: {
        Args: {
          p_claim_metadata?: Json
          p_didit_session_id?: string
          p_document_country?: string
          p_document_fingerprint: string
          p_document_type?: string
          p_document_type_key?: string
          p_duplicate_override?: boolean
          p_manual_review_id?: string
          p_normalized_email?: string
          p_role: string
          p_source?: string
          p_user_id: string
        }
        Returns: Json
      }
      claim_identity_document_approval_v2: {
        Args: {
          p_birth_date?: string
          p_claim_metadata?: Json
          p_didit_session_id?: string
          p_document_country?: string
          p_document_fingerprint?: string
          p_document_type?: string
          p_document_type_key?: string
          p_duplicate_override?: boolean
          p_full_legal_name?: string
          p_manual_review_id?: string
          p_normalized_email?: string
          p_normalized_full_legal_name?: string
          p_role: string
          p_source?: string
          p_user_id: string
        }
        Returns: Json
      }
      cleanup_expired_holds: { Args: never; Returns: number }
      contract_3nf_preflight: {
        Args: never
        Returns: {
          metric: string
          value: number
        }[]
      }
      contract_3nf_ready: { Args: never; Returns: boolean }
      create_group_conversation: {
        Args: { p_creator_id: string; p_group_id: string }
        Returns: string
      }
      decline_leadership_transfer: {
        Args: { request_id: string }
        Returns: undefined
      }
      delete_gig_safely: {
        Args: { p_gig_id: string; p_reason?: string }
        Returns: Json
      }
      delete_group_safely: {
        Args: { p_group_id: string; p_reason?: string }
        Returns: Json
      }
      delete_studio_safely: {
        Args: { p_reason?: string; p_studio_id: string }
        Returns: Json
      }
      drain_legacy_3nf: {
        Args: { p_batch_size?: number }
        Returns: {
          drained: number
          entity: string
        }[]
      }
      expire_stale_invites: { Args: never; Returns: number }
      expire_unresolved_studio_payments: {
        Args: { p_threshold_minutes?: number }
        Returns: number
      }
      get_ai_recommendations: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          budget: number
          created_at: string
          embedding: string
          genre: string
          hourly_rate: number
          id: string
          images: string[]
          location: string
          name: string
          organizer_id: string
          owner_id: string
          rate: number
          rating: number
          review_count: number
          similarity: number
          type: string
        }[]
      }
      get_entity_rating: {
        Args: { entity_id: string; entity_type: string }
        Returns: {
          rating: number
          review_count: number
        }[]
      }
      gig_has_available_slots: {
        Args: { p_gig_id: string; p_slot_type?: string }
        Returns: boolean
      }
      hold_booking_payout: {
        Args: {
          p_booking_id: string
          p_reason?: string
          p_reverse_existing?: boolean
        }
        Returns: Json
      }
      increment_post_share_count: {
        Args: { p_post_id: string }
        Returns: number
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_id: string }; Returns: boolean }
      is_conversation_admin: { Args: { conv_id: string }; Returns: boolean }
      is_conversation_member: { Args: { conv_id: string }; Returns: boolean }
      is_slot_available: {
        Args: {
          p_booking_date: string
          p_end_time: string
          p_start_time: string
          p_studio_id: string
          p_user_id?: string
        }
        Returns: boolean
      }
      link_verification_session: {
        Args: { p_session_ref: string; p_user_id: string }
        Returns: Json
      }
      match_listings: {
        Args: {
          listing_type: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      migration_duplicate_check: {
        Args: never
        Returns: {
          domain: string
          duplicate_groups: number
        }[]
      }
      migration_row_count_parity: {
        Args: never
        Returns: {
          domain: string
          legacy_count: number
          normalized_count: number
        }[]
      }
      normalize_identity_full_legal_name: {
        Args: { p_value: string }
        Returns: string
      }
      normalize_report_target_type: {
        Args: { raw_target_type: string }
        Returns: string
      }
      notify_profile_followers: {
        Args: {
          p_actor_id: string
          p_image?: string
          p_message: string
          p_meta?: Json
          p_title: string
          p_type: string
        }
        Returns: number
      }
      process_booking_auto_complete: { Args: never; Returns: number }
      process_booking_auto_start: { Args: never; Returns: number }
      process_expired_pending_relocations: {
        Args: never
        Returns: {
          cancelled_count: number
          penalties_count: number
        }[]
      }
      process_mock_withdrawal: {
        Args: {
          p_amount: number
          p_payout_method_id: string
          p_user_id: string
        }
        Returns: Json
      }
      process_overdue_booking_incidents: { Args: never; Returns: number }
      process_release_eligible_booking_payouts: { Args: never; Returns: number }
      record_booking_attendance: {
        Args: { p_booking_id: string; p_event_type: string; p_notes?: string }
        Returns: Json
      }
      register_push_device: {
        Args: {
          p_app_version?: string
          p_device_name?: string
          p_installation_id: string
          p_platform?: string
          p_project_id?: string
          p_push_token: string
        }
        Returns: string
      }
      release_booking_payout: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      send_verification_email: {
        Args: {
          p_email: string
          p_html: string
          p_name: string
          p_subject: string
        }
        Returns: boolean
      }
      set_conversation_mute: {
        Args: {
          p_conversation_id: string
          p_muted: boolean
          p_muted_until?: string
        }
        Returns: {
          conversation_id: string
          is_muted: boolean
          muted_until: string
          user_id: string
        }[]
      }
      sync_gig_3nf: { Args: { p_gig_id: string }; Returns: undefined }
      sync_group_3nf: { Args: { p_group_id: string }; Returns: undefined }
      sync_profile_3nf: { Args: { p_profile_id: string }; Returns: undefined }
      sync_studio_3nf: { Args: { p_studio_id: string }; Returns: undefined }
      sync_studio_booking_slots_3nf: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      unregister_push_device: {
        Args: { p_installation_id: string; p_reason?: string }
        Returns: undefined
      }
      update_gig_safely: {
        Args: { p_gig_id: string; p_payload: Json; p_reason?: string }
        Returns: Json
      }
      update_user_interest: {
        Args: { p_item_vector: string; p_user_id: string; p_weight?: number }
        Returns: undefined
      }
      validate_time_slots: { Args: { slots: Json }; Returns: boolean }
    }
    Enums: {
      verification_status_enum:
        | "NOT_STARTED"
        | "PENDING"
        | "PENDING_REVIEW"
        | "APPROVED"
        | "DECLINED"
        | "ABANDONED"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      verification_status_enum: [
        "NOT_STARTED",
        "PENDING",
        "PENDING_REVIEW",
        "APPROVED",
        "DECLINED",
        "ABANDONED",
      ],
    },
  },
} as const
