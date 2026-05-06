import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEFAULT_PRICING = {
  lunch_price: 10,
  dinner_price: 10,
  guide_price: 40,
  usd_to_uzs: 12500,
  usd_to_eur: 0.92,
};

/**
 * GET /api/pricing
 * Returns current service pricing. Falls back to defaults if DB row missing.
 */
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('service_pricing')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !data) {
      return NextResponse.json({ pricing: DEFAULT_PRICING, source: 'default' });
    }

    return NextResponse.json({
      pricing: {
        lunch_price: data.lunch_price ?? DEFAULT_PRICING.lunch_price,
        dinner_price: data.dinner_price ?? DEFAULT_PRICING.dinner_price,
        guide_price: data.guide_price ?? DEFAULT_PRICING.guide_price,
        usd_to_uzs: data.usd_to_uzs ?? DEFAULT_PRICING.usd_to_uzs,
        usd_to_eur: data.usd_to_eur ?? DEFAULT_PRICING.usd_to_eur,
      },
      source: 'database',
    });
  } catch (err: any) {
    return NextResponse.json({ pricing: DEFAULT_PRICING, source: 'default', error: err.message });
  }
}

/**
 * PATCH /api/pricing
 * Updates service pricing (requires admin).
 * Body: { lunch_price?, dinner_price?, guide_price?, usd_to_uzs?, usd_to_eur? }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const updates: Record<string, number> = {};

    const fields = ['lunch_price', 'dinner_price', 'guide_price', 'usd_to_uzs', 'usd_to_eur'];
    fields.forEach((f) => {
      if (body[f] !== undefined) updates[f] = body[f];
    });

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid pricing fields provided' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('service_pricing')
      .update(updates)
      .eq('id', 1)
      .select()
      .single();

    if (error) {
      // If row doesn't exist, insert it
      if (error.code === 'PGRST116') {
        const { data: inserted, error: insertErr } = await supabase
          .from('service_pricing')
          .insert([{ id: 1, ...DEFAULT_PRICING, ...updates }])
          .select()
          .single();

        if (insertErr) {
          return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
        return NextResponse.json({ pricing: inserted });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pricing: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
