'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type UserRole } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';

// Force dynamic rendering to avoid SSR issues with auth
export const dynamic = 'force-dynamic';

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

  useEffect(() => {
    fetchData();
    // Poll for updates every 5 seconds for real-time sync
    const interval = setInterval(fetchData, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const fetchData = async () => {
    // Optimization for Speed (Uzbekistan Connectivity): 
    // Data Pruning: Load only current month and next month to save bandwidth and memory.
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
    
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*')
      .gte('check_out', start)
      .lte('check_in', end);
      
    setBookings(bookingsData || []);
  };

  const checkIn = async (id: number) => {
    // Optimistic UI: Update state instantly for Uzbekistan Speed
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'checked_in' } : b));
    
    const { error } = await supabase.from('bookings').update({ status: 'checked_in' }).eq('id', id);
    if (error) {
      console.error(error);
      fetchData(); // Rollback if error
    }
  };

  const checkOut = async (id: number) => {
    // Optimistic UI: Mark as completed instantly
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'completed' } : b));

    // Get booking data for finance entry
    const { data: booking } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (!booking) return;

    const amountValue = booking.amount || booking.total_price || 0;
    const rateValue = booking.exchange_rate || 1;
    const amountUZS = booking.currency === 'UZS' ? amountValue : amountValue * rateValue;

    await supabase.from('camp_finances').insert([{
      date: booking.check_out,
      type: 'income',
      category: 'Booking',
      currency: booking.currency || 'UZS',
      original_amount: amountValue,
      exchange_rate: rateValue,
      amount_uzs: amountUZS,
      description: booking.description || `Booking: ${booking.guest_name} (${booking.check_in} - ${booking.check_out})`,
      guest_name: booking.guest_name,
      guest_count: booking.guest_count || booking.number_of_people,
      children_under_12: booking.children_under_12,
      nights: booking.nights,
      guide_service: booking.guide_service || booking.guide_required,
      guide_names: booking.guide_names,
      transportation: booking.has_transportation,
      transportation_details: booking.transportation_details,
      lunch: booking.lunch,
      lunch_count: booking.lunch_count,
      dinner: booking.dinner,
      dinner_count: booking.dinner_count,
      drinks: booking.drinks,
      drinks_count: booking.drinks_count,
      laundry: booking.laundry,
      laundry_price: booking.laundry_price,
      laundry_currency: booking.laundry_currency,
      payment_method: booking.payment_method,
      created_by: booking.created_by_role || 'System',
    }]);

    const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
    if (error) fetchData();
  };

  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    // Optimistic UI update
    setBookings(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    
    const { error } = await supabase.from('bookings').update({ ...updates, last_edited_by_id: currentUserId || '', last_edited_at: new Date().toISOString() }).eq('id', id);
    if (error) fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-indigo-700 to-purple-800 text-white shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-10 h-10 text-indigo-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Check-in & Check-out</h1>
              <p className="text-xs text-indigo-200 font-bold tracking-widest uppercase opacity-80 mt-1">
                {userRole} Portal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/15 border border-white/30 rounded-xl px-3 py-2 backdrop-blur-sm">
              <LanguageSwitcher variant="light" />
            </div>
            <button
              onClick={signOut}
              className="px-5 py-3 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-sm font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2 min-h-[48px]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <OccupancyCalendar
          bookings={bookings}
          userRole={userRole}
          currentUserId={currentUserId}
          onCheckIn={userRole === 'Manager' || userRole === 'CEO' ? checkIn : undefined}
          onCheckOut={userRole === 'Manager' || userRole === 'CEO' ? checkOut : undefined}
          onUpdateBooking={userRole !== 'Cook' ? handleUpdateBooking : undefined}
          onRefresh={fetchData}
        />
      </main>
    </div>
  );
}
