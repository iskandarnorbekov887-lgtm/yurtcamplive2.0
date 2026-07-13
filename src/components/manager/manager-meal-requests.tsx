'use client';

import { useState, useEffect } from 'react';
import { supabase, type Booking, type MealRequest } from '@/lib/supabase';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Utensils, Send, X, Bell, Zap, ChefHat, CheckCircle2 } from 'lucide-react';
import { RecipeDisplay } from '@/components/RecipeDisplay';

interface MealDraft {
  meal_date: string;
  meal_type: 'Lunch' | 'Dinner';
  adult_qty: number;
  child_qty: number;
  dietary_type: 'Normal' | 'Vegetarian';
  notes: string;
  sent: boolean;
}

interface ManagerMealRequestsProps {
  booking: Booking | null;
  onClose: () => void;
  onSent: () => void;
  teamId?: string;
  userRole?: string;
}

function normalizeDate(d: string | Date | null) {
  if (!d) return '';
  const s = typeof d === 'string' ? d : d.toISOString ? d.toISOString() : String(d);
  return s.split('T')[0];
}

const fetchMealStats = async (bookingId: number) => {
  const { data } = await supabase
    .from('meal_requests')
    .select('status')
    .eq('booking_id', bookingId);
  
  const stats = { accepted: 0, served: 0 };
  (data || []).forEach(m => {
    if (m.status === 'Accepted') stats.accepted++;
    else if (m.status === 'Served') stats.served++;
  });
  return stats;
};

