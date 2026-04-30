'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';
import { ReserverIncomeForm } from '@/components/reserver-income-form';

import type { UserRole } from '@/lib/supabase';

// Force dynamic rendering to avoid SSR issues with auth
export const dynamic = 'force-dynamic';

export default function BookingsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO', 'Manager']}>
      <ReserverPortal />
    </ProtectedRoute>
  );
}

function ReserverPortal() {
  const { user, signOut } = useAuth();
  const currentUserId = user?.id;
  const userRole = user?.role as UserRole;
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [selectedBookingDate, setSelectedBookingDate] = useState('');

  const openIncomeForm = (date: string) => {
    setSelectedBookingDate(date);
    setShowIncomeForm(true);
  };

  useEffect(() => {
    fetchData();
    // Poll for updates every 5 seconds for real-time sync
    const interval = setInterval(fetchData, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const fetchData = async () => {
    try {
      const { data: bookingsData } = await supabase.from('bookings').select('*');
      setBookings(bookingsData || []);
      console.log('🔄 Reserver Fetched bookings:', bookingsData?.length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (id: number) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    fetchData();
  };

  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    await supabase.from('bookings').update({ ...updates, last_edited_by_id: currentUserId || '', last_edited_at: new Date().toISOString() }).eq('id', id);
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Booking Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            <button onClick={signOut} className="px-4 py-2.5 text-slate-500 hover:text-rose-600 font-bold text-sm transition-all flex items-center gap-2">
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto w-full space-y-8">
        <OccupancyCalendar 
          bookings={bookings} 
          userRole={userRole}
          currentUserId={currentUserId}
          onCancelBooking={cancelBooking}
          onUpdateBooking={handleUpdateBooking}
          onAddNewBooking={(date) => openIncomeForm(date)}
          onRefresh={fetchData}
        />
        
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.name')}</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.dates')}</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.status')}</th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.price')}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4 font-semibold text-slate-800">{booking.guest_name}</td>
                  <td className="px-8 py-4 text-slate-600 text-sm">
                    {new Date(booking.check_in).toLocaleDateString()} - {new Date(booking.check_out).toLocaleDateString()}
                  </td>
                  <td className="px-8 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      booking.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                      booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      booking.status === 'checked_in' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {t(`status.${booking.status}`)}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right font-bold text-slate-800">${booking.total_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <ReserverIncomeForm
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
