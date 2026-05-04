'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type Notification } from '@/lib/supabase';
import { handleApproveDatesLogic } from '@/utils/calendar-logic';
import { sendDateChangeResult } from '@/utils/notify';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { GoogleGuestAgenda } from '@/components/google-guest-agenda';
import { PrivateCalendarView } from '@/components/private-calendar-view';
import { ManagerIncomeForm } from '@/components/manager-income-form';

import type { UserRole } from '@/lib/supabase';

// Force dynamic rendering to avoid SSR issues with auth
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
  const [activeTab, setActiveTab] = useState<'checkin' | 'bookings' | 'financials' | 'grocery'>('checkin');
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [groceryRequest, setGroceryRequest] = useState<any>(null);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [selectedBookingDate, setSelectedBookingDate] = useState('');
  

  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  const isStopping = useRef(false);

  useEffect(() => {
    fetchData();
    // Poll for updates every 15 seconds for real-time sync (safety increase from 5s)
    pollInterval.current = setInterval(() => {
      fetchData();
    }, 15000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const fetchData = async () => {
    if (isStopping.current) return;
    try {
      const [
        { data: bookingsData, error: bErr }, 
        { data: pendingData, error: pErr }, 
        { data: notifData, error: nErr }, 
        { data: groceryData, error: gErr }
      ] = await Promise.all([
        supabase.from('bookings').select('*'),
        supabase.from('bookings').select('*').eq('status', 'pending'),
        supabase.from('notifications').select('*').eq('user_id', currentUserId || '').order('created_at', { ascending: false }),
        supabase.from('grocery_requests').select('*').order('created_at', { ascending: false }).limit(1).single()
      ]);

      // Check for 403 Forbidden errors (Insufficient permissions or session expired)
      const err403 = [bErr, pErr, nErr, gErr].find(e => e?.code === '42501' || e?.status === 403);
      if (err403) {
        console.error('🚫 403 Forbidden detected. Stopping polling and redirecting to login.');
        isStopping.current = true;
        if (pollInterval.current) clearInterval(pollInterval.current);
        window.location.href = '/login';
        return;
      }

      setBookings(bookingsData || []);
      setPendingBookings(pendingData || []);
      setNotifications((notifData || []).slice(0, 20));
      setGroceryRequest(groceryData);
      console.log('🔄 Manager Fetched bookings:', bookingsData?.length);
    } catch (err) {
      console.error('Fetch error:', err);
    }
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
    await supabase.from('bookings').update({ 
      ...updates, 
      is_manually_updated: true, // Manual Protection Rule: Prevent office sync overwrite
      last_edited_by_id: currentUserId || '', 
      last_edited_at: new Date().toISOString() 
    }).eq('id', id);
    fetchData();
  };

  const handleMarkPurchased = async () => {
    if (!groceryRequest) return;
    await supabase.from('grocery_requests')
      .update({ status: 'purchased', items: groceryRequest.items })
      .eq('id', groceryRequest.id);
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
            {/* ⚡ Temporary Flash / Force Refresh Button */}
            <button
              onClick={async () => {
                setIsFlashing(true);
                await fetchData();
                setTimeout(() => setIsFlashing(false), 800);
              }}
              disabled={isFlashing}
              title="Force refresh all data from server"
              className={`p-2.5 rounded-xl border text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 ${
                isFlashing
                  ? 'bg-yellow-400 border-yellow-300 text-yellow-900 shadow-lg shadow-yellow-400/40 animate-pulse'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <svg className={`w-4 h-4 ${isFlashing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isFlashing ? 'Syncing...' : '⚡ Flash'}
            </button>
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all relative"
              >
                <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-12 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 max-h-[28rem] overflow-y-auto">
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-black text-slate-900">Notifications</h3>
                    <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">×</button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-6 text-slate-500 text-sm text-center">No notifications</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {(showAllNotifications ? notifications : notifications.slice(0, 5)).map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 transition-colors ${!notification.read ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
                          onClick={async () => {
                            if (!notification.read && notification.type !== 'date_change_request') {
                              await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
                              setNotifications(notifications.map(n => n.id === notification.id ? { ...n, read: true } : n));
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-bold text-slate-900 text-sm">{notification.title}</p>
                              <p className="text-slate-600 text-xs mt-1">{notification.message}</p>
                              {notification.status && (
                                <div className={`inline-block mt-2 px-2 py-1 rounded text-xs font-bold ${
                                  notification.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                  notification.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
                                </div>
                              )}
                              <p className="text-slate-400 text-[10px] mt-2">{new Date(notification.created_at).toLocaleString()}</p>
                            </div>
                            {notification.status === 'approved' && (
                              <svg className="w-5 h-5 text-emerald-600 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {notification.status === 'rejected' && (
                              <svg className="w-5 h-5 text-rose-600 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </div>

                          {/* Date Change Request: Approve / Reject buttons */}
                          {notification.type === 'date_change_request' && !notification.status && (
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!notification.related_id) return;
                                  const bookingId = notification.related_id;
                                  const booking = bookings.find(b => b.id === bookingId);
                                  if (!booking) { alert('Booking not found.'); return; }

                                  try {
                                    // Fetch latest calendar events to get the new dates
                                    const res = await fetch('/api/calendar/events', { cache: 'no-store' });
                                    const eventsData = await res.json();
                                    if ('error' in eventsData) { alert('Failed to fetch calendar.'); return; }
                                    const gcEvents = eventsData as any[];
                                    const linkedEv = gcEvents.find((ev: any) => ev.id === booking.google_event_id);
                                    if (!linkedEv) { alert('Calendar event not found.'); return; }

                                    // Update dates in DB
                                    await handleUpdateBooking(bookingId, {
                                      check_in: linkedEv.start,
                                      check_out: linkedEv.end,
                                    });

                                    // Mark notification as approved
                                    await supabase.from('notifications').update({ status: 'approved', read: true }).eq('id', notification.id);

                                    // Notify CEO
                                    await sendDateChangeResult(
                                      bookingId,
                                      booking.guest_name,
                                      'approved',
                                      { checkIn: linkedEv.start, checkOut: linkedEv.end }
                                    );

                                    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, status: 'approved', read: true } : n));
                                    fetchData();
                                  } catch (err) {
                                    console.error('Approve date change failed:', err);
                                    alert('Failed to approve date change.');
                                  }
                                }}
                                className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                Approve
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!notification.related_id) return;
                                  const bookingId = notification.related_id;
                                  const booking = bookings.find(b => b.id === bookingId);

                                  // Mark notification as rejected (dates stay unchanged)
                                  await supabase.from('notifications').update({ status: 'rejected', read: true }).eq('id', notification.id);

                                  // Notify CEO of rejection
                                  if (booking) {
                                    await sendDateChangeResult(
                                      bookingId,
                                      booking.guest_name,
                                      'rejected',
                                      { checkIn: booking.check_in, checkOut: booking.check_out }
                                    );
                                  }

                                  setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, status: 'rejected', read: true } : n));
                                }}
                                className="flex-1 px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-1.5"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {notifications.length > 5 && !showAllNotifications && (
                        <button
                          onClick={() => setShowAllNotifications(true)}
                          className="w-full py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all"
                        >
                          Show More ({notifications.length - 5} more)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
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
          {(['checkin', 'bookings', 'financials', 'grocery'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-medium capitalize ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab === 'grocery' ? 'Grocery' : t(`manager.${tab === 'financials' ? 'expenses' : tab}`)}
              {tab === 'grocery' && groceryRequest?.status === 'requested' && (
                <span className="ml-2 w-2 h-2 bg-rose-500 rounded-full inline-block animate-pulse" />
              )}
            </button>
          ))}
        </div>

        {activeTab === 'checkin' && (
          <div className="animate-in fade-in duration-500">
            <GoogleGuestAgenda
              bookings={bookings}
              userRole={userRole}
              currentUserId={currentUserId}
              onCheckIn={checkIn}
              onCheckOut={checkOut}
              onUpdateBooking={handleUpdateBooking}
              onCancelBooking={async (id) => {
                await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
                fetchData();
              }}
              onAddNewBooking={(data: Partial<Booking>) => {
                setSelectedBookingDate((data as any).check_in || '');
                setShowIncomeForm(true);
              }}
              onRefresh={fetchData}
            />

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

        {activeTab === 'grocery' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[32px] p-8 shadow-xl border border-slate-100">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Grocery Purchase Mode</h2>
                  <p className="text-slate-500 font-bold">Review and update the list from the Kitchen</p>
                </div>
                {groceryRequest?.status === 'requested' && <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-black uppercase border border-amber-200">New Request</span>}
              </div>

              {!groceryRequest || groceryRequest.status === 'received' ? (
                <div className="py-20 text-center text-slate-400">
                  <div className="text-5xl mb-4">🛒</div>
                  <p className="text-lg font-bold">No active grocery requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    {groceryRequest.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex gap-3 items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <input type="text" value={item.name} onChange={e => {
                          const next = {...groceryRequest}; next.items[idx].name = e.target.value; setGroceryRequest(next);
                        }} className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900" />
                        <input type="text" value={item.qty} onChange={e => {
                          const next = {...groceryRequest}; next.items[idx].qty = e.target.value; setGroceryRequest(next);
                        }} className="w-24 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-center" />
                        <span className="text-xs font-black text-slate-400 w-10 uppercase">{item.unit}</span>
                      </div>
                    ))}
                  </div>

                  {groceryRequest.status === 'requested' ? (
                    <button onClick={handleMarkPurchased}
                      className="w-full py-5 bg-indigo-600 text-white rounded-[24px] text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all mt-6 active:scale-95">
                      Mark as Purchased
                    </button>
                  ) : (
                    <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                      <p className="text-emerald-700 font-black uppercase tracking-widest text-xs">Waiting for Kitchen Verification...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
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
                          <p className="text-sm text-gray-700">Booking #{booking.id}</p>
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
                          <p className="text-sm text-gray-700">Booking #{booking.id}</p>
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
