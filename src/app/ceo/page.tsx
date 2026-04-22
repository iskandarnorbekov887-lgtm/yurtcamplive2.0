'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Yurt, type Booking, type Expense, type Profile } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import jsPDF from 'jspdf';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { OccupancyCalendar } from '@/components/occupancy-calendar';
import type { UserRole } from '@/lib/supabase';

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
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState<Booking[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<'checkin' | 'finance' | 'team'>('checkin');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [calendarPreference, setCalendarPreference] = useState<'internal' | 'google'>('internal');
  const [googleCalendarConfig, setGoogleCalendarConfig] = useState({
    apiKey: '',
    clientId: '',
    calendarId: '',
  });
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
    // Load calendar preference from localStorage
    const savedPreference = localStorage.getItem('ceo_calendar_preference') as 'internal' | 'google' | null;
    if (savedPreference) {
      setCalendarPreference(savedPreference);
    }
    // Load Google Calendar config
    const savedConfig = localStorage.getItem('google_calendar_config');
    if (savedConfig) {
      setGoogleCalendarConfig(JSON.parse(savedConfig));
    }
  }, []);

  // Fetch Google Calendar events using provider_token from Supabase session
  const fetchGoogleCalendarEvents = async () => {
    const provider_token = session?.provider_token;
    if (!provider_token || calendarPreference !== 'google') return;
    
    try {
      const calendarId = googleCalendarConfig.calendarId || 'primary';
      const timeMin = new Date(new Date().getFullYear(), 0, 1).toISOString(); // Start of year
      const timeMax = new Date(new Date().getFullYear() + 1, 11, 31).toISOString(); // End of next year
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            'Authorization': `Bearer ${provider_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('📅 Google Calendar events fetched:', data.items?.length || 0);
        
        // Convert Google Calendar events to Booking format
        const mappedEvents: Booking[] = (data.items || []).map((event: any, index: number) => {
          const startDate = event.start?.date || event.start?.dateTime?.split('T')[0];
          const endDate = event.end?.date || event.end?.dateTime?.split('T')[0];
          
          return {
            id: 10000 + index, // Offset to avoid collision with Supabase IDs
            yurt_id: 1, // Default yurt
            guest_name: event.summary || 'Google Calendar Event',
            check_in: startDate,
            check_out: endDate,
            total_price: 0,
            number_of_people: 1,
            payment_status: 'Paid',
            source: 'Manual',
            status: 'confirmed',
            notes: event.description || 'Imported from Google Calendar',
            meal_notes: null,
            approved_by_manager: true,
            created_by_id: currentUserId || '',
            last_edited_by_id: null,
          };
        });
        
        setGoogleCalendarEvents(mappedEvents);
      } else {
        const error = await response.json();
        console.error('❌ Failed to fetch Google Calendar events:', error);
        setGoogleCalendarEvents([]);
      }
    } catch (err) {
      console.error('❌ Error fetching Google Calendar events:', err);
      setGoogleCalendarEvents([]);
    }
  };

  // Fetch Google Calendar events when preference changes or on mount
  useEffect(() => {
    if (calendarPreference === 'google' && session?.provider_token) {
      fetchGoogleCalendarEvents();
    }
  }, [calendarPreference, session?.provider_token]);

  const syncToGoogleCalendar = async (booking: Booking) => {
    const provider_token = session?.provider_token;
    if (calendarPreference !== 'google' || !provider_token) return;
    
    try {
      const event = {
        summary: `${booking.guest_name} - Isky Camp Yurt Booking`,
        description: `Guest: ${booking.guest_name}\nYurt: ${booking.yurt?.name || 'TBD'}\nParty Size: ${booking.number_of_people}\nPrice: $${booking.total_price}\nNotes: ${booking.notes || ''}`,
        start: {
          date: booking.check_in,
        },
        end: {
          date: booking.check_out,
        },
      };

      const calendarId = googleCalendarConfig.calendarId || 'primary';
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (response.ok) {
        console.log('✅ Booking synced to Google Calendar');
      } else {
        const error = await response.json();
        console.error('❌ Failed to sync to Google Calendar:', error);
      }
    } catch (err) {
      console.error('❌ Error syncing to Google Calendar:', err);
    }
  };

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
      if (e.key === 'camp_bookings' || e.key === 'camp_yurts' || e.key === 'camp_expenses' || e.key === 'camp_profiles') {
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
      const [{ data: yurtsData }, { data: bookingsData }, { data: expensesData }, { data: staffData }] = await Promise.all([
        supabase.from('yurts').select('*'),
        supabase.from('bookings').select('*'),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ]);

      console.log('🔄 CEO Fetched bookings:', bookingsData?.length);

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

      setYurts(deDuplicate(yurtsData || []));
      setBookings(deDuplicate(bookingsData || []));
      setExpenses(deDuplicate(expensesData || []));
      setStaff(deDuplicate(staffData || []));
    } catch (error) {
      console.error('Error fetching CEO data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = (period: 'weekly' | 'monthly' | 'yearly') => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 138);
    doc.text('ISKY CAMP FLOW - EXECUTIVE REPORT', 20, 25);
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 30, 190, 30);
    doc.setFontSize(14);
    doc.setTextColor(75, 85, 99);
    doc.text(`Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`, 20, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 55);
    
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.total_price || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.total_amount || 0), 0);
    const profit = totalRevenue - totalExpenses;
    
    doc.setFontSize(12);
    doc.setTextColor(31, 41, 55);
    doc.text(`Total Revenue: $${totalRevenue.toLocaleString()}`, 20, 75);
    doc.text(`Total Expenses: $${totalExpenses.toLocaleString()}`, 20, 85);
    doc.setFontSize(14);
    doc.setTextColor(profit >= 0 ? 22 : 153, profit >= 0 ? 101 : 27, profit >= 0 ? 52 : 27);
    doc.text(`Net Profit: $${profit.toLocaleString()}`, 20, 100);
    doc.save(`camp-report-${period}.pdf`);
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
    await supabase.from('bookings').update({ status: 'completed' }).eq('id', id);
    fetchData();
  };

  const handleAddBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.from('bookings').insert([{
        ...formData,
        total_price: parseFloat(formData.total_price),
        number_of_people: parseInt(formData.num_people),
        num_people: parseInt(formData.num_people),
        status: 'confirmed',
        created_by_role: 'CEO',
        created_by_id: currentUserId || '',
        last_edited_by_id: currentUserId || ''
      }]).select().single();
      if (error) throw error;
      
      // Sync to Google Calendar if enabled
      if (calendarPreference === 'google' && data) {
        await syncToGoogleCalendar(data);
      }
      
      setShowAddModal(false);
      fetchData();
    } catch (err) {
      alert('Error creating booking');
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
            <div className="hidden md:flex gap-2 mr-4 border-r border-white/10 pr-4">
              <button onClick={() => generatePDF('weekly')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-2">
                WEEKLY REPORT
              </button>
              <button onClick={() => generatePDF('monthly')} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-2">
                MONTHLY REPORT
              </button>
            </div>
            <button onClick={() => setShowSettingsModal(true)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              SETTINGS
            </button>
            <LanguageSwitcher />
            <button onClick={signOut} className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        <div className="flex bg-white/50 p-1.5 rounded-2xl mb-8 border border-slate-200 shadow-sm w-fit">
          {(['checkin', 'finance', 'team'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-3 rounded-xl font-bold capitalize transition-all duration-300 text-sm flex items-center gap-2 ${
                activeTab === tab ? 'bg-white text-indigo-700 shadow-lg border border-slate-100 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t(`tab.${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === 'checkin' && (
          <div className="animate-in fade-in duration-500">
            <OccupancyCalendar 
              bookings={calendarPreference === 'google' ? [...bookings, ...googleCalendarEvents] : bookings} 
              yurts={yurts} 
              userRole={userRole}
              currentUserId={currentUserId}
              staff={staff}
              onCancelBooking={handleCancelBooking}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onUpdateBooking={handleUpdateBooking}
              onAddBooking={() => setShowAddModal(true)}
            />
          </div>
        )}
        {activeTab === 'finance' && <StrategicFinanceCalendar expenses={expenses} bookings={bookings} />}
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

      {showAddModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}></div>
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-indigo-900 text-white flex justify-between items-center">
              <h2 className="text-2xl font-black">{t('btn.new_booking')}</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleAddBooking} className="p-8 grid grid-cols-2 gap-6 bg-white overflow-y-auto max-h-[70vh]">
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.guest_name')}</label>
                <input type="text" value={formData.guest_name} onChange={(e) => setFormData({...formData, guest_name: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.check_in')}</label>
                <input type="date" value={formData.check_in} onChange={(e) => setFormData({...formData, check_in: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.check_out')}</label>
                <input type="date" value={formData.check_out} onChange={(e) => setFormData({...formData, check_out: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.yurt_select')}</label>
                <select value={formData.yurt_id} onChange={(e) => setFormData({...formData, yurt_id: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" required>
                  <option value="">-- {t('form.yurt_select')} --</option>
                  {yurts.map(y => <option key={y.id} value={y.id}>{y.name} ({y.type})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.num_people')}</label>
                <input type="number" value={formData.num_people} onChange={(e) => setFormData({...formData, num_people: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('table.status')}</label>
                <select value={formData.payment_status} onChange={(e) => setFormData({...formData, payment_status: e.target.value as any})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" required>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.total_price')}</label>
                <input type="number" value={formData.total_price} onChange={(e) => setFormData({...formData, total_price: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" required />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.transportation')}</label>
                <input type="text" value={formData.transportation} onChange={(e) => setFormData({...formData, transportation: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" placeholder="Flight info, pickup point..." />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.meal_preference')}</label>
                <textarea value={formData.meal_preference} onChange={(e) => setFormData({...formData, meal_preference: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" placeholder="Allergies, Halal, Vegetarian..." />
              </div>
              <div className="flex items-center gap-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('form.guide_required')}</label>
                <input type="checkbox" checked={formData.guide_required} onChange={(e) => setFormData({...formData, guide_required: e.target.checked})} className="w-6 h-6 text-indigo-600 border-2 border-slate-100 rounded focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('form.special_requests')}</label>
                <textarea value={formData.special_requests} onChange={(e) => setFormData({...formData, special_requests: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 transition-all font-bold text-slate-700" />
              </div>
              <div className="col-span-2 pt-4">
                <button type="submit" className="w-full py-4 bg-indigo-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-950 transition-all shadow-xl shadow-indigo-200">{t('btn.new_booking')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                      setCalendarPreference('google');
                      localStorage.setItem('ceo_calendar_preference', 'google');
                    }}
                    className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                      calendarPreference === 'google' 
                        ? 'border-indigo-600 bg-indigo-50' 
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-800">Google Calendar</p>
                      <p className="text-xs text-slate-500">Sync with your Google Calendar</p>
                    </div>
                    {calendarPreference === 'google' && (
                      <svg className="w-6 h-6 text-indigo-600 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    )}
                  </button>
                </div>
              </div>
              
              {calendarPreference === 'google' && (
                <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-sm text-blue-800 mb-4">
                    <strong>Setup Instructions:</strong> Create a Google Cloud project, enable Google Calendar API, and get your credentials from Google Cloud Console.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">API Key</label>
                    <input
                      type="text"
                      value={googleCalendarConfig.apiKey}
                      onChange={(e) => setGoogleCalendarConfig({ ...googleCalendarConfig, apiKey: e.target.value })}
                      placeholder="Enter your Google Calendar API Key"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Client ID</label>
                    <input
                      type="text"
                      value={googleCalendarConfig.clientId}
                      onChange={(e) => setGoogleCalendarConfig({ ...googleCalendarConfig, clientId: e.target.value })}
                      placeholder="Enter your OAuth Client ID"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Calendar ID</label>
                    <input
                      type="text"
                      value={googleCalendarConfig.calendarId}
                      onChange={(e) => setGoogleCalendarConfig({ ...googleCalendarConfig, calendarId: e.target.value })}
                      placeholder="primary or your calendar ID"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                if (calendarPreference === 'google') {
                  localStorage.setItem('google_calendar_config', JSON.stringify(googleCalendarConfig));
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



function StrategicFinanceCalendar({ expenses, bookings }: { expenses: Expense[], bookings: Booking[] }) {
  const { t } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = t(`month.${month}`);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const days = [];
  for (let i = 0; i < firstDayOfMonth(year, month); i++) days.push(null);
  for (let i = 1; i <= daysInMonth(year, month); i++) days.push(i);

  const getFinancialsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Expenses
    const dayExpenses = expenses.filter(e => e.created_at.startsWith(dateStr));
    const totalSpent = dayExpenses.reduce((sum, e) => sum + e.total_amount, 0);
    
    // Income (Bookings that check in on this day)
    const dayIncome = bookings.filter(b => b.check_in === dateStr && b.status === 'confirmed');
    const totalIncome = dayIncome.reduce((sum, b) => sum + (b.total_price || 0), 0);
    
    return { dayExpenses, dayIncome, totalSpent, totalIncome, dateStr };
  };

  const selectedDayData = selectedDate ? getFinancialsForDate(parseInt(selectedDate.split('-')[2])) : null;
  
  const totalMonthExpenses = expenses
    .filter(e => new Date(e.created_at).getMonth() === month && new Date(e.created_at).getFullYear() === year)
    .reduce((sum, e) => sum + e.total_amount, 0);
    
  const totalMonthIncome = bookings
    .filter(b => b.status === 'confirmed' && new Date(b.check_in).getMonth() === month && new Date(b.check_in).getFullYear() === year)
    .reduce((sum, b) => sum + (b.total_price || 0), 0);

  const netProfit = totalMonthIncome - totalMonthExpenses;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">{t('cal.fiscal_ledger')}</h2>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-all border border-slate-100"><svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-all border border-slate-100"><svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
          <span className="text-xl font-bold text-slate-400 ml-2">{monthName} {year}</span>
        </div>
        <div className="flex gap-10 items-center">
          <div className="text-right">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">TOTAL INCOME</p>
            <p className="text-lg font-black text-emerald-400/80">+${totalMonthIncome.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-1">TOTAL EXPENSES</p>
            <p className="text-lg font-black text-rose-600">-${totalMonthExpenses.toLocaleString()}</p>
          </div>
          <div className="text-right bg-emerald-50/50 px-6 py-3 rounded-2xl border border-emerald-100 shadow-sm">
            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.2em] mb-1">NET PROFIT</p>
            <p className={`text-2xl font-black ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-4">
        {[0,1,2,3,4,5,6].map(d => (
          <div key={d} className="text-center py-2 text-[10px] font-black text-slate-400 tracking-widest">{t(`day.${d}`)}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="h-32 bg-slate-50/30 rounded-[1.5rem] border border-dashed border-slate-100"></div>;
          const { totalSpent, totalIncome, dateStr } = getFinancialsForDate(day);
          const isToday = new Date().toISOString().split('T')[0] === dateStr;
          
          return (
            <div 
              key={day} 
              onClick={() => setSelectedDate(dateStr)} 
              className={`h-36 p-4 rounded-[2rem] border-2 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl bg-white border-slate-100 flex flex-col justify-between ${isToday ? 'ring-4 ring-indigo-500/20 !border-indigo-500' : ''}`}
            >
              <div className="flex justify-between items-start">
                <span className={`text-2xl font-black ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>{day}</span>
                <div className="flex gap-1.5 mt-1">
                  {totalIncome > 0 && <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-200 animate-pulse"></div>}
                  {totalSpent > 0 && <div className="w-3 h-3 rounded-full bg-rose-500 shadow-lg shadow-rose-200 animate-pulse"></div>}
                </div>
              </div>

              <div className="flex flex-col gap-1 items-end">
                {totalIncome > 0 && (
                  <div className="flex flex-col items-end">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter leading-none">INCOME</p>
                    <p className="text-sm font-black text-emerald-600 leading-tight">+${totalIncome.toLocaleString()}</p>
                  </div>
                )}
                {totalSpent > 0 && (
                  <div className="flex flex-col items-end">
                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-tighter leading-none">EXPENSES</p>
                    <p className="text-sm font-black text-rose-600 leading-tight">-${totalSpent.toLocaleString()}</p>
                  </div>
                )}
                {totalIncome === 0 && totalSpent === 0 && (
                  <div className="w-full text-center">
                    <p className="text-[10px] font-black text-slate-300 italic tracking-tighter">{t('cal.no_expenses')}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Financial Drill-Down Panel */}
      {selectedDate && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedDate(null)}></div>
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-100 flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b border-slate-50 bg-slate-50/30">
              <div className="flex justify-between items-start mb-6">
                <button onClick={() => setSelectedDate(null)} className="p-2 hover:bg-slate-200 rounded-xl transition-all"><svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full tracking-widest uppercase">{t('manifest.financial')}</span>
              </div>
              <h3 className="text-3xl font-black text-slate-800">{new Date(selectedDate).toLocaleDateString()}</h3>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-emerald-50 rounded-[1.5rem] border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-400 uppercase mb-1">INCOME</p>
                  <p className="text-xl font-black text-emerald-700">+${selectedDayData?.totalIncome.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-rose-50 rounded-[1.5rem] border border-rose-100">
                  <p className="text-[10px] font-black text-rose-400 uppercase mb-1">EXPENSES</p>
                  <p className="text-xl font-black text-rose-700">-${selectedDayData?.totalSpent.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {/* Income Items */}
              {selectedDayData?.dayIncome.map((booking) => (
                <div key={booking.id} className="p-6 rounded-[2rem] border border-emerald-100 bg-emerald-50/30 shadow-sm transition-all">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-emerald-500">Booking Revenue</p>
                  <h4 className="text-xl font-black text-slate-800">{booking.guest_name}</h4>
                  <p className="text-lg font-black text-emerald-600 mt-2">+${booking.total_price?.toLocaleString()}</p>
                </div>
              ))}
              
              {/* Expense Items */}
              {selectedDayData?.dayExpenses.map((expense) => (
                <div key={expense.id} className="p-6 rounded-[2rem] border border-slate-100 bg-white shadow-sm hover:shadow-xl transition-all">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-rose-400">{expense.category}</p>
                  <h4 className="text-xl font-black text-slate-800">{expense.item_name}</h4>
                  <p className="text-lg font-black text-rose-600 mt-2">-${expense.total_amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

