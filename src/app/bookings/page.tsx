'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type Yurt } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';
import type { UserRole } from '@/lib/supabase';

export default function BookingsPage() {
  return (
    <ProtectedRoute allowedRoles={['Reserver', 'CEO', 'Manager']}>
      <ReserverPortal />
    </ProtectedRoute>
  );
}

function ReserverPortal() {
  const { user, signOut } = useAuth();
  const currentUserId = user?.id;
  const userRole = user?.role as UserRole;
  const { t } = useLanguage();
  const [yurts, setYurts] = useState<Yurt[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    yurt_id: '',
    guest_name: '',
    check_in: '',
    check_out: '',
    total_price: '',
    source: 'Manual',
    notes: '',
    meal_notes: '',
    num_people: '1',
    payment_status: 'Unpaid' as any,
    transportation: '',
    meal_preference: '',
    guide_required: false,
    special_requests: '',
  });

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
    try {
      const [{ data: yurtsData }, { data: bookingsData }] = await Promise.all([
        supabase.from('yurts').select('*'),
        supabase.from('bookings').select('*'),
      ]);
      setYurts(yurtsData || []);
      setBookings(bookingsData || []);
      console.log('🔄 Reserver Fetched bookings:', bookingsData?.length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('bookings').insert([{
        ...formData,
        total_price: parseFloat(formData.total_price),
        number_of_people: parseInt(formData.num_people),
        num_people: parseInt(formData.num_people),
        status: 'confirmed',
        created_by_role: 'Reserver',
        created_by_id: currentUserId || '',
        last_edited_by_id: currentUserId || ''
      }]);
      if (error) throw error;
      
      setShowAddModal(false);
      fetchData();
      setFormData({
        yurt_id: '',
        guest_name: '',
        check_in: '',
        check_out: '',
        total_price: '',
        source: 'Manual',
        notes: '',
        meal_notes: '',
        num_people: '1',
        payment_status: 'Unpaid' as any,
        transportation: '',
        meal_preference: '',
        guide_required: false,
        special_requests: '',
      });
    } catch (err: any) {
      alert(err.message || 'Error creating booking');
    }
  };

  const cancelBooking = async (id: number) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    fetchData();
  };

  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    await supabase.from('bookings').update({ ...updates, last_edited_by_id: currentUserId || '' }).eq('id', id);
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
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t('portal.reserver')}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowAddModal(true)} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {t('btn.new_booking')}
            </button>
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
          yurts={yurts} 
          userRole={userRole}
          currentUserId={currentUserId}
          onCancelBooking={cancelBooking}
          onUpdateBooking={handleUpdateBooking}
        />
        
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.name')}</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.yurt')}</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.dates')}</th>
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.status')}</th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.price')}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4 font-semibold text-slate-800">{booking.guest_name}</td>
                  <td className="px-8 py-4 text-slate-600">{booking.yurt?.name || `Yurt ${booking.yurt_id}`}</td>
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-black text-slate-800 mb-6">{t('btn.new_booking')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">{t('form.guest_name')}</label>
                <input
                  type="text"
                  required
                  value={formData.guest_name}
                  onChange={e => setFormData({ ...formData, guest_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">{t('form.yurt_select')}</label>
                <select
                  required
                  value={formData.yurt_id}
                  onChange={e => setFormData({ ...formData, yurt_id: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Select Yurt</option>
                  {yurts.map(yurt => (
                    <option key={yurt.id} value={yurt.id}>{yurt.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('form.check_in')}</label>
                  <input
                    type="date"
                    required
                    value={formData.check_in}
                    onChange={e => setFormData({ ...formData, check_in: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('form.check_out')}</label>
                  <input
                    type="date"
                    required
                    value={formData.check_out}
                    onChange={e => setFormData({ ...formData, check_out: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('form.total_price')}</label>
                  <input
                    type="number"
                    required
                    value={formData.total_price}
                    onChange={e => setFormData({ ...formData, total_price: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{t('form.num_people')}</label>
                  <input
                    type="number"
                    required
                    value={formData.num_people}
                    onChange={e => setFormData({ ...formData, num_people: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">{t('form.notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  rows={3}
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                >
                  Create Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
