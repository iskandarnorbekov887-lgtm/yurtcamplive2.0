'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PrivateCalendarView } from '@/components/private-calendar-view';

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
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'grocery' | 'schedule'>('orders');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [drinks, setDrinks] = useState<any[]>([]);
  const [showDrinkSelector, setShowDrinkSelector] = useState(false);
  
  // Grocery State
  const [groceryItems, setGroceryItems] = useState<Array<{ name: string; qty: string; unit: string; purchased: boolean; received: boolean }>>([]);
  const [groceryStatus, setGroceryStatus] = useState<'none' | 'requested' | 'purchased' | 'received'>('none');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000); // 3s Polling for "Real-time" feel
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Cook visibility: See all guests with pending kitchen orders or active status
      const { data: bookingsData } = await supabase.from('bookings').select('*, special_requests').neq('status', 'cancelled');
      
      const sanitized = (bookingsData || []).map((b: Booking) => ({
        ...b,
        special_requests: b.special_requests 
          ? (typeof b.special_requests === 'string' ? JSON.parse(b.special_requests) : b.special_requests) 
          : { kitchen_orders: [] }
      }));

      setBookings(sanitized);
      console.log('Sanitized Bookings for Cook:', sanitized.map((b: Booking) => b.special_requests));
      
      // Fetch Drinks for the selector
      const { data: drinkData } = await supabase.from('drinks').select('*').eq('available', true);
      setDrinks(drinkData || []);
    } catch (err) {
      console.error('Fetch failed:', err);
    }

    // Fetch latest grocery request
    const { data: groceryData } = await supabase.from('grocery_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (groceryData) {
      setGroceryItems(groceryData.items || []);
      setGroceryStatus(groceryData.status);
    }
  };

  const handleAcceptOrder = async (booking: Booking, mealType: 'lunch' | 'dinner') => {
    try {
      // Fetch latest to prevent overwriting other fields (like draft or days)
      const { data: latest } = await supabase
        .from('bookings')
        .select('special_requests')
        .eq('id', booking.id)
        .single();

      const meta = latest?.special_requests 
        ? (typeof latest.special_requests === 'string' ? JSON.parse(latest.special_requests) : latest.special_requests)
        : {};
      
      const orders = (meta.kitchen_orders || []).map((o: any) => 
        o.type === mealType ? { ...o, status: 'confirmed', accepted_at: new Date().toISOString() } : o
      );
      await supabase.from('bookings').update({
        special_requests: JSON.stringify({ ...meta, kitchen_orders: orders })
      }).eq('id', booking.id);
      fetchData();
    } catch (err) {
      console.error('Accept order failed:', err);
    }
  };

  const handleSendGrocery = async () => {
    setLoading(true);
    const { error } = await supabase.from('grocery_requests').insert([{
      items: groceryItems,
      status: 'requested',
      created_by_id: user?.id
    }]);
    if (!error) {
      setGroceryStatus('requested');
      setLoading(false);
    }
  };

  const handleVerifyItem = async (index: number) => {
    const newItems = [...groceryItems];
    newItems[index].received = !newItems[index].received;
    setGroceryItems(newItems);
  };

  const handleFinalizeGrocery = async () => {
    setLoading(true);
    // 1. Mark as received
    await supabase.from('grocery_requests')
      .update({ status: 'received', items: groceryItems })
      .eq('status', 'purchased'); // Update the active one
    
    // 2. Record as expense (Data Finalization)
    const totalItems = groceryItems.length;
    if (totalItems > 0) {
      await supabase.from('expenses').insert(groceryItems.map(item => ({
        category: 'Kitchen',
        item_name: item.name,
        quantity: parseFloat(item.qty) || 1,
        unit_price: 0, // Manager will fill price later or we just log the event
        total_amount: 0,
        created_by: user?.id
      })));
    }
    
    setGroceryStatus('received');
    setGroceryItems([]);
    setLoading(false);
    fetchData();
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

  const kitchenOrders = bookings.flatMap(b => {
    try {
      const meta = typeof b.special_requests === 'string' 
        ? JSON.parse(b.special_requests || '{}') 
        : (b.special_requests || {});
      
      const orders = (meta.kitchen_orders || []).map((o: any) => ({ 
        ...o, 
        bookingId: b.id, 
        guestName: b.guest_name, 
        booking: b 
      }));
      return orders;
    } catch (e) { 
      console.error('Failed to parse kitchen orders for booking:', b.id, e);
      return []; 
    }
  });

  const pendingOrders = kitchenOrders.filter(o => o.status === 'pending');

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
        <div className="flex gap-2 mb-8 p-1.5 bg-white rounded-[24px] shadow-sm border border-slate-100 max-w-lg mx-auto">
          {(['orders', 'schedule', 'grocery'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-orange-600 text-white shadow-lg shadow-orange-200' : 'text-slate-400 hover:text-slate-600'}`}>
              {tab === 'orders' ? 'Order Queue' : tab === 'schedule' ? 'Guest Schedule' : 'Grocery Flow'}
              {tab === 'orders' && pendingOrders.length > 0 && <span className="ml-2 bg-white text-orange-600 px-1.5 py-0.5 rounded-full text-[10px]">{pendingOrders.length}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {pendingOrders.length > 0 && (
              <div className="bg-rose-500 text-white p-5 rounded-[32px] flex items-center justify-between animate-pulse shadow-xl shadow-rose-200 border-4 border-rose-400">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center font-black text-2xl">🔔</div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Kitchen Priority Alert</p>
                    <p className="text-xl font-black">{pendingOrders.length} New Orders Received!</p>
                  </div>
                </div>
                <div className="text-[10px] font-black bg-white text-rose-600 px-4 py-1.5 rounded-full uppercase tracking-tighter">Action Required</div>
              </div>
            )}

            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <span className="p-2 bg-orange-100 text-orange-600 rounded-xl">🍽️</span>
              Active Kitchen Queue
            </h2>

            {pendingOrders.length === 0 ? (
              <div className="bg-white rounded-[32px] p-16 text-center shadow-xl border border-slate-100">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">👨‍🍳</div>
                <h3 className="text-xl font-bold text-slate-900">Queue is Clear</h3>
                <p className="text-slate-500 mt-2">No new requests from the Manager right now.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pendingOrders.map((order, idx) => (
                  <div key={idx} className="bg-white rounded-[32px] p-8 shadow-md border border-slate-100 flex items-center justify-between group hover:shadow-xl hover:border-orange-200 transition-all duration-300">
                    <div className="flex items-center gap-8">
                      <div className="relative">
                        <div className="w-20 h-20 bg-orange-50 rounded-3xl flex items-center justify-center text-4xl shadow-inner border border-orange-100 group-hover:scale-110 transition-transform">
                          {order.type === 'lunch' ? '🍱' : '🌙'}
                        </div>
                        <div className="absolute -top-2 -right-2 bg-rose-500 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-4 border-white">!</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">{order.type} request</span>
                          <span className="text-[10px] font-bold text-slate-400">⏱️ {new Date(order.requested_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mt-2">{order.guestName}</h3>
                        <p className="text-slate-500 font-bold mt-1">Requested Portions: <span className="text-orange-600 text-2xl ml-1">{order.quantity}</span></p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleAcceptOrder(order.booking, order.type)}
                      className="px-10 py-5 bg-emerald-500 text-white rounded-3xl font-black uppercase tracking-widest text-xs hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-100 active:scale-95 flex items-center gap-3 group/btn"
                    >
                      <svg className="w-5 h-5 group-hover/btn:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      Accept & Confirm
                    </button>
                  </div>
                ))}
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

        {activeTab === 'grocery' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <span className="p-2 bg-blue-100 text-blue-600 rounded-xl">🛒</span>
              Grocery Workflow
            </h2>

            {groceryStatus === 'none' && (
              <div className="bg-white rounded-[32px] p-8 shadow-xl border border-slate-100">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-6">Create Request List</h3>
                <div className="space-y-4">
                  {groceryItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2" style={{animationDelay: `${idx*50}ms`}}>
                      <input type="text" placeholder="Item (e.g. Beef)" value={item.name} onChange={e => {
                        const next = [...groceryItems]; next[idx].name = e.target.value; setGroceryItems(next);
                      }} className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-500 outline-none" />
                      <input type="text" placeholder="Qty" value={item.qty} onChange={e => {
                        const next = [...groceryItems]; next[idx].qty = e.target.value; setGroceryItems(next);
                      }} className="w-20 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-500 outline-none" />
                      <input type="text" placeholder="Unit" value={item.unit} onChange={e => {
                        const next = [...groceryItems]; next[idx].unit = e.target.value; setGroceryItems(next);
                      }} className="w-20 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-900 focus:border-blue-500 outline-none" />
                      <button onClick={() => setGroceryItems(groceryItems.filter((_, i) => i !== idx))} className="w-12 bg-rose-50 text-rose-600 rounded-xl font-black hover:bg-rose-100">×</button>
                    </div>
                  ))}
                  <button onClick={() => setGroceryItems([...groceryItems, { name: '', qty: '', unit: 'kg', purchased: false, received: false }])}
                    className="w-full py-4 border-2 border-dashed border-slate-200 text-slate-400 rounded-2xl font-black hover:bg-slate-50 transition-all">+ Add Item</button>
                  
                  <button onClick={handleSendGrocery} disabled={groceryItems.length === 0 || loading}
                    className="w-full py-5 bg-blue-600 text-white rounded-[24px] text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">
                    {loading ? 'Sending...' : 'Send Grocery List to Manager'}
                  </button>
                </div>
              </div>
            )}

            {groceryStatus === 'requested' && (
              <div className="bg-white rounded-[32px] p-12 text-center shadow-xl border border-slate-100">
                <div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl">⏳</div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Sent to Manager</h3>
                <p className="text-slate-500 mt-2 max-w-xs mx-auto">Waiting for the Manager to purchase items and mark the list as ready.</p>
                <div className="mt-8 space-y-2 text-left max-w-sm mx-auto">
                  {groceryItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between py-2 border-b border-slate-50 text-sm font-bold text-slate-600">
                      <span>{item.name}</span>
                      <span>{item.qty} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groceryStatus === 'purchased' && (
              <div className="bg-white rounded-[32px] p-8 shadow-xl border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Verify Receiving</h3>
                    <p className="text-slate-500 text-xs font-bold">Check items as you physically receive them</p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase">Purchased by Manager</span>
                </div>

                <div className="space-y-3 mb-8">
                  {groceryItems.map((item, idx) => (
                    <button key={idx} onClick={() => handleVerifyItem(idx)}
                      className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${item.received ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-white border-slate-100 text-slate-600'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${item.received ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'}`}>
                          {item.received ? '✓' : ''}
                        </div>
                        <span className="text-lg font-black">{item.name}</span>
                      </div>
                      <span className="text-sm font-bold opacity-60">{item.qty} {item.unit}</span>
                    </button>
                  ))}
                </div>

                <button onClick={handleFinalizeGrocery} 
                  disabled={groceryItems.some(i => !i.received) || loading}
                  className="w-full py-5 bg-emerald-600 text-white rounded-[24px] text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50">
                  {loading ? 'Finalizing...' : 'All Received & Confirmed'}
                </button>
              </div>
            )}

            {groceryStatus === 'received' && (
              <div className="bg-white rounded-[32px] p-12 text-center shadow-xl border border-slate-100">
                <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 text-5xl">✅</div>
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Workflow Complete</h3>
                <p className="text-slate-500 mt-2">All items have been verified and recorded to the financial ledger.</p>
                <button onClick={() => { setGroceryStatus('none'); setGroceryItems([]); }}
                  className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest">Start New Request</button>
              </div>
            )}
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

