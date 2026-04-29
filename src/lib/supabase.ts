import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client.
 *
 * Uses `@supabase/ssr`'s `createBrowserClient` which automatically syncs
 * the auth session to **browser cookies** (not just localStorage).
 * This ensures the Vercel server can read the session on every request.
 *
 * `createBrowserClient` is a singleton by default — safe to call from
 * multiple components without navigator.locks contention.
 *
 * On the server (SSR/build), we return a no-op proxy so that imports
 * from 'use client' modules don't crash during the server render pass.
 */
function createSafeBrowserClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    // Server-side: return a no-op proxy (never used for real calls)
    const handler: ProxyHandler<object> = {
      get() {
        return () => new Proxy({}, handler);
      },
    };
    return new Proxy({}, handler) as unknown as SupabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase Environment Variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const supabase: SupabaseClient = createSafeBrowserClient();

export type UserRole = 'CEO' | 'Manager' | 'Cook' | 'Reserver';

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
  special_requests: string;
  created_by_role: string;
  approved_by_manager: boolean;
  created_by_id: string;
  last_edited_by_id: string;
  last_edited_by_role: string;
  created_at: string;
  google_event_id?: string;
  cooking_class?: boolean;
  cooking_class_amount?: string | null;
  cooking_class_description?: string | null;
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
