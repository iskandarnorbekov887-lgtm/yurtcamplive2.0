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
import { ManagerGrocery } from '@/components/manager/manager-grocery';
import { ManagerMealRequests } from '@/components/manager/manager-meal-requests';

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

  // Core data state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [groceryRequest, setGroceryRequest] = useState<any>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<'checkin' | 'bookings' | 'financials' | 'grocery'>('checkin');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [selectedBookingDate, setSelectedBookingDate] = useState('');
  const [selectedMealBooking, setSelectedMealBooking] = useState<Booking | null>(null);

  // Loading / error state
  const [loading, setLoading] = useState(true);
  const [timeoutError, setTimeoutError] = useState(false);
  const [configMissing, setConfigMissing] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const channelsRef = useRef<any[]>([]);
  const isStopping = useRef(false);

  const cleanupChannels = () => {
    channelsRef.current.forEach((ch) => {
      try { ch.unsubscribe(); } catch { /* ignore */ }
    });
    channelsRef.current = [];
  };

  // ─── Data Fetching ───────────────────────────────────────────────

  useEffect(() => {
    cleanupChannels();
    isStopping.current = false;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setConfigMissing(true);
      setLoading(false);
      return;
    }

    const timeoutTimer = setTimeout(() => {
      if (loading) {
        setTimeoutError(true);
        setLoading(false);
        cleanupChannels();
      }
    }, 5000);

    fetchData().then(() => {
      clearTimeout(timeoutTimer);
      setLoading(false);
    }).catch(() => {
      clearTimeout(timeoutTimer);
      setLoading(false);
    });

    // Subscribe to real-time changes on relevant tables
    const tables = ['bookings', 'notifications', 'grocery_requests', 'meal_requests'];
    tables.forEach((table) => {
      const channel = supabase
        .channel(`manager-${table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          if (!isStopping.current) fetchData();
        })
        .subscribe((status: string, err?: any) => {
          if (err) console.warn(`Realtime ${table} error:`, err);
        });
      channelsRef.current.push(channel);
    });

    return () => {
      clearTimeout(timeoutTimer);
      cleanupChannels();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async (): Promise<void> => {
    if (isStopping.current) return;
    try {
      const [
        { data: bookingsData, error: bErr },
        { data: pendingData, error: pErr },
        { data: notifData, error: nErr },
        { data: groceryData, error: gErr }
      ] = await Promise.all([
        supabase.from('bookings').select('*, meal_requests(*)'),
        supabase.from('bookings').select('*, meal_requests(*)').eq('status', 'pending'),
        supabase.from('notifications').select('*').eq('user_id', currentUserId || '').order('created_at', { ascending: false }),
        supabase.from('grocery_requests').select('*').order('created_at', { ascending: false }).limit(1).single()
      ]);

      const err403 = [bErr, pErr, nErr, gErr].find(e =>
        e?.code === '42501' || e?.status === 403 ||
        e?.message?.includes('JWT') || e?.message?.includes('permission')
      );
      if (err403) {
        isStopping.current = true;
        cleanupChannels();
        setSessionExpired(true);
        setTimeout(() => { window.location.href = '/login'; }, 3000);
        return;
      }

      setBookings(bookingsData || []);
      setPendingBookings(pendingData || []);
      setNotifications((notifData || []).slice(0, 20));
      setGroceryRequest(groceryData);
    } catch (err: any) {
      if (err?.status === 403 || err?.code === '42501' ||
          err?.message?.includes('JWT') || err?.message?.includes('permission')) {
        isStopping.current = true;
        cleanupChannels();
        setSessionExpired(true);
        setTimeout(() => { window.location.href = '/login'; }, 3000);
      }
      throw err;
    }
  };

  // ─── Booking Actions ─────────────────────────────────────────────

  const approveBooking = async (id: number) => {
    await supabase.from('bookings').update({ status: 'confirmed', approved_by_manager: true }).eq('id', id);
    fetchData();
  };

  const rejectBooking = async (id: number) => {
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
    await supabase.from('bookings').update({
      ...updates,
      is_manually_updated: true,
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

  // ─── Derived State ─────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();

  const neglectedBookings = bookings.filter(b => {
    if (b.status !== 'confirmed') return false;
    const checkInDateStr = new Date(b.check_in).toISOString().split('T')[0];
    if (checkInDateStr === today && currentHour >= 18) return true;
    if (checkInDateStr < today) return true;
    return false;
  });

  // ─── Layout ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Error Overlays */}
      {sessionExpired && (
        <div className="fixed inset-0 z-[100] bg-red-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Session Expired</h2>
            <p className="text-slate-600 mb-6">Redirecting to login...</p>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Redirecting in 3 seconds...</span>
            </div>
          </div>
        </div>
      )}

      {(loading || timeoutError || configMissing) && (
        <div className="fixed inset-0 z-[99] bg-white/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm text-center border border-slate-200">
            {configMissing ? (
              <>
                <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Configuration Missing</h2>
                <p className="text-sm text-slate-600 mb-4">NEXT_PUBLIC_SUPABASE_URL is not set. Check your .env.local file.</p>
              </>
            ) : timeoutError ? (
              <>
                <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Connection Timeout</h2>
                <p className="text-sm text-slate-600 mb-4">Could not reach the server within 5 seconds.</p>
                <button
                  onClick={() => { setTimeoutError(false); setLoading(true); window.location.reload(); }}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Loading Dashboard</h2>
                <p className="text-sm text-slate-500">Fetching data from server...</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{t('portal.manager')}</h1>
              <p className="text-[10px] text-blue-300 font-bold tracking-widest uppercase opacity-80">Operational Management</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications((s) => !s)}
                className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all relative"
              >
                <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {notifications.filter((n) => !n.read).length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <ManagerNotifications
                  notifications={notifications}
                  setNotifications={setNotifications}
                  bookings={bookings}
                  onUpdateBooking={handleUpdateBooking}
                  onRefresh={fetchData}
                  onClose={() => setShowNotifications(false)}
                />
              )}
            </div>

            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
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

        {/* Tab Content */}
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
          <ManagerGrocery
            groceryRequest={groceryRequest}
            setGroceryRequest={setGroceryRequest}
            onMarkPurchased={handleMarkPurchased}
          />
        )}

        {activeTab === 'bookings' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Neglected Bookings */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-xl font-bold mb-4 text-red-800 flex items-center gap-2">
                <svg className="w-6 h-6 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
                </svg>
                Attention Needed ({neglectedBookings.length})
              </h2>
              {neglectedBookings.length === 0 ? (
                <p className="text-gray-600">No bookings needing attention</p>
              ) : (
                <div className="space-y-3">
                  {neglectedBookings.map((booking, idx) => (
                    <div
                      key={`neglected-${booking.id}-${idx}`}
                      className="w-full text-left border-2 border-red-200 rounded-lg p-4 bg-red-50 hover:bg-red-100 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-gray-900">{booking.guest_name}</p>
                          <p className="text-sm text-gray-700">Booking #{booking.id}</p>
                          <p className="text-sm text-red-600 font-medium">Check-in: {booking.check_in}</p>
                        </div>
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded font-medium animate-pulse">
                          NOT CHECKED IN
                        </span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setActiveTab('checkin')}
                          className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg hover:bg-indigo-700 text-xs font-bold transition-all"
                        >
                          View in Calendar
                        </button>
                        <button
                          onClick={() => setSelectedMealBooking(booking)}
                          className="flex-1 bg-orange-500 text-white py-1.5 rounded-lg hover:bg-orange-600 text-xs font-bold transition-all"
                        >
                          🍽️ Request Food
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Bookings */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-xl font-bold mb-4 text-yellow-800">Pending Bookings ({pendingBookings.length})</h2>
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
                          <p className="text-sm text-gray-600">{booking.check_in} → {booking.check_out}</p>
                          <p className="text-sm font-medium text-green-700">${booking.total_price}</p>
                        </div>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded font-medium">PENDING</span>
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
