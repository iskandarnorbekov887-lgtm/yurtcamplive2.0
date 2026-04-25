'use client';

import { useEffect, useState, useCallback } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Yurt, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { GoogleGuestAgenda } from '@/components/google-guest-agenda';
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
  const [activeTab, setActiveTab] = useState<'checkin' | 'bookings' | 'financials'>('checkin');
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  

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

  const checkIn = async (id: number) => {
    await supabase.from('bookings').update({ status: 'checked_in' }).eq('id', id);
    fetchData();
  };

  const checkOut = async (id: number) => {
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
    fetchData();
  };

  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    await supabase.from('bookings').update({ ...updates, last_edited_by_id: currentUserId || '', last_edited_at: new Date().toISOString() }).eq('id', id);
    fetchData();
  };



  const updateYurtStatus = async (yurtId: number, status: string) => {
    await supabase.from('yurts').update({ status }).eq('id', yurtId);
    fetchData();
  };

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const currentHour = now.getHours();

  // Filter neglected bookings (confirmed, check-in day is today or past, and after 6PM or overdue)
  const neglectedBookings = bookings.filter(b => {
    if (b.status !== 'confirmed') return false;
    const checkInDate = new Date(b.check_in);
    const checkInDateStr = checkInDate.toISOString().split('T')[0];
    // Neglected if check-in day is today and after 6PM, or check-in day is in the past
    if (checkInDateStr === today && currentHour >= 18) return true;
    if (checkInDateStr < today) return true;
    return false;
  });

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
          {(['checkin', 'bookings', 'financials'] as const).map((tab) => (
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
            <GoogleGuestAgenda
              bookings={bookings}
              yurts={yurts}
              userRole={userRole}
              currentUserId={currentUserId}
              onCheckIn={checkIn}
              onCheckOut={checkOut}
              onUpdateBooking={handleUpdateBooking}
              onCancelBooking={async (id) => {
                await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
                fetchData();
              }}
            />

            <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-lg font-black text-slate-900">Google Calendar</h2>
                <p className="text-xs text-slate-500">Shared camp calendar</p>
              </div>
              <iframe
                src="https://calendar.google.com/calendar/embed?src=072d8da6e5b1a848d2ec34c42648591405a428494d10c820a7a8b198125e864c%40group.calendar.google.com&ctz=Asia%2FTashkent&mode=MONTH&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0"
                style={{ border: 0 }}
                width="100%"
                height="600"
                frameBorder="0"
                scrolling="no"
              />
            </div>
          </div>
        )}


        {activeTab === 'financials' && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-bold mb-4 text-emerald-800">Financial Recording</h2>
            <p className="text-gray-600 mb-4">Record income and expenses. Date is automatically set to today.</p>
            <a
              href="/financials"
              className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-all"
            >
              Go to Financial Recording
            </a>
          </div>
        )}

        {activeTab === 'bookings' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-xl font-bold mb-4 text-red-800 flex items-center gap-2">
                <svg className="w-6 h-6 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
                </svg>
                Attention Needed ({neglectedBookings.length})
              </h2>
              {neglectedBookings.length === 0 ? (
                <p className="text-gray-600">No bookings needing attention</p>
              ) : (
                <div className="space-y-3">
                  {neglectedBookings.map((booking, idx) => (
                    <button
                      key={`neglected-${booking.id}-${idx}`}
                      onClick={() => {
                        // Scroll to calendar and highlight booking (simplified - just switch to checkin tab)
                        setActiveTab('checkin');
                      }}
                      className="w-full text-left border-2 border-red-200 rounded-lg p-4 bg-red-50 hover:bg-red-100 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900">{booking.guest_name}</p>
                          <p className="text-sm text-gray-700">{booking.yurt?.name || `Yurt ${booking.yurt_id}`}</p>
                          <p className="text-sm text-red-600 font-medium">
                            Check-in: {booking.check_in}
                          </p>
                        </div>
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded font-medium animate-pulse">
                          NOT CHECKED IN
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

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
          </div>
        )}
      </div>

    </div>
  );
}
