'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type Yurt, type UserRole } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';

export default function CheckinPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO', 'Manager', 'Cook']}>
      <CheckinPortal />
    </ProtectedRoute>
  );
}

function CheckinPortal() {
  const { user, signOut } = useAuth();
  const currentUserId = user?.id;
  const userRole = user?.role as UserRole;
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [yurts, setYurts] = useState<Yurt[]>([]);

  useEffect(() => {
    fetchData();
    // Poll for updates every 5 seconds for real-time sync
    const interval = setInterval(fetchData, 5000);
    
    // Listen for localStorage changes from other tabs for instant sync
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'camp_bookings' || e.key === 'camp_yurts') {
        fetchData();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const fetchData = async () => {
    const [{ data: bookingsData }, { data: yurtsData }] = await Promise.all([
      supabase.from('bookings').select('*'),
      supabase.from('yurts').select('*'),
    ]);
    
    setBookings(bookingsData || []);
    setYurts(yurtsData || []);
  };

  const cancelBooking = async (id: number) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    fetchData();
  };

  const checkIn = async (id: number) => {
    await supabase.from('bookings').update({ status: 'checked_in' }).eq('id', id);
    fetchData();
  };

  const checkOut = async (id: number) => {
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
    fetchData();
  };

  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    await supabase.from('bookings').update({ ...updates, last_edited_by_id: currentUserId || '' }).eq('id', id);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-indigo-700 to-purple-800 text-white shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Check-in & Check-out</h1>
              <p className="text-[10px] text-indigo-200 font-bold tracking-widest uppercase opacity-80">
                {userRole} Portal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        <OccupancyCalendar 
          bookings={bookings} 
          yurts={yurts} 
          userRole={userRole}
          currentUserId={currentUserId}
          onCancelBooking={userRole !== 'Cook' ? cancelBooking : undefined}
          onCheckIn={userRole === 'Manager' || userRole === 'CEO' ? checkIn : undefined}
          onCheckOut={userRole === 'Manager' || userRole === 'CEO' ? checkOut : undefined}
          onAddBooking={userRole === 'Manager' || userRole === 'CEO' ? () => {} : undefined}
          onUpdateBooking={userRole !== 'Cook' ? handleUpdateBooking : undefined}
        />
      </main>
    </div>
  );
}
