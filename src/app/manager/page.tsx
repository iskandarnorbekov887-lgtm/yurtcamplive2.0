'use client';

import { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Yurt, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';
import type { UserRole } from '@/lib/supabase';

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
  const [yurts, setYurts] = useState<Yurt[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'checkin' | 'bookings'>('checkin');
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
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
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    
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
    const [{ data: yurtsData }, { data: bookingsData }, { data: pendingData }] = await Promise.all([
      supabase.from('yurts').select('*'),
      supabase.from('bookings').select('*'),
      supabase.from('bookings').select('*, yurt:yurts(*)').eq('status', 'pending'),
    ]);
    setYurts(yurtsData || []);
    setBookings(bookingsData || []);
    setPendingBookings(pendingData || []);
    console.log('🔄 Manager Fetched bookings:', bookingsData?.length);
  };

  const approveBooking = async (id: number) => {
    await supabase.from('bookings').update({ 
      status: 'confirmed', 
      approved_by_manager: true 
    }).eq('id', id);
    fetchData();
  };

  const rejectBooking = async (id: number) => {
    await supabase.from('bookings').update({ 
      status: 'cancelled' 
    }).eq('id', id);
    fetchData();
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

  const handleAddBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('bookings').insert([{
        ...formData,
        total_price: parseFloat(formData.total_price),
        number_of_people: parseInt(formData.num_people),
        num_people: parseInt(formData.num_people),
        status: 'confirmed',
        created_by_role: 'Manager',
        created_by_id: currentUserId || '',
        last_edited_by_id: currentUserId || ''
      }]);
      if (error) throw error;
      
      console.log('🔄 SYNCING TO GOOGLE CALENDAR (NEW):', {
        summary: `Booking: ${formData.guest_name} (${formData.num_people} ppl)`,
        start: formData.check_in,
        end: formData.check_out,
        description: 'New booking from Manager portal'
      });

      setShowAddModal(false);
      fetchData();
    } catch (err) {
      alert('Error creating booking');
    }
  };


  const updateYurtStatus = async (yurtId: number, status: string) => {
    await supabase.from('yurts').update({ status }).eq('id', yurtId);
    fetchData();
  };

  const today = new Date().toISOString().split('T')[0];
  const todaysCheckins = bookings.filter(b => b.check_in === today);
  const todaysCheckouts = bookings.filter(b => b.check_out === today);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{t('portal.manager')}</h1>
              <p className="text-[10px] text-blue-300 font-bold tracking-widest uppercase opacity-80">Operational Management</p>
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

      <div className="max-w-7xl mx-auto p-6">
        <div className="flex gap-4 mb-6">
          {(['checkin', 'bookings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-medium capitalize ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(`manager.${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === 'checkin' && (
          <div className="animate-in fade-in duration-500">
            <OccupancyCalendar 
              bookings={bookings} 
              yurts={yurts} 
              userRole={userRole}
              currentUserId={currentUserId}
              onCancelBooking={cancelBooking}
              onCheckIn={checkIn}
              onCheckOut={checkOut}
              onUpdateBooking={handleUpdateBooking}
              onAddBooking={() => setShowAddModal(true)}
            />
          </div>
        )}


        {activeTab === 'bookings' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-xl font-bold mb-4 text-yellow-800">
                Pending Bookings ({pendingBookings.length})
              </h2>
              {pendingBookings.length === 0 ? (
                <p className="text-gray-600">No pending bookings to review</p>
              ) : (
                <div className="space-y-4">
                  {pendingBookings.map((booking, idx) => (
                    <div key={`pending-${booking.id}-${idx}`} className="border-2 border-yellow-200 rounded-lg p-4 bg-yellow-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-gray-900">{booking.guest_name}</p>
                          <p className="text-sm text-gray-700">{booking.yurt?.name}</p>
                          <p className="text-sm text-gray-600">
                            {booking.check_in} → {booking.check_out}
                          </p>
                          <p className="text-sm font-medium text-green-700">
                            ${booking.total_price}
                          </p>
                        </div>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded font-medium">
                          PENDING
                        </span>
                      </div>
                      
                      {booking.notes && (
                        <div className="mt-3 p-2 bg-white rounded border">
                          <p className="text-xs font-medium text-gray-600">Internal Notes:</p>
                          <p className="text-sm text-gray-800">{booking.notes}</p>
                        </div>
                      )}
                      
                      {booking.meal_notes && (
                        <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200">
                          <p className="text-xs font-medium text-orange-600">Meal Notes for Cook:</p>
                          <p className="text-sm text-gray-800">{booking.meal_notes}</p>
                        </div>
                      )}
                      
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => approveBooking(booking.id)}
                          className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-medium"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => rejectBooking(booking.id)}
                          className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 font-medium"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-xl font-bold mb-4 text-green-800">
                Confirmed Bookings ({bookings.length})
              </h2>
              {bookings.length === 0 ? (
                <p className="text-gray-600">No confirmed bookings</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {bookings.map((booking, idx) => (
                    <div key={`confirmed-${booking.id}-${idx}`} className="border rounded-lg p-3">
                      <div className="flex justify-between">
                        <p className="font-medium text-gray-900">{booking.guest_name}</p>
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                          CONFIRMED
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{booking.yurt?.name}</p>
                      <p className="text-xs text-gray-600">
                        {booking.check_in} → {booking.check_out}
                      </p>
                      {booking.meal_notes && (
                        <p className="text-xs text-orange-600 mt-1">
                          🍽️ {booking.meal_notes.substring(0, 50)}...
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-blue-600 text-white flex justify-between items-center">
              <h2 className="text-2xl font-black">{t('btn.new_booking')}</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleAddBooking} className="p-8 grid grid-cols-2 gap-6 bg-white overflow-y-auto max-h-[70vh]">
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.guest_name')}</label>
                <input type="text" value={formData.guest_name} onChange={(e) => setFormData({...formData, guest_name: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.check_in')}</label>
                <input type="date" value={formData.check_in} onChange={(e) => setFormData({...formData, check_in: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.check_out')}</label>
                <input type="date" value={formData.check_out} onChange={(e) => setFormData({...formData, check_out: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.yurt_select')}</label>
                <select value={formData.yurt_id} onChange={(e) => setFormData({...formData, yurt_id: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" required>
                  <option value="">-- {t('form.yurt_select')} --</option>
                  {yurts.map(y => <option key={y.id} value={y.id}>{y.name} ({y.type})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.num_people')}</label>
                <input type="number" value={formData.num_people} onChange={(e) => setFormData({...formData, num_people: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('table.status')}</label>
                <select value={formData.payment_status} onChange={(e) => setFormData({...formData, payment_status: e.target.value as any})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" required>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.total_price')}</label>
                <input type="number" value={formData.total_price} onChange={(e) => setFormData({...formData, total_price: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" required />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.transportation')}</label>
                <input type="text" value={formData.transportation} onChange={(e) => setFormData({...formData, transportation: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" placeholder="Flight info, pickup point..." />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.meal_preference')}</label>
                <textarea value={formData.meal_preference} onChange={(e) => setFormData({...formData, meal_preference: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" placeholder="Allergies, Halal, Vegetarian..." />
              </div>
              <div className="flex items-center gap-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('form.guide_required')}</label>
                <input type="checkbox" checked={formData.guide_required} onChange={(e) => setFormData({...formData, guide_required: e.target.checked})} className="w-6 h-6 text-blue-600 border-2 border-slate-100 rounded focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.special_requests')}</label>
                <textarea value={formData.special_requests} onChange={(e) => setFormData({...formData, special_requests: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 transition-all font-bold text-slate-700" />
              </div>
              <div className="col-span-2 pt-4">
                <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200">{t('btn.new_booking')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
