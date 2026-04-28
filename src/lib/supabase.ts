import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Create a complete mock for server/build side
// Cast to SupabaseClient so TypeScript only sees real Supabase types.
const createMockClient = (): SupabaseClient => {
  const handler: ProxyHandler<object> = {
    get() {
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler) as unknown as SupabaseClient;
};

function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase configuration missing!');
    throw new Error('Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'yurt-camp-v3-final',
    },
  });
}

// SSR/build: return mock. Browser: create singleton once.
// Both branches return SupabaseClient type so TypeScript sees consistent types.
export const supabase: SupabaseClient = typeof window === 'undefined'
  ? createMockClient()
  : createBrowserClient();

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
