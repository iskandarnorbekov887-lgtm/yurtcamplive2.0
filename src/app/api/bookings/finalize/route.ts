import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../_supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/finalize
 * Finalizes (settles) an open tab for a booking:
 *  1. Archives the current tab as a booking_receipt
 *  2. Updates booking total_price and collected_amount
 *  3. Persists payments to the payments table
 * Body: {
 *   booking_id: number,
 *   tab_data: {
 *     date: string,
 *     items: { accommodation, meals, services, extras, drinks },
 *     total: number,
 *     payments: Array<{ amount, currency, method }>
 *   },
 *   
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { booking_id, tab_data } = body;

    if (!booking_id || !tab_data) {
      return NextResponse.json({ error: 'booking_id and tab_data are required' }, { status: 400 });
    }

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: fetchErr?.message || 'Booking not found' }, { status: 404 });
    }

    // 1. Archive receipt
    const { data: receipt, error: receiptErr } = await supabase
      .from('booking_receipts')
      .insert([{
        booking_id,
        amount: tab_data.total || 0,
        currency: tab_data.payments?.[0]?.currency || 'USD',
        settled_at: booking.check_out?.split('T')[0],
        created_by: booking.created_by,
        note: JSON.stringify(tab_data),
      }])
      .select()
      .single();

    if (receiptErr) {
      return NextResponse.json({ error: receiptErr.message }, { status: 500 });
    }

    // 2. Record individual payments
    const payments = (tab_data.payments || []).map((p: any) => ({
      booking_id,
      amount_original: parseFloat(p.amount) || 0,
      currency_original: p.currency || 'USD',
      amount_usd_equivalent: p.currency === 'USD'
        ? parseFloat(p.amount) || 0
        : (parseFloat(p.amount) || 0) / (p.rate || (p.currency === 'UZS' ? 12500 : 0.92)),
      exchange_rate_used: p.rate || (p.currency === 'UZS' ? 12500 : 0.92),
      method: p.method || 'Cash',
      created_at: new Date().toISOString(),
    }));

    if (payments.length > 0) {
      const { error: payErr } = await supabase.from('payments').insert(payments);
      if (payErr) {
        console.error('Payments insert error:', payErr);
      }
    }

    // 3. Update booking totals
    const totalPaid = tab_data.payments?.reduce((sum: number, p: any) => {
      const amt = parseFloat(p.amount) || 0;
      if (p.currency === 'USD') return sum + amt;
      const rate = p.rate || (p.currency === 'UZS' ? 12500 : 0.92);
      return sum + (amt / rate);
    }, 0) || 0;

    const updates: Record<string, any> = {
      is_manually_updated: true,
      total_price: (booking.total_price || 0) + (tab_data.total || 0),
      collected_amount: (booking.collected_amount || 0) + totalPaid,
      last_edited_at: new Date().toISOString(),
    };

    

    // Merge settled_receipts directly
    const settledReceipts = booking.settled_receipts || [];
    settledReceipts.push({
      id: receipt.id,
      date: tab_data.date,
      total: tab_data.total,
      items: tab_data.items,
      payments: tab_data.payments,
      settled_at: new Date().toISOString(),
    });

    updates.settled_receipts = settledReceipts;

    const { data: updated, error: updErr } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', booking_id)
      .select()
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      receipt,
      booking: updated,
      payments_inserted: payments.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
