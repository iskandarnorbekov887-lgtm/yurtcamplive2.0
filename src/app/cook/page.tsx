'use client';

import { useEffect, useState, useRef } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type MealRequest } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PrivateCalendarView } from '@/components/private-calendar-view';
import { CookProcurement } from '@/components/procurement/cook-procurement';
import { CookUsage } from '@/components/procurement/cook-usage';
import { InventoryDashboard } from '@/components/procurement/inventory-dashboard';

// Force dynamic rendering to avoid SSR issues with auth
export const dynamic = 'force-dynamic';

export default function CookPage() {
  return (
    <ProtectedRoute allowedRoles={['Cook', 'CEO']}>
      <CookPortal />
    </ProtectedRoute>
  );
}

function CookPortal() {
  const { user, signOut } = useAuth();
  console.log('Current User Role:', user?.role);
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mealRequests, setMealRequests] = useState<MealRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'procurement' | 'usage' | 'inventory' | 'schedule'>('orders');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [drinks, setDrinks] = useState<any[]>([]);
  const [showDrinkSelector, setShowDrinkSelector] = useState(false);

  const channelsRef = useRef<any[]>([]);
  const isStopping = useRef(false);

  const cleanupChannels = () => {
    channelsRef.current.forEach((ch) => {
      try { ch.unsubscribe(); } catch { /* ignore */ }
    });
    channelsRef.current = [];
  };

  useEffect(() => {
    cleanupChannels();
    isStopping.current = false;

    fetchData();

    // 15-second auto-refresh polling for kitchen view
    const pollTimer = setInterval(() => {
      if (!isStopping.current) fetchData();
    }, 15000);

    // Subscribe to real-time changes on relevant tables
    const tables = ['meal_requests', 'bookings', 'grocery_requests', 'drinks'];
    tables.forEach((table) => {
      const channel = supabase
        .channel(`cook-${table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          if (!isStopping.current) fetchData();
        })
        .subscribe((status: string, err?: any) => {
          if (err) console.warn(`Realtime ${table} error:`, err);
        });
      channelsRef.current.push(channel);
    });

    return () => {
      clearInterval(pollTimer);
      cleanupChannels();
    };
  }, []);

  // Helper: get local YYYY-MM-DD
  const getLocalDateStr = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // Helper: normalize any date value from Supabase to YYYY-MM-DD
  const normalizeDate = (d: string | Date | null) => {
    if (!d) return '';
    const s = typeof d === 'string' ? d : d.toISOString ? d.toISOString() : String(d);
    return s.split('T')[0];
  };

  const fetchData = async () => {
    if (isStopping.current) return;
    try {
      const today = getLocalDateStr();

      // Fetch bookings with joined meal_requests for schedule + orders
      const { data: bookingsData, error: bErr } = await supabase
        .from('bookings')
        .select('*, meal_requests(*)')
        .neq('status', 'cancelled');

      if (bErr?.code === '42501') {
        console.error('🚫 Cook 403 Forbidden detected. Stopping realtime.');
        isStopping.current = true;
        cleanupChannels();
        signOut();
        return;
      }

      const bookingsWithMeals = (bookingsData || []) as Booking[];
      setBookings(bookingsWithMeals);

      // Derive flat mealRequests from joined data — show all unserved meals
      const allMeals = bookingsWithMeals.flatMap((b) =>
        (b.meal_requests || []).map((m) => ({
          ...m,
          meal_date: normalizeDate(m.meal_date),
        }))
      );
      console.table(allMeals);
      const filteredMeals = allMeals.filter((m) => {
        const statusLower = (m.status || '').toLowerCase();
        return statusLower !== 'served';
      });
      console.log('🍳 Cook fetched meals (unserved):', filteredMeals);
      setMealRequests(filteredMeals);

      // Fetch Drinks for the selector
      const { data: drinkData } = await supabase.from('drinks').select('*').eq('available', true);
      setDrinks(drinkData || []);
    } catch (err) {
      console.error('Fetch failed:', err);
    }
  };


  // Helper: sync kitchen_orders JSON in bookings.special_requests with meal_requests status
  const syncKitchenOrdersJSON = async (bookingId: number, mealType: string, newStatus: string, mealId?: number) => {
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('special_requests')
        .eq('id', bookingId)
        .single();
      if (!booking) return;

      const meta = booking.special_requests
        ? (typeof booking.special_requests === 'string' ? JSON.parse(booking.special_requests) : booking.special_requests)
        : {};
      const orders = [...(meta.kitchen_orders || [])];
      const type = mealType.toLowerCase();
      // Match by meal_id if possible, fallback to type
      const existingIndex = orders.findIndex((o: any) => mealId ? o.meal_id === mealId : o.type === type);
      
      if (existingIndex !== -1) {
        orders[existingIndex].status = newStatus;
      } else {
        orders.push({ type, quantity: 0, status: newStatus, prepaid: false, guest_name: '', id: bookingId, meal_id: mealId, requested_at: new Date().toISOString() });
      }
      meta.kitchen_orders = orders;
      await supabase.from('bookings').update({ special_requests: JSON.stringify(meta) }).eq('id', bookingId);
    } catch (err) {
      console.error('Failed to sync kitchen_orders JSON:', err);
    }
  };

  const handleAcceptMeal = async (mealId: number) => {
    // Find the meal to get booking_id and meal_type before updating
    const meal = mealRequests.find(m => m.id === mealId);
    const { error } = await supabase.from('meal_requests').update({ status: 'Accepted' }).eq('id', mealId);
    if (error) {
      console.error('Accept meal failed:', error);
      if (error.code === '23514') {
        console.error('🚫 Constraint violation: DB rejected status "Accepted". Check meal_requests CHECK constraint.');
      }
      if (error.code === '42501' || error.message?.includes('403')) {
        console.warn('🚫 RLS Block: Cook cannot update meal_requests. Check RLS policy in Supabase.');
      }
      return;
    }
    // Sync the kitchen_orders JSON so Manager BookingModal updates instantly
    if (meal) {
      await syncKitchenOrdersJSON(meal.booking_id, meal.meal_type, 'confirmed', meal.id);
    }
    fetchData();
  };

  const handleMarkServed = async (mealId: number) => {
    try {
      const meal = mealRequests.find(m => m.id === mealId);
      await supabase.from('meal_requests').update({ status: 'Served' }).eq('id', mealId);
      if (meal) {
        await syncKitchenOrdersJSON(meal.booking_id, meal.meal_type, 'served', meal.id);
      }
      fetchData();
    } catch (err) {
      console.error('Mark served failed:', err);
    }
  };

  const handleAddDrink = async (drink: any) => {
    if (!selectedBooking) return;
    try {
      const currentTab = selectedBooking.drinks_tab || [];
      const nextTab = [...currentTab, { 
        drink_id: drink.id, 
        drink_name: drink.name, 
        quantity: 1, 
        price: drink.sold_price, 
        currency: drink.currency 
      }];
      
      await supabase.from('bookings').update({ 
        drinks_tab: nextTab 
      }).eq('id', selectedBooking.id);
      
      setSelectedBooking({ ...selectedBooking, drinks_tab: nextTab });
      fetchData();
    } catch (err) {
      console.error('Add drink failed:', err);
    }
  };

  const today = getLocalDateStr();
  const queueMeals = mealRequests;
  const pendingCount = queueMeals.filter(m => (m.status || '').toLowerCase() === 'pending').length;
  console.log('📅 Cook queue (all unserved) | queueMeals:', queueMeals.length, '| allMeals:', mealRequests.length);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-orange-700 to-amber-800 text-white shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-orange-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{t('portal.cook')}</h1>
              <p className="text-[10px] text-orange-200 font-bold tracking-widest uppercase opacity-80 italic">KITCHEN COMMAND CENTER</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <button onClick={signOut} className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg active:scale-95 flex items-center gap-2">
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 mb-8 p-1.5 bg-white rounded-[24px] shadow-sm border border-slate-100 max-w-2xl mx-auto overflow-x-auto">
          {(['orders', 'procurement', 'usage', 'inventory', 'schedule'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-2 rounded-[18px] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-orange-600 text-white shadow-lg shadow-orange-200' : 'text-slate-400 hover:text-slate-600'}`}>
              {tab === 'orders' ? '🍽️ Orders' : tab === 'procurement' ? '📋 Procurement' : tab === 'usage' ? '⚖️ Usage' : tab === 'inventory' ? '📦 Inventory' : '📅 Schedule'}
              {tab === 'orders' && pendingCount > 0 && <span className="ml-1 bg-white text-orange-600 px-1.5 py-0.5 rounded-full text-[10px]">{pendingCount}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Pending alert banner */}
            {pendingCount > 0 && (
              <div className="bg-rose-500 text-white p-5 rounded-[32px] flex items-center justify-between animate-pulse shadow-xl shadow-rose-200 border-4 border-rose-400">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center font-black text-2xl">🔔</div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Kitchen Priority Alert</p>
                    <p className="text-xl font-black">{pendingCount} New Meal Orders!</p>
                  </div>
                </div>
                <div className="text-[10px] font-black bg-white text-rose-600 px-4 py-1.5 rounded-full uppercase tracking-tighter">Action Required</div>
              </div>
            )}

            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <span className="p-2 bg-orange-100 text-orange-600 rounded-xl">🍽️</span>
              Upcoming Meals — {today} onwards
            </h2>

            {queueMeals.length === 0 ? (
              <div className="bg-white rounded-[32px] p-16 text-center shadow-xl border border-slate-100">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">👨‍🍳</div>
                <h3 className="text-xl font-bold text-slate-900">No Meals in Queue</h3>
                <p className="text-slate-500 mt-2">No upcoming meal requests from the Manager.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {(['Lunch', 'Dinner'] as const).map((mealType) => {
                  const typeMeals = queueMeals.filter(m => (m.meal_type || '').toLowerCase() === mealType.toLowerCase());
                  if (typeMeals.length === 0) return null;

                  const totalAdults = typeMeals.reduce((sum, m) => sum + m.adult_qty, 0);
                  const totalKids = typeMeals.reduce((sum, m) => sum + m.child_qty, 0);
                  const normalCount = typeMeals.filter(m => m.dietary_type === 'Normal').length;
                  const vegCount = typeMeals.filter(m => m.dietary_type === 'Vegetarian').length;

                  return (
                    <div key={mealType} className="bg-white rounded-[32px] p-6 shadow-xl border border-slate-100">
                      {/* Section header with totals */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-orange-100">
                            {mealType === 'Lunch' ? '🍱' : '🌙'}
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-slate-900">{mealType}</h3>
                            <p className="text-sm text-slate-500 font-bold">
                              {totalAdults} Adults · {totalKids} Kids
                              {normalCount > 0 && <span className="ml-2">🍖 {normalCount}</span>}
                              {vegCount > 0 && <span className="ml-2">🥗 {vegCount}</span>}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                          {typeMeals.length} order{typeMeals.length > 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Meal cards */}
                      <div className="space-y-3">
                        {typeMeals.map((meal) => {
                          const guest = bookings.find(b => b.id === meal.booking_id);
                          return (
                            <div key={meal.id} className={`rounded-2xl p-4 border-2 flex items-center justify-between transition-all ${
                              (meal.status || '').toLowerCase() === 'pending'
                                ? 'bg-rose-50 border-rose-100'
                                : 'bg-emerald-50 border-emerald-100'
                            }`}>
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner border-2 ${
                                  meal.dietary_type === 'Vegetarian'
                                    ? 'bg-green-100 border-green-200 text-green-700'
                                    : 'bg-amber-100 border-amber-200 text-amber-700'
                                }`}>
                                  {meal.dietary_type === 'Vegetarian' ? '🥗' : '🍖'}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">
                                    {guest?.guest_name || `Booking #${meal.booking_id}`}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-sm font-bold text-slate-600">
                                      {meal.adult_qty} Adults
                                    </span>
                                    {meal.child_qty > 0 && (
                                      <span className="text-sm font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-100">
                                        👶 {meal.child_qty} Kids
                                      </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                      (meal.status || '').toLowerCase() === 'pending'
                                        ? 'bg-rose-100 text-rose-600'
                                        : 'bg-emerald-100 text-emerald-600'
                                    }`}>
                                      {meal.status}
                                    </span>
                                  </div>
                                  {meal.notes && (
                                    <p className="text-xs text-slate-400 italic mt-1">{meal.notes}</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2">
                                {(meal.status || '').toLowerCase() === 'pending' && (
                                  <button
                                    onClick={() => handleAcceptMeal(meal.id)}
                                    className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 active:scale-95 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    Accept
                                  </button>
                                )}
                                {(meal.status || '').toLowerCase() === 'accepted' && (
                                  <button
                                    onClick={() => handleMarkServed(meal.id)}
                                    className="px-5 py-2.5 bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 active:scale-95 flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Mark Served
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 mb-6">
              <span className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">📅</span>
              Guest Schedule
            </h2>
            <PrivateCalendarView 
              bookings={bookings} 
              onSelectBooking={(b) => setSelectedBooking(b)} 
            />
          </div>
        )}

        {activeTab === 'procurement' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 mb-6">
              <span className="p-2 bg-orange-100 text-orange-600 rounded-xl">📋</span>
              Procurement
            </h2>
            <CookProcurement />
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 mb-6">
              <span className="p-2 bg-amber-100 text-amber-600 rounded-xl">⚖️</span>
              Daily Usage
            </h2>
            <CookUsage />
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 mb-6">
              <span className="p-2 bg-blue-100 text-blue-600 rounded-xl">📦</span>
              Inventory
            </h2>
            <InventoryDashboard />
          </div>
        )}
      </div>

      {/* Cook's Restricted Guest Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" onClick={() => { setSelectedBooking(null); setShowDrinkSelector(false); }}>
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
            <div className="bg-orange-600 px-8 py-6 text-white flex justify-between items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Guest View (Kitchen Restricted)</p>
                <h2 className="text-2xl font-black">{selectedBooking.guest_name}</h2>
              </div>
              <button onClick={() => { setSelectedBooking(null); setShowDrinkSelector(false); }} className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-xl font-bold transition-all">×</button>
            </div>
            
            <div className="p-8 space-y-6">
              {/* Meal Status Section */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kitchen Order Status</p>
                <div className="grid grid-cols-2 gap-3">
                  {['lunch', 'dinner'].map((meal) => {
                    const meta = typeof selectedBooking.special_requests === 'string' ? JSON.parse(selectedBooking.special_requests || '{}') : (selectedBooking.special_requests || {});
                    const order = (meta.kitchen_orders || []).find((o: any) => o.type === meal);
                    return (
                      <div key={meal} className={`p-4 rounded-2xl border-2 flex items-center justify-between ${order?.status === 'confirmed' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{meal === 'lunch' ? '🍱' : '🌙'}</span>
                            <span className="text-xs font-black uppercase tracking-tight">{meal}</span>
                          </div>
                          {order?.prepaid && (
                            <span className="text-[8px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase mt-1 self-start">✓ Prepaid</span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold uppercase">{order?.status || 'No Order'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Drink Functionality */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Beverage Service</p>
                  <button onClick={() => setShowDrinkSelector(!showDrinkSelector)} className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase hover:bg-indigo-100 transition-all">
                    {showDrinkSelector ? 'Close List' : '+ Add Drink'}
                  </button>
                </div>

                {showDrinkSelector ? (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {drinks.map(d => (
                      <button key={d.id} onClick={() => handleAddDrink(d)}
                        className="p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-xl text-left transition-all active:scale-95">
                        <p className="text-xs font-bold text-slate-800 truncate">{d.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{d.original_price} UZS</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    {selectedBooking.drinks_tab && (selectedBooking.drinks_tab as any[]).length > 0 ? (
                      <div className="space-y-2">
                        {(selectedBooking.drinks_tab as any[]).map((item: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-xs font-bold text-slate-600">
                            <span>{item.drink_name}</span>
                            <span>x{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-2">No drinks added yet</p>
                    )}
                  </div>
                )}
              </div>

              {/* Privacy Warning */}
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                <span className="text-lg">🔒</span>
                <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                  Financial details, notes, and other guest services are restricted to Management.
                  The Cook role is limited to meal management and drink logging only.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

