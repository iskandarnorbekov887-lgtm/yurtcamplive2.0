import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../_supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings
 * Creates a booking with category-based defaults.
 * Body: {
 *   guest_name: string,
 *   check_in: string (YYYY-MM-DD),
 *   check_out?: string (YYYY-MM-DD),
 *   number_of_people?: number,
 *   guest_category: 'international' | 'local' | 'pool' | 'camper',
 *   local_stay_type?: 'day' | 'night',
 *   amount?: number,
 *   currency?: 'UZS' | 'USD' | 'EUR',
 *   services?: { lunch?, dinner?, guide?, transport?, cooking?, laundry? },
 *   created_by: string,
 *   notes?: string,
 *   is_system_only?: boolean,
 *   is_manual_dates?: boolean
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      guest_name,
      check_in,
      check_out,
      number_of_adults = 1,
      guest_category = 'international',
      local_stay_type,
      amount = 0,
      currency = 'USD',
      services = {},
      created_by,
      notes = '',
      is_system_only = false,
      is_manual_dates = true,
    } = body;

    if (!guest_name?.trim()) {
      return NextResponse.json({ error: 'guest_name is required' }, { status: 400 });
    }
    if (!check_in) {
      return NextResponse.json({ error: 'check_in is required' }, { status: 400 });
    }
    if (!created_by) {
      return NextResponse.json({ error: 'created_by is required' }, { status: 400 });
    }

    const isFinancial = guest_category === 'local' || guest_category === 'pool';
    const isDayVisit = guest_category === 'pool' || (guest_category === 'local' && local_stay_type === 'day');
    const finalCheckOut = check_out || (isDayVisit ? check_in : check_in);

    // Build special_requests metadata
    const meta: Record<string, any> = {
      is_system_only,
      is_manual_dates,
      guest_category,
      local_stay_type: guest_category === 'local' ? local_stay_type : null,
      is_pool_visitor: guest_category === 'pool',
      is_room_stay: guest_category === 'international' || guest_category === 'camper',
    };

    // Default payload
    const payload: Record<string, any> = {
      guest_name: guest_name.trim(),
      check_in,
      check_out: finalCheckOut,
      number_of_adults,
      guest_count: number_of_adults,
      status: isFinancial ? 'completed' : 'checked_in',
      source: is_system_only ? 'System' : 'manual',
      total_price: isFinancial ? amount : 0,
      payment_status: isFinancial ? 'paid' : 'Unpaid',
      currency,
      amount,
      exchange_rate: currency === 'UZS' ? 1 : (currency === 'USD' ? 1 : await fetchUsdToEur()),
      created_by,
      approved_by_manager: true,
      notes,
      is_manual_dates: meta.is_manual_dates,
      guest_category: meta.guest_category,
      local_stay_type: meta.local_stay_type,
      is_pool_visitor: meta.is_pool_visitor,
      is_room_stay: meta.is_room_stay,
    };

    // Purge room-related fields for Local/Pool/Financials
    if (isFinancial) {
      payload.collected_amount = amount;
      payload.collected_currency = currency;
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert([payload])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If financial (Local/Pool), record receipt
    if (isFinancial && booking) {
      await supabase.from('booking_receipts').insert([{
        booking_id: booking.id,
        amount,
        currency,
        settled_at: check_in,
        created_by,
        note: guest_category === 'pool' ? 'Instant Pool Payment' : `Local ${local_stay_type} payment`,
      }]);
    }

    return NextResponse.json({ booking }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

async function fetchUsdToEur(): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    return data?.rates?.EUR || 0.92;
  } catch {
    return 0.92;
  }
}
