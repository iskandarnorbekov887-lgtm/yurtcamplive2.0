'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart
} from 'recharts';

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface AnalyticsData {
  period: string;
  income: number;
  expense: number;
  netProfit: number;
  guestsIn: number;
  guestsOut: number;
}

interface SummaryData {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  totalGuestsIn: number;
  totalGuestsOut: number;
  averageGuestsPerDay: number;
}

interface DayGuest {
  id: number;
  guest_name: string;
  total_price: number;
  collected_amount: number;
  currency: string;
  payment_status: string | null;
  is_prepaid: boolean;
  is_accommodation_prepaid: boolean;
  is_food_prepaid: boolean;
}

interface DayExpense {
  id: number;
  category: string | null;
  description: string | null;
  amount_uzs: number;
  worker_name: string | null;
}

interface ExpenseLineItem {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export function CEOFinancialAnalytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>('daily');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [periodBreakdown, setPeriodBreakdown] = useState<AnalyticsData[]>([]);

  // Day transactions panel (guests + expenses for a clicked day)
  const [panelDate, setPanelDate] = useState<string | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [dayGuests, setDayGuests] = useState<DayGuest[]>([]);
  const [dayExpenses, setDayExpenses] = useState<DayExpense[]>([]);
  const [expandedExpenseId, setExpandedExpenseId] = useState<number | null>(null);
  const [expenseItemsCache, setExpenseItemsCache] = useState<Record<number, ExpenseLineItem[]>>({});
  const [expenseItemsLoading, setExpenseItemsLoading] = useState<number | null>(null);

