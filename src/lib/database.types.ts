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
          role: 'CEO' | 'Manager' | 'Reserver' | 'Cook'
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'CEO' | 'Manager' | 'Reserver' | 'Cook'
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'CEO' | 'Manager' | 'Reserver' | 'Cook'
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      yurts: {
        Row: {
          id: number
          name: string
          status: string
          type: string
        }
        Insert: {
          id?: number
          name: string
          status?: string
          type?: string
        }
        Update: {
          id?: number
          name?: string
          status?: string
          type?: string
        }
      }
      bookings: {
        Row: {
          id: number
          yurt_id: number
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
          yurt_id: number
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
          yurt_id?: number
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
