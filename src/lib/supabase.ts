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
  yurt_id?: number;
  guest_name: string;
  check_in: string;
  check_out: string;
  total_price: number;
  number_of_people: number;
  num_people?: number;
  payment_status: 'Paid' | 'Partial' | 'Unpaid';
  source: 'Manual' | 'Booking.com' | 'TripAdvisor';
  status: 'confirmed' | 'cancelled' | 'completed' | 'pending' | 'checked_in' | 'no_arrival';
  notes: string | null;
  meal_notes: string | null;
  transportation?: string;
  meal_preference?: string;
  guide_required?: boolean;
  special_requests?: string;
  created_by_role?: UserRole;
  approved_by_manager: boolean;
  created_by_id: string;
  created_at?: string;
  last_edited_by_id: string | null;
  last_edited_by_role?: UserRole;
  last_edited_at?: string;
  yurt?: Yurt;
  // Service fields (from income form)
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
  lunch_dietary?: string; // Dietary requests for lunch (vegetarian, special request)
  dinner?: boolean;
  dinner_count?: number;
  dinner_dietary?: string; // Dietary requests for dinner (vegetarian, special request)
  drinks?: boolean;
  drinks_count?: number;
  laundry?: boolean;
  laundry_price?: string | null;
  laundry_currency?: 'UZS' | 'USD' | null;
  payment_method?: 'in_camp' | 'all_paid' | 'partially_paid' | null;
  payment_note?: string | null; // Optional message for all_paid, required for partially_paid
  currency?: 'UZS' | 'USD' | 'EUR';
  exchange_rate?: number;
  amount?: number;
  description?: string;
  // New fields for manager UI
  yurt_requests?: string; // Special requests for yurts (separate/together beds, how many yurts)
  cooking_class?: boolean; // Cooking class service
  cooking_class_description?: string | null; // Optional description for cooking class
  cooking_class_amount?: string | null; // Amount for cooking class
  drinks_tab?: Array<{ drink_id: number; drink_name: string; quantity: number; price: number; currency: 'UZS' | 'USD' | 'EUR' }>;
  extra_services?: Array<{ name: string; price: number; currency: 'UZS' | 'USD' | 'EUR' }>;
  collected_amount?: number;
  collected_currency?: 'UZS' | 'USD' | 'EUR';
  google_event_id?: string;
  payments?: Payment[];
}

export interface Drink {
  id: number;
  name: string;
  original_price: number;
  sold_price: number;
  currency: 'UZS' | 'USD' | 'EUR';
  available: boolean;
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
  // Income-specific fields
  guest_count?: number | null;
  children_under_12?: number | null;
  nights?: string | null;
  guide_service?: boolean | null;
  guide_names?: string | null;
  transportation?: boolean | null;
  transportation_details?: string | null;
  lunch?: boolean | null;
  lunch_count?: number | null;
  dinner?: boolean | null;
  dinner_count?: number | null;
  laundry?: boolean | null;
  laundry_price?: string | null;
  laundry_currency?: 'UZS' | 'USD' | null;
  drinks?: boolean | null;
  drinks_count?: number | null;
  payment_method?: 'cash' | 'online' | 'already_paid' | 'partially_paid' | 'in_camp' | null;
}

export interface Payment {
  id: number;
  booking_id: number;
  amount_original: number;
  currency_original: 'USD' | 'UZS' | 'EUR';
  method: 'Cash' | 'Card/Online';
  exchange_rate_used: number;
  amount_usd_equivalent: number;
  created_at?: string;
}

