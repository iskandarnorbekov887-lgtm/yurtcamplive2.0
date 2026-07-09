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
    <div className="flex h-screen overflow-hidden bg-[#0F1419] text-[#EDE6D6] font-sans">
      
      {/* ── Sidebar ── */}
      <motion.aside 
        initial={false}
        animate={{ width: isCollapsed ? 80 : 256 }}
        className="hidden md:flex flex-col bg-[#1C232E] border-r border-[#5C4A2E]/30 shadow-lg relative transition-all duration-300 ease-in-out"
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-full flex items-center justify-center text-[#9C9384] hover:text-[#C9A227] hover:border-[#C9A227] transition-all z-50 shadow-lg"
        >
          <motion.div animate={{ rotate: isCollapsed ? 180 : 0 }}>
            <Calendar size={12} className="rotate-90" />
          </motion.div>
        </button>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-8 overflow-hidden">
            <div className="w-10 h-10 bg-[#0B6E4F]/20 rounded-xl flex-shrink-0 flex items-center justify-center border border-[#0B6E4F]/40">
              <LayoutDashboard className="text-[#0B6E4F]" size={20} />
            </div>
            {!isCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h1 className="text-sm font-bold uppercase tracking-tight text-[#EDE6D6] whitespace-nowrap font-heading">{t('portal.manager')}</h1>
                <p className="text-[10px] text-[#9C9384] font-medium tracking-widest uppercase whitespace-nowrap">Operations HUD</p>
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
                    ? 'bg-[#0B6E4F] text-[#C9A227] shadow-lg' 
                    : 'text-[#9C9384] hover:bg-[#2A1518] hover:text-[#EDE6D6]'
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
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-xs font-black uppercase tracking-[0.2em] bg-[#2A1518] text-[#C9A227] shadow-lg mt-4 hover:bg-[#3A1F22] transition-all border border-[#5C4A2E]/30 ${isCollapsed ? 'justify-center' : ''}`}
              >
                <LayoutDashboard size={18} className="text-[#C9A227] flex-shrink-0" />
                {!isCollapsed && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="whitespace-nowrap text-[10px]">
                    CEO Executive
                  </motion.span>
                )}
              </a>
            )}
          </nav>
        </div>

        <div className={`mt-auto p-6 border-t border-[#5C4A2E]/30 space-y-3 ${isCollapsed ? 'items-center flex flex-col' : ''}`}>
           <a 
             href="/financials" 
             title={isCollapsed ? "Fiscal Recording" : undefined}
             className={`block p-3 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#0B6E4F] bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 hover:bg-[#0B6E4F]/20 transition-all text-center ${isCollapsed ? 'w-full flex justify-center' : ''}`}
           >
             {isCollapsed ? "💰" : "💰 Fiscal Recording"}
           </a>
           <button 
             onClick={signOut} 
             title={isCollapsed ? t('btn.logout') : undefined}
             className={`w-full flex items-center justify-center gap-2 p-3 bg-[#2A1518]/50 border border-[#5C4A2E]/30 text-[#9C9384] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#2A1518] hover:text-[#EDE6D6] hover:border-[#C9A227] transition-all`}
           >
             <LogOut size={18} className="flex-shrink-0" />
             {!isCollapsed && <span className="whitespace-nowrap">{t('btn.logout')}</span>}
           </button>
        </div>
      </motion.aside>

      {/* ── Main Content ── */}
      <main className="flex-1 relative overflow-y-auto bg-[#0F1419]">
        
        {/* Top Bar */}
        <div className="sticky top-0 z-30 px-8 py-4 flex justify-between items-center bg-[#1C232E] backdrop-blur-sm border-b border-[#5C4A2E]/30">
          <div className="text-xs font-bold text-[#9C9384] uppercase tracking-widest">
            {activeTab === 'checkin' ? 'Guest Calendar' : activeTab === 'meals' ? 'Catering' : activeTab === 'procurement' ? 'Logistics' : 'Stores'}
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="light" />
            
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#1C232E] border border-[#5C4A2E]/30 hover:bg-[#2A1518] shadow-lg transition-all relative"
              >
                <Bell size={16} className="text-[#9C9384]" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#722F37] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
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
                    const payloadToSave = { ...data } as any;
                    delete payloadToSave.meta;






                    delete payloadToSave.last_edited_by_id;
                    delete payloadToSave.days;
                    const { error } = await supabase.from('bookings').update(payloadToSave).eq('id', id);
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
                <div className="classic-card p-6">
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
                      const payloadToSave = { ...data } as any;
                      delete payloadToSave.meta;






                      delete payloadToSave.last_edited_by_id;
                      const { error } = await supabase.from('bookings').update(payloadToSave).eq('id', id);
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
                        <h2 className="text-2xl font-bold text-[#EDE6D6] font-heading">Catering Orchestration</h2>
                        <p className="text-xs text-[#9C9384] font-medium uppercase tracking-widest mt-1">Active Kitchen Protocols</p>
                      </div>
                      <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-lg px-4 py-2 shadow-lg flex items-center gap-2">
                        <span className="font-data text-lg text-[#EDE6D6]">{checkedInCount}</span>
                        <span className="text-xs text-[#9C9384] font-medium">Guests In House</span>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                     {bookings.filter(b => b.status === 'checked_in' || b.status === 'confirmed').map(b => (
                       <div 
                         key={b.id} 
                         className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-lg p-6 shadow-lg hover:shadow-xl transition-all group"
                       >
                         <div className="flex justify-between items-start mb-4">
                           <div className="w-9 h-9 bg-[#0B6E4F]/20 rounded-lg flex items-center justify-center border border-[#0B6E4F]/40 text-[#0B6E4F]">
                             <Utensils size={16} />
                           </div>
                           <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                             b.status === 'checked_in' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' : 'bg-[#2A1518]/20 text-[#9C9384]'
                           }`}>
                             {b.status === 'checked_in' ? 'LIVE' : b.status}
                           </span>
                         </div>

                         <h3 className="text-sm font-bold text-[#EDE6D6] mb-1 group-hover:text-[#C9A227] transition-colors">{b.guest_name}</h3>
                         <div className="flex items-center gap-1.5 text-[#9C9384] text-[10px] font-medium uppercase tracking-widest mb-4">
                           <Calendar size={10} />
                           <span className="font-data text-[#EDE6D6]">{new Date(b.check_in).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                           <span>→</span>
                           <span className="font-data text-[#EDE6D6]">{new Date(b.check_out).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                         </div>

                         <button
                           onClick={() => setSelectedMealBooking(b)}
                           className="w-full py-2.5 bg-[#1C232E] border border-[#5C4A2E]/30 text-[#EDE6D6] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#0B6E4F] hover:text-[#C9A227] hover:border-[#0B6E4F] transition-all"
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
