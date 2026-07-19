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

  type CheckedInBookingRow = {
    check_in: string;
    check_out: string;
    status: string;
    number_of_adults: number | null;
    number_of_children: number | null;
  };

  const fetchCheckedInCounts = async () => {
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 0).toISOString();
    
    try {
      const { data } = await supabase
        .from('bookings')
        .select('check_in, check_out, status, number_of_adults, number_of_children')
        .gte('check_in', start)
        .lte('check_in', end)
        .in('status', ['checked_in', 'completed']);

      if (data) {
        const counts: Record<string, number> = {};
        (data as CheckedInBookingRow[]).forEach((booking) => {
          const checkIn = booking.check_in;
          const checkOut = booking.check_out;
          const people = (booking.number_of_adults || 0) + (booking.number_of_children || 0) || 1;
          
          // Count for each day of the stay
          const current = new Date(checkIn);
          const end = new Date(checkOut);
          while (current < end) {
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
    <div className="min-h-screen bg-[#0F1419] font-sans text-[#EDE6D6]">
      <header className="bg-gradient-to-r from-[#0B6E4F] via-[#0B6E4F] to-[#0B6E4F] text-[#C9A227] shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a
              href="/ceo"
              className="p-2.5 bg-[#1C232E]/20 text-[#C9A227] rounded-lg hover:bg-[#1C232E]/30 transition-all border border-[#5C4A2E]/30 backdrop-blur-sm"
            >
              <svg className="w-6 h-6 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="p-2 bg-[#1C232E]/20 rounded-lg backdrop-blur-sm border border-[#5C4A2E]/30">
              <svg className="w-6 h-6 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#EDE6D6]">Financial Calendar</h1>
              <p className="text-[10px] text-[#9C9384] font-bold tracking-widest uppercase opacity-80">Audit HUD</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/ceo-financials/pricing')}
              className="px-4 py-2 bg-[#C9A227] text-[#1C232E] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#C9A227]/80 transition-all shadow-sm active:scale-95 flex items-center gap-2"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pricing
            </button>
            <LanguageSwitcher variant="dark" />
            <button
              onClick={signOut}
              className="px-4 py-2 bg-[#722F37] text-[#EDE6D6] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#722F37]/80 transition-all shadow-sm active:scale-95 flex items-center gap-2"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Cash Box Summary */}
        <div className="bg-zinc-950 rounded-xl p-8 text-white shadow-lg border border-white/5">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest">Camp Cash Box</h2>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Physical drawer contents</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-8">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">USD Total</p>
              <p className="text-2xl font-data font-bold tracking-tight text-white">${cashBox.USD.toLocaleString()}</p>
            </div>
            <div className="space-y-1 border-x border-white/5 px-8">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">UZS (Sum)</p>
              <p className="text-2xl font-data font-bold tracking-tight text-white">{cashBox.UZS.toLocaleString()} <span className="text-[10px] text-slate-500 font-medium">SUM</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">EUR Total</p>
              <p className="text-2xl font-data font-bold tracking-tight text-white">€{cashBox.EUR.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-[#1C232E] rounded-lg border border-[#5C4A2E]/30 shadow-sm p-8">
          <div className="flex justify-between items-center mb-10">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1))}
              className="p-2 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-lg hover:bg-[#2A1518] transition-all"
            >
              <svg className="w-5 h-5 text-[#EDE6D6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-xl font-bold text-[#EDE6D6] uppercase tracking-tight">
              {monthNames[month]} {year}
            </h2>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1))}
              className="p-2 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-lg hover:bg-[#2A1518] transition-all"
            >
              <svg className="w-5 h-5 text-[#EDE6D6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-3 mb-3">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-[10px] font-bold text-[#9C9384] uppercase tracking-widest py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-3">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] bg-[#1C232E]/30 rounded-lg border border-transparent" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const peopleCount = checkedInCounts[dateStr] || 0;
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`min-h-[90px] p-3 rounded-lg border transition-all flex flex-col justify-between group ${
                    isToday
                      ? 'border-[#0B6E4F] bg-[#0B6E4F]/20 shadow-sm'
                      : 'border-[#5C4A2E]/30 hover:border-[#0B6E4F] hover:bg-[#1C232E]/50'
                  }`}
                >
                  <span className={`text-xs font-bold ${isToday ? 'text-[#0B6E4F]' : 'text-[#EDE6D6]'}`}>{day}</span>
                  {peopleCount > 0 && (
                    <div className="text-[10px] font-data font-bold text-[#0B6E4F] bg-[#0B6E4F]/20 px-1.5 py-0.5 rounded border border-[#0B6E4F]/40 self-end">
                      {peopleCount}👤
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDay && (
          <div className="mt-8 bg-[#1C232E] rounded-lg border border-[#5C4A2E]/30 shadow-sm p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-[#5C4A2E]/30">
              <h3 className="text-sm font-bold text-[#EDE6D6] uppercase tracking-widest">
                {selectedDay.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1.5 hover:bg-[#2A1518] rounded-md transition-all text-[#9C9384] hover:text-[#EDE6D6]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Net Profit Summary */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-[#1C232E]/50 rounded-lg p-6 border border-[#5C4A2E]/30 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">Net Day Performance</p>
                      <p className="text-4xl font-data font-bold text-[#EDE6D6] tracking-tighter">
                        {(() => {
                          const revenue = dayReceipts.reduce((sum, r) => sum + (r.total_usd || 0), 0);
                          const expenses = dayFinances.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount_uzs, 0);
                          const expenseUsd = expenses / 12500; 
                          const net = revenue - expenseUsd;
                          return `$${net.toFixed(2)}`;
                        })()}
                      </p>
                    </div>
                    <div className={`p-4 rounded-full ${dayReceipts.length > 0 ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' : 'bg-[#1C232E]/30 text-[#9C9384]'}`}>
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    </div>
                  </div>
                  <div className="bg-[#1C232E]/50 rounded-lg p-6 border border-[#5C4A2E]/30 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">UZS Collected Today</p>
                      <p className="text-4xl font-data font-bold text-[#EDE6D6] tracking-tighter">
                        {(() => {
                          const uzsCollected = dayReceipts
                            .filter(r => r.currency === 'UZS')
                            .reduce((sum, r) => sum + (r.amount || 0), 0);
                          return uzsCollected.toLocaleString() + " SUM";
                        })()}
                      </p>
                    </div>
                    <div className={`p-4 rounded-full ${dayReceipts.length > 0 ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' : 'bg-[#1C232E]/30 text-[#9C9384]'}`}>
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Left: Guest Payments (Revenue) */}
                  <div>
                    <h4 className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-4">Live Revenue Pipeline</h4>
                    <div className="space-y-4">
                      {dayReceipts.length > 0 ? dayReceipts.map((receipt) => (
                        <div key={receipt.id} className="p-4 rounded-lg border border-[#5C4A2E]/30 bg-[#1C232E] hover:bg-[#1C232E]/50 transition-all group">
                          <div className="flex justify-between items-start mb-3">
                            <p className="font-bold text-[#EDE6D6] text-xs">Batch #{receipt.receipt_id}</p>
                            <span className="text-[10px] font-data font-bold text-[#0B6E4F] bg-[#0B6E4F]/20 px-2 py-0.5 rounded border border-[#0B6E4F]/40">${(receipt.total_usd || 0).toFixed(2)}</span>
                          </div>
                          {receipt.snapshot?.payments?.map((payment: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-[10px] font-medium text-[#9C9384] mt-1">
                              <span>{payment.method}</span>
                              <span className="font-data font-bold text-[#EDE6D6]">{payment.amount} {payment.currency}</span>
                            </div>
                          ))}
                        </div>
                      )) : (
                        <div className="py-12 border-2 border-dashed border-[#5C4A2E]/30 rounded-lg text-center">
                          <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">No Revenue Cycles</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Expenses by Category */}
                  <div>
                    <h4 className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-4">Burn Expenditure</h4>
                    <div className="space-y-4">
                      {(() => {
                        const expensesByCategory = dayFinances
                          .filter(f => f.type === 'expense')
                          .reduce((acc: any, f) => {
                            const cat = f.category || 'Unassigned';
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
                                const expense = data.items[0];
                                if (expense) handleFinanceClick(expense);
                              }}
                              className="w-full p-4 rounded-lg border border-[#5C4A2E]/30 bg-[#1C232E] hover:border-[#0B6E4F] hover:bg-[#1C232E]/50 transition-all text-left group"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-[#EDE6D6] text-xs">{category}</p>
                                  <p className="text-[10px] text-[#9C9384] font-medium uppercase mt-0.5">{data.count} line items</p>
                                </div>
                                <p className="font-data font-bold text-[#EDE6D6] text-sm">
                                  ${(data.total / 12500).toFixed(2)}
                                </p>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="py-12 border-2 border-dashed border-[#5C4A2E]/30 rounded-lg text-center">
                            <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">Zero Burn Logged</p>
                          </div>
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