export function ManagerMealRequests({ booking, onClose, onSent, teamId, userRole }: ManagerMealRequestsProps) {
  const [mealRequests, setMealRequests] = useState<MealRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [drinks, setDrinks] = useState<any[]>([]);
  const [selectedDrink, setSelectedDrink] = useState<number | null>(null);
  const [drinkQuantity, setDrinkQuantity] = useState(1);
  const [addedDrinks, setAddedDrinks] = useState<Array<{ drink_id: number; drink_name: string; quantity: number; price: number; currency: string }>>([]);
  const [mealDrafts, setMealDrafts] = useState<Record<string, { checked: boolean; adult_qty: number; child_qty: number; veg_adults_qty: number; veg_children_qty: number; dietary: 'Normal' | 'Vegetarian' }>>({});

  useEffect(() => {
    if (!booking) return;

    const channel = supabase
      .channel(`manager-meals-${booking.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'meal_requests',
        filter: `booking_id=eq.${booking.id}`
      }, () => {
        fetchMeals();
      })
      .subscribe();

    fetchMeals();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [booking]);

  useEffect(() => {
    supabase.from('drinks').select('*').eq('available', true).then(({ data }) => setDrinks(data || []));
  }, []);

  const fetchMeals = async () => {
    if (!booking) return;
    setLoading(true);
    const { data } = await supabase
      .from('meal_requests')
      .select('*')
      .eq('booking_id', booking.id)
      .order('meal_date', { ascending: true })
      .order('meal_type', { ascending: true });
    setMealRequests(data || []);
    setLoading(false);
  };

  const getStayDates = () => {
    if (!booking) return [];
    const dates = [];
    const current = new Date(booking.check_in);
    const end = new Date(booking.check_out);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const getMealForDate = (date: string, mealType: 'Lunch' | 'Dinner') => {
    return mealRequests.find(m => m.meal_date === date && m.meal_type === mealType && m.status !== 'Cancelled');
  };

  const handleSendMeal = async (date: string, mealType: 'Lunch' | 'Dinner', adultQty: number, childQty: number, vegAdultsQty: number, vegChildrenQty: number, dietary: 'Normal' | 'Vegetarian') => {
    if (!booking || (adultQty <= 0 && childQty <= 0)) return;
    const row = {
      booking_id: booking.id,
      meal_date: date,
      meal_type: mealType,
      adult_qty: adultQty,
      child_qty: childQty,
      vegetarian_qty: vegAdultsQty + vegChildrenQty,
      veg_adults_qty: vegAdultsQty,
      veg_children_qty: vegChildrenQty,
      dietary_type: dietary,
      notes: '',
      status: 'Pending',
      team_id: teamId,
    };

    const { data: existing } = await supabase
      .from('meal_requests')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('meal_date', date)
      .eq('meal_type', mealType)
      .neq('status', 'Cancelled')
      .maybeSingle();

    let error;
    if (existing) {
      const { error: updateError } = await supabase
        .from('meal_requests')
        .update({
          adult_qty: adultQty,
          child_qty: childQty,
          vegetarian_qty: vegAdultsQty + vegChildrenQty,
          veg_adults_qty: vegAdultsQty,
          veg_children_qty: vegChildrenQty,
          dietary_type: dietary,
        })
        .eq('id', existing.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('meal_requests').insert(row);
      error = insertError;
    }

    if (error) {
      console.error('Failed to send meal request:');
      console.error('message:', error?.message);
      console.error('details:', error?.details);
      console.error('hint:', error?.hint);
      console.error('code:', error?.code);
      return;
    }

    // Update bookings table with default_vegetarian_qty
    await supabase
      .from('bookings')
      .update({ default_vegetarian_qty: vegAdultsQty + vegChildrenQty })
      .eq('id', booking.id);

    // If this is Lunch, auto-apply the same vegetarian count to Dinner on the same day
    if (mealType === 'Lunch') {
      const { data: existingDinner } = await supabase
        .from('meal_requests')
        .select('*')
        .eq('booking_id', booking.id)
        .eq('meal_date', date)
        .eq('meal_type', 'Dinner')
        .single();

      if (existingDinner) {
        await supabase
          .from('meal_requests')
          .update({ vegetarian_qty: vegAdultsQty + vegChildrenQty, veg_adults_qty: vegAdultsQty, veg_children_qty: vegChildrenQty })
          .eq('id', existingDinner.id);
      }
    }

    await fetchMeals();
    setFlashMessage('✓ Sent to Kitchen');
    setTimeout(() => setFlashMessage(null), 2000);
    if (onSent) onSent();
  };

  const handleAddDrink = () => {
    if (!selectedDrink) return;
    const drink = drinks.find(d => d.id === selectedDrink);
    if (!drink) return;

    const existing = addedDrinks.find(d => d.drink_id === selectedDrink);
    if (existing) {
      setAddedDrinks(addedDrinks.map(d => d.drink_id === selectedDrink ? { ...d, quantity: d.quantity + drinkQuantity } : d));
    } else {
      setAddedDrinks([...addedDrinks, {
        drink_id: drink.id,
        drink_name: drink.name,
        quantity: drinkQuantity,
        price: drink.sold_price || drink.original_price,
        currency: drink.currency
      }]);
    }
    setSelectedDrink(null);
    setDrinkQuantity(1);
  };

  const handleRemoveDrink = (drinkId: number) => {
    setAddedDrinks(addedDrinks.filter(d => d.drink_id !== drinkId));
  };

  const handleCancel = async (meal: MealRequest) => {
    if (!booking) return;
    const confirmed = confirm(`Cancel this ${meal.meal_type} request for ${booking.guest_name}?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from('meal_requests')
      .update({ status: 'Cancelled' })
      .eq('id', meal.id);

    if (error) {
      console.error('Failed to cancel meal request:');
      console.error('message:', error?.message);
      console.error('details:', error?.details);
      console.error('hint:', error?.hint);
      console.error('code:', error?.code);
      return;
    }

    setFlashMessage('✓ Cancelled');
    setTimeout(() => setFlashMessage(null), 2000);
  };

  if (!booking) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1C232E] border border-[#5C4A2E]/30 shadow-[12px_12px_0px_0px_rgba(92,74,46,0.3)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-8 border-b border-[#2A2F36] bg-[#1C232E]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-black text-[#EDE6D6] uppercase tracking-tighter">
                {booking.guest_name}
              </h2>
              <p className="text-xs font-mono text-[#9C9384] mt-1">
                {booking.number_of_adults || 1} adult{((booking.number_of_adults || 1) > 1) ? 's' : ''}{booking.number_of_children ? `, ${booking.number_of_children} child${booking.number_of_children > 1 ? 'ren' : ''}` : ''}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 border border-[#2A2F36] flex items-center justify-center hover:bg-[#2A1518] transition-all text-[#EDE6D6]"
            >
              <X size={20} />
            </button>
          </div>

          {/* Day-by-Day Meals */}
          <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2">
            {getStayDates().map(date => (
              <div key={date} className="border border-[#2A2F36] rounded-xl p-4">
                <p className="text-xs font-black text-[#0B6E4F] uppercase tracking-widest mb-4">
                  {normalizeDate(date)}
                </p>
                
                {/* Lunch */}
                <div className="mb-4">
                  {(() => {
                    const existingMeal = getMealForDate(date, 'Lunch');
                    if (existingMeal) {
                      const status = existingMeal.status || 'Pending';
                      const statusColor = status === 'Pending' ? 'bg-[#9C9384]' : status === 'Accepted' ? 'bg-[#0B6E4F]' : status === 'Served' ? 'bg-[#3B82F6]' : 'bg-[#722F37]';
                      const canCancel = status === 'Pending' || userRole === 'CEO';
                      return (
                        <div className="bg-[#1C232E]/30 border border-[#2A2F36] rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black text-[#EDE6D6] uppercase">Lunch</span>
                              <span className="text-xs text-[#9C9384]">{existingMeal.adult_qty} adults, {existingMeal.child_qty} children ({existingMeal.dietary_type})</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white ${statusColor}`}>
                                {status}
                              </span>
                            </div>
                            {canCancel && (
                              <button
                                onClick={() => handleCancel(existingMeal)}
                                className="text-[10px] font-black text-[#722F37] uppercase tracking-wider hover:text-[#722F37]/80"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-[#1C232E]/50 border border-[#2A2F36] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={mealDrafts[`${date}-Lunch`]?.checked || false}
                              onChange={(e) => setMealDrafts(prev => ({
                                ...prev,
                                [`${date}-Lunch`]: {
                                  ...prev[`${date}-Lunch`],
                                  checked: e.target.checked,
                                  adult_qty: e.target.checked ? (booking.number_of_adults || 1) : 0,
                                  child_qty: e.target.checked ? (booking.number_of_children || 0) : 0,
                                  veg_adults_qty: e.target.checked ? (booking.default_vegetarian_qty || 0) : 0,
                                  veg_children_qty: 0,
                                  dietary: prev[`${date}-Lunch`]?.dietary || 'Normal'
                                }
                              }))}
                              className="w-4 h-4 rounded border-[#2A2F36] bg-[#1C232E] text-[#0B6E4F] focus:ring-[#0B6E4F]"
                            />
                            <span className="text-sm font-black text-[#EDE6D6] uppercase">Lunch</span>
                          </div>
                          <select
                            value={mealDrafts[`${date}-Lunch`]?.dietary || 'Normal'}
                            onChange={(e) => setMealDrafts(prev => ({
                              ...prev,
                              [`${date}-Lunch`]: {
                                ...prev[`${date}-Lunch`],
                                dietary: e.target.value as 'Normal' | 'Vegetarian'
                              }
                            }))}
                            disabled={!mealDrafts[`${date}-Lunch`]?.checked}
                            className="px-2 py-1 bg-[#1C232E] border border-[#2A2F36] text-[10px] font-black text-[#EDE6D6] outline-none appearance-none disabled:opacity-50"
                          >
                            <option value="Normal">Normal</option>
                            <option value="Vegetarian">Vegetarian</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <label className="text-[9px] font-black text-[#9C9384] uppercase tracking-widest">Adults</label>
                            <input
                              type="number"
                              min={0}
                              value={mealDrafts[`${date}-Lunch`]?.adult_qty || 0}
                              onChange={(e) => setMealDrafts(prev => ({
                                ...prev,
                                [`${date}-Lunch`]: {
                                  ...prev[`${date}-Lunch`],
                                  adult_qty: parseInt(e.target.value) || 0
                                }
                              }))}
                              disabled={!mealDrafts[`${date}-Lunch`]?.checked}
                              className="w-12 px-2 py-1 bg-[#1C232E] border border-[#2A2F36] text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-[9px] font-black text-[#9C9384] uppercase tracking-widest">Children</label>
                            <input
                              type="number"
                              min={0}
                              value={mealDrafts[`${date}-Lunch`]?.child_qty || 0}
                              onChange={(e) => setMealDrafts(prev => ({
                                ...prev,
                                [`${date}-Lunch`]: {
                                  ...prev[`${date}-Lunch`],
                                  child_qty: parseInt(e.target.value) || 0
                                }
                              }))}
                              disabled={!mealDrafts[`${date}-Lunch`]?.checked}
                              className="w-12 px-2 py-1 bg-[#1C232E] border border-[#2A2F36] text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                            />
                          </div>
                          {mealDrafts[`${date}-Lunch`]?.dietary === 'Vegetarian' && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex items-center gap-1">
                                <label className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-widest">Veg Adults</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={mealDrafts[`${date}-Lunch`]?.adult_qty || 0}
                                  value={mealDrafts[`${date}-Lunch`]?.veg_adults_qty || 0}
                                  onChange={(e) => setMealDrafts(prev => ({
                                    ...prev,
                                    [`${date}-Lunch`]: {
                                      ...prev[`${date}-Lunch`],
                                      veg_adults_qty: Math.min(prev[`${date}-Lunch`]?.adult_qty || 0, parseInt(e.target.value) || 0)
                                    }
                                  }))}
                                  disabled={!mealDrafts[`${date}-Lunch`]?.checked}
                                  className="w-12 px-2 py-1 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                                />
                              </div>
                              {(booking.number_of_children || 0) > 0 && (
                                <div className="flex items-center gap-1">
                                  <label className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-widest">Veg Children</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={mealDrafts[`${date}-Lunch`]?.child_qty || 0}
                                    value={mealDrafts[`${date}-Lunch`]?.veg_children_qty || 0}
                                    onChange={(e) => setMealDrafts(prev => ({
                                      ...prev,
                                      [`${date}-Lunch`]: {
                                        ...prev[`${date}-Lunch`],
                                        veg_children_qty: Math.min(prev[`${date}-Lunch`]?.child_qty || 0, parseInt(e.target.value) || 0)
                                      }
                                    }))}
                                    disabled={!mealDrafts[`${date}-Lunch`]?.checked}
                                    className="w-12 px-2 py-1 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => {
                              const entry = mealDrafts[`${date}-Lunch`];
                              console.log('Lunch Send clicked:', { date, entry });
                              if (entry?.checked && (entry.adult_qty > 0 || entry.child_qty > 0)) {
                                handleSendMeal(date, 'Lunch', entry.adult_qty, entry.child_qty, entry.veg_adults_qty, entry.veg_children_qty, entry.dietary);
                                setMealDrafts(prev => ({ ...prev, [`${date}-Lunch`]: { checked: false, adult_qty: 0, child_qty: 0, veg_adults_qty: 0, veg_children_qty: 0, dietary: 'Normal' } }));
                              }
                            }}
                            className="px-3 py-1 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-wider border border-[#0B6E4F]/40 hover:bg-[#0B6E4F]/80 transition-all"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Dinner */}
                <div>
                  {(() => {
                    const existingMeal = getMealForDate(date, 'Dinner');
                    if (existingMeal) {
                      const status = existingMeal.status || 'Pending';
                      const statusColor = status === 'Pending' ? 'bg-[#9C9384]' : status === 'Accepted' ? 'bg-[#0B6E4F]' : status === 'Served' ? 'bg-[#3B82F6]' : 'bg-[#722F37]';
                      const canCancel = status === 'Pending' || userRole === 'CEO';
                      return (
                        <div className="bg-[#1C232E]/30 border border-[#2A2F36] rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black text-[#EDE6D6] uppercase">Dinner</span>
                              <span className="text-xs text-[#9C9384]">{existingMeal.adult_qty} adults, {existingMeal.child_qty} children ({existingMeal.dietary_type})</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white ${statusColor}`}>
                                {status}
                              </span>
                            </div>
                            {canCancel && (
                              <button
                                onClick={() => handleCancel(existingMeal)}
                                className="text-[10px] font-black text-[#722F37] uppercase tracking-wider hover:text-[#722F37]/80"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-[#1C232E]/50 border border-[#2A2F36] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={mealDrafts[`${date}-Dinner`]?.checked || false}
                              onChange={(e) => setMealDrafts(prev => ({
                                ...prev,
                                [`${date}-Dinner`]: {
                                  ...prev[`${date}-Dinner`],
                                  checked: e.target.checked,
                                  adult_qty: e.target.checked ? (booking.number_of_adults || 1) : 0,
                                  child_qty: e.target.checked ? (booking.number_of_children || 0) : 0,
                                  veg_adults_qty: e.target.checked ? (booking.default_vegetarian_qty || 0) : 0,
                                  veg_children_qty: 0,
                                  dietary: prev[`${date}-Dinner`]?.dietary || 'Normal'
                                }
                              }))}
                              className="w-4 h-4 rounded border-[#2A2F36] bg-[#1C232E] text-[#0B6E4F] focus:ring-[#0B6E4F]"
                            />
                            <span className="text-sm font-black text-[#EDE6D6] uppercase">Dinner</span>
                          </div>
                          <select
                            value={mealDrafts[`${date}-Dinner`]?.dietary || 'Normal'}
                            onChange={(e) => setMealDrafts(prev => ({
                              ...prev,
                              [`${date}-Dinner`]: {
                                ...prev[`${date}-Dinner`],
                                dietary: e.target.value as 'Normal' | 'Vegetarian'
                              }
                            }))}
                            disabled={!mealDrafts[`${date}-Dinner`]?.checked}
                            className="px-2 py-1 bg-[#1C232E] border border-[#2A2F36] text-[10px] font-black text-[#EDE6D6] outline-none appearance-none disabled:opacity-50"
                          >
                            <option value="Normal">Normal</option>
                            <option value="Vegetarian">Vegetarian</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <label className="text-[9px] font-black text-[#9C9384] uppercase tracking-widest">Adults</label>
                            <input
                              type="number"
                              min={0}
                              value={mealDrafts[`${date}-Dinner`]?.adult_qty || 0}
                              onChange={(e) => setMealDrafts(prev => ({
                                ...prev,
                                [`${date}-Dinner`]: {
                                  ...prev[`${date}-Dinner`],
                                  adult_qty: parseInt(e.target.value) || 0
                                }
                              }))}
                              disabled={!mealDrafts[`${date}-Dinner`]?.checked}
                              className="w-12 px-2 py-1 bg-[#1C232E] border border-[#2A2F36] text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-[9px] font-black text-[#9C9384] uppercase tracking-widest">Children</label>
                            <input
                              type="number"
                              min={0}
                              value={mealDrafts[`${date}-Dinner`]?.child_qty || 0}
                              onChange={(e) => setMealDrafts(prev => ({
                                ...prev,
                                [`${date}-Dinner`]: {
                                  ...prev[`${date}-Dinner`],
                                  child_qty: parseInt(e.target.value) || 0
                                }
                              }))}
                              disabled={!mealDrafts[`${date}-Dinner`]?.checked}
                              className="w-12 px-2 py-1 bg-[#1C232E] border border-[#2A2F36] text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                            />
                          </div>
                          {mealDrafts[`${date}-Dinner`]?.dietary === 'Vegetarian' && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex items-center gap-1">
                                <label className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-widest">Veg Adults</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={mealDrafts[`${date}-Dinner`]?.adult_qty || 0}
                                  value={mealDrafts[`${date}-Dinner`]?.veg_adults_qty || 0}
                                  onChange={(e) => setMealDrafts(prev => ({
                                    ...prev,
                                    [`${date}-Dinner`]: {
                                      ...prev[`${date}-Dinner`],
                                      veg_adults_qty: Math.min(prev[`${date}-Dinner`]?.adult_qty || 0, parseInt(e.target.value) || 0)
                                    }
                                  }))}
                                  disabled={!mealDrafts[`${date}-Dinner`]?.checked}
                                  className="w-12 px-2 py-1 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                                />
                              </div>
                              {(booking.number_of_children || 0) > 0 && (
                                <div className="flex items-center gap-1">
                                  <label className="text-[9px] font-black text-[#0B6E4F] uppercase tracking-widest">Veg Children</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={mealDrafts[`${date}-Dinner`]?.child_qty || 0}
                                    value={mealDrafts[`${date}-Dinner`]?.veg_children_qty || 0}
                                    onChange={(e) => setMealDrafts(prev => ({
                                      ...prev,
                                      [`${date}-Dinner`]: {
                                        ...prev[`${date}-Dinner`],
                                        veg_children_qty: Math.min(prev[`${date}-Dinner`]?.child_qty || 0, parseInt(e.target.value) || 0)
                                      }
                                    }))}
                                    disabled={!mealDrafts[`${date}-Dinner`]?.checked}
                                    className="w-12 px-2 py-1 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 text-xs font-mono text-[#EDE6D6] outline-none disabled:opacity-50"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => {
                              const entry = mealDrafts[`${date}-Dinner`];
                              console.log('Dinner Send clicked:', { date, entry });
                              if (entry?.checked && (entry.adult_qty > 0 || entry.child_qty > 0)) {
                                handleSendMeal(date, 'Dinner', entry.adult_qty, entry.child_qty, entry.veg_adults_qty, entry.veg_children_qty, entry.dietary);
                                setMealDrafts(prev => ({ ...prev, [`${date}-Dinner`]: { checked: false, adult_qty: 0, child_qty: 0, veg_adults_qty: 0, veg_children_qty: 0, dietary: 'Normal' } }));
                              }
                            }}
                            className="px-3 py-1 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-wider border border-[#0B6E4F]/40 hover:bg-[#0B6E4F]/80 transition-all"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>

          {/* Drinks Section */}
          <div className="mt-6 bg-[#1C232E]/50 border border-[#2A2F36] rounded-xl p-4">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-3">Drinks</p>
            <div className="flex gap-2 mb-3">
              <select
                value={selectedDrink || ''}
                onChange={(e) => setSelectedDrink(e.target.value ? parseInt(e.target.value) : null)}
                className="flex-1 px-3 py-2 bg-[#1C232E] border border-[#2A2F36] text-xs font-black text-[#EDE6D6] outline-none appearance-none"
              >
                <option value="">Select drink...</option>
                {drinks.map(drink => (
                  <option key={drink.id} value={drink.id}>{drink.name} ({drink.currency} {drink.sold_price || drink.original_price})</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={drinkQuantity}
                onChange={(e) => setDrinkQuantity(parseInt(e.target.value) || 1)}
                className="w-16 px-3 py-2 bg-[#1C232E] border border-[#2A2F36] text-xs font-mono text-[#EDE6D6] outline-none"
              />
              <button
                onClick={handleAddDrink}
                disabled={!selectedDrink}
                className="px-4 py-2 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-wider border border-[#0B6E4F]/40 hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            {addedDrinks.length > 0 && (
              <div className="space-y-2">
                {addedDrinks.map(drink => (
                  <div key={drink.drink_id} className="flex items-center justify-between text-sm">
                    <span className="text-[#EDE6D6]">{drink.drink_name} × {drink.quantity}</span>
                    <button
                      onClick={() => handleRemoveDrink(drink.drink_id)}
                      className="text-[#722F37] text-[10px] font-black uppercase tracking-wider hover:text-[#722F37]/80"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 border-t border-[#2A2F36] bg-[#1C232E]">
          <button
            onClick={onClose}
            className="w-full py-4 bg-[#1C232E] text-[#EDE6D6] border border-[#2A2F36] font-black uppercase tracking-[0.2em] text-xs hover:bg-[#2A1518] transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
