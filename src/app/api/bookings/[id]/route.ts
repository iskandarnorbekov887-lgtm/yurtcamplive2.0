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



    // Persist services to normalized tables (meal_requests, booking_services)
    // total_price is NOT modified here - only /api/bookings/finalize is allowed to change it
    if (recalculate) {
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
