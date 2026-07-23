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
import { DrinksPOS } from '@/components/DrinksPOS';
import { motion, AnimatePresence } from 'framer-motion';
import { Utensils, ShoppingBag, Scale, Box, Calendar, LogOut, Bell, Zap, ChefHat, Wine } from 'lucide-react';
import { processMealRequest } from '@/app/actions/meal-actions';
import { RecipeDisplay } from '@/components/RecipeDisplay';

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
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mealRequests, setMealRequests] = useState<MealRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'procurement' | 'usage' | 'inventory' | 'schedule' | 'pos'>('orders');
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

    const pollTimer = setInterval(() => {
      if (!isStopping.current) fetchData();
    }, 15000);

    const tables = ['meal_requests', 'bookings', 'grocery_requests', 'drinks'];
    tables.forEach((table) => {
      const channel = supabase
        .channel(`cook-${table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          if (!isStopping.current) fetchData();
        })
        .subscribe();
      channelsRef.current.push(channel);
    });

    return () => {
      clearInterval(pollTimer);
      cleanupChannels();
    };
  }, []);

  const getLocalDateStr = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const normalizeDate = (d: string | Date | null) => {
    if (!d) return '';
    const s = typeof d === 'string' ? d : d.toISOString ? d.toISOString() : String(d);
    return s.split('T')[0];
  };

  const fetchData = async () => {
    if (isStopping.current) return;
    try {
      const { data: bookingsData, error: bErr } = await supabase
        .from('bookings')
        .select('*, meal_requests(*)')
        .neq('status', 'cancelled');

      if (bErr?.code === '42501') {
        isStopping.current = true;
        cleanupChannels();
        signOut();
        return;
      }

      const bookingsWithMeals = (bookingsData || []) as Booking[];
      setBookings(bookingsWithMeals);

      const allMeals = bookingsWithMeals.flatMap((b) =>
        (b.meal_requests || []).map((m) => ({
          ...m,
          meal_date: normalizeDate(m.meal_date),
        }))
      );
      
      const filteredMeals = allMeals.filter((m) => {
        const statusLower = (m.status || '').toLowerCase();
        return statusLower !== 'served' && statusLower !== 'cancelled';
      });
      setMealRequests(filteredMeals);

      const { data: drinkData } = await supabase.from('drinks').select('*').order('name');
      setDrinks(drinkData || []);
    } catch (err) {
      console.error('Fetch failed:', err);
    }
  };

  // legacy JSON sync removed

  const handleAcceptMeal = async (meal: MealRequest) => {
    // Optimistic Update
    setMealRequests(prev => prev.map(m => m.id === meal.id ? { ...m, status: 'Accepted' } : m));
    
    const res = await processMealRequest(meal.id, meal.order_id);
    if (!res.success) {
      console.error('Accept failed:', res.error);
      fetchData(); // Rollback/Refresh
      return;
    }
    fetchData();
  };

  const handleMarkServed = async (meal: MealRequest) => {
    try {
      // Optimistic Update
      setMealRequests(prev => prev.map(m => m.id === meal.id ? { ...m, status: 'Served' } : m));

      const { error } = await supabase.from('meal_requests')
        .update({ status: 'Served' })
        .eq(meal.order_id ? 'order_id' : 'id', meal.order_id || meal.id);
      
      if (error) throw error;
      
      // Legacy JSON sync removed
      fetchData();
    } catch (err) {
      console.error('Mark served failed:', err);
      fetchData();
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
      
      const payloadToSave = { drinks_tab: nextTab } as any;
      delete payloadToSave.meta;






      delete payloadToSave.last_edited_by_id;
      delete payloadToSave.days;
      await supabase.from('bookings').update(payloadToSave).eq('id', selectedBooking.id);
      
      setSelectedBooking({ ...selectedBooking, drinks_tab: nextTab });
      fetchData();
    } catch (err) {
      console.error('Add drink failed:', err);
    }
  };

  const today = getLocalDateStr();
  const queueMeals = mealRequests.filter(m => m.meal_date === today);
  const upcomingMeals = mealRequests.filter(m => m.meal_date > today);
  const pendingCount = queueMeals.filter(m => (m.status || '').toLowerCase() === 'pending').length;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0F1419] text-[#EDE6D6] font-sans">
      
      {/* ── Sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 bg-[#1C232E] border-r border-[#5C4A2E]/30 shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 bg-[#0B6E4F]/20 rounded-xl flex items-center justify-center border border-[#0B6E4F]/30">
              <ChefHat className="text-[#0B6E4F]" size={20} />
            </div>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-tight text-[#EDE6D6]">{t('portal.cook')}</h1>
              <p className="text-[10px] text-[#9C9384] font-medium tracking-widest uppercase">Kitchen Command</p>
            </div>
          </div>

          <nav className="space-y-1">
            {[
              { id: 'orders', label: 'Queue', icon: Utensils, count: pendingCount },
              { id: 'procurement', label: 'Requests', icon: ShoppingBag },
              { id: 'usage', label: 'Weighing', icon: Scale },
              { id: 'inventory', label: 'Stores', icon: Box },
              { id: 'pos', label: 'Drinks POS', icon: Wine },
              { id: 'schedule', label: 'Calendar', icon: Calendar },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === item.id 
                    ? 'bg-[#0B6E4F] text-[#C9A227] shadow-sm' 
                    : 'text-[#9C9384] hover:bg-[#2A1518] hover:text-[#EDE6D6]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon size={14} />
                  {item.label}
                </div>
                {item.count ? (
                  <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded text-[9px] font-bold">
                    {item.count}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-[#5C4A2E]/30">
           <button 
             onClick={signOut} 
             className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#2A1518]/50 border border-[#5C4A2E]/30 text-[#9C9384] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#722F37]/20 hover:text-[#722F37] hover:border-[#722F37]/30 transition-all"
           >
             <LogOut size={12} />
             {t('btn.logout')}
           </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 relative overflow-y-auto bg-[#0F1419]">
        
        {/* Top Bar */}
        <div className="sticky top-0 z-30 px-8 py-4 flex justify-between items-center bg-[#1C232E]/80 backdrop-blur-sm border-b border-[#5C4A2E]/30">
          <div className="text-xs font-bold text-[#9C9384] uppercase tracking-widest">
            {activeTab === 'orders' ? 'Kitchen Queue' : activeTab === 'procurement' ? 'Supply Requests' : activeTab === 'usage' ? 'Weighing Station' : activeTab === 'inventory' ? 'Stores' : activeTab === 'pos' ? 'Drinks POS' : 'Calendar'}
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="dark" />
            <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#1C232E] border border-[#5C4A2E]/30 shadow-sm">
               <Zap className={pendingCount > 0 ? "text-[#722F37] animate-pulse" : "text-[#0B6E4F]"} size={16} />
            </div>
          </div>
        </div>

        <div className="max-w-full md:max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {activeTab === 'orders' && (
                <div className="space-y-8">
                  {/* Header */}
                  <div className="flex justify-between items-end">
                    <div>
                      <h2 className="text-2xl font-bold text-[#EDE6D6]">Kitchen Queue</h2>
                      <p className="text-xs text-[#9C9384] font-medium uppercase tracking-widest mt-1">Live Production Line</p>
                    </div>
                    <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-lg px-4 py-2 shadow-sm">
                      <span className="font-data text-sm text-[#EDE6D6]">{today}</span>
                    </div>
                  </div>

                  {/* Pending Alert */}
                  {pendingCount > 0 && (
                    <div className="bg-[#1C232E] border border-[#722F37]/40 p-6 rounded-lg shadow-sm flex items-center gap-6">
                      <div className="w-12 h-12 bg-[#722F37]/20 rounded-lg flex items-center justify-center border border-[#722F37]/40">
                        <Bell className="text-[#722F37] animate-bounce" size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#722F37] uppercase tracking-widest mb-0.5">Critical Kitchen Alert</p>
                        <p className="text-lg font-bold text-[#EDE6D6]"><span className="font-data text-2xl">{pendingCount}</span> Orders Awaiting Approval</p>
                      </div>
                    </div>
                  )}

                  {/* Order Cards */}
                  {queueMeals.length === 0 ? (
                    <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-lg p-16 text-center shadow-sm">
                      <Utensils className="mx-auto mb-4 text-[#9C9384]" size={48} />
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[#9C9384]">No Meals in Queue</h3>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {(['Lunch', 'Dinner'] as const).map((mealType) => {
                        const typeMeals = queueMeals.filter(m => (m.meal_type || '').toLowerCase() === mealType.toLowerCase());
                        if (typeMeals.length === 0) return null;

                        return (
                          <div key={mealType} className="space-y-4">
                            <div className="flex items-center gap-3">
                              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{mealType} Service</h3>
                              <div className="flex-1 h-px bg-slate-200" />
                              <span className="text-xs font-data text-slate-400">{typeMeals.length}</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {typeMeals.map((meal) => {
                                const guest = bookings.find(b => b.id === meal.booking_id);
                                const isPending = (meal.status || '').toLowerCase() === 'pending';
                                return (
                                  <div 
                                    key={meal.order_id || meal.id} 
                                    className="bg-[#1C232E] border border-[#5C4A2E]/30 p-6 shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)] transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)] flex flex-col"
                                  >
                                    <div className="flex justify-between items-start mb-4 border-b border-[#5C4A2E]/30 pb-2">
                                      <div className="font-mono text-[10px] font-black text-[#EDE6D6] uppercase tracking-tighter bg-[#1C232E]/50 border border-[#5C4A2E]/20 px-2 py-1 rounded shadow-inner">
                                         BID: {meal.booking_id} <br/>
                                         OID: {meal.order_id || 'LEGACY'}
                                      </div>
                                      <span className={`px-2 py-0.5 border border-[#5C4A2E]/30 text-[9px] font-black uppercase tracking-widest ${
                                        isPending ? 'bg-[#B8860B] text-[#1C232E]' : 'bg-[#0B6E4F] text-[#C9A227]'
                                      }`}>
                                        {meal.status}
                                      </span>
                                    </div>

                                    <div className="flex-1 flex flex-col justify-center items-center py-6">
                                       <p className="text-[10px] font-black text-[#9C9384] uppercase mb-2 tracking-[0.2em]">
                                          {guest?.guest_name || 'GUEST'}
                                       </p>
                                       <h3 className="text-2xl font-black text-[#EDE6D6] uppercase tracking-widest border-y border-[#5C4A2E]/30 py-2 w-full text-center">
                                          {meal.meal_type}
                                       </h3>
                                       <p className="text-[10px] font-black text-[#9C9384] uppercase mt-2 tracking-[0.3em]">
                                          {meal.dietary_type}
                                       </p>

                                       <div className="w-full">
                                          <RecipeDisplay 
                                            mealType={meal.meal_type} 
                                            count={meal.adult_qty + meal.child_qty} 
                                            isManager={false}
                                            orderId={meal.order_id}
                                          />
                                          <div className="mt-2 space-y-1">
                                            <p className="text-[9px] font-bold text-[#EDE6D6]">
                                              Normal: {(meal.adult_qty + meal.child_qty - (meal.vegetarian_qty || 0))}
                                            </p>
                                            <p className="text-[9px] font-bold text-[#0B6E4F]">
                                              Vegetarian: {meal.vegetarian_qty || 0}
                                            </p>
                                          </div>
                                       </div>
                                    </div>

                                    {isPending ? (
                                      <button 
                                        onClick={() => handleAcceptMeal(meal)} 
                                        className="w-full py-2.5 bg-black text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all border border-black active:translate-x-[1px] active:translate-y-[1px] font-mono"
                                      >
                                        Accept Order {meal.order_id && `[${meal.order_id}]`}
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => handleMarkServed(meal)} 
                                        className="w-full py-2.5 bg-[#1C232E] text-[#EDE6D6] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#2A1518] transition-all border border-[#5C4A2E]/30 active:translate-x-[1px] active:translate-y-[1px] font-mono"
                                      >
                                        Mark Served {meal.order_id && `[${meal.order_id}]`}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Upcoming Requests */}
                  {upcomingMeals.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Upcoming Requests</h3>
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-xs font-data text-slate-400">{upcomingMeals.length}</span>
                      </div>
                      <div className="bg-[#1C232E]/50 border border-[#5C4A2E]/20 rounded-lg p-4">
                        <div className="space-y-3">
                          {Array.from(new Set(upcomingMeals.map(m => m.meal_date))).sort().map((date) => {
                            const dateMeals = upcomingMeals.filter(m => m.meal_date === date);
                            return (
                              <div key={date} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">{date}</span>
                                  <span className="text-[9px] font-data text-[#9C9384]">{dateMeals.length} meals</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {dateMeals.map((meal) => (
                                    <div key={meal.order_id || meal.id} className="bg-[#1C232E] border border-[#5C4A2E]/20 p-3 rounded text-xs">
                                      <div className="flex justify-between items-center">
                                        <span className="font-bold text-[#EDE6D6]">{meal.meal_type}</span>
                                        <span className="text-[9px] text-[#9C9384]">{meal.status}</span>
                                      </div>
                                      <div className="mt-1 text-[9px] text-[#9C9384]">
                                        {meal.adult_qty + meal.child_qty} total ({meal.vegetarian_qty || 0} veg)
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'schedule' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-[#EDE6D6]">Guest Schedule</h2>
                  <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-lg p-6 shadow-sm">
                    <PrivateCalendarView bookings={bookings} onSelectBooking={(b) => setSelectedBooking(b)} />
                  </div>
                </div>
              )}

              {activeTab === 'procurement' && <CookProcurement />}
              {activeTab === 'usage' && <CookUsage />}
              {activeTab === 'inventory' && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-[#EDE6D6]">Stores Inventory</h2>
                  <InventoryDashboard />
                </div>
              )}
              {activeTab === 'pos' && <DrinksPOS drinks={drinks} onSale={fetchData} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ── Guest Modal ── */}
      <AnimatePresence>
        {selectedBooking && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedBooking(null)} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }} className="relative w-full max-w-lg bg-[#1C232E] rounded-xl p-8 border border-[#5C4A2E]/30 shadow-xl">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">Guest Profile (Restricted)</p>
                    <h2 className="text-xl font-bold text-[#EDE6D6]">{selectedBooking.guest_name}</h2>
                 </div>
                 <button onClick={() => setSelectedBooking(null)} className="w-8 h-8 bg-[#2A1518]/50 rounded-lg flex items-center justify-center hover:bg-[#2A1518] transition-all text-lg text-[#9C9384]">×</button>
              </div>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['lunch', 'dinner'].map((meal) => {
                    const order = mealRequests.find((m) => m.booking_id === selectedBooking.id && (m.meal_type || '').toLowerCase() === meal);
                    const isConfirmed = order?.status === 'Accepted' || order?.status === 'Served';
                    return (
                      <div key={meal} className={`p-4 rounded-lg border transition-all ${isConfirmed ? 'bg-[#0B6E4F]/20 border-[#0B6E4F]/40 text-[#0B6E4F]' : 'bg-[#1C232E]/50 border-[#5C4A2E]/30 text-[#9C9384]'}`}>
                         <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{meal === 'lunch' ? '🍱' : '🌙'}</span>
                            <span className="text-xs font-bold uppercase tracking-tight">{meal}</span>
                         </div>
                         <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{order?.status || 'No Order'}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-[#9C9384] uppercase tracking-widest">Beverage Tab</p>
                    <button onClick={() => setShowDrinkSelector(!showDrinkSelector)} className="px-3 py-1.5 bg-[#1C232E]/50 rounded-lg text-[10px] font-bold uppercase hover:bg-[#2A1518] transition-all border border-[#5C4A2E]/30 text-[#9C9384]">
                      {showDrinkSelector ? 'Close' : '+ Log Drink'}
                    </button>
                  </div>

                  {showDrinkSelector ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-40 overflow-y-auto">
                      {drinks.map(d => (
                        <button key={d.id} onClick={() => handleAddDrink(d)} className="p-3 bg-[#1C232E] hover:bg-[#0B6E4F]/20 border border-[#5C4A2E]/30 hover:border-[#0B6E4F]/40 rounded-lg text-left transition-all group">
                          <p className="text-xs font-bold text-[#EDE6D6] group-hover:text-[#0B6E4F] transition-colors">{d.name}</p>
                          <p className="text-[10px] text-[#9C9384] font-data mt-0.5">{d.sold_price} UZS</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#1C232E]/50 rounded-lg p-4 border border-[#5C4A2E]/30">
                      {selectedBooking.drinks_tab && (selectedBooking.drinks_tab as any[]).length > 0 ? (
                        <div className="space-y-2">
                          {(selectedBooking.drinks_tab as any[]).map((item: any, i: number) => (
                            <div key={i} className="flex justify-between items-center text-sm">
                              <span className="text-[#EDE6D6]">{item.drink_name}</span>
                              <span className="font-data text-[#EDE6D6]">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#9C9384] text-center">No drinks logged</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3 p-4 bg-[#B8860B]/10 border border-[#B8860B]/30 rounded-lg">
                   <Bell className="text-[#B8860B] shrink-0" size={16} />
                   <p className="text-[10px] text-[#B8860B] font-medium leading-relaxed">
                      Logistics Lockdown: Sensitive financial data is hidden. You can only manage meals and log beverages.
                   </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
