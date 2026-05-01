export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: 'CEO' | 'Manager' | 'Cook'
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'CEO' | 'Manager' | 'Cook'
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'CEO' | 'Manager' | 'Cook'
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      // The yurts table is deprecated and removed from code references.
      // Use is_room_stay metadata for accommodation logic.
      bookings: {
        Row: {
          id: number
          guest_name: string
          check_in: string
          check_out: string
          total_price: number
          source: string
          status: string
          notes: string | null
          meal_notes: string | null
          approved_by_manager: boolean
          created_by_id: string
          last_edited_by_id: string | null
        }
        Insert: {
          id?: number
          guest_name: string
          check_in: string
          check_out: string
          total_price?: number
          source?: string
          status?: string
          notes?: string | null
          meal_notes?: string | null
          approved_by_manager?: boolean
          created_by_id: string
          last_edited_by_id?: string | null
        }
        Update: {
          id?: number
          guest_name?: string
          check_in?: string
          check_out?: string
          total_price?: number
          source?: string
          status?: string
          notes?: string | null
          meal_notes?: string | null
          approved_by_manager?: boolean
          created_by_id?: string
          last_edited_by_id?: string | null
        }
      }
      expenses: {
        Row: {
          id: number
          category: string
          item_name: string
          quantity: number
          unit_price: number
          total_amount: number
          receipt_url: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: number
          category: string
          item_name: string
          quantity: number
          unit_price: number
          receipt_url?: string | null
          created_by?: string | null
        }
        Update: {
          id?: number
          category?: string
          item_name?: string
          quantity?: number
          unit_price?: number
          receipt_url?: string | null
          created_by?: string | null
        }
      }
    }
  }
}
