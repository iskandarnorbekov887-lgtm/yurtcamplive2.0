'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Yurt, type Booking, type Profile, type Finance, type Notification } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';
import type { UserRole } from '@/lib/supabase';
import ICAL from 'ical.js';

export default function CEOPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEODashboard />
    </ProtectedRoute>
  );
}

function CEODashboard() {
  const { user, session, signOut } = useAuth();
  const currentUserId = user?.id;
  const userRole = user?.role as UserRole;
  const { t } = useLanguage();
  const [yurts, setYurts] = useState<Yurt[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [icalEvents, setIcalEvents] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<'checkin' | 'team' | 'financials' | 'approvals'>('checkin');
  const [loading, setLoading] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [calendarPreference, setCalendarPreference] = useState<'internal' | 'ical'>('internal');
  const [icalConfig, setIcalConfig] = useState({
    url: '',
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  useEffect(() => {
    // Load calendar preference from localStorage
    const savedPreference = localStorage.getItem('ceo_calendar_preference') as 'internal' | 'ical' | 'google' | null;
    if (savedPreference && (savedPreference === 'internal' || savedPreference === 'ical')) {
      setCalendarPreference(savedPreference);
    } else if (savedPreference === 'google') {
      // Migrate old 'google' preference to 'ical'
      setCalendarPreference('ical');
      localStorage.setItem('ceo_calendar_preference', 'ical');
    }
    // Load iCal config
    const savedConfig = localStorage.getItem('ical_config');
    if (savedConfig) {
      setIcalConfig(JSON.parse(savedConfig));
    }
  }, []);

  // Fetch and parse iCal events
  const fetchIcalEvents = async () => {
    if (!icalConfig.url || calendarPreference !== 'ical') {
      console.log('⚠️ iCal fetch skipped - URL:', icalConfig.url, 'Preference:', calendarPreference);
      return;
    }
    
    console.log('🔄 Fetching iCal from:', icalConfig.url);
    
    try {
      const response = await fetch(icalConfig.url);
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        console.error('❌ Failed to fetch iCal:', response.status, response.statusText);
        setIcalEvents([]);
        return;
      }
      
      const icalData = await response.text();
      console.log('📄 iCal data length:', icalData.length);
      
      const jcalData = ICAL.parse(icalData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');
      console.log('📋 Number of vevents:', vevents.length);
      
      const mappedEvents: Booking[] = vevents.map((vevent, index) => {
        const event = new ICAL.Event(vevent);
        const startDate = event.startDate.toJSDate().toISOString().split('T')[0];
        const endDate = event.endDate.toJSDate().toISOString().split('T')[0];
        
        console.log(`📅 Event ${index}: ${event.summary} (${startDate} - ${endDate})`);
        
        return {
          id: 10000 + index, // Offset to avoid collision with Supabase IDs
          yurt_id: 1, // Default yurt
          guest_name: event.summary || 'iCal Event',
          check_in: startDate,
          check_out: endDate,
          total_price: 0,
          number_of_people: 1,
          payment_status: 'Paid',
          source: 'Manual',
          status: 'confirmed',
          notes: event.description || 'Imported from iCal',
          meal_notes: null,
          approved_by_manager: true,
          created_by_id: currentUserId || '',
          last_edited_by_id: null,
        };
      });
      
      console.log('✅ iCal events fetched:', mappedEvents.length);
      setIcalEvents(mappedEvents);
    } catch (err) {
      console.error('❌ Error fetching iCal events:', err);
      setIcalEvents([]);
    }
  };

  // Fetch iCal events when preference changes or on mount
  useEffect(() => {
    if (calendarPreference === 'ical' && icalConfig.url) {
      fetchIcalEvents();
    }
  }, [calendarPreference, icalConfig.url]);

  useEffect(() => {
    fetchData();
    // Poll for updates every 5 seconds for real-time sync
    console.log('⏰ CEO Starting 5-second polling');
    const interval = setInterval(() => {
      console.log('⏰ CEO Polling...');
      fetchData();
    }, 5000);
    
    // Check for automatic check-outs and overdue check-ins every minute
    const checkInterval = setInterval(async () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const currentHour = now.getHours();
      
      // Automatic check-out: if it's past 12:00 noon on check-out date
      if (currentHour >= 12) {
        const { data: checkedInBookings } = await supabase.from('bookings').select('*').eq('status', 'checked_in');
        if (checkedInBookings) {
          for (const booking of checkedInBookings) {
            if (booking.check_out === today) {
              console.log('🕐 Auto-checking out guest:', booking.guest_name);
              await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id);
            }
          }
        }
      }
      
      // Alert for guests not checked in within 24 hours of check-in date
      const { data: confirmedBookings } = await supabase.from('bookings').select('*').eq('status', 'confirmed');
      if (confirmedBookings) {
        for (const booking of confirmedBookings) {
          const checkInDate = new Date(booking.check_in);
          const daysDiff = Math.floor((now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // If check-in date was yesterday (1 day passed) and still not checked in
          if (daysDiff >= 1 && daysDiff <= 2) {
            console.warn('⚠️ Guest not checked in within 24 hours:', booking.guest_name, 'Check-in was:', booking.check_in);
            // You could show a UI alert here if needed
          }
        }
      }
    }, 60000); // Check every minute
    
    // Listen for localStorage changes from other tabs for instant sync
    const handleStorageChange = (e: StorageEvent) => {
      console.log('🔔 CEO Storage event:', e.key);
      if (e.key === 'camp_bookings' || e.key === 'camp_yurts' || e.key === 'camp_profiles') {
        fetchData();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      clearInterval(checkInterval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [yurtsData, bookingsData, staffData, notificationsData, pendingUsersData] = await Promise.all([
        supabase.from('yurts').select('*'),
        supabase.from('bookings').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('notifications').select('*').eq('user_id', currentUserId || '').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('approved', false)
      ]);

      console.log('🔄 CEO Fetched bookings:', bookingsData.data?.length);

      const deDuplicate = (arr: any[]) => {
        if (!arr) return [];
        const map = new Map();
        arr.forEach(item => {
          if (item && item.id && !map.has(item.id)) {
            map.set(item.id, item);
          }
        });
        return Array.from(map.values());
      };

      setYurts(deDuplicate(yurtsData.data));
      setBookings(deDuplicate(bookingsData.data));
      setStaff(staffData.data || []);
      setNotifications((notificationsData.data || []).slice(0, 10));
      setPendingUsers(pendingUsersData.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    await supabase.from('bookings').update({ ...updates, last_edited_by_id: currentUserId || '', last_edited_by_role: userRole }).eq('id', id);
    fetchData();
  };

  const handleCancelBooking = async (id: number) => {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
    fetchData();
  };

  const handleCheckIn = async (id: number) => {
    await supabase.from('bookings').update({ status: 'checked_in' }).eq('id', id);
    fetchData();
  };

  const handleCheckOut = async (id: number) => {
    // First get the booking data
    const { data: booking } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (!booking) return;

    // Create camp_finances record from booking data
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

    // Then mark booking as completed
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
    fetchData();
  };

  const handleApproveUser = async (userId: string, role: UserRole) => {
    await supabase.from('profiles').update({ approved: true, role }).eq('id', userId);
    fetchData();
  };

  const handleRejectUser = async (userId: string) => {
    if (confirm('Are you sure you want to reject this user?')) {
      await supabase.from('profiles').delete().eq('id', userId);
      fetchData();
    }
  };


  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-indigo-900 font-medium animate-pulse">Initializing Command Center...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      <header className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-950 text-white shadow-2xl sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200 uppercase">
                {t('portal.ceo')}
              </h1>
              <p className="text-xs text-indigo-300 font-medium tracking-widest uppercase opacity-80">Isky Camp Executive Flow</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowSettingsModal(true)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              SETTINGS
            </button>
            <LanguageSwitcher />
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all relative"
              >
                <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="font-black text-slate-900">Notifications</h3>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-4 text-slate-500 text-sm">No notifications</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {(showAllNotifications ? notifications : notifications.slice(0, 5)).map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 ${!notification.read ? 'bg-indigo-50' : ''}`}
                          onClick={async () => {
                            if (!notification.read && notification.type !== 'delete_request') {
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
                                  notification.status === 'denied' ? 'bg-rose-100 text-rose-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
                                </div>
                              )}
                              <p className="text-slate-400 text-xs mt-2">{new Date(notification.created_at).toLocaleString()}</p>
                            </div>
                            {notification.status === 'approved' && (
                              <svg className="w-5 h-5 text-emerald-600 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {notification.status === 'denied' && (
                              <svg className="w-5 h-5 text-rose-600 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </div>
                          {notification.type === 'delete_request' && notification.status !== 'approved' && notification.status !== 'denied' && (
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!notification.related_id) return;
                                  
                                  try {
                                    // Get the record from camp_finances
                                    const { data: record } = await supabase
                                      .from('camp_finances')
                                      .select('*')
                                      .eq('id', notification.related_id)
                                      .single();
                                    
                                    // Get Manager who requested the delete
                                    const { data: managerData } = await supabase
                                      .from('profiles')
                                      .select('id')
                                      .eq('role', 'Manager')
                                      .single();
                                    
                                    if (record) {
                                      // Extract reason from notification message
                                      const reasonMatch = notification.message.match(/Reason: (.+)$/);
                                      const deleteReason = reasonMatch ? reasonMatch[1] : '';
                                      
                                      // Insert into deleted_records
                                      await supabase.from('deleted_records').insert({
                                        id: record.id,
                                        original_id: record.id,
                                        type: record.type,
                                        date: record.date,
                                        category: record.category,
                                        description: record.description,
                                        original_amount: record.original_amount,
                                        amount_uzs: record.amount_uzs,
                                        currency: record.currency,
                                        exchange_rate: record.exchange_rate,
                                        guest_name: record.guest_name,
                                        guest_count: record.guest_count,
                                        children_under_12: record.children_under_12,
                                        nights: record.nights,
                                        payment_method: record.payment_method,
                                        guide_service: record.guide_service,
                                        guide_names: record.guide_names,
                                        transportation: record.transportation,
                                        transportation_details: record.transportation_details,
                                        lunch: record.lunch,
                                        lunch_count: record.lunch_count,
                                        dinner: record.dinner,
                                        dinner_count: record.dinner_count,
                                        laundry: record.laundry,
                                        laundry_price: record.laundry_price,
                                        laundry_currency: record.laundry_currency,
                                        receipt_url: record.receipt_url,
                                        delete_reason: deleteReason,
                                        deleted_by: 'Manager',
                                      });
                                      
                                      // Delete from camp_finances
                                      await supabase.from('camp_finances').delete().eq('id', notification.related_id);
                                    }
                                    
                                    // Update notification status to approved
                                    await supabase.from('notifications').update({ status: 'approved', read: true }).eq('id', notification.id);
                                    
                                    // Send notification to Manager
                                    if (managerData) {
                                      await supabase.from('notifications').insert({
                                        user_id: managerData.id,
                                        type: 'delete_approved',
                                        title: 'Delete Request Approved',
                                        message: `Your delete request has been approved by the CEO.`,
                                        related_id: notification.related_id,
                                      });
                                    }
                                    
                                    setNotifications(notifications.map(n => n.id === notification.id ? { ...n, status: 'approved', read: true } : n));
                                  } catch (err) {
                                    console.error('Error approving delete:', err);
                                  }
                                }}
                                className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all"
                              >
                                Approve
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  
                                  // Get Manager who requested the delete
                                  const { data: managerData } = await supabase
                                    .from('profiles')
                                    .select('id')
                                    .eq('role', 'Manager')
                                    .single();
                                  
                                  // Update notification status to denied
                                  await supabase.from('notifications').update({ status: 'denied', read: true }).eq('id', notification.id);
                                  
                                  // Send notification to Manager
                                  if (managerData) {
                                    await supabase.from('notifications').insert({
                                      user_id: managerData.id,
                                      type: 'delete_denied',
                                      title: 'Delete Request Denied',
                                      message: `Your delete request has been denied by the CEO.`,
                                      related_id: notification.related_id,
                                    });
                                  }
                                  
                                  setNotifications(notifications.map(n => n.id === notification.id ? { ...n, status: 'denied', read: true } : n));
                                }}
                                className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-all"
                              >
                                Deny
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {notifications.length > 5 && !showAllNotifications && (
                        <button
                          onClick={() => setShowAllNotifications(true)}
                          className="w-full py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-all"
                        >
                          Show More ({notifications.length - 5} more)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={signOut} className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        <div className="flex bg-white/50 p-1.5 rounded-2xl mb-8 border border-slate-200 shadow-sm w-fit">
          {(['checkin', 'team', 'financials', 'approvals'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-3 rounded-xl font-bold capitalize transition-all duration-300 text-sm flex items-center gap-2 ${
                activeTab === tab ? 'bg-white text-indigo-700 shadow-lg border border-slate-100 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab === 'approvals' ? (
                <>
                  Approvals
                  {pendingUsers.length > 0 && (
                    <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingUsers.length}</span>
                  )}
                </>
              ) : t(`tab.${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === 'checkin' && (
          <div className="animate-in fade-in duration-500">
            {/* Sync iCal Button */}
            {calendarPreference === 'ical' && icalConfig.url && (
              <div className="mb-4 flex items-center justify-between bg-blue-50 p-4 rounded-xl border border-blue-200">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/>
                  </svg>
                  <span className="text-sm text-blue-800">
                    {icalEvents.length > 0 
                      ? `${icalEvents.length} iCal events loaded` 
                      : 'iCal connected'}
                  </span>
                </div>
                <button
                  onClick={fetchIcalEvents}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Now
                </button>
              </div>
            )}
            <OccupancyCalendar
              bookings={calendarPreference === 'ical' ? icalEvents : bookings}
              yurts={yurts}
              userRole={userRole}
              currentUserId={currentUserId}
              staff={staff}
              onCancelBooking={handleCancelBooking}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onUpdateBooking={handleUpdateBooking}
            />
          </div>
        )}
        {activeTab === 'financials' && (
          <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 border border-slate-100 p-8 animate-in fade-in duration-500">
            <h2 className="text-2xl font-black text-slate-800 mb-4">Financial Calendar</h2>
            <p className="text-slate-600 mb-6">View income and expenses by date. Click on any day to see details.</p>
            <a
              href="/ceo-financials"
              className="inline-block px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
            >
              Go to Financial Calendar
            </a>
          </div>
        )}
        {activeTab === 'approvals' && (
          <div className="animate-in fade-in duration-500">
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-gradient-to-r from-amber-50/50 to-white">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </span>
                  Pending User Approvals
                </h3>
                <p className="text-sm text-slate-500 mt-2">Review and approve new user registration requests</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Requested Role</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pendingUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-slate-400">
                          No pending approvals
                        </td>
                      </tr>
                    ) : pendingUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-amber-50/30 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 font-black shadow-inner">
                              {user.full_name?.charAt(0) || 'N'}
                            </div>
                            <span className="font-bold text-slate-800">{user.full_name}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-sm text-slate-600">{user.email}</td>
                        <td className="px-8 py-5 text-sm text-slate-600">{user.phone || 'N/A'}</td>
                        <td className="px-8 py-5">
                          <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold uppercase">{user.role}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex gap-2">
                            <select
                              onChange={(e) => handleApproveUser(user.id, e.target.value as UserRole)}
                              className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-black bg-white"
                              defaultValue=""
                            >
                              <option value="" disabled>Approve as...</option>
                              <option value="Manager">Manager</option>
                              <option value="Cook">Cook</option>
                              <option value="Reserver">Reserver</option>
                              <option value="Observer">Observer</option>
                            </select>
                            <button
                              onClick={() => handleRejectUser(user.id)}
                              className="px-3 py-2 bg-rose-100 text-rose-600 rounded-lg text-sm font-bold hover:bg-rose-200 transition-all"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'team' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-gradient-to-r from-slate-50/50 to-white">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  </span>
                  Operational Taskforce
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.name')}</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.email')}</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('table.role')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {staff.map((member) => (
                      <tr key={member.id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-black shadow-inner">
                              {member.full_name?.charAt(0) || 'N'}
                            </div>
                            <span className="font-bold text-slate-800">{member.full_name || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 font-medium text-slate-500">{member.email}</td>
                        <td className="px-8 py-5">
                          <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase shadow-sm ${
                            member.role === 'CEO' ? 'bg-indigo-600 text-white' :
                            member.role === 'Manager' ? 'bg-blue-100 text-blue-800' :
                            member.role === 'Cook' ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {member.role}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>


      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowSettingsModal(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800">Calendar Settings</h2>
              <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Choose Calendar Type</label>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setCalendarPreference('internal');
                      localStorage.setItem('ceo_calendar_preference', 'internal');
                    }}
                    className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                      calendarPreference === 'internal' 
                        ? 'border-indigo-600 bg-indigo-50' 
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-800">Internal Calendar</p>
                      <p className="text-xs text-slate-500">Built-in calendar for Isky Camp</p>
                    </div>
                    {calendarPreference === 'internal' && (
                      <svg className="w-6 h-6 text-indigo-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </button>
                  
                  <button
                    onClick={() => {
                      setCalendarPreference('ical');
                      localStorage.setItem('ceo_calendar_preference', 'ical');
                    }}
                    className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                      calendarPreference === 'ical' 
                        ? 'border-indigo-600 bg-indigo-50' 
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="p-2 bg-blue-50 rounded-xl">
                      <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/></svg>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-800">iCal Calendar</p>
                      <p className="text-xs text-slate-500">Sync with iCal feed URL</p>
                    </div>
                    {calendarPreference === 'ical' && (
                      <svg className="w-6 h-6 text-indigo-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </button>
                </div>
              </div>
              
              {calendarPreference === 'ical' && (
                <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-sm text-blue-800 mb-4">
                    <strong>Setup Instructions:</strong> Get your iCal feed URL from Google Calendar, Outlook, or any calendar app.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">iCal URL</label>
                    <input
                      type="text"
                      value={icalConfig.url}
                      onChange={(e) => setIcalConfig({ ...icalConfig, url: e.target.value })}
                      placeholder="https://calendar.google.com/calendar/ical/..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-xs text-slate-600">
                    <strong>To get iCal URL from Google Calendar:</strong> Settings → Share with specific people → Get shareable link → Copy the iCal URL
                  </p>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                if (calendarPreference === 'ical') {
                  localStorage.setItem('ical_config', JSON.stringify(icalConfig));
                }
                setShowSettingsModal(false);
              }}
              className="w-full mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
