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

  const fetchData = async (): Promise<void> => {
    try {
      const [
        { data: bookingsData },
        { data: notifData },
      ] = await Promise.all([
        supabase.from('bookings').select('*, meal_requests(*)'),
        supabase
          .from('notifications')
          .select('*')
          .or(`user_id.eq.${currentUserId || ''},and(target_role.eq.${userRole || ''},user_id.is.null)`)
          .order('created_at', { ascending: false }),
      ]);

      setBookings(bookingsData || []);
      setNotifications((notifData || []).slice(0, 20));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-noir-950 text-white font-sans selection:bg-electric-blue/30">
      
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 glass-card border-x-0 border-t-0 rounded-none bg-noir-950/80">
        <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              <LayoutDashboard className="text-electric-blue" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight">{t('portal.manager')}</h1>
              <p className="text-[9px] text-slate-500 font-bold tracking-[0.3em] uppercase">Executive Operations HUD</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <LanguageSwitcher variant="dark" />
            
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all relative"
              >
                <Bell size={20} className="text-slate-400" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-14 w-80 z-50">
                   <ManagerNotifications
                     notifications={notifications}
                     setNotifications={setNotifications}
                     bookings={bookings}
                     onUpdateBooking={async (id, data) => { 
                       console.log("Update triggered for:", id, data);
                     }}
                     onRefresh={fetchData}
                     onClose={() => setShowNotifications(false)}
                   />
                </div>
              )}
            </div>

            <button onClick={signOut} className="flex items-center gap-2 px-4 py-2 bg-rose-600/10 border border-rose-600/20 text-rose-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">
              <LogOut size={14} />
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main className="max-w-7xl mx-auto p-8 flex gap-8">
        
        {/* Sidebar Navigation */}
        <aside className="w-64 space-y-2 shrink-0">
          {[
            { id: 'checkin', label: 'Calendar', icon: Calendar },
            { id: 'meals', label: 'Meals', icon: Utensils },
            { id: 'procurement', label: 'Logistics', icon: ShoppingBag },
            { id: 'inventory', label: 'Stores', icon: Box },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                activeTab === item.id 
                  ? 'bg-electric-blue text-white shadow-xl shadow-blue-900/20' 
                  : 'text-slate-500 hover:bg-white/5'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}

          <div className="mt-12 pt-12 border-t border-white/5 space-y-4">
             <a href="/financials" className="block px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/5 border border-emerald-500/10 transition-all text-center">
               💰 Fiscal Recording
             </a>
          </div>
        </aside>

        {/* Workspace */}
        <section className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'checkin' && (
                <div className="glass-card rounded-[48px] p-8">
                  <GoogleGuestAgenda
                    bookings={bookings}
                    userRole={userRole}
                    currentUserId={currentUserId}
                    onCheckIn={() => {}}
                    onCheckOut={() => {}}
                    onUpdateBooking={async (id, data) => { 
                      console.log("Update triggered for:", id, data);
                    }}
                    onCancelBooking={() => {}}
                    onAddNewBooking={(data: any) => {
                      setSelectedBookingDate(data.check_in || '');
                      setShowIncomeForm(true);
                    }}
                    onRefresh={fetchData}
                  />
                </div>
              )}

              {activeTab === 'meals' && (
                <div className="space-y-6">
                   <h2 className="text-3xl font-black uppercase tracking-tight">Catering Orchestration</h2>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {bookings.filter(b => b.status === 'checked_in' || b.status === 'confirmed').map(b => (
                       <div key={b.id} className="glass-card p-8 rounded-[40px] border border-white/5 hover:border-orange-500/30 transition-all group">
                         <div className="flex justify-between items-start mb-6">
                           <div>
                             <h3 className="text-lg font-black uppercase tracking-tight">{b.guest_name}</h3>
                             <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">{b.check_in} → {b.check_out}</p>
                           </div>
                           <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] font-black text-slate-400 uppercase">{b.status}</span>
                         </div>
                         <button
                           onClick={() => setSelectedMealBooking(b)}
                           className="w-full py-4 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all"
                         >
                           Manage Meal Protocol
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
        </section>
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
