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
  const [dayIncome, setDayIncome] = useState<Finance[]>([]);
  const [loading, setLoading] = useState(false);
  const [cashBox, setCashBox] = useState<{ USD: number; UZS: number; EUR: number }>({ USD: 0, UZS: 0, EUR: 0 });
  const [checkedInCounts, setCheckedInCounts] = useState<Record<string, { inHouse: number; arriving: number; departing: number }>>({});
  
  // Slide-out panel state
  const [slideOutOpen, setSlideOutOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionDescription, setTransactionDescription] = useState('');
  const [transactionWorkerName, setTransactionWorkerName] = useState('');
  const [submittingTransaction, setSubmittingTransaction] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState('');
  
  // Expanded booking IDs for collapsible rows
  const [expandedBookings, setExpandedBookings] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchCashBox();
    fetchCheckedInCounts();
  }, [currentDate]);

  const fetchCashBox = async () => {
    // Fetch cash payments from payments table
    const { data: paymentsData } = await supabase.from('payments').select('*').eq('method', 'Cash');
    
    // Fetch income/expense from camp_finances
    const { data: financesData } = await supabase.from('camp_finances').select('*');
    
    // Start with payments summary
    const summary = paymentsData?.reduce((acc: any, p: any) => {
      acc[p.currency_original] = (acc[p.currency_original] || 0) + p.amount_original;
      return acc;
    }, { USD: 0, UZS: 0, EUR: 0 }) || { USD: 0, UZS: 0, EUR: 0 };
    
    // Add camp_finances (income adds, expense subtracts)
    if (financesData) {
      financesData.forEach((f: any) => {
        const amount = Number(f.amount) || 0;
        const currency = f.currency || 'UZS';
        if (f.type === 'income') {
          summary[currency] = (summary[currency] || 0) + amount;
        } else if (f.type === 'expense') {
          summary[currency] = (summary[currency] || 0) - amount;
        }
      });
    }
    
    setCashBox(summary);
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
        const counts: Record<string, { inHouse: number; arriving: number; departing: number }> = {};
        (data as CheckedInBookingRow[]).forEach((booking) => {
          const checkInDateStr = booking.check_in.split('T')[0];
          const checkOutDateStr = booking.check_out.split('T')[0];
          const people = (booking.number_of_adults || 0) + (booking.number_of_children || 0) || 1;
          
          // Mark check-in day as arriving
          if (!counts[checkInDateStr]) counts[checkInDateStr] = { inHouse: 0, arriving: 0, departing: 0 };
          counts[checkInDateStr].arriving += people;
          
          // Mark check-out day as departing
          if (!counts[checkOutDateStr]) counts[checkOutDateStr] = { inHouse: 0, arriving: 0, departing: 0 };
          counts[checkOutDateStr].departing += people;
          
          // Count in-house for days strictly between check-in and check-out (exclusive)
          const current = new Date(checkInDateStr);
          const end = new Date(checkOutDateStr);
          current.setDate(current.getDate() + 1); // Start from day after check-in
          while (current < end) {
            const dateStr = current.toISOString().split('T')[0];
            if (!counts[dateStr]) counts[dateStr] = { inHouse: 0, arriving: 0, departing: 0 };
            counts[dateStr].inHouse += people;
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
      // Fetch camp finances (expenses only)
      const { data: finances } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('transaction_date', dateStr)
        .eq('type', 'expense')
        .order('created_at', { ascending: false });

      // Fetch manual income entries
      const { data: income } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('transaction_date', dateStr)
        .eq('type', 'income')
        .order('created_at', { ascending: false });

      // Fetch receipts for this day (revenue from settled tabs)
      const { data: receipts } = await supabase
        .from('booking_receipts')
        .select('*')
        .eq('settled_at', dateStr)
        .order('created_at', { ascending: false });

      // Fetch all bookings that have receipts for this day (to get guest names)
      const bookingIds = receipts ? [...new Set(receipts.map(r => r.booking_id))] : [];
      let bookingsMap: Record<number, Booking> = {};
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('*')
          .in('id', bookingIds);
        if (bookings) {
          bookingsMap = bookings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {});
        }
      }

      setDayFinances(finances || []);
      setDayIncome(income || []);
      setDayBookings(Object.values(bookingsMap));
      setDayReceipts(receipts || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setDayFinances([]);
      setDayIncome([]);
      setDayBookings([]);
      setDayReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFinanceClick = (finance: Finance) => {
    router.push(`/ceo-financials/detail/${finance.id}`);
  };

  const expenseCategories = [
    'groceries',
    'workers income',
    'gas for car',
    'shezod akaga berildi',
    'other expenses'
  ];

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDay) return;

    setSubmittingTransaction(true);
    setTransactionMessage('');

    try {
      // Validate worker name for workers income category
      if (transactionType === 'expense' && transactionCategory === 'workers income' && !transactionWorkerName.trim()) {
        setTransactionMessage('Please enter a worker name for workers income');
        setSubmittingTransaction(false);
        return;
      }

      const amountValue = parseFloat(transactionAmount);
      if (isNaN(amountValue) || amountValue <= 0) {
        setTransactionMessage('Please enter a valid amount');
        setSubmittingTransaction(false);
        return;
      }

      const dateStr = selectedDay.toISOString().split('T')[0];

      const { error: insertError } = await supabase.from('camp_finances').insert({
        transaction_date: dateStr,
        type: transactionType,
        category: transactionType === 'expense' ? transactionCategory : 'Income',
        currency: 'UZS',
        original_amount: amountValue,
        exchange_rate: 1,
        amount_uzs: amountValue,
        description: transactionDescription,
        worker_name: transactionType === 'expense' && transactionCategory === 'workers income' ? transactionWorkerName : null,
        created_by: user.id,
        team_id: user?.team_id,
      });

      if (insertError) throw insertError;

      setTransactionMessage('Record saved successfully!');
      
      // Reset form
      setTransactionCategory('');
      setTransactionAmount('');
      setTransactionDescription('');
      setTransactionWorkerName('');
      
      // Refresh day data
      const day = selectedDay.getDate();
      await handleDayClick(day);
      
      // Close panel after short delay
      setTimeout(() => {
        setSlideOutOpen(false);
        setTransactionMessage('');
      }, 1000);
    } catch (err: any) {
      setTransactionMessage(`Error: ${err.message}`);
    } finally {
      setSubmittingTransaction(false);
    }
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
              const dayCounts = checkedInCounts[dateStr] || { inHouse: 0, arriving: 0, departing: 0 };
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
                  {(dayCounts.inHouse > 0 || dayCounts.arriving > 0 || dayCounts.departing > 0) && (
                    <div className="flex gap-1 self-end">
                      {dayCounts.inHouse > 0 && (
                        <div className="text-[10px] font-data font-bold text-[#3B82F6] bg-[#3B82F6]/20 px-1.5 py-0.5 rounded border border-[#3B82F6]/40">
                          👤{dayCounts.inHouse}
                        </div>
                      )}
                      {dayCounts.arriving > 0 && (
                        <div className="text-[10px] font-data font-bold text-[#0B6E4F] bg-[#0B6E4F]/20 px-1.5 py-0.5 rounded border border-[#0B6E4F]/40">
                          👤{dayCounts.arriving}
                        </div>
                      )}
                      {dayCounts.departing > 0 && (
                        <div className="text-[10px] font-data font-bold text-[#F97316] bg-[#F97316]/20 px-1.5 py-0.5 rounded border border-[#F97316]/40">
                          👤{dayCounts.departing}
                        </div>
                      )}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSlideOutOpen(true)}
                  className="px-3 py-1.5 bg-[#0B6E4F] text-[#C9A227] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Record Transaction
                </button>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="p-1.5 hover:bg-[#2A1518] rounded-md transition-all text-[#9C9384] hover:text-[#EDE6D6]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Net Profit Summary */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-[#1C232E]/50 rounded-lg p-6 border border-[#5C4A2E]/30 shadow-sm">
                    <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">Collected Today</p>
                    <div className="space-y-2">
                      {(() => {
                        const currencyTotals: Record<string, number> = {};
                        dayReceipts.forEach(receipt => {
                          receipt.snapshot?.payments?.forEach((payment: any) => {
                            currencyTotals[payment.currency] = (currencyTotals[payment.currency] || 0) + payment.amount;
                          });
                        });
                        dayIncome.forEach(income => {
                          currencyTotals['UZS'] = (currencyTotals['UZS'] || 0) + income.amount_uzs;
                        });
                        
                        return Object.keys(currencyTotals).length > 0 ? (
                          Object.entries(currencyTotals).map(([currency, amount]) => (
                            <p key={currency} className="text-2xl font-data font-bold text-[#EDE6D6] tracking-tight">
                              {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''}{amount.toLocaleString()} {currency === 'UZS' ? 'SUM' : currency}
                            </p>
                          ))
                        ) : (
                          <p className="text-2xl font-data font-bold text-[#9C9384] tracking-tight">$0.00</p>
                        );
                      })()}
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
                      {(() => {
                        // Group receipts by booking_id
                        const receiptsByBooking: Record<number, any[]> = {};
                        dayReceipts.forEach(receipt => {
                          if (!receiptsByBooking[receipt.booking_id]) {
                            receiptsByBooking[receipt.booking_id] = [];
                          }
                          receiptsByBooking[receipt.booking_id].push(receipt);
                        });

                        // Create booking groups with totals
                        const bookingGroups = Object.entries(receiptsByBooking).map(([bookingId, receipts]) => {
                          const booking = dayBookings.find((b: Booking) => b.id === parseInt(bookingId));
                          const totalUsd = receipts.reduce((sum, r) => sum + (r.total_usd || 0), 0);
                          const currencyTotals: Record<string, number> = {};
                          receipts.forEach(receipt => {
                            receipt.snapshot?.payments?.forEach((payment: any) => {
                              currencyTotals[payment.currency] = (currencyTotals[payment.currency] || 0) + payment.amount;
                            });
                          });
                          const latestTime = receipts.reduce((latest, r) => {
                            const receiptTime = new Date(r.created_at).getTime();
                            return receiptTime > latest ? receiptTime : latest;
                          }, 0);
                          return {
                            bookingId: parseInt(bookingId),
                            booking,
                            receipts,
                            totalUsd,
                            currencyTotals,
                            latestTime
                          };
                        });

                        // Merge with manual income, sort by latest activity
                        const allRevenue = [
                          ...bookingGroups.map(bg => ({ ...bg, source: 'booking', sortTime: bg.latestTime })),
                          ...dayIncome.map(i => ({ ...i, source: 'manual', sortTime: new Date(i.created_at).getTime() }))
                        ].sort((a, b) => b.sortTime - a.sortTime);

                        return allRevenue.length > 0 ? allRevenue.map((item: any) => {
                          if (item.source === 'booking') {
                            const isExpanded = expandedBookings.has(item.bookingId);
                            return (
                              <div key={item.bookingId} className="border border-[#5C4A2E]/30 rounded-lg bg-[#1C232E] overflow-hidden">
                                <button
                                  onClick={() => {
                                    setExpandedBookings(prev => {
                                      const next = new Set(prev);
                                      if (next.has(item.bookingId)) {
                                        next.delete(item.bookingId);
                                      } else {
                                        next.add(item.bookingId);
                                      }
                                      return next;
                                    });
                                  }}
                                  className="w-full p-4 hover:bg-[#1C232E]/50 transition-all text-left group"
                                >
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-bold text-[#EDE6D6] text-xs">{item.booking?.guest_name || `Booking #${item.bookingId}`}</p>
                                      <span className="text-[9px] font-bold text-[#3B82F6] bg-[#3B82F6]/20 px-1.5 py-0.5 rounded border border-[#3B82F6]/40 mt-1 inline-block">Guest Payment</span>
                                      <p className="text-[9px] text-[#9C9384] mt-1">{item.receipts.length} receipt(s)</p>
                                    </div>
                                    <div className="text-right">
                                      <div className="space-y-1">
                                        {Object.entries(item.currencyTotals).map(([currency, amount]: [string, any]) => (
                                          <p key={currency} className="text-[10px] font-data font-bold text-[#0B6E4F]">
                                            {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''}{Number(amount).toLocaleString()} {currency}
                                          </p>
                                        ))}
                                      </div>
                                      <svg className={`w-4 h-4 text-[#9C9384] mt-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </div>
                                  </div>
                                </button>
                                {isExpanded && (
                                  <div className="p-4 border-t border-[#5C4A2E]/30 bg-[#0F1419]/50">
                                    <div className="space-y-3">
                                      {item.receipts.map((receipt: any) => (
                                        <div key={receipt.id} className="p-3 bg-[#1C232E] rounded border border-[#5C4A2E]/20">
                                          <div className="flex justify-between items-center mb-2">
                                            <p className="text-[10px] font-bold text-[#9C9384]">{receipt.receipt_id}</p>
                                            <p className="text-[9px] text-[#9C9384]">{new Date(receipt.created_at).toLocaleTimeString()}</p>
                                          </div>
                                          {receipt.snapshot?.items && (
                                            <div className="space-y-2">
                                              {receipt.snapshot.items.accommodation && (
                                                <div className="flex justify-between items-center text-[9px]">
                                                  <span className="text-[#EDE6D6]">Accommodation</span>
                                                  <div className="flex items-center gap-2">
                                                    {receipt.snapshot.items.isPrepaid && (
                                                      <span className="text-[8px] font-bold bg-emerald-400 text-emerald-900 px-1 py-0.5 rounded uppercase">PREPAID</span>
                                                    )}
                                                    <span className="font-data font-bold text-[#EDE6D6]">${receipt.snapshot.items.accommodation.toFixed(2)}</span>
                                                  </div>
                                                </div>
                                              )}
                                              {receipt.snapshot.items.meals && (
                                                <>
                                                  {receipt.snapshot.items.meals.lunch > 0 && (
                                                    <div className="flex justify-between items-center text-[9px]">
                                                      <span className="text-[#EDE6D6]">Lunch x{receipt.snapshot.items.meals.lunch}</span>
                                                      <span className="font-data font-bold text-[#EDE6D6]">Included</span>
                                                    </div>
                                                  )}
                                                  {receipt.snapshot.items.meals.dinner > 0 && (
                                                    <div className="flex justify-between items-center text-[9px]">
                                                      <span className="text-[#EDE6D6]">Dinner x{receipt.snapshot.items.meals.dinner}</span>
                                                      <span className="font-data font-bold text-[#EDE6D6]">Included</span>
                                                    </div>
                                                  )}
                                                </>
                                              )}
                                              {receipt.snapshot.items.services && Object.keys(receipt.snapshot.items.services).length > 0 && (
                                                <div className="text-[9px] text-[#9C9384]">
                                                  Services: {Object.keys(receipt.snapshot.items.services).length} item(s)
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          {receipt.snapshot?.payments?.map((payment: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center text-[9px] text-[#9C9384] mt-2 pt-2 border-t border-[#5C4A2E]/20">
                                              <span>{payment.method}</span>
                                              <span className="font-data font-bold text-[#EDE6D6]">{payment.amount} {payment.currency}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            return (
                              <div key={item.id} className="p-4 rounded-lg border border-[#5C4A2E]/30 bg-[#1C232E] hover:bg-[#1C232E]/50 transition-all group">
                                <div className="flex justify-between items-start mb-3">
                                  <div>
                                    <p className="font-bold text-[#EDE6D6] text-xs">{item.description || 'Manual Income'}</p>
                                    <span className="text-[9px] font-bold text-[#F97316] bg-[#F97316]/20 px-1.5 py-0.5 rounded border border-[#F97316]/40 mt-1 inline-block">Manual Income</span>
                                  </div>
                                  <span className="text-[10px] font-data font-bold text-[#0B6E4F] bg-[#0B6E4F]/20 px-2 py-0.5 rounded border border-[#0B6E4F]/40">{(item.amount_uzs / 12500).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-medium text-[#9C9384] mt-1">
                                  <span>Category</span>
                                  <span className="font-data font-bold text-[#EDE6D6]">{item.category || 'Income'}</span>
                                </div>
                              </div>
                            );
                          }
                        }) : (
                          <div className="py-12 border-2 border-dashed border-[#5C4A2E]/30 rounded-lg text-center">
                            <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">No Revenue Cycles</p>
                          </div>
                        );
                      })()}
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

        {/* Slide-out Transaction Panel */}
        {slideOutOpen && (
          <div className="fixed inset-0 z-50" onClick={() => setSlideOutOpen(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div 
              className="absolute right-0 top-0 h-full w-full max-w-md bg-[#1C232E] border-l border-[#5C4A2E]/30 shadow-2xl animate-in slide-in-from-right duration-300"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 h-full flex flex-col">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#5C4A2E]/30">
                  <h3 className="text-lg font-bold text-[#EDE6D6] uppercase tracking-widest">Record Transaction</h3>
                  <button
                    onClick={() => setSlideOutOpen(false)}
                    className="p-1.5 hover:bg-[#2A1518] rounded-md transition-all text-[#9C9384] hover:text-[#EDE6D6]"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {selectedDay && (
                  <div className="mb-6 p-3 bg-[#0F1419] rounded-lg border border-[#5C4A2E]/30">
                    <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">Recording for</p>
                    <p className="text-sm font-bold text-[#C9A227]">
                      {selectedDay.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                )}

                {transactionMessage && (
                  <div className={`mb-4 p-3 rounded-lg ${
                    transactionMessage.includes('Error') ? 'bg-[#722F37]/20 text-[#722F37] border border-[#722F37]/40' : 'bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40'
                  }`}>
                    {transactionMessage}
                  </div>
                )}

                <form onSubmit={handleTransactionSubmit} className="space-y-4 flex-1 overflow-y-auto">
                  {/* Type Toggle */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTransactionType('expense')}
                      className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all ${
                        transactionType === 'expense' 
                          ? 'bg-[#722F37] text-[#C9A227]' 
                          : 'bg-[#0F1419] text-[#9C9384] hover:bg-[#2A1518]'
                      }`}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransactionType('income')}
                      className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs transition-all ${
                        transactionType === 'income' 
                          ? 'bg-[#0B6E4F] text-[#C9A227]' 
                          : 'bg-[#0F1419] text-[#9C9384] hover:bg-[#2A1518]'
                      }`}
                    >
                      Income
                    </button>
                  </div>

                  {/* Category */}
                  {transactionType === 'expense' && (
                    <div>
                      <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">Category</label>
                      <select
                        value={transactionCategory}
                        onChange={(e) => setTransactionCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all"
                        required
                      >
                        <option value="">Select category</option>
                        {expenseCategories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Worker Name - only for workers income */}
                  {transactionType === 'expense' && transactionCategory === 'workers income' && (
                    <div>
                      <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">Worker Name</label>
                      <input
                        type="text"
                        value={transactionWorkerName}
                        onChange={(e) => setTransactionWorkerName(e.target.value)}
                        placeholder="Enter worker name"
                        className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all"
                        required
                      />
                    </div>
                  )}

                  {/* Amount */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">Amount (UZS)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
                      placeholder="Enter amount in UZS"
                      className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">Description</label>
                    <textarea
                      value={transactionDescription}
                      onChange={(e) => setTransactionDescription(e.target.value)}
                      placeholder="Describe the transaction..."
                      rows={3}
                      className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all resize-none"
                      required
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submittingTransaction}
                    className="w-full py-3 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-[#0B6E4F]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {submittingTransaction ? 'Saving...' : 'Save Transaction'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
