'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useRouter } from 'next/navigation';

export default function CEOFinancialsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEOFinancialCalendar />
    </ProtectedRoute>
  );
}

function CEOFinancialCalendar() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayFinances, setDayFinances] = useState<Finance[]>([]);
  const [dayBookings, setDayBookings] = useState<Booking[]>([]);
  const [dayReceipts, setDayReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cashBox, setCashBox] = useState<{ USD: number; UZS: number; EUR: number }>({ USD: 0, UZS: 0, EUR: 0 });
  const [checkedInCounts, setCheckedInCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchCashBox();
    fetchCheckedInCounts();
  }, [currentDate]);

  const fetchCashBox = async () => {
    const { data } = await supabase.from('payments').select('*').eq('method', 'Cash');
    if (data) {
      const summary = data.reduce((acc: any, p: any) => {
        acc[p.currency_original] = (acc[p.currency_original] || 0) + p.amount_original;
        return acc;
      }, { USD: 0, UZS: 0, EUR: 0 });
      setCashBox(summary);
    }
  };

  const fetchCheckedInCounts = async () => {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0).toISOString();
    
    try {
      const { data } = await supabase
        .from('bookings')
        .select('check_in, check_out, status, number_of_people, guest_count')
        .gte('check_in', start)
        .lte('check_in', end)
        .in('status', ['checked_in', 'completed']);

      if (data) {
        const counts: Record<string, number> = {};
        data.forEach(booking => {
          const checkIn = booking.check_in;
          const checkOut = booking.check_out;
          const people = booking.number_of_people || booking.guest_count || 1;
          
          // Count for each day of the stay
          const current = new Date(checkIn);
          const end = new Date(checkOut);
          while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            counts[dateStr] = (counts[dateStr] || 0) + people;
            current.setDate(current.getDate() + 1);
          }
        });
        setCheckedInCounts(counts);
      }
    } catch (error) {
      console.error('Error fetching checked-in counts:', error);
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handleDayClick = async (day: number) => {
    const date = new Date(year, month, day);
    setSelectedDay(date);
    setLoading(true);

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    try {
      // Fetch camp finances (expenses)
      const { data: finances } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('date', dateStr)
        .order('created_at', { ascending: false });

      // Fetch bookings that checked out on this day with settled tabs
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('check_out', dateStr)
        .in('status', ['completed'])
        .order('check_out', { ascending: false });

      // Fetch receipts created on this day (revenue from settled tabs)
      const { data: receipts } = await supabase
        .from('booking_receipts')
        .select('*')
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`)
        .order('created_at', { ascending: false });

      setDayFinances(finances || []);
      setDayBookings(bookings || []);
      setDayReceipts(receipts || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setDayFinances([]);
      setDayBookings([]);
      setDayReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFinanceClick = (finance: Finance) => {
    router.push(`/ceo-financials/detail/${finance.id}`);
  };

  const handleBookingClick = (booking: Booking) => {
    router.push(`/ceo-financials/booking/${booking.id}`);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-indigo-800 to-purple-900 text-white shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a
              href="/ceo"
              className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg"
            >
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Financial Calendar</h1>
              <p className="text-xs text-indigo-300 font-bold tracking-widest uppercase opacity-80">CEO View Only</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/ceo-financials/pricing')}
              className="px-5 py-2.5 bg-emerald-600/90 hover:bg-emerald-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pricing
            </button>
            <LanguageSwitcher variant="light" />
            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Cash Box Summary */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 text-white shadow-2xl border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30 backdrop-blur-md">
              <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Camp Cash Box</h2>
              <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest opacity-70">Physical drawer contents</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-tighter">USD Total</p>
              <p className="text-2xl font-black tracking-tight">${cashBox.USD.toLocaleString()}</p>
            </div>
            <div className="space-y-1 border-x border-white/10 px-6">
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-tighter">UZS (Sum)</p>
              <p className="text-2xl font-black tracking-tight">{cashBox.UZS.toLocaleString()} <span className="text-xs opacity-50">sum</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-indigo-300 uppercase tracking-tighter">EUR Total</p>
              <p className="text-2xl font-black tracking-tight">€{cashBox.EUR.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1))}
              className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-2xl font-black text-slate-800">
              {monthNames[month]} {year}
            </h2>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1))}
              className="p-2 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-sm font-bold text-slate-600 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`min-h-[80px] p-2 rounded-xl border-2 transition-all ${
                    isToday
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}
                >
                  <span className="text-sm font-bold text-slate-800">{day}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedDay && (
          <div className="mt-6 bg-white rounded-2xl shadow-xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">
                {selectedDay.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Net Profit Summary */}
                <div className="bg-slate-100 rounded-xl p-4 mb-6 border-2 border-slate-300">
                  <p className="text-sm font-black text-slate-900 mb-1">Net Profit</p>
                  <p className="text-3xl font-black text-slate-900">
                    {(() => {
                      const revenue = dayReceipts.reduce((sum, r) => sum + (r.total_usd || 0), 0);
                      const expenses = dayFinances.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount_uzs, 0);
                      const expenseUsd = expenses / 12500; // Approximate conversion
                      const net = revenue - expenseUsd;
                      return `${net.toFixed(2)} USD`;
                    })()}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Left: Guest Payments (Revenue) */}
                  <div>
                    <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-3">Guest Payments</h4>
                    <div className="space-y-3">
                      {dayReceipts.length > 0 ? dayReceipts.map((receipt) => (
                        <div key={receipt.id} className="p-3 rounded-xl border-2 bg-emerald-50 border-emerald-200">
                          <p className="font-bold text-slate-800 text-sm">Tab {receipt.receipt_id}</p>
                          {receipt.snapshot?.payments?.map((payment: any, idx: number) => (
                            <div key={idx} className="mt-2 text-xs">
                              <p className="text-slate-600">{payment.method}</p>
                              <p className="font-black text-emerald-700">{payment.amount} {payment.currency}</p>
                            </div>
                          ))}
                          <p className="mt-2 text-xs font-black text-slate-900">Total: ${(receipt.total_usd || 0).toFixed(2)}</p>
                        </div>
                      )) : (
                        <p className="text-center text-slate-500 italic text-sm">No settled tabs for this day</p>
                      )}
                    </div>
                  </div>

                  {/* Right: Expenses by Category */}
                  <div>
                    <h4 className="text-sm font-black text-rose-900 uppercase tracking-widest mb-3">Expenses</h4>
                    <div className="space-y-3">
                      {(() => {
                        const expensesByCategory = dayFinances
                          .filter(f => f.type === 'expense')
                          .reduce((acc: any, f) => {
                            const cat = f.category || 'Other';
                            if (!acc[cat]) acc[cat] = { total: 0, count: 0, items: [] };
                            acc[cat].total += f.amount_uzs;
                            acc[cat].count += 1;
                            acc[cat].items.push(f);
                            return acc;
                          }, {});

                        return Object.keys(expensesByCategory).length > 0 ? (
                          Object.entries(expensesByCategory).map(([category, data]: any) => (
                            <button
                              key={category}
                              onClick={() => {
                                // Show expense details
                                const expense = data.items[0];
                                if (expense) handleFinanceClick(expense);
                              }}
                              className="w-full p-3 rounded-xl border-2 bg-rose-50 border-rose-200 text-left hover:shadow-lg hover:border-rose-400 transition-all"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-slate-800 text-sm">{category}</p>
                                  <p className="text-xs text-slate-600">{data.count} item(s)</p>
                                </div>
                                <p className="font-black text-rose-700 text-sm">
                                  {(data.total / 12500).toFixed(2)} USD
                                </p>
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="text-center text-slate-500 italic text-sm">No expenses for this day</p>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
