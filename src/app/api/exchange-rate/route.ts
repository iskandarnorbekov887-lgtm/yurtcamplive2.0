import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch('https://cbu.uz/en/arkhiv-kursov-valyut/json/all/', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`CBU API returned ${response.status}`);
    }

    const data = await response.json();

    // Extract USD and EUR rates from the response
    const usdData = data.find((item: any) => item.Ccy === 'USD');
    const eurData = data.find((item: any) => item.Ccy === 'EUR');

    if (!usdData || !eurData) {
      throw new Error('USD or EUR rate not found in CBU response');
    }

    // Calculate actual rate: Rate / Nominal (Nominal represents the unit amount)
    const usdRate = parseFloat(usdData.Rate) / (parseFloat(usdData.Nominal) || 1);
    const eurRate = parseFloat(eurData.Rate) / (parseFloat(eurData.Nominal) || 1);

    return NextResponse.json({
      USD: usdRate,
      EUR: eurRate,
    });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return NextResponse.json(
      { error: 'Could not fetch rate, please enter manually' },
      { status: 500 }
    );
  }
}
