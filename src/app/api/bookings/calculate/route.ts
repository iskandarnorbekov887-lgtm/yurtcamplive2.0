import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../_supabase';

export const dynamic = 'force-dynamic';

interface ServicePricing {
  lunch_price: number;
  dinner_price: number;
  guide_price: number;
  usd_to_uzs: number;
  usd_to_eur: number;
}

async function getPricing(): Promise<ServicePricing> {
  const { data } = await supabase.from('service_pricing').select('*').eq('id', 1).single();
  if (data) {
    return {
      lunch_price: data.lunch_price ?? 10,
      dinner_price: data.dinner_price ?? 10,
      guide_price: data.guide_price ?? 40,
      usd_to_uzs: data.usd_to_uzs ?? 12500,
      usd_to_eur: data.usd_to_eur ?? 0.92,
    };
  }
  return { lunch_price: 10, dinner_price: 10, guide_price: 40, usd_to_uzs: 12500, usd_to_eur: 0.92 };
}

/**
 * POST /api/bookings/calculate
 * Calculates total price for a booking based on services, drinks, extras.
 * Body: {
 *   accommodation_amount: number,
 *   is_prepaid: boolean,
 *   services: {
 *     lunch?: { count: number, prepaid?: boolean },
 *     dinner?: { count: number, prepaid?: boolean },
 *     guide?: { price: number },
 *     transport?: Array<{ price: number }>,
 *     laundry?: { price: number },
 *     cooking?: { price: number }
 *   },
 *   drinks?: Array<{ drink_id: number; quantity: number }>,
 *   extra_services?: Array<{ price: number }>,
 *   discount?: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      accommodation_amount = 0,
      is_prepaid = false,
      services = {},
      drinks = [],
      extra_services = [],
      discount = 0,
    } = body;

    const pricing = await getPricing();

    // Fetch drink prices
    const drinkIds = drinks.map((d: any) => d.drink_id).filter(Boolean);
    let drinkPrices: Record<number, number> = {};
    if (drinkIds.length > 0) {
      const { data: drinkData } = await supabase.from('drinks').select('id, sold_price').in('id', drinkIds);
      (drinkData || []).forEach((d: any) => { drinkPrices[d.id] = d.sold_price || 0; });
    }

    // Calculate services total
    const sTotal =
      (services.lunch && !services.lunch.prepaid ? (services.lunch.count || 0) * pricing.lunch_price : 0) +
      (services.dinner && !services.dinner.prepaid ? (services.dinner.count || 0) * pricing.dinner_price : 0) +
      (services.guide ? (services.guide.price || 0) : 0) +
      (services.transport ? services.transport.reduce((s: number, t: any) => s + (t.price || 0), 0) : 0) +
      (services.laundry ? (services.laundry.price || 0) : 0) +
      (services.cooking ? (services.cooking.price || 0) : 0);

    // Calculate drinks total
    const dTotal = drinks.reduce((sum: number, d: any) => {
      const price = drinkPrices[d.drink_id] || 0;
      return sum + (d.quantity || 0) * price;
    }, 0);

    // Calculate extras total
    const eTotal = extra_services.reduce((sum: number, s: any) => sum + (parseFloat(s.price) || 0), 0);

    // Grand total
    const gTotal = Math.max(0, (is_prepaid ? 0 : accommodation_amount) + sTotal + dTotal + eTotal - discount);

    return NextResponse.json({
      accommodation: is_prepaid ? 0 : accommodation_amount,
      services: sTotal,
      drinks: dTotal,
      extras: eTotal,
      discount,
      total: gTotal,
      breakdown: {
        lunch: services.lunch ? (services.lunch.count || 0) * pricing.lunch_price : 0,
        dinner: services.dinner ? (services.dinner.count || 0) * pricing.dinner_price : 0,
        guide: services.guide ? services.guide.price || 0 : 0,
        transport: services.transport ? services.transport.reduce((s: number, t: any) => s + (t.price || 0), 0) : 0,
        laundry: services.laundry ? services.laundry.price || 0 : 0,
        cooking: services.cooking ? services.cooking.price || 0 : 0,
      },
      pricing,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
