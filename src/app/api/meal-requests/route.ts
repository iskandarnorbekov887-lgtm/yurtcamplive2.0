import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../_supabase';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meal-requests
 * Creates one or more meal_requests linked to a booking.
 * Body: {
 *   booking_id: number,
 *   meals: Array<{
 *     meal_date: string (YYYY-MM-DD),
 *     meal_type: 'Lunch' | 'Dinner',
 *     adult_qty: number,
 *     child_qty: number,
 *     dietary_type: 'Normal' | 'Vegetarian',
 *     notes?: string
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile } = await supabaseServer.from('profiles').select('team_id, account_status').eq('id', user.id).single();
    if (!profile?.team_id) return NextResponse.json({ error: 'User does not belong to a team' }, { status: 403 });
    if (profile.account_status === 'banned') {
      return NextResponse.json({ error: 'This account has been deactivated. Contact your administrator.' }, { status: 403 });
    }
    const teamId = profile.team_id;

    const body = await request.json();
    const { booking_id, meals } = body;

    if (!booking_id || !Array.isArray(meals) || meals.length === 0) {
      return NextResponse.json({ error: 'booking_id and meals array are required' }, { status: 400 });
    }

    // Validate each meal
    for (const m of meals) {
      if (!m.meal_date || !m.meal_type) {
        return NextResponse.json({ error: 'Each meal requires meal_date and meal_type' }, { status: 400 });
      }
      if (!['Lunch', 'Dinner'].includes(m.meal_type)) {
        return NextResponse.json({ error: `Invalid meal_type: ${m.meal_type}` }, { status: 400 });
      }
      if (!['Normal', 'Vegetarian'].includes(m.dietary_type || 'Normal')) {
        return NextResponse.json({ error: `Invalid dietary_type: ${m.dietary_type}` }, { status: 400 });
      }
    }

    // Deduplicate: skip meals that already exist for this booking+date+type
    const { data: existing } = await supabase
      .from('meal_requests')
      .select('meal_date, meal_type')
      .eq('booking_id', booking_id);

    const existingKeys = new Set(
      (existing || []).map((e: any) => `${e.meal_date}|${e.meal_type}`)
    );

    const toInsert = meals
      .filter((m: any) => !existingKeys.has(`${m.meal_date}|${m.meal_type}`))
      .map((m: any) => {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        const orderId = `ORD-${timestamp}-${random}`;

        return {
          booking_id,
          order_id: orderId,
          meal_date: m.meal_date,
          meal_type: m.meal_type,
          adult_qty: m.adult_qty ?? 1,
          child_qty: m.child_qty ?? 0,
          dietary_type: m.dietary_type ?? 'Normal',
          status: 'Pending',
          notes: m.notes || null,
          team_id: teamId,
        };
      });

    if (toInsert.length === 0) {
      return NextResponse.json({ message: 'All meals already exist for this booking', inserted: [] }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('meal_requests')
      .insert(toInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: data, count: data?.length || 0 }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/meal-requests?booking_id=123&from=2024-01-01&to=2024-12-31
 * Fetches meal requests, optionally filtered by booking and date range.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const booking_id = searchParams.get('booking_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const status = searchParams.get('status');

    let query = supabase.from('meal_requests').select('*, bookings(guest_name)');

    if (booking_id) query = query.eq('booking_id', parseInt(booking_id, 10));
    if (from) query = query.gte('meal_date', from);
    if (to) query = query.lte('meal_date', to);
    if (status) query = query.eq('status', status);

    const { data, error } = await query.order('meal_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meals: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
