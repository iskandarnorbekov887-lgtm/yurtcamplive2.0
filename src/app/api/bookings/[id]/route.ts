import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../_supabase';

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

    // Merge metadata if special_requests is an object
    let meta: Record<string, any> = {};
    if (bookingFields.special_requests) {
      try {
        meta = typeof bookingFields.special_requests === 'string'
          ? JSON.parse(bookingFields.special_requests)
          : bookingFields.special_requests;
      } catch { /* ignore */ }
    }

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
      const accAmount = bookingFields.amount ?? existing.amount ?? 0;

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

      // Persist services to dedicated columns
      if (services?.lunch !== undefined) {
        bookingFields.lunch = services.lunch.enabled ?? services.lunch;
        bookingFields.lunch_count = services.lunch.count || 0;
      }
      if (services?.dinner !== undefined) {
        bookingFields.dinner = services.dinner.enabled ?? services.dinner;
        bookingFields.dinner_count = services.dinner.count || 0;
      }
      if (services?.guide !== undefined) {
        bookingFields.guide_service = services.guide.enabled ?? !!services.guide;
        bookingFields.guide_amount = String(services.guide.price || 0);
      }
      if (services?.transport !== undefined) {
        bookingFields.has_transportation = services.transport.enabled ?? !!services.transport;
        bookingFields.transportation_details = (services.transport.entries || [])
          .filter((t: any) => t.name?.trim() || t.details?.trim())
          .map((t: any) => `${t.name.trim()} | ${t.details.trim()} | Price: $${t.price || 0}`)
          .join('\n') || null;
      }
      if (services?.cooking !== undefined) {
        bookingFields.cooking_class = services.cooking.enabled ?? !!services.cooking;
        bookingFields.cooking_class_amount = String(services.cooking.price || 0);
      }
      if (services?.laundry !== undefined) {
        bookingFields.laundry = services.laundry.enabled ?? !!services.laundry;
        bookingFields.laundry_price = String(services.laundry.price || 0);
      }
      if (drinks !== undefined) {
        bookingFields.drinks_tab = drinks;
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

    // Re-stringify special_requests if it's an object
    if (typeof bookingFields.special_requests === 'object' && bookingFields.special_requests !== null) {
      bookingFields.special_requests = JSON.stringify(bookingFields.special_requests);
    }

    const { data, error } = await supabase
      .from('bookings')
      .update(bookingFields)
      .eq('id', bookingId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    const { id } = await params;
    const bookingId = parseInt(id, 10);
    if (isNaN(bookingId)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*, meal_requests(*)')
      .eq('id', bookingId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ booking: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
