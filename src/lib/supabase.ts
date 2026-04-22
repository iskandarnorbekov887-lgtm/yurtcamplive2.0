import { createClient } from '@supabase/supabase-js';
import { createLocalClient } from './local-supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = supabaseUrl && !supabaseUrl.includes('placeholder') && supabaseKey && supabaseKey.length > 20;

export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseKey)
  : createLocalClient() as any;

export const isUsingLocalStorage = !isConfigured;

export type UserRole = 'CEO' | 'Manager' | 'Cook' | 'Reserver';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
}

export interface Yurt {
  id: number;
  name: string;
  status: 'Clean' | 'Dirty' | 'Maintenance';
  type: string;
  capacity: number;
}

export interface Booking {
  id: number;
  yurt_id: number;
  guest_name: string;
  check_in: string;
  check_out: string;
  total_price: number;
  number_of_people: number;
  num_people?: number; // Alias for backward compatibility or specific schema request
  payment_status: 'Paid' | 'Partial' | 'Unpaid';
  source: 'Manual' | 'Booking.com' | 'TripAdvisor';
  status: 'confirmed' | 'cancelled' | 'completed' | 'pending' | 'checked_in';
  notes: string | null;
  meal_notes: string | null;
  transportation?: string;
  meal_preference?: string;
  guide_required?: boolean;
  special_requests?: string;
  created_by_role?: UserRole;
  approved_by_manager: boolean;
  created_by_id: string;
  last_edited_by_id: string | null;
  last_edited_by_role?: UserRole;
  yurt?: Yurt;
}

export interface Expense {
  id: number;
  category: 'Grocery' | 'Maintenance' | 'Freelance';
  item_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  receipt_url: string;
  created_at: string;
  created_by: string;
}
