import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../_supabase';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/bookings/[id]
 * Updates a booking. Optionally recalculates total_price if services data is provided.
 * Body: { ...bookingFields, recalculate?: boolean, services?: {...}, drinks?: [...], extras?: [...], discount?: number }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const bookingId = parseInt(id, 10);
    if (isNaN(bookingId)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 });
    }

    const body = await request.json();
    const {
      recalculate = false,
      services,
      drinks,
      extras: extra_services,
      discount = 0,
      last_edited_by_id,
      ...bookingFields
    } = body;



    // Fetch existing booking for price recalculation context
    let existing: any = null;
    if (recalculate) {
      const { data } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
      existing = data;
    }

    // If recalculating, compute new total
    if (recalculate && existing) {
      const { data: pricingRow } = await supabase.from('service_pricing').select('*').eq('id', 1).single();
      const pricing = pricingRow || { lunch_price: 10, dinner_price: 10, guide_price: 40 };

      const isPrepaid = bookingFields.is_prepaid ?? existing.is_prepaid ?? false;
      const accAmount = existing.total_price ?? 0;

      const sTotal =
        (services?.lunch && !services.lunch.prepaid ? (services.lunch.count || 0) * (pricing.lunch_price || 10) : 0) +
        (services?.dinner && !services.dinner.prepaid ? (services.dinner.count || 0) * (pricing.dinner_price || 10) : 0) +
        (services?.guide ? (services.guide.price || 0) : 0) +
        (services?.transport ? services.transport.reduce((s: number, t: any) => s + (t.price || 0), 0) : 0) +
        (services?.laundry ? (services.laundry.price || 0) : 0) +
        (services?.cooking ? (services.cooking.price || 0) : 0);

      let dTotal = 0;
      if (drinks?.length > 0) {
        const drinkIds = drinks.map((d: any) => d.drink_id).filter(Boolean);
        const { data: drinkData } = await supabase.from('drinks').select('id, sold_price').in('id', drinkIds);
        const prices: Record<number, number> = {};
        (drinkData || []).forEach((d: any) => { prices[d.id] = d.sold_price || 0; });
        dTotal = drinks.reduce((sum: number, d: any) => sum + (d.quantity || 0) * (prices[d.drink_id] || 0), 0);
      }

      const eTotal = (extra_services || []).reduce((sum: number, s: any) => sum + (parseFloat(s.price) || 0), 0);

      bookingFields.total_price = Math.max(0, (isPrepaid ? 0 : accAmount) + sTotal + dTotal + eTotal - discount);

      // Persist services to normalized tables (not booking columns)
      if (services?.lunch !== undefined && services.lunch.enabled) {
        await supabase.from('meal_requests').insert({
          booking_id: bookingId,
          meal_date: new Date().toISOString().split('T')[0],
          meal_type: 'Lunch',
          adult_qty: services.lunch.count || 0,
          child_qty: 0,
          dietary_type: 'Normal',
          status: 'Pending',
          team_id: teamId,
        });
      }
      if (services?.dinner !== undefined && services.dinner.enabled) {
        await supabase.from('meal_requests').insert({
          booking_id: bookingId,
          meal_date: new Date().toISOString().split('T')[0],
          meal_type: 'Dinner',
          adult_qty: services.dinner.count || 0,
          child_qty: 0,
          dietary_type: 'Normal',
          status: 'Pending',
          team_id: teamId,
        });
      }
      if (services?.guide !== undefined && services.guide.enabled) {
        await supabase.from('booking_services').insert({
          booking_id: bookingId,
          service_type: 'guide',
          unit_price: services.guide.price || 0,
          quantity: 1,
          currency: 'USD',
          details: { names: services.guide.names || '' },
        });
      }
      if (services?.transport !== undefined && services.transport.enabled) {
        for (const entry of (services.transport.entries || [])) {
          if (entry.name?.trim() || entry.details?.trim()) {
            await supabase.from('booking_services').insert({
              booking_id: bookingId,
              service_type: 'transportation',
              unit_price: entry.price || 0,
              quantity: 1,
              currency: 'USD',
              details: { name: entry.name, destination: entry.details },
            });
          }
        }
      }
      if (services?.laundry !== undefined && services.laundry.enabled) {
        await supabase.from('booking_services').insert({
          booking_id: bookingId,
          service_type: 'laundry',
          unit_price: services.laundry.price || 0,
          quantity: 1,
          currency: 'USD',
          details: {},
        });
      }
      if (drinks !== undefined && drinks.length > 0) {
        for (const d of drinks) {
          await supabase.from('booking_services').insert({
            booking_id: bookingId,
            service_type: 'drinks',
            unit_price: d.price || 0,
            quantity: d.quantity || 1,
            currency: d.currency || 'USD',
            details: { drink_id: d.drink_id, drink_name: d.drink_name },
          });
        }
      }
      if (extra_services !== undefined) {
        bookingFields.extra_services = extra_services.map((s: any) => ({
          name: s.name,
          price: parseFloat(s.price) || 0,
          currency: s.currency || 'USD',
        }));
      }
    }

    bookingFields.is_manually_updated = true;
    if (last_edited_by_id) {
      bookingFields.last_edited_by_id = last_edited_by_id;
      bookingFields.last_edited_at = new Date().toISOString();
    }



    const { data, error } = await supabase
      .from('bookings')
      .update(bookingFields)
      .eq('id', bookingId)
      .eq('team_id', teamId)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json({ booking: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/bookings/[id]
 * Fetch a single booking with joined meal_requests.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const bookingId = parseInt(id, 10);
    if (isNaN(bookingId)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*, meal_requests(*)')
      .eq('id', bookingId)
      .eq('team_id', teamId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json({ booking: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
