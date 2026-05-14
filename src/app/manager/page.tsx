'use client';

import { useEffect, useState, useRef } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type Notification } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { GoogleGuestAgenda } from '@/components/google-guest-agenda';
import { ManagerIncomeForm } from '@/components/manager-income-form';
import { ManagerNotifications } from '@/components/manager/manager-notifications';
import { ManagerProcurement } from '@/components/procurement/manager-procurement';
import { InventoryDashboard } from '@/components/procurement/inventory-dashboard';
import { ManagerMealRequests } from '@/components/manager/manager-meal-requests';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, ShoppingBag, Box, Bell, LogOut, Utensils, Calendar } from 'lucide-react';

import type { UserRole } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default function ManagerPage() {
  return (
    <ProtectedRoute allowedRoles={['Manager', 'CEO']}>
      <ManagerPortal />
    </ProtectedRoute>
  );
}

function ManagerPortal() {
  const { user, signOut } = useAuth();
  const currentUserId = user?.id;
  const userRole = user?.role as UserRole;
  const { t } = useLanguage();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<'checkin' | 'meals' | 'procurement' | 'inventory'>('checkin');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [selectedBookingDate, setSelectedBookingDate] = useState('');
  const [selectedMealBooking, setSelectedMealBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fetchData = async (): Promise<void> => {
    try {
      const [
        { data: bookingsData },
        { data: notifData },
      ] = await Promise.all([
        supabase.from('bookings').select('*, meal_requests(*), payments(*)').order('check_in', { ascending: false }),
        supabase
          .from('notifications')
          .select('*')
          .filter('user_id', 'eq', currentUserId || '00000000-0000-0000-0000-000000000000') // Use a dummy UUID if missing
          .order('created_at', { ascending: false })
      ]);

      setBookings(bookingsData || []);
      setNotifications((notifData || []).slice(0, 20));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    
    // Real-time listeners
    const bookingsChannel = supabase
      .channel('manager-bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchData())
      .subscribe();
      
    const mealsChannel = supabase
      .channel('manager-meals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_requests' }, () => fetchData())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(mealsChannel);
    };
  }, []);

  const checkedInCount = bookings.filter(b => b.status === 'checked_in').length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-zinc-950 font-sans">
      
      {/* ── Sidebar ── */}
      <motion.aside 
        initial={false}
        animate={{ width: isCollapsed ? 80 : 256 }}
        className="hidden md:flex flex-col bg-white border-r border-slate-200 shadow-sm relative transition-all duration-300 ease-in-out"
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-zinc-950 hover:border-emerald-500 transition-all z-50 shadow-sm"
        >
          <motion.div animate={{ rotate: isCollapsed ? 180 : 0 }}>
            <Calendar size={12} className="rotate-90" />
          </motion.div>
        </button>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-8 overflow-hidden">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex-shrink-0 flex items-center justify-center border border-emerald-200">
              <LayoutDashboard className="text-emerald-700" size={20} />
            </div>
            {!isCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="text-sm font-bold uppercase tracking-tight text-zinc-950 whitespace-nowrap">{t('portal.manager')}</h1>
                <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase whitespace-nowrap">Operations HUD</p>
              </motion.div>
            )}
          </div>

          <nav className="space-y-1">
            {[
              { id: 'checkin', label: 'Calendar', icon: Calendar },
              { id: 'meals', label: 'Meals', icon: Utensils },
              { id: 'procurement', label: 'Logistics', icon: ShoppingBag },
              { id: 'inventory', label: 'Stores', icon: Box },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === item.id 
                    ? 'bg-emerald-700 text-white shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-zinc-950'
                } ${isCollapsed ? 'justify-center' : ''}`}
              >
                <item.icon size={18} className="flex-shrink-0" />
                {!isCollapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap">
                    {item.label}
                  </motion.span>
                )}
              </button>
            ))}
            {userRole === 'CEO' && (
              <a
                href="/ceo"
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-xs font-black uppercase tracking-[0.2em] bg-zinc-950 text-white shadow-lg shadow-zinc-200 mt-4 hover:bg-zinc-800 transition-all border border-white/10 ${isCollapsed ? 'justify-center' : ''}`}
              >
                <LayoutDashboard size={18} className="text-emerald-400 flex-shrink-0" />
                {!isCollapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap text-[10px]">
                    CEO Executive
                  </motion.span>
                )}
              </a>
            )}
          </nav>
        </div>

        <div className={`mt-auto p-6 border-t border-slate-100 space-y-3 ${isCollapsed ? 'items-center flex flex-col' : ''}`}>
           <a 
             href="/financials" 
             title={isCollapsed ? "Fiscal Recording" : undefined}
             className={`block p-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all text-center ${isCollapsed ? 'w-full flex justify-center' : ''}`}
           >
             {isCollapsed ? "💰" : "💰 Fiscal Recording"}
           </a>
           <button 
             onClick={signOut} 
             title={isCollapsed ? t('btn.logout') : undefined}
             className={`w-full flex items-center justify-center gap-2 p-3 bg-slate-50 border border-slate-200 text-slate-500 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all`}
           >
             <LogOut size={18} className="flex-shrink-0" />
             {!isCollapsed && <span className="whitespace-nowrap">{t('btn.logout')}</span>}
           </button>
        </div>
      </motion.aside>

      {/* ── Main Content ── */}
      <main className="flex-1 relative overflow-y-auto bg-slate-50">
        
        {/* Top Bar */}
        <div className="sticky top-0 z-30 px-8 py-4 flex justify-between items-center bg-white backdrop-blur-sm border-b border-black">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {activeTab === 'checkin' ? 'Guest Calendar' : activeTab === 'meals' ? 'Catering' : activeTab === 'procurement' ? 'Logistics' : 'Stores'}
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="light" />
            
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all relative"
              >
                <Bell size={16} className="text-slate-400" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <ManagerNotifications
                  notifications={notifications}
                  setNotifications={setNotifications}
                  bookings={bookings}
                  onUpdateBooking={async (id, data) => {
                    const { error } = await supabase.from('bookings').update(data).eq('id', id);
                    if (error) console.error(error);
                    await fetchData();
                  }}
                  onRefresh={fetchData}
                  onClose={() => setShowNotifications(false)}
                />
              )}
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-8 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {activeTab === 'checkin' && (
                <div className="bento-card p-6">
                  <GoogleGuestAgenda
                    bookings={bookings}
                    userRole={userRole}
                    currentUserId={currentUserId}
                    onCheckIn={async (id) => {
                      const { error } = await supabase.from('bookings').update({ status: 'checked_in' }).eq('id', id);
                      if (error) console.error(error);
                      await fetchData();
                    }}
                    onCheckOut={async (id) => {
                      const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
                      if (error) console.error(error);
                      await fetchData();
                    }}
                    onUpdateBooking={async (id, data) => {
                      const { error } = await supabase.from('bookings').update(data).eq('id', id);
                      if (error) {
                        console.error('Update Error:', error.message, error.details);
                        alert(`Database Error: ${error.message}`);
                      }
                      await fetchData();
                    }}
                    onCancelBooking={async (id) => {
                      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
                      if (error) console.error(error);
                      await fetchData();
                    }}
                    onAddNewBooking={(data: any) => {
                      setSelectedBookingDate(data.check_in || '');
                      setShowIncomeForm(true);
                    }}
                    onRefresh={fetchData}
                  />
                </div>
              )}

              {activeTab === 'meals' && (
                <div className="space-y-8">
                   <div className="flex justify-between items-end">
                      <div>
                        <h2 className="text-2xl font-bold text-zinc-950">Catering Orchestration</h2>
                        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">Active Kitchen Protocols</p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm flex items-center gap-2">
                        <span className="font-data text-lg text-zinc-950">{checkedInCount}</span>
                        <span className="text-xs text-slate-400 font-medium">Guests In House</span>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                     {bookings.filter(b => b.status === 'checked_in' || b.status === 'confirmed').map(b => (
                       <div 
                         key={b.id} 
                         className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-all group"
                       >
                         <div className="flex justify-between items-start mb-4">
                           <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center border border-emerald-200 text-emerald-700">
                             <Utensils size={16} />
                           </div>
                           <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                             b.status === 'checked_in' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'
                           }`}>
                             {b.status === 'checked_in' ? 'LIVE' : b.status}
                           </span>
                         </div>

                         <h3 className="text-sm font-bold text-zinc-950 mb-1 group-hover:text-emerald-700 transition-colors">{b.guest_name}</h3>
                         <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-medium uppercase tracking-widest mb-4">
                           <Calendar size={10} />
                           <span className="font-data text-zinc-950">{new Date(b.check_in).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                           <span>→</span>
                           <span className="font-data text-zinc-950">{new Date(b.check_out).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                         </div>

                         <button
                           onClick={() => setSelectedMealBooking(b)}
                           className="w-full py-2.5 bg-slate-50 border border-slate-200 text-zinc-950 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 hover:text-white hover:border-emerald-700 transition-all"
                         >
                           Manage Protocol
                         </button>
                       </div>
                     ))}
                   </div>
                </div>
              )}

              {activeTab === 'procurement' && <ManagerProcurement />}
              {activeTab === 'inventory' && <InventoryDashboard />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <ManagerMealRequests
        booking={selectedMealBooking}
        onClose={() => setSelectedMealBooking(null)}
        onSent={fetchData}
      />

      <ManagerIncomeForm
        isOpen={showIncomeForm}
        selectedDate={selectedBookingDate}
        onClose={() => setShowIncomeForm(false)}
        onSuccess={() => {
          setShowIncomeForm(false);
          fetchData();
        }}
      />
    </div>
  );
}