export interface BookingReceipt {
  id: number;
  booking_id: number;
  receipt_id: string;
  snapshot: any;
  total_usd: number;
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

// Helper function to clear test data (use only in development/testing)
export async function clearTestReceipts() {
  try {
    // Clear from booking_receipts table
    await supabase.from('booking_receipts').delete().neq('id', 0);
    
    // Clear settled_receipts from special_requests in bookings table
    const { data: bookings } = await supabase.from('bookings').select('id, special_requests');
    if (bookings) {
      for (const booking of bookings) {
        if (booking.special_requests) {
          try {
            const parsed = typeof booking.special_requests === 'string'
              ? JSON.parse(booking.special_requests || '{}')
              : (booking.special_requests || {});
            const meta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
            
            if (meta.settled_receipts && meta.settled_receipts.length > 0) {
              delete meta.settled_receipts;
              await supabase.from('bookings').update({
                special_requests: JSON.stringify(meta)
              }).eq('id', booking.id);
            }
          } catch {
            // Skip if parsing fails
          }
        }
      }
    }
    
    console.log('Test receipts cleared from both database and special_requests');
  } catch (error) {
    console.error('Failed to clear test receipts:', error);
  }
}

// Helper function to delete specific receipts by receipt ID
export async function deleteReceiptById(receiptId: string) {
  try {
    // Delete from booking_receipts table
    const { error: dbError } = await supabase
      .from('booking_receipts')
      .delete()
      .eq('receipt_id', receiptId);

    if (dbError) {
      console.error('Error deleting from booking_receipts:', dbError);
    }

    // Remove from special_requests in bookings table
    const { data: bookings } = await supabase.from('bookings').select('id, special_requests');
    if (bookings) {
      for (const booking of bookings) {
        if (booking.special_requests) {
          try {
            const parsed = typeof booking.special_requests === 'string'
              ? JSON.parse(booking.special_requests || '{}')
              : (booking.special_requests || {});
            const meta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});

            if (meta.settled_receipts && meta.settled_receipts.length > 0) {
              const filtered = meta.settled_receipts.filter((r: any) => r.id !== receiptId);
              if (filtered.length !== meta.settled_receipts.length) {
                meta.settled_receipts = filtered;
                await supabase.from('bookings').update({
                  special_requests: JSON.stringify(meta)
                }).eq('id', booking.id);
                console.log(`Removed receipt ${receiptId} from booking ${booking.id}`);
              }
            }
          } catch {
            // Skip if parsing fails
          }
        }
      }
    }

    console.log(`Receipt ${receiptId} deleted from both locations`);
    return true;
  } catch (error) {
    console.error('Failed to delete receipt:', error);
    return false;
  }
}

// SQL queries to manually delete receipts (run in Supabase SQL Editor)
export const SQL_DELETE_RECEIPTS = {
  // Delete from booking_receipts table
  deleteFromBookingReceipts: (receiptId: string) =>
    `DELETE FROM booking_receipts WHERE receipt_id = '${receiptId}';`,

  // Delete from special_requests (more complex - need to update JSON)
  // Run this for each booking that has the receipt in special_requests
  clearSettledReceipts:
    `UPDATE bookings
     SET special_requests = special_requests::jsonb - 'settled_receipts'
     WHERE special_requests::jsonb ? 'settled_receipts';`
};

// Function to find which booking contains a specific receipt
export async function findBookingWithReceipt(receiptId: string) {
  const { data: bookings } = await supabase.from('bookings').select('id, guest_name, special_requests');
  const found: any[] = [];

  if (bookings) {
    for (const booking of bookings) {
      if (booking.special_requests) {
        try {
          const parsed = typeof booking.special_requests === 'string'
            ? JSON.parse(booking.special_requests || '{}')
            : (booking.special_requests || {});
          const meta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});

          if (meta.settled_receipts && meta.settled_receipts.length > 0) {
            const hasReceipt = meta.settled_receipts.some((r: any) => r.id === receiptId);
            if (hasReceipt) {
              found.push({
                booking_id: booking.id,
                guest_name: booking.guest_name,
                receipt_count: meta.settled_receipts.length
              });
            }
          }
        } catch {
          // Skip if parsing fails
        }
      }
    }
  }

  return found;
}