  const currentDate = new Date();

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange]);

  useEffect(() => {
    // Default the transactions panel to today once daily data is available
    if (timeRange === 'daily' && !panelDate && analyticsData.length > 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const hasToday = analyticsData.some(d => d.period === todayStr);
      openDayPanel(hasToday ? todayStr : analyticsData[analyticsData.length - 1].period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsData, timeRange]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      let data: AnalyticsData[] = [];
      let summary: SummaryData;

      switch (timeRange) {
        case 'daily':
          data = await fetchDailyData();
          break;
        case 'weekly':
          data = await fetchWeeklyData();
          break;
        case 'monthly':
          data = await fetchMonthlyData();
          break;
        case 'yearly':
          data = await fetchYearlyData();
          break;
      }

      summary = calculateSummary(data);
      setAnalyticsData(data);
      setSummaryData(summary);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyData = async (): Promise<AnalyticsData[]> => {
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

    // Fetch bookings for the month
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('check_in, check_out, status, number_of_adults, number_of_children')
      .gte('check_in', `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .lte('check_in', `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`)
      .in('status', ['checked_in', 'completed']);

    const dailyData: AnalyticsData[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      let income = 0;
      let expense = 0;
      let guestsIn = 0;
      let guestsOut = 0;

      // Process camp_finances
      (financesData || []).forEach((item: any) => {
        const itemDateStr = item.transaction_date || item.created_at?.split('T')[0];
        if (itemDateStr === dateStr) {
          const amount = Number(item.amount_uzs) || 0;
          if (item.type === 'income') {
            income += amount;
          } else if (item.type === 'expense') {
            expense += amount;
          }
        }
      });

      // Process payments (UZS only)
      (paymentsData || []).forEach((item: any) => {
        const itemDateStr = item.transaction_date || item.created_at?.split('T')[0];
        if (itemDateStr === dateStr && item.currency_original === 'UZS') {
          const amount = Number(item.amount_original) || 0;
          if (item.type === 'sale') {
            income += amount;
          } else if (item.type === 'expense') {
            expense += amount;
          }
        }
      });

      // Process bookings for guest counts
      (bookingsData || []).forEach((booking: any) => {
        const checkInDateStr = booking.check_in?.split('T')[0];
        const checkOutDateStr = booking.check_out?.split('T')[0];
        const people = (booking.number_of_adults || 0) + (booking.number_of_children || 0) || 1;

        if (checkInDateStr === dateStr) {
          guestsIn += people;
        }
        if (checkOutDateStr === dateStr) {
          guestsOut += people;
        }
      });

      dailyData.push({
        period: dateStr,
        income,
        expense,
        netProfit: income - expense,
        guestsIn,
        guestsOut,
      });
    }

    return dailyData;
  };

  const fetchWeeklyData = async (): Promise<AnalyticsData[]> => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Get all data for the month
    const { data: financesData } = await supabase
      .from('camp_finances')
      .select('*')
      .gte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .lte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`);

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .gte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .lte('transaction_date', `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`);

    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('check_in, check_out, status, number_of_adults, number_of_children')
      .gte('check_in', `${year}-${String(month + 1).padStart(2, '0')}-01`)
      .lte('check_in', `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`)
      .in('status', ['checked_in', 'completed']);

    // Group by week
    const weeklyData: Record<string, AnalyticsData> = {};
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekNumber = getWeekNumber(date);
      const weekKey = `Week ${weekNumber}`;

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          period: weekKey,
          income: 0,
          expense: 0,
          netProfit: 0,
          guestsIn: 0,
          guestsOut: 0,
        };
      }

      // Process finances for this day
      (financesData || []).forEach((item: any) => {
        const itemDateStr = item.transaction_date || item.created_at?.split('T')[0];
        if (itemDateStr === dateStr) {
          const amount = Number(item.amount_uzs) || 0;
          if (item.type === 'income') {
            weeklyData[weekKey].income += amount;
          } else if (item.type === 'expense') {
            weeklyData[weekKey].expense += amount;
          }
        }
      });

      // Process payments for this day
      (paymentsData || []).forEach((item: any) => {
        const itemDateStr = item.transaction_date || item.created_at?.split('T')[0];
        if (itemDateStr === dateStr && item.currency_original === 'UZS') {
          const amount = Number(item.amount_original) || 0;
          if (item.type === 'sale') {
            weeklyData[weekKey].income += amount;
          } else if (item.type === 'expense') {
            weeklyData[weekKey].expense += amount;
          }
        }
      });

      // Process bookings for this day
      (bookingsData || []).forEach((booking: any) => {
        const checkInDateStr = booking.check_in?.split('T')[0];
        const checkOutDateStr = booking.check_out?.split('T')[0];
        const people = (booking.number_of_adults || 0) + (booking.number_of_children || 0) || 1;

        if (checkInDateStr === dateStr) {
          weeklyData[weekKey].guestsIn += people;
        }
        if (checkOutDateStr === dateStr) {
          weeklyData[weekKey].guestsOut += people;
        }
      });
    }

    // Calculate net profit for each week
    Object.keys(weeklyData).forEach(weekKey => {
      weeklyData[weekKey].netProfit = weeklyData[weekKey].income - weeklyData[weekKey].expense;
    });

    return Object.values(weeklyData);
  };

  const fetchMonthlyData = async (): Promise<AnalyticsData[]> => {
    const year = currentDate.getFullYear();

    const { data: financesData } = await supabase
      .from('camp_finances')
      .select('*')
      .gte('transaction_date', `${year}-01-01`)
      .lte('transaction_date', `${year}-12-31`);

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .gte('transaction_date', `${year}-01-01`)
      .lte('transaction_date', `${year}-12-31`);

    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('check_in, check_out, status, number_of_adults, number_of_children')
      .gte('check_in', `${year}-01-01`)
      .lte('check_in', `${year}-12-31`)
      .in('status', ['checked_in', 'completed']);

    const monthlyData: Record<string, AnalyticsData> = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let month = 0; month < 12; month++) {
      const monthKey = monthNames[month];
      monthlyData[monthKey] = {
        period: monthKey,
        income: 0,
        expense: 0,
        netProfit: 0,
        guestsIn: 0,
        guestsOut: 0,
      };
    }

    // Process finances
    (financesData || []).forEach((item: any) => {
      const itemDate = new Date(item.transaction_date || item.created_at);
      if (itemDate.getFullYear() === year) {
        const monthKey = monthNames[itemDate.getMonth()];
        const amount = Number(item.amount_uzs) || 0;
        if (item.type === 'income') {
          monthlyData[monthKey].income += amount;
        } else if (item.type === 'expense') {
          monthlyData[monthKey].expense += amount;
        }
      }
    });

    // Process payments
    (paymentsData || []).forEach((item: any) => {
      const itemDate = new Date(item.transaction_date || item.created_at);
      if (itemDate.getFullYear() === year && item.currency_original === 'UZS') {
        const monthKey = monthNames[itemDate.getMonth()];
        const amount = Number(item.amount_original) || 0;
        if (item.type === 'sale') {
          monthlyData[monthKey].income += amount;
        } else if (item.type === 'expense') {
          monthlyData[monthKey].expense += amount;
        }
      }
    });

    // Process bookings
    (bookingsData || []).forEach((booking: any) => {
      const checkInDate = new Date(booking.check_in);
      const checkOutDate = new Date(booking.check_out);
      const people = (booking.number_of_adults || 0) + (booking.number_of_children || 0) || 1;

      if (checkInDate.getFullYear() === year) {
        const monthKey = monthNames[checkInDate.getMonth()];
        monthlyData[monthKey].guestsIn += people;
      }
      if (checkOutDate.getFullYear() === year) {
        const monthKey = monthNames[checkOutDate.getMonth()];
        monthlyData[monthKey].guestsOut += people;
      }
    });

    // Calculate net profit
    Object.keys(monthlyData).forEach(monthKey => {
      monthlyData[monthKey].netProfit = monthlyData[monthKey].income - monthlyData[monthKey].expense;
    });

    return Object.values(monthlyData);
  };

  const fetchYearlyData = async (): Promise<AnalyticsData[]> => {
    const { data: financesData } = await supabase
      .from('camp_finances')
      .select('*')
      .order('transaction_date', { ascending: true });

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .order('transaction_date', { ascending: true });

    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('check_in, check_out, status, number_of_adults, number_of_children')
      .in('status', ['checked_in', 'completed'])
      .order('check_in', { ascending: true });

    const yearlyData: Record<string, AnalyticsData> = {};

    // Process finances
    (financesData || []).forEach((item: any) => {
      const itemDate = new Date(item.transaction_date || item.created_at);
      const yearKey = itemDate.getFullYear().toString();
      
      if (!yearlyData[yearKey]) {
        yearlyData[yearKey] = {
          period: yearKey,
          income: 0,
          expense: 0,
          netProfit: 0,
          guestsIn: 0,
          guestsOut: 0,
        };
      }

      const amount = Number(item.amount_uzs) || 0;
      if (item.type === 'income') {
        yearlyData[yearKey].income += amount;
      } else if (item.type === 'expense') {
        yearlyData[yearKey].expense += amount;
      }
    });

    // Process payments
    (paymentsData || []).forEach((item: any) => {
      const itemDate = new Date(item.transaction_date || item.created_at);
      const yearKey = itemDate.getFullYear().toString();
      
      if (!yearlyData[yearKey]) {
        yearlyData[yearKey] = {
          period: yearKey,
          income: 0,
          expense: 0,
          netProfit: 0,
          guestsIn: 0,
          guestsOut: 0,
        };
      }

      if (item.currency_original === 'UZS') {
        const amount = Number(item.amount_original) || 0;
        if (item.type === 'sale') {
          yearlyData[yearKey].income += amount;
        } else if (item.type === 'expense') {
          yearlyData[yearKey].expense += amount;
        }
      }
    });

    // Process bookings
    (bookingsData || []).forEach((booking: any) => {
      const checkInDate = new Date(booking.check_in);
      const checkOutDate = new Date(booking.check_out);
      const people = (booking.number_of_adults || 0) + (booking.number_of_children || 0) || 1;

      const checkInYear = checkInDate.getFullYear().toString();
      const checkOutYear = checkOutDate.getFullYear().toString();

      if (!yearlyData[checkInYear]) {
        yearlyData[checkInYear] = {
          period: checkInYear,
          income: 0,
          expense: 0,
          netProfit: 0,
          guestsIn: 0,
          guestsOut: 0,
        };
      }
      yearlyData[checkInYear].guestsIn += people;

      if (!yearlyData[checkOutYear]) {
        yearlyData[checkOutYear] = {
          period: checkOutYear,
          income: 0,
          expense: 0,
          netProfit: 0,
          guestsIn: 0,
          guestsOut: 0,
        };
      }
      yearlyData[checkOutYear].guestsOut += people;
    });

    // Calculate net profit
    Object.keys(yearlyData).forEach(yearKey => {
      yearlyData[yearKey].netProfit = yearlyData[yearKey].income - yearlyData[yearKey].expense;
    });

    return Object.values(yearlyData).sort((a, b) => a.period.localeCompare(b.period));
  };

  const calculateSummary = (data: AnalyticsData[]): SummaryData => {
    const totalIncome = data.reduce((sum, item) => sum + item.income, 0);
    const totalExpense = data.reduce((sum, item) => sum + item.expense, 0);
    const netProfit = totalIncome - totalExpense;
    const totalGuestsIn = data.reduce((sum, item) => sum + item.guestsIn, 0);
    const totalGuestsOut = data.reduce((sum, item) => sum + item.guestsOut, 0);
    const averageGuestsPerDay = data.length > 0 ? totalGuestsIn / data.length : 0;

    return {
      totalIncome,
      totalExpense,
      netProfit,
      totalGuestsIn,
      totalGuestsOut,
      averageGuestsPerDay,
    };
  };

  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toFixed(0);
  };

  const handlePeriodClick = (period: string) => {
    setSelectedPeriod(period);
    
    // For daily view, show the day's breakdown
    if (timeRange === 'daily') {
      const dayData = analyticsData.find(d => d.period === period);
      setPeriodBreakdown(dayData ? [dayData] : []);
    } else {
      // For weekly/monthly/yearly, show all days in that period
      // This would require additional fetching - for now, show the period summary
      const periodData = analyticsData.find(d => d.period === period);
      setPeriodBreakdown(periodData ? [periodData] : []);
    }
  };

  const formatCurrency = (amount: number): string => {
    return `${formatNumber(amount)} UZS`;
  };

  const formatMoney = (amount: number, currency: string): string => {
    return `${formatNumber(amount)} ${currency}`;
  };

  // Called when a bar/point on the chart (or a table row) is clicked.
  // Only meaningful for a single day, so weekly/monthly/yearly periods
  // fall back to the first day of that period.
  const openDayPanel = (period: string) => {
    let dateStr = period;
    if (timeRange !== 'daily') {
      // period strings for other ranges aren't plain dates - try to find
      // a matching day inside the underlying data as a best-effort fallback.
      const match = analyticsData.find(d => d.period === period);
      dateStr = match ? match.period : period;
    }
    setPanelDate(dateStr);
    setExpandedExpenseId(null);
    fetchDayPanel(dateStr);
  };

  const fetchDayPanel = async (dateStr: string) => {
    setPanelLoading(true);
    try {
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('id, guest_name, total_price, collected_amount, currency, payment_status, is_prepaid, is_accommodation_prepaid, is_food_prepaid, check_in')
        .eq('check_in', dateStr);

      const { data: financesData } = await supabase
        .from('camp_finances')
        .select('id, category, description, amount_uzs, worker_name, transaction_date, created_at, type')
        .eq('type', 'expense');

      const expensesForDay = (financesData || []).filter((item: any) => {
        const itemDateStr = item.transaction_date || item.created_at?.split('T')[0];
        return itemDateStr === dateStr;
      });

      setDayGuests(
        (bookingsData || []).map((b: any) => ({
          id: b.id,
          guest_name: b.guest_name,
          total_price: Number(b.total_price) || 0,
          collected_amount: Number(b.collected_amount) || 0,
          currency: b.currency || 'USD',
          payment_status: b.payment_status,
          is_prepaid: !!b.is_prepaid,
          is_accommodation_prepaid: !!b.is_accommodation_prepaid,
          is_food_prepaid: !!b.is_food_prepaid,
        }))
      );

      setDayExpenses(
        expensesForDay.map((e: any) => ({
          id: e.id,
          category: e.category,
          description: e.description,
          amount_uzs: Number(e.amount_uzs) || 0,
          worker_name: e.worker_name,
        }))
      );
    } catch (error) {
      console.error('Error fetching day panel data:', error);
      setDayGuests([]);
      setDayExpenses([]);
    } finally {
      setPanelLoading(false);
    }
  };

  const toggleExpenseExpand = async (expenseId: number) => {
    if (expandedExpenseId === expenseId) {
      setExpandedExpenseId(null);
      return;
    }
    setExpandedExpenseId(expenseId);

    if (!expenseItemsCache[expenseId]) {
      setExpenseItemsLoading(expenseId);
      try {
        const { data } = await supabase
          .from('camp_finance_items')
          .select('id, item_name, quantity, unit_price, line_total')
          .eq('finance_id', expenseId);

        setExpenseItemsCache(prev => ({
          ...prev,
          [expenseId]: (data || []).map((item: any) => ({
            id: item.id,
            item_name: item.item_name,
            quantity: Number(item.quantity) || 0,
            unit_price: Number(item.unit_price) || 0,
            line_total: Number(item.line_total) || 0,
          })),
        }));
      } catch (error) {
        console.error('Error fetching expense line items:', error);
        setExpenseItemsCache(prev => ({ ...prev, [expenseId]: [] }));
      } finally {
        setExpenseItemsLoading(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[#9C9384]">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Toggle */}
      <div className="flex gap-2">
        {(['daily', 'weekly', 'monthly', 'yearly'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all ${
              timeRange === range
                ? 'bg-[#0B6E4F] text-[#C9A227]'
                : 'bg-[#1C232E] text-[#9C9384] hover:bg-[#2A1518]'
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      {summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Total Income</p>
            <p className="text-xl font-bold text-[#0B6E4F]">{formatCurrency(summaryData.totalIncome)}</p>
          </div>
          <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Total Expense</p>
            <p className="text-xl font-bold text-[#722F37]">{formatCurrency(summaryData.totalExpense)}</p>
          </div>
          <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Net Profit</p>
            <p className={`text-xl font-bold ${summaryData.netProfit >= 0 ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
              {formatCurrency(summaryData.netProfit)}
            </p>
          </div>
          <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Guests In</p>
            <p className="text-xl font-bold text-[#C9A227]">{summaryData.totalGuestsIn}</p>
          </div>
          <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Guests Out</p>
            <p className="text-xl font-bold text-[#C9A227]">{summaryData.totalGuestsOut}</p>
          </div>
          <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Avg Guests/Day</p>
            <p className="text-xl font-bold text-[#C9A227]">{summaryData.averageGuestsPerDay.toFixed(1)}</p>
          </div>
        </div>
      )}

      {/* Chart + Day Transactions Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-[#1C232E] rounded-xl p-6 border border-[#5C4A2E]/30">
          <h3 className="text-lg font-black text-[#EDE6D6] mb-4">Financial Overview</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={analyticsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#5C4A2E" />
              <XAxis 
                dataKey="period" 
                stroke="#9C9384"
                tick={{ fill: '#9C9384', fontSize: 12 }}
              />
              <YAxis 
                stroke="#9C9384"
                tick={{ fill: '#9C9384', fontSize: 12 }}
                tickFormatter={(value) => formatNumber(value)}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1C232E', 
                  border: '1px solid #5C4A2E',
                  borderRadius: '8px'
                }}
                itemStyle={{ color: '#EDE6D6' }}
                labelStyle={{ color: '#9C9384' }}
                formatter={(value) => formatCurrency(value as number)}
              />
              <Legend />
              <Bar
                dataKey="income"
                fill="#0B6E4F"
                name="Income"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data: any) => openDayPanel(data.period)}
              />
              <Bar
                dataKey="expense"
                fill="#722F37"
                name="Expense"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data: any) => openDayPanel(data.period)}
              />
              <Line 
                type="monotone" 
                dataKey="netProfit" 
                stroke="#C9A227" 
                strokeWidth={3}
                dot={{ fill: '#C9A227', r: 4, cursor: 'pointer', onClick: (data: any) => openDayPanel(data?.payload?.period) } as any}
                name="Net Profit"
              />
            </ComposedChart>
          </ResponsiveContainer>
          {timeRange === 'daily' && (
            <p className="text-[10px] text-[#9C9384] mt-2">Click a bar to see that day's guests and expenses →</p>
          )}
        </div>

        {/* Day Transactions Panel */}
        <div className="bg-[#1C232E] rounded-xl border border-[#5C4A2E]/30 flex flex-col max-h-[420px] xl:max-h-none">
          <div className="p-4 border-b border-[#5C4A2E]/30">
            <h3 className="text-sm font-black text-[#EDE6D6] uppercase tracking-widest">
              {panelDate ? panelDate : 'Day Transactions'}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!panelDate && (
              <p className="text-xs text-[#9C9384]">
                {timeRange === 'daily'
                  ? 'Pick a day above to see who checked in and what was spent.'
                  : 'Switch to the Daily view and click a bar to inspect a specific day.'}
              </p>
            )}

            {panelDate && panelLoading && (
              <p className="text-xs text-[#9C9384]">Loading…</p>
            )}

            {panelDate && !panelLoading && (
              <>
                {/* Guests */}
                <div>
                  <p className="text-[10px] font-black text-[#C9A227] uppercase tracking-widest mb-2">
                    Guests Checked In {dayGuests.length > 0 && `(${dayGuests.length})`}
                  </p>
                  {dayGuests.length === 0 ? (
                    <p className="text-xs text-[#9C9384]">No check-ins this day.</p>
                  ) : (
                    <div className="space-y-2">
                      {dayGuests.map((g) => (
                        <div key={g.id} className="bg-[#0F1419]/50 rounded-lg p-3 border border-[#5C4A2E]/20">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-sm font-medium text-[#EDE6D6]">{g.guest_name}</span>
                            <span className="text-sm font-bold text-[#0B6E4F] whitespace-nowrap">
                              {formatMoney(g.collected_amount, g.currency)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {g.is_prepaid && (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-[#0B6E4F]/20 text-[#0B6E4F] px-2 py-0.5 rounded-full">
                                Prepaid
                              </span>
                            )}
                            {g.is_accommodation_prepaid && !g.is_prepaid && (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-[#0B6E4F]/20 text-[#0B6E4F] px-2 py-0.5 rounded-full">
                                Stay Prepaid
                              </span>
                            )}
                            {g.is_food_prepaid && (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-[#0B6E4F]/20 text-[#0B6E4F] px-2 py-0.5 rounded-full">
                                Food Prepaid
                              </span>
                            )}
                            {!g.is_prepaid && !g.is_accommodation_prepaid && !g.is_food_prepaid && (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-[#722F37]/20 text-[#722F37] px-2 py-0.5 rounded-full">
                                {g.payment_status || 'unpaid'}
                              </span>
                            )}
                          </div>
                          {g.collected_amount < g.total_price && (
                            <p className="text-[10px] text-[#9C9384] mt-1">
                              of {formatMoney(g.total_price, g.currency)} total
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expenses */}
                <div>
                  <p className="text-[10px] font-black text-[#722F37] uppercase tracking-widest mb-2">
                    Expenses {dayExpenses.length > 0 && `(${dayExpenses.length})`}
                  </p>
                  {dayExpenses.length === 0 ? (
                    <p className="text-xs text-[#9C9384]">No expenses this day.</p>
                  ) : (
                    <div className="space-y-2">
                      {dayExpenses.map((e) => (
                        <div key={e.id} className="bg-[#0F1419]/50 rounded-lg border border-[#5C4A2E]/20 overflow-hidden">
                          <button
                            onClick={() => toggleExpenseExpand(e.id)}
                            className="w-full text-left p-3 flex justify-between items-center gap-2 hover:bg-[#2A1518]/50 transition-colors"
                          >
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-[#EDE6D6] block truncate">
                                {e.category || e.description || 'Expense'}
                              </span>
                              {e.worker_name && (
                                <span className="text-[10px] text-[#9C9384]">{e.worker_name}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-bold text-[#722F37]">
                                {formatCurrency(e.amount_uzs)}
                              </span>
                              <svg
                                className={`w-4 h-4 text-[#9C9384] transition-transform ${expandedExpenseId === e.id ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>

                          {expandedExpenseId === e.id && (
                            <div className="px-3 pb-3 border-t border-[#5C4A2E]/20 pt-2">
                              {e.description && (
                                <p className="text-xs text-[#9C9384] mb-2">{e.description}</p>
                              )}
                              {expenseItemsLoading === e.id ? (
                                <p className="text-xs text-[#9C9384]">Loading items…</p>
                              ) : (expenseItemsCache[e.id]?.length || 0) === 0 ? (
                                <p className="text-xs text-[#9C9384]">No itemized breakdown for this expense.</p>
                              ) : (
                                <div className="space-y-1">
                                  {expenseItemsCache[e.id].map((item) => (
                                    <div key={item.id} className="flex justify-between text-xs">
                                      <span className="text-[#EDE6D6]">
                                        {item.item_name} <span className="text-[#9C9384]">×{item.quantity}</span>
                                      </span>
                                      <span className="text-[#9C9384]">{formatCurrency(item.line_total)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Breakdown Table */}
      <div className="bg-[#1C232E] rounded-xl border border-[#5C4A2E]/30 overflow-hidden">
        <h3 className="text-lg font-black text-[#EDE6D6] p-6 pb-4">Detailed Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0F1419]/50 border-b border-[#5C4A2E]/30">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Period</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Income</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Expense</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Net Profit</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Guests In</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Guests Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#5C4A2E]/20">
              {analyticsData.map((item) => (
                <tr 
                  key={item.period}
                  onClick={() => { handlePeriodClick(item.period); openDayPanel(item.period); }}
                  className="hover:bg-[#2A1518] cursor-pointer transition-colors"
                >
                  <td className="px-6 py-3 text-sm font-medium text-[#EDE6D6]">{item.period}</td>
                  <td className="px-6 py-3 text-sm text-right text-[#0B6E4F]">{formatCurrency(item.income)}</td>
                  <td className="px-6 py-3 text-sm text-right text-[#722F37]">{formatCurrency(item.expense)}</td>
                  <td className={`px-6 py-3 text-sm text-right font-bold ${item.netProfit >= 0 ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
                    {formatCurrency(item.netProfit)}
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-[#C9A227]">{item.guestsIn}</td>
                  <td className="px-6 py-3 text-sm text-right text-[#C9A227]">{item.guestsOut}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Period Breakdown Modal */}
      {selectedPeriod && periodBreakdown.length > 0 && (
        <div className="fixed inset-0 bg-[#0F1419]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1C232E] rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl animate-in zoom-in duration-200 border border-[#5C4A2E]/30">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-[#EDE6D6]">{selectedPeriod} Breakdown</h3>
              <button
                onClick={() => setSelectedPeriod(null)}
                className="text-[#9C9384] hover:text-[#EDE6D6] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              {periodBreakdown.map((item) => (
                <div key={item.period} className="bg-[#0F1419]/50 rounded-lg p-4 border border-[#5C4A2E]/20">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Income</p>
                      <p className="text-lg font-bold text-[#0B6E4F]">{formatCurrency(item.income)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Expense</p>
                      <p className="text-lg font-bold text-[#722F37]">{formatCurrency(item.expense)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Net Profit</p>
                      <p className={`text-lg font-bold ${item.netProfit >= 0 ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
                        {formatCurrency(item.netProfit)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Guests</p>
                      <p className="text-lg font-bold text-[#C9A227]">In: {item.guestsIn} | Out: {item.guestsOut}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
