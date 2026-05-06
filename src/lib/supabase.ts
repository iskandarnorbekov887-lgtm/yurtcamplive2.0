import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Uses `@supabase/ssr`'s `createBrowserClient` which automatically syncs
 * the auth session to **browser cookies** (not just localStorage).
 * This ensures the Vercel server can read the session on every request.
 *
 * `createBrowserClient` is a singleton by default — safe to import
 * from multiple components without navigator.locks contention.
 */
import { supabase } from '@/utils/supabase/client';
export { supabase };

export type UserRole = 'CEO' | 'Manager' | 'Cook';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export interface Booking {
  id: number;
  guest_name: string;
  check_in: string;
  check_out: string;
  total_price: number;
  number_of_people: number;
  num_people: number;
  payment_status: string;
  source: string;
  status: string;
  notes: string;
  meal_notes: string;
  transportation: string;
  meal_preference: string;
  guide_required: boolean;
  special_requests: string; // Contains guest_category in JSON metadata
  created_by_role: string;
  approved_by_manager: boolean;
  created_by_id: string;
  last_edited_by_id: string;
  last_edited_by_role: string;
  created_at: string;
  google_event_id?: string;
  cooking_class?: boolean; // Database column for cooking class
  cooking_class_amount?: string | null;
  laundry_price?: string | null;
  laundry_currency?: 'UZS' | 'USD' | null;
  guest_count?: number;
  children_under_12?: number;
  nights?: string;
  guide_service?: boolean;
  guide_names?: string | null;
  guide_amount?: string | null;
  has_transportation?: boolean;
  transportation_details?: string | null;
  lunch?: boolean;
  lunch_count?: number;
  lunch_dietary?: string;
  dinner?: boolean;
  dinner_count?: number;
  dinner_dietary?: string;
  drinks?: boolean;
  drinks_count?: number;
  laundry?: boolean;
  payment_method?: 'in_camp' | 'all_paid' | 'partially_paid' | null;
  payment_note?: string | null;
  currency?: 'UZS' | 'USD' | 'EUR';
  exchange_rate?: number;
  amount?: number;
  description?: string;
  drinks_tab?: Array<{ drink_id: number; drink_name: string; quantity: number; price: number; currency: 'UZS' | 'USD' | 'EUR' }>;
  extra_services?: Array<{ name: string; price: number; currency: 'UZS' | 'USD' | 'EUR' }>;
  collected_amount?: number;
  collected_currency?: 'UZS' | 'USD' | 'EUR';
  payments?: any[];
  is_prepaid?: boolean;
  lunch_prepaid?: boolean;
  dinner_prepaid?: boolean;
  is_manual_dates?: boolean;
  is_manually_updated?: boolean;
  /** Joined meal_requests from the normalized table (not a DB column) */
  meal_requests?: MealRequest[];
}

export interface Tab {
  id: string;
  date: string;
  is_prepaid: boolean;
  lunch_prepaid: boolean;
  dinner_prepaid: boolean;
  items: {
    accommodation: number;
    meals: { lunch: number; dinner: number };
    services: { guide: number; transport: number; laundry: number; cooking: number };
    extras: Array<{ name: string; price: number; currency: string }>;
    drinks: Array<{ drink_id: number; drink_name: string; quantity: number; price: number; currency: string }>;
  };
  total: number;
  payments: Array<{ amount: number; currency: string; method: string }>;
}

export interface Finance {
  id: number;
  date: string;
  type: 'income' | 'expense';
  category: string;
  currency: 'UZS' | 'USD' | 'EUR';
  original_amount: number;
  exchange_rate: number;
  amount_uzs: number;
  description: string | null;
  guest_name: string | null;
  receipt_url: string | null;
  created_by: string;
  created_at: string;
}

export interface KitchenOrder {
  type: 'lunch' | 'dinner';
  quantity: number;
  status: 'pending' | 'accepted';
  requested_at: string;
  accepted_at?: string;
}

export interface GroceryRequest {
  id: number;
  items: Array<{
    name: string;
    qty: string;
    unit: string;
    purchased: boolean;
    received: boolean;
  }>;
  status: 'requested' | 'purchased' | 'received';
  created_at: string;
  created_by_id: string;
}

export interface Notification {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message: string;
  related_id: number | null;
  status?: string;
  read: boolean;
  created_at: string;
}

export interface Payment {
  id: number;
  booking_id: number;
  amount_original: number;
  currency_original: string;
  amount_usd_equivalent: number;
  exchange_rate_used: number;
  method: string;
  created_at?: string;
}

export interface MealRequest {
  id: number;
  booking_id: number;
  meal_date: string;
  meal_type: 'Lunch' | 'Dinner';
  adult_qty: number;
  child_qty: number;
  dietary_type: 'Normal' | 'Vegetarian';
  status: 'Pending' | 'Accepted' | 'Served';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ExtraService {
  id: number;
  booking_id: number;
  service_type: 'drink' | 'other';
  source_id?: number | null;
  name: string;
  quantity: number;
  price: number;
  currency: 'UZS' | 'USD' | 'EUR';
  created_at: string;
  updated_at: string;
}
