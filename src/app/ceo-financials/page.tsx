'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance, type Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useRouter } from 'next/navigation';
import { CEOFinancialAnalytics } from '@/components/CEOFinancialAnalytics';

export default function CEOFinancialsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEOFinancialCalendar />
    </ProtectedRoute>
  );
}

function CEOFinancialCalendar() {
  const { user, signOut } = useAuth();
  const { t, getLocale } = useLanguage();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState<'calendar' | 'analytics'>('calendar');
  const [dayFinances, setDayFinances] = useState<Finance[]>([]);
  const [dayBookings, setDayBookings] = useState<Booking[]>([]);
  const [dayReceipts, setDayReceipts] = useState<any[]>([]);
  const [dayIncome, setDayIncome] = useState<Finance[]>([]);
  const [dayPayments, setDayPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cashBox, setCashBox] = useState<{ USD: number; UZS: number; EUR: number }>({ USD: 0, UZS: 0, EUR: 0 });
  const [checkedInCounts, setCheckedInCounts] = useState<Record<string, { inHouse: number; arriving: number; departing: number }>>({});
  const [dayFinancials, setDayFinancials] = useState<Record<string, { netIncome: number; netExpense: number; netProfit: number }>>({});
  
  // Slide-out panel state
  const [slideOutOpen, setSlideOutOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'expense' | 'income'>('expense');
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionDescription, setTransactionDescription] = useState('');
  const [transactionWorkerName, setTransactionWorkerName] = useState('');
  const [selectedWorkerOption, setSelectedWorkerOption] = useState('');
  const [newWorkerName, setNewWorkerName] = useState('');
  const [transactionPeriodStart, setTransactionPeriodStart] = useState('');
  const [transactionPeriodEnd, setTransactionPeriodEnd] = useState('');
  const [submittingTransaction, setSubmittingTransaction] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState('');
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);
  const [loadingWorkerPayments, setLoadingWorkerPayments] = useState(false);
  const [showNewWorkerInput, setShowNewWorkerInput] = useState(false);
  
  // Exchange modal state
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [exchangeFromCurrency, setExchangeFromCurrency] = useState<'USD' | 'EUR'>('USD');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [exchangeRateSource, setExchangeRateSource] = useState<'auto' | 'manual'>('manual');
  const [submittingExchange, setSubmittingExchange] = useState(false);
  const [exchangeMessage, setExchangeMessage] = useState('');
  const [exchangeAmountError, setExchangeAmountError] = useState('');
  
  // Expanded booking IDs for collapsible rows
  const [expandedBookings, setExpandedBookings] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchCashBox();
    fetchCheckedInCounts();
    fetchDayFinancials();
    fetchWorkerNames();
    fetchWorkerPayments();
  }, [currentDate]);

  const fetchWorkerNames = async () => {
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('worker_name')
        .eq('category', 'workers income')
        .eq('team_id', user?.team_id)
        .not('worker_name', 'is', null);
      
      const names = [...new Set(data?.map(r => r.worker_name).filter(Boolean) || [])].sort();
      setWorkerNames(names);
    } catch (error) {
      console.error('Error fetching worker names:', error);
    }
  };

  const fetchWorkerPayments = async () => {
    setLoadingWorkerPayments(true);
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('category', 'workers income')
        .eq('team_id', user?.team_id)
        .order('period_start', { ascending: false });
      
      setWorkerPayments(data || []);
    } catch (error) {
      console.error('Error fetching worker payments:', error);
    } finally {
      setLoadingWorkerPayments(false);
    }
  };

  const fetchCashBox = async () => {
    // Fetch cash payments from payments table
    const { data: paymentsData } = await supabase.from('payments').select('*').eq('method', 'Cash');
    
    // Fetch income/expense from camp_finances
    const { data: financesData } = await supabase.from('camp_finances').select('*');
    
    // Fetch currency exchanges
    const { data: exchangesData } = await supabase
      .from('currency_exchanges')
      .select('*')
      .eq('team_id', user?.team_id);

    let liveRates = { USD: 12500, EUR: 13500 };
    try {
      const rateResponse = await fetch('/api/exchange-rate');
      if (rateResponse.ok) {
        const rateJson = await rateResponse.json();
        if (rateJson?.USD && rateJson?.EUR) liveRates = { USD: rateJson.USD, EUR: rateJson.EUR };
      }
    } catch {}

    // Start with payments summary (sale adds, expense subtracts)
    const summary = paymentsData?.reduce((acc: any, p: any) => {
      const amount = Number(p.amount_original) || 0;
      const currency = p.currency_original || 'USD';
      if (p.type === 'expense') {
        acc[currency] = (acc[currency] || 0) - amount;
      } else {
        // Default to 'sale' or treat as income
        acc[currency] = (acc[currency] || 0) + amount;
      }
      return acc;
    }, { USD: 0, UZS: 0, EUR: 0 }) || { USD: 0, UZS: 0, EUR: 0 };
    
    // Add camp_finances (income adds, expense subtracts)
    if (financesData) {
      financesData.forEach((f: any) => {
        const amount = Number(f.original_amount) || 0;
        const currency = f.currency || 'UZS';
        if (f.type === 'income') {
          summary[currency] = (summary[currency] || 0) + amount;
        } else if (f.type === 'expense') {
          summary[currency] = (summary[currency] || 0) - amount;
        }
      });
    }
    
    // Add currency exchanges (subtract from_currency, add to UZS)
    if (exchangesData) {
      exchangesData.forEach((e: any) => {
        const fromAmount = Number(e.from_amount) || 0;
        const toAmount = Number(e.to_amount) || 0;
        const fromCurrency = e.from_currency;
        
        summary[fromCurrency] = (summary[fromCurrency] || 0) - fromAmount;
        summary['UZS'] = (summary['UZS'] || 0) + toAmount;
      });
    }
    
    setCashBox(summary);
    return summary;
  };

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    } else {
      return value.toFixed(0);
    }
  };

  const handleFetchExchangeRate = async () => {
    try {
      const response = await fetch('/api/exchange-rate');
      const data = await response.json();
      
      if (response.ok) {
        setExchangeRate(data[exchangeFromCurrency].toString());
        setExchangeRateSource('auto');
        setExchangeMessage('');
      } else {
        setExchangeMessage(data.error || t('exchange.rate_fetch_error'));
      }
    } catch (error) {
      setExchangeMessage(t('exchange.rate_fetch_error'));
    }
  };

  const handleConfirmExchange = async () => {
    if (!exchangeAmount.trim() || !exchangeRate.trim()) {
      setExchangeMessage('Please fill in all fields');
      return;
    }
    
    const amount = parseFloat(exchangeAmount);
    const rate = parseFloat(exchangeRate);
    const toAmount = amount * rate;
    
    if (amount <= 0 || rate <= 0) {
      setExchangeMessage('Amount and rate must be positive');
      return;
    }
    
    // Re-fetch cash box to get current balance (in case it changed since modal opened)
    const freshBalance = await fetchCashBox();
    
    // Validate against current balance
    const availableBalance = freshBalance[exchangeFromCurrency] || 0;
    if (amount > availableBalance) {
      setExchangeMessage(
        t('exchange.insufficient_balance')
          .replace('{amount}', availableBalance.toLocaleString())
          .replace('{currency}', exchangeFromCurrency)
      );
      return;
    }
    
    setSubmittingExchange(true);
    setExchangeMessage('');
    
    try {
      await supabase.from('currency_exchanges').insert({
        team_id: user?.team_id,
        from_currency: exchangeFromCurrency,
        from_amount: amount,
        to_currency: 'UZS',
        to_amount: toAmount,
        rate: rate,
        rate_source: exchangeRateSource,
        created_by: user?.id,
      });
      
      setExchangeMessage(t('exchange.success'));
      setExchangeModalOpen(false);
      setExchangeAmount('');
      setExchangeRate('');
      setExchangeRateSource('manual');
      setExchangeAmountError('');
      
      // Refresh cash box
      fetchCashBox();
      
      setTimeout(() => setExchangeMessage(''), 3000);
    } catch (error) {
      setExchangeMessage('Error recording exchange');
    } finally {
      setSubmittingExchange(false);
    }
  };

  const fetchDayFinancials = async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      // Fetch camp_finances for the month
      const { data: financesData } = await supabase
        .from('camp_finances')
        .select('*')
        .gte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
        .lte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`);

      // Fetch payments for the month
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .gte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
        .lte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`);

      let liveRates = { USD: 12500, EUR: 13500 };
      try {
        const rateResponse = await fetch('/api/exchange-rate');
        if (rateResponse.ok) {
          const rateJson = await rateResponse.json();
          if (rateJson?.USD && rateJson?.EUR) liveRates = { USD: rateJson.USD, EUR: rateJson.EUR };
        }
      } catch {}

      const financialsByDay: Record<string, { netIncome: number; netExpense: number; netProfit: number }> = {};

      // Initialize all days
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        financialsByDay[dateStr] = { netIncome: 0, netExpense: 0, netProfit: 0 };
      }

      // Process camp_finances
      (financesData || []).forEach((item: any) => {
        const dateStr = item.transaction_date || item.created_at?.split('T')[0];
        if (financialsByDay[dateStr]) {
          const amount = Number(item.amount_uzs) || 0;
          if (item.type === 'income') {
            financialsByDay[dateStr].netIncome += amount;
          } else if (item.type === 'expense') {
            financialsByDay[dateStr].netExpense += amount;
          }
        }
      });

      // Process payments
      (paymentsData || []).forEach((item: any) => {
        const dateStr = item.transaction_date || item.created_at?.split('T')[0];
        if (financialsByDay[dateStr]) {
          const currency = item.currency_original || 'UZS';
          let amountUzs = 0;
          if (currency === 'UZS') {
            amountUzs = Number(item.amount_original) || 0;
          } else {
            const usdEq = Number(item.amount_usd_equivalent) || Number(item.amount_original) || 0;
            amountUzs = currency === 'EUR' ? usdEq * liveRates.EUR : usdEq * liveRates.USD;
          }
          if (item.type === 'sale') financialsByDay[dateStr].netIncome += amountUzs;
          else if (item.type === 'expense') financialsByDay[dateStr].netExpense += amountUzs;
        }
      });

      // Calculate net profit for each day
      Object.keys(financialsByDay).forEach(dateStr => {
        financialsByDay[dateStr].netProfit = financialsByDay[dateStr].netIncome - financialsByDay[dateStr].netExpense;
      });

      setDayFinancials(financialsByDay);
    } catch (error) {
      console.error('Error fetching day financials:', error);
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
    console.log('📅 handleDayClick dateStr:', dateStr);

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

      // Fetch payments for this day
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('transaction_date', dateStr)
        .order('created_at', { ascending: false });

      // Fetch receipts for this day (revenue from settled tabs)
      const { data: receipts } = await supabase
        .from('booking_receipts')
        .select('*')
        .gte('created_at', `${dateStr}T00:00:00`)
        .lt('created_at', `${dateStr}T23:59:59.999`)
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
      setDayPayments(payments || []);
      setDayBookings(Object.values(bookingsMap));
      setDayReceipts(receipts || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setDayFinances([]);
      setDayIncome([]);
      setDayPayments([]);
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
      const finalWorkerName = selectedWorkerOption === '__new__' ? newWorkerName : selectedWorkerOption;
      if (transactionType === 'expense' && transactionCategory === 'workers income' && !finalWorkerName.trim()) {
        setTransactionMessage('Please enter a worker name for workers income');
        setSubmittingTransaction(false);
        return;
      }

      // Check for duplicate worker name (case-insensitive) only when adding new worker
      if (transactionType === 'expense' && transactionCategory === 'workers income' && showNewWorkerInput && newWorkerName.trim()) {
        const normalizedInput = newWorkerName.trim().toLowerCase();
        const existingWorker = workerNames.find(name => name.toLowerCase() === normalizedInput);
        if (existingWorker) {
          setTransactionMessage('Bu ishchi allaqachon mavjud');
          setSubmittingTransaction(false);
          return;
        }
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
        worker_name: transactionType === 'expense' && transactionCategory === 'workers income' ? finalWorkerName : null,
        period_start: transactionType === 'expense' && transactionCategory === 'workers income' ? transactionPeriodStart : null,
        period_end: transactionType === 'expense' && transactionCategory === 'workers income' ? transactionPeriodEnd : null,
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
      setSelectedWorkerOption('');
      setNewWorkerName('');
      setShowNewWorkerInput(false);
      setTransactionPeriodStart('');
      setTransactionPeriodEnd('');
      
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
            <div className="flex bg-[#1C232E]/20 rounded-lg p-1 border border-[#5C4A2E]/30 backdrop-blur-sm">
              <button
                onClick={() => setActiveView('calendar')}
                className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeView === 'calendar'
                    ? 'bg-[#0B6E4F] text-[#C9A227]'
                    : 'text-[#9C9384] hover:text-[#EDE6D6]'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setActiveView('analytics')}
                className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  activeView === 'analytics'
                    ? 'bg-[#0B6E4F] text-[#C9A227]'
                    : 'text-[#9C9384] hover:text-[#EDE6D6]'
                }`}
              >
                Analytics
              </button>
            </div>
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

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Cash Box Summary */}
        <div className="bg-zinc-950 rounded-xl p-8 text-white shadow-lg border border-white/5">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold uppercase tracking-widest">{t('msg.cash_box')}</h2>
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">{t('msg.physical_drawer_contents')}</p>
            </div>
            <button
              onClick={() => setExchangeModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-emerald-500/20"
            >
              {t('exchange.title')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-8">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('msg.usd_total')}</p>
              <p className="text-2xl font-data font-bold tracking-tight text-white">${cashBox.USD.toLocaleString()}</p>
            </div>
            <div className="space-y-1 border-x border-white/5 px-8">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('msg.uzs_total')}</p>
              <p className="text-2xl font-data font-bold tracking-tight text-white">{cashBox.UZS.toLocaleString()} <span className="text-[10px] text-slate-500 font-medium">SUM</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('msg.eur_total')}</p>
              <p className="text-2xl font-data font-bold tracking-tight text-white">€{cashBox.EUR.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {activeView === 'calendar' ? (
          <>
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

          <div className="grid grid-cols-7 gap-1 md:gap-3 mb-3">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center text-[8px] md:text-[10px] font-bold text-[#9C9384] uppercase tracking-widest py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-3">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[60px] md:min-h-[80px] bg-[#1C232E]/30 rounded-lg border border-transparent" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayCounts = checkedInCounts[dateStr] || { inHouse: 0, arriving: 0, departing: 0 };
              const dayFin = dayFinancials[dateStr] || { netIncome: 0, netExpense: 0, netProfit: 0 };
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`min-h-[70px] md:min-h-[90px] p-2 md:p-3 rounded-lg border transition-all flex flex-col justify-between group ${
                    isToday
                      ? 'border-[#0B6E4F] bg-[#0B6E4F]/20 shadow-sm'
                      : 'border-[#5C4A2E]/30 hover:border-[#0B6E4F] hover:bg-[#1C232E]/50'
                  }`}
                >
                  <span className={`text-[10px] sm:text-xs font-bold ${isToday ? 'text-[#0B6E4F]' : 'text-[#EDE6D6]'}`}>{day}</span>
                  <div className="flex flex-col items-end gap-1">
                    {(dayCounts.inHouse > 0 || dayCounts.arriving > 0 || dayCounts.departing > 0) && (
                      <div className="flex gap-0.5 sm:gap-1 self-end flex-wrap">
                        {dayCounts.inHouse > 0 && (
                          <div className="text-[8px] sm:text-[10px] font-data font-bold text-[#3B82F6] bg-[#3B82F6]/20 px-1 sm:px-1.5 py-0.5 rounded border border-[#3B82F6]/40">
                            👤{dayCounts.inHouse}
                          </div>
                        )}
                        {dayCounts.arriving > 0 && (
                          <div className="text-[8px] sm:text-[10px] font-data font-bold text-[#0B6E4F] bg-[#0B6E4F]/20 px-1 sm:px-1.5 py-0.5 rounded border border-[#0B6E4F]/40">
                            👤{dayCounts.arriving}
                          </div>
                        )}
                        {dayCounts.departing > 0 && (
                          <div className="text-[8px] sm:text-[10px] font-data font-bold text-[#F97316] bg-[#F97316]/20 px-1 sm:px-1.5 py-0.5 rounded border border-[#F97316]/40">
                            👤{dayCounts.departing}
                          </div>
                        )}
                      </div>
                    )}
                    {dayFin.netProfit !== 0 && (
                      <div className="text-[8px] sm:text-[10px] font-bold truncate w-full text-right">
                        <span className={dayFin.netProfit > 0 ? 'text-[#0B6E4F]' : 'text-[#722F37]'}>
                          {dayFin.netProfit > 0 ? '+' : ''}{formatCurrency(dayFin.netProfit)}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedDay && (
          <div className="mt-8 bg-[#1C232E] rounded-lg border border-[#5C4A2E]/30 shadow-sm p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-[#5C4A2E]/30">
              <h3 className="text-sm font-bold text-[#EDE6D6] uppercase tracking-widest">
                {selectedDay.toLocaleDateString(getLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSlideOutOpen(true)}
                  className="px-3 py-1.5 bg-[#0B6E4F] text-[#C9A227] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#0B6E4F]/80 transition-all flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {t('btn.record_transaction')}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-8">
                  <div className="bg-[#1C232E]/50 rounded-lg p-6 border border-[#5C4A2E]/30 shadow-sm">
                    <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">Collected Today</p>
                    <div className="space-y-2">
                      {(() => {
                        const currencyTotals: Record<string, number> = {};
                        dayReceipts.forEach(receipt => {
                          receipt.snapshot?.payments?.forEach((payment: any) => {
                            currencyTotals[payment.currency_original] = (currencyTotals[payment.currency_original] || 0) + payment.amount_original;
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
                      <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">{t('msg.uzs_collected_today')}</p>
                      <p className="text-4xl font-data font-bold text-[#EDE6D6] tracking-tighter">
                        {(() => {
                          const uzsCollected = dayReceipts.reduce((sum, r) => {
                            const uzsPayments = (r.snapshot?.payments || []).filter((p: any) => p.currency_original === 'UZS');
                            return sum + uzsPayments.reduce((s: number, p: any) => s + (p.amount_original || 0), 0);
                          }, 0);
                          return uzsCollected.toLocaleString() + " SUM";
                        })()}
                      </p>
                    </div>
                    <div className={`p-4 rounded-full ${dayReceipts.length > 0 ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' : 'bg-[#1C232E]/30 text-[#9C9384]'}`}>
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
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
                              currencyTotals[payment.currency_original] = (currencyTotals[payment.currency_original] || 0) + payment.amount_original;
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
                                              {receipt.snapshot.items.accommodation > 0 && (
                                                <div className="flex justify-between items-center text-[9px]">
                                                  <span className="text-[#EDE6D6]">Accommodation</span>
                                                  <div className="flex items-center gap-2">
                                                    {receipt.snapshot.items.isPrepaid ? (
                                                      <span className="text-[8px] font-bold bg-emerald-400 text-emerald-900 px-1 py-0.5 rounded uppercase">PREPAID</span>
                                                    ) : (
                                                      <span className="font-data font-bold text-[#EDE6D6]">${receipt.snapshot.items.accommodation.toFixed(2)}</span>
                                                    )}
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
                                                <div className="space-y-1">
                                                  {Object.entries(receipt.snapshot.items.services).map(([name, amount]: [string, any]) => (
                                                    <div key={name} className="flex justify-between items-center text-[9px]">
                                                      <span className="text-[#EDE6D6]">{name}</span>
                                                      <span className="font-data font-bold text-[#EDE6D6]">${Number(amount).toFixed(2)}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          {receipt.snapshot?.payments?.map((payment: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center text-[9px] text-[#9C9384] mt-2 pt-2 border-t border-[#5C4A2E]/20">
                                              <span>{payment.method}</span>
                                              <span className="font-data font-bold text-[#EDE6D6]">{payment.amount_original} {payment.currency_original}</span>
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
                    <h4 className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-4">{t('msg.burn_expenditure')}</h4>
                    <div className="space-y-4">
                      {(() => {
                        const expensesByCategory = dayFinances
                          .filter(f => f.type === 'expense')
                          .reduce((acc: any, f) => {
                            const cat = f.category || 'Unassigned';
                            const currency = f.currency || 'UZS';
                            const key = `${cat}|${currency}`;
                            if (!acc[key]) acc[key] = { category: cat, currency, total: 0, count: 0, items: [] };
                            acc[key].total += Number(f.original_amount) || 0;
                            acc[key].count += 1;
                            acc[key].items.push(f);
                            return acc;
                          }, {});

                        const formatCurrency = (amount: number, currency: string) => {
                          if (currency === 'USD') return `$${amount.toLocaleString()}`;
                          if (currency === 'EUR') return `€${amount.toLocaleString()}`;
                          return `${amount.toLocaleString()} SUM`;
                        };

                        return Object.keys(expensesByCategory).length > 0 ? (
                          Object.values(expensesByCategory).map((data: any) => (
                            <button
                              key={`${data.category}-${data.currency}`}
                              onClick={() => {
                                const expense = data.items[0];
                                if (expense) handleFinanceClick(expense);
                              }}
                              className="w-full p-4 rounded-lg border border-[#5C4A2E]/30 bg-[#1C232E] hover:border-[#0B6E4F] hover:bg-[#1C232E]/50 transition-all text-left group"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-[#EDE6D6] text-xs">{data.category}</p>
                                  <p className="text-[10px] text-[#9C9384] font-medium uppercase mt-0.5">{data.count} {t('msg.line_items')}</p>
                                </div>
                                <p className="font-data font-bold text-[#EDE6D6] text-sm">
                                  {formatCurrency(data.total, data.currency)}
                                </p>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="py-12 border-2 border-dashed border-[#5C4A2E]/30 rounded-lg text-center">
                            <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">{t('msg.zero_burn_logged')}</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Payments Section */}
                <div className="mt-6">
                  <h4 className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-4">All Transactions (Payments)</h4>
                  <div className="space-y-3">
                    {dayPayments.length === 0 ? (
                      <div className="py-8 border-2 border-dashed border-[#5C4A2E]/30 rounded-lg text-center">
                        <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest">No Payment Transactions</p>
                      </div>
                    ) : (
                      dayPayments.map((payment: any) => (
                        <div
                          key={payment.id}
                          className="p-4 rounded-lg border border-[#5C4A2E]/30 bg-[#1C232E]"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-bold text-[#EDE6D6] text-xs">
                                {payment.exchange_id ? 'Currency Exchange' : 
                                 payment.note?.startsWith('Stock purchase:') ? 'Stock Purchase' :
                                 payment.type === 'sale' && payment.booking_id ? 'Booking Payment' :
                                 payment.type === 'sale' ? 'POS Sale' : 'Payment'}
                              </p>
                              <p className="text-[10px] text-[#9C9384] mt-1">{payment.note || payment.method}</p>
                            </div>
                            <p className={`font-data font-bold text-sm ${payment.type === 'expense' ? 'text-[#722F37]' : 'text-[#0B6E4F]'}`}>
                              {payment.type === 'expense' ? '-' : '+'}{payment.amount_original.toLocaleString()} {payment.currency_original}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Worker Payments Section */}
        <div className="mt-6 bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-black text-[#EDE6D6] font-heading">{t('txn.worker_payments_section')}</h3>
            <button
              onClick={() => router.push('/financials/workers')}
              className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#0B6E4F]/80 text-[#C9A227] rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-[#0B6E4F]/20 active:scale-95"
            >
              {t('txn.view_all_workers')}
            </button>
          </div>
          
          {loadingWorkerPayments ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : workerPayments.length === 0 ? (
            <p className="text-[#9C9384] italic text-sm">No worker payments recorded</p>
          ) : (
            (() => {
              const groupedByWorker = workerPayments.reduce((acc: any, payment: any) => {
                const workerName = payment.worker_name || 'Unknown';
                if (!acc[workerName]) {
                  acc[workerName] = [];
                }
                acc[workerName].push(payment);
                return acc;
              }, {});

              Object.keys(groupedByWorker).forEach(workerName => {
                groupedByWorker[workerName].sort((a: any, b: any) => 
                  new Date(b.period_start || '').getTime() - new Date(a.period_start || '').getTime()
                );
              });

              return (
                <div className="space-y-6">
                  {Object.entries(groupedByWorker).map(([workerName, payments]: [string, any]) => (
                    <div key={workerName} className="bg-[#0F1419] rounded-xl p-6 border border-[#5C4A2E]/30">
                      <h4 className="text-lg font-black text-[#C9A227] mb-4">{workerName}</h4>
                      <div className="space-y-3">
                        {payments.map((payment: any) => (
                          <div key={payment.id} className="flex justify-between items-center bg-[#1C232E] rounded-lg p-4 border border-[#5C4A2E]/20">
                            <div>
                              <p className="text-sm text-[#9C9384]">
                                {payment.period_start && payment.period_end 
                                  ? `${payment.period_start} – ${payment.period_end}`
                                  : payment.period_start || payment.period_end || 'No period specified'
                                }
                              </p>
                              <p className="text-xs text-[#5C4A2E] mt-1">{payment.transaction_date}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-black text-[#EDE6D6]">
                                {payment.amount_uzs?.toLocaleString()} UZS
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>

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
                  <h3 className="text-lg font-bold text-[#EDE6D6] uppercase tracking-widest">{t('btn.record_transaction')}</h3>
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
                      {selectedDay.toLocaleDateString(getLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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
                        <option value="">{t('form.select_category')}</option>
                        {expenseCategories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Worker Name - only for workers income */}
                  {transactionType === 'expense' && transactionCategory === 'workers income' && (
                    <div>
                      <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">{t('txn.worker_name_label')}</label>
                      <select
                        value={selectedWorkerOption}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setSelectedWorkerOption(newValue);
                          setShowNewWorkerInput(newValue === '__new__');
                          if (newValue !== '__new__') {
                            setTransactionWorkerName(newValue);
                          }
                        }}
                        className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all"
                        required
                      >
                        <option value="">{t('form.select_worker')}</option>
                        {workerNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value="__new__">{t('txn.add_new_worker')}</option>
                      </select>
                      {showNewWorkerInput && (
                        <div className="mt-3">
                          <input
                            type="text"
                            value={newWorkerName}
                            onChange={(e) => setNewWorkerName(e.target.value)}
                            placeholder={t('form.enter_worker_name')}
                            className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all"
                            required
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Period Date Fields - only for workers income */}
                  {transactionType === 'expense' && transactionCategory === 'workers income' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">{t('txn.period_start_label')}</label>
                        <input
                          type="date"
                          value={transactionPeriodStart}
                          onChange={(e) => setTransactionPeriodStart(e.target.value)}
                          className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">{t('txn.period_end_label')}</label>
                        <input
                          type="date"
                          value={transactionPeriodEnd}
                          onChange={(e) => setTransactionPeriodEnd(e.target.value)}
                          className="w-full px-3 py-2 border border-[#5C4A2E]/30 rounded-lg bg-[#0F1419] text-[#EDE6D6] text-sm focus:border-[#0B6E4F] focus:ring-1 focus:ring-[#0B6E4F]/20 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Amount */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">Amount (UZS)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
                      placeholder={t('form.enter_amount_uzs')}
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
          </>
        ) : (
          <CEOFinancialAnalytics />
        )}
      </main>

      {/* Exchange Modal */}
      {exchangeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setExchangeModalOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-zinc-950 rounded-xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200 border border-white/5" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black text-white mb-6">{t('exchange.title')}</h2>
            
            {exchangeMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                exchangeMessage.includes('Error') || exchangeMessage.includes('Could not') || exchangeMessage.includes('please')
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
              }`}>
                {exchangeMessage}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('exchange.from_currency')}</label>
                <select
                  value={exchangeFromCurrency}
                  onChange={(e) => {
                    setExchangeFromCurrency(e.target.value as 'USD' | 'EUR');
                    setExchangeRate('');
                    setExchangeRateSource('manual');
                    setExchangeAmountError('');
                    // Re-validate amount if it exists
                    if (exchangeAmount) {
                      const amount = parseFloat(exchangeAmount);
                      const newAvailableBalance = cashBox[e.target.value as 'USD' | 'EUR'] || 0;
                      if (amount > newAvailableBalance) {
                        setExchangeAmountError(
                          t('exchange.insufficient_balance')
                            .replace('{amount}', newAvailableBalance.toLocaleString())
                            .replace('{currency}', e.target.value)
                        );
                      }
                    }
                  }}
                  className="w-full px-4 py-3 border border-white/10 rounded-lg bg-zinc-900 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('exchange.amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={exchangeAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    setExchangeAmount(value);
                    
                    // Validate against current balance
                    if (value) {
                      const amount = parseFloat(value);
                      const availableBalance = cashBox[exchangeFromCurrency] || 0;
                      if (amount > availableBalance) {
                        setExchangeAmountError(
                          t('exchange.insufficient_balance')
                            .replace('{amount}', availableBalance.toLocaleString())
                            .replace('{currency}', exchangeFromCurrency)
                        );
                      } else {
                        setExchangeAmountError('');
                      }
                    } else {
                      setExchangeAmountError('');
                    }
                  }}
                  placeholder="0.00"
                  className={`w-full px-4 py-3 border rounded-lg bg-zinc-900 text-white focus:ring-1 transition-all ${
                    exchangeAmountError 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-white/10 focus:border-emerald-500 focus:ring-emerald-500/20'
                  }`}
                />
                {exchangeAmountError && (
                  <p className="mt-1 text-xs text-red-500">{exchangeAmountError}</p>
                )}
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('exchange.rate')}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={exchangeRate}
                    onChange={(e) => {
                      setExchangeRate(e.target.value);
                      setExchangeRateSource('manual');
                    }}
                    placeholder="0.00"
                    className="flex-1 px-4 py-3 border border-white/10 rounded-lg bg-zinc-900 text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleFetchExchangeRate}
                    className="px-4 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg text-xs font-bold uppercase tracking-widest transition-all border border-emerald-500/20 whitespace-nowrap"
                  >
                    {t('exchange.get_current_rate')}
                  </button>
                </div>
              </div>
              
              <div className="bg-zinc-900 rounded-lg p-4 border border-white/5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('exchange.result')}</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {exchangeAmount && exchangeRate 
                    ? (parseFloat(exchangeAmount) * parseFloat(exchangeRate)).toLocaleString('uz-UZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                    : '0.00'}
                  {' UZS'}
                </p>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setExchangeModalOpen(false);
                    setExchangeAmount('');
                    setExchangeRate('');
                    setExchangeRateSource('manual');
                    setExchangeMessage('');
                  }}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold uppercase tracking-widest text-xs transition-all"
                >
                  {t('exchange.cancel')}
                </button>
                <button
                  onClick={handleConfirmExchange}
                  disabled={submittingExchange || !exchangeAmount.trim() || !exchangeRate.trim() || !!exchangeAmountError}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold uppercase tracking-widest text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingExchange ? 'Processing...' : t('exchange.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
