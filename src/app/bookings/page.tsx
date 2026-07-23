'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';
import { ManagerIncomeForm } from '@/components/manager-income-form';

import type { UserRole } from '@/lib/supabase';

// Force dynamic rendering to avoid SSR issues with auth
export const dynamic = 'force-dynamic';

export default function BookingsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO', 'Manager']}>
      <BookingPortal />
    </ProtectedRoute>
  );
}

function BookingPortal() {
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
      console.log('🔄 Booking Portal Fetched bookings:', bookingsData?.length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (id: number) => {
    const payloadToSave = { status: 'cancelled' } as any;
    // No need to delete unrelated fields; they are omitted from payload
    await supabase.from('bookings').update(payloadToSave).eq('id', id);
    fetchData();
  };

  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    const payloadToSave = { ...updates, last_edited_at: new Date().toISOString() } as any;
    delete payloadToSave.meta;






    delete payloadToSave.last_edited_by_id;
    delete payloadToSave.days;
    await supabase.from('bookings').update(payloadToSave).eq('id', id);
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1419]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#0B6E4F] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1419] font-sans">
      <header className="bg-[#1C232E] border-b border-[#5C4A2E]/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-2 bg-[#0B6E4F]/20 border border-[#0B6E4F]/30 rounded-lg text-[#0B6E4F]">
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h1 className="text-sm md:text-lg font-bold text-[#EDE6D6] uppercase tracking-tight">Booking Portal</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <LanguageSwitcher variant="dark" />
            <button onClick={signOut} className="px-3 py-2 md:px-4 md:py-2 text-[#9C9384] hover:text-[#722F37] font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-2">
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-7xl mx-auto w-full space-y-4 md:space-y-8">
        <OccupancyCalendar 
          bookings={bookings} 
          userRole={userRole}
          currentUserId={currentUserId}
          onCancelBooking={cancelBooking}
          onUpdateBooking={handleUpdateBooking}
          onAddNewBooking={(date) => openIncomeForm(date)}
          onRefresh={fetchData}
        />
        
        <div className="bg-[#1C232E] rounded-lg border border-[#5C4A2E]/30 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#1C232E]/50 border-b border-[#5C4A2E]/30">
              <tr>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">{t('table.name')}</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">{t('table.dates')}</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">{t('table.status')}</th>
                <th className="px-8 py-4 text-right text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">{t('table.price')}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-[#5C4A2E]/20 hover:bg-[#1C232E]/80 transition-colors group">
                  <td className="px-8 py-4 font-bold text-[#EDE6D6] text-sm">{booking.guest_name}</td>
                  <td className="px-8 py-4 text-[#9C9384] font-data text-xs">
                    {new Date(booking.check_in).toLocaleDateString()} - {new Date(booking.check_out).toLocaleDateString()}
                  </td>
                  <td className="px-8 py-4">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${
                      booking.status === 'confirmed' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F] border-[#0B6E4F]/40' :
                      booking.status === 'cancelled' ? 'bg-[#722F37]/20 text-[#722F37] border-[#722F37]/40' :
                      booking.status === 'checked_in' ? 'bg-[#1C3A52]/20 text-[#6DD9FF] border-[#1C3A52]/40' :
                      'bg-[#1C232E]/50 text-[#9C9384] border-[#5C4A2E]/30'
                    }`}>
                      {t(`status.${booking.status}`)}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right font-data font-bold text-[#C9A227]">${booking.total_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

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
