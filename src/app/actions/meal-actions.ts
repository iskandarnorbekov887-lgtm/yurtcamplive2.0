'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

const MOCK_RECIPES: Record<string, Array<{ item_name: string; qty: number }>> = {
  'Lunch': [
    { item_name: 'Rice', qty: 0.2 }, // kg per person
    { item_name: 'Meat', qty: 0.15 },
    { item_name: 'Oil', qty: 0.05 },
  ],
  'Dinner': [
    { item_name: 'Flour', qty: 0.1 },
    { item_name: 'Potato', qty: 0.2 },
    { item_name: 'Meat', qty: 0.1 },
  ]
};

export async function processMealRequest(mealId: number, orderId?: string) {
  const supabase = await createClient();
  try {
    console.log(`🛠️ processMealRequest: Attempting lookup with ID=${mealId}, OID=${orderId || 'NONE'}`);
    
    let query = supabase.from('meal_requests').select('*, bookings(*)');
    if (orderId) {
      query = query.eq('order_id', orderId);
    } else {
      query = query.eq('id', mealId);
    }
    
    const { data: meal, error: mealErr } = await query.single();

    if (mealErr || !meal) {
      console.error(`❌ processMealRequest: Not found! ID=${mealId}, OID=${orderId || 'NONE'}. Error:`, mealErr);
      throw new Error('Meal request not found in database');
    }
    const booking = meal.bookings;
    if (!booking) throw new Error('Booking not found');

    // 2. Generate Unique Order ID
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    const newOrderId = `ORD-${timestamp}-${random}`;

    // 3. Billing Logic
    // Requirement: If the booking is NOT marked as "Prepaid," add the cost of the meal
    const isBookingPrepaid = booking.is_prepaid || booking.payment_status === 'paid';

    if (!isBookingPrepaid) {
      // Fetch pricing
      const { data: pricing } = await supabase.from('service_pricing').select('*').eq('id', 1).single();
      const pricePerMeal = meal.meal_type === 'Lunch' 
        ? (pricing?.lunch_price || 10) 
        : (pricing?.dinner_price || 10);
      
      const totalCost = (meal.adult_qty + meal.child_qty) * pricePerMeal;

      // Add to guest's tab (total_price)
      const currentAmount = parseFloat(booking.total_price || 0);
      const { error: billingErr } = await supabase
        .from('bookings')
        .update({ total_price: currentAmount + totalCost })
        .eq('id', booking.id);

      if (billingErr) console.error('Billing update failed:', billingErr);
    }

    // 4. Inventory Logic (Recipe Deduction)
    const recipe = MOCK_RECIPES[meal.meal_type] || [];
    const totalPeople = meal.adult_qty + meal.child_qty;

    for (const ingredient of recipe) {
      const requiredQty = ingredient.qty * totalPeople;
      
      // Fetch current stock
      const { data: invItem } = await supabase
        .from('inventory_items')
        .select('id, current_stock')
        .eq('item_name', ingredient.item_name)
        .single();

      if (invItem) {
        const newStock = Math.max(0, invItem.current_stock - requiredQty);
        await supabase
          .from('inventory_items')
          .update({ current_stock: newStock })
          .eq('id', invItem.id);
        
        // Log to ledger
        await supabase.from('inventory_ledger').insert({
          item_id: invItem.id,
          type: 'OUT',
          qty: requiredQty,
          unit: 'kg', // assume kg for now
          reason: `Meal Request ${meal.order_id || newOrderId}`,
          created_at: new Date().toISOString()
        });
      }
    }

    // 5. Update Meal Request
    const { error: updateErr } = await supabase
      .from('meal_requests')
      .update({ 
        status: 'Accepted'
      })
      .eq(meal.order_id ? 'order_id' : 'id', meal.order_id || meal.id);

    if (updateErr) throw updateErr;

    revalidatePath('/cook');
    revalidatePath('/manager');
    
    return { success: true, orderId: meal.order_id || newOrderId };
  } catch (err: any) {
    console.error('processMealRequest failed:', err);
    return { success: false, error: err.message };
  }
}
