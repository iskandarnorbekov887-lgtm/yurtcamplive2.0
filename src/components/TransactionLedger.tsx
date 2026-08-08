'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type TxnType = 'income' | 'expense';

interface LedgerTxn {
  id: string;
  type: TxnType;
  category: string;
  label: string;
  description: string;
  amount: number;
  currency: string;
  amount_uzs: number;
  txn_date: string;
  created_at: string;
  source: 'camp_finances' | 'payment_exchange' | 'payment_restock' | 'booking_payment' | 'payment_sale';
  finance_id?: number;
  booking_id?: number;
  worker_name?: string | null;
  method?: string | null;
  is_prepaid_hint?: boolean;
}

interface FinanceLineItem {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface BookingDetail {
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

type Preset = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

export function TransactionLedger() {
  const [preset, setPreset] = useState<Preset>('month');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | TxnType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [rawTxns, setRawTxns] = useState<LedgerTxn[]>([]);
  const [rates, setRates] = useState<{ USD: number; EUR: number }>({ USD: 12500, EUR: 13500 });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lineItemsCache, setLineItemsCache] = useState<Record<number, FinanceLineItem[]>>({});
  const [bookingCache, setBookingCache] = useState<Record<number, BookingDetail | null>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  // Initialize default range: current month to date
  useEffect(() => {
    applyPreset('month');
    fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dateFrom && dateTo) {
      fetchTransactions(dateFrom, dateTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const fetchRates = async () => {
    try {
      const res = await fetch('/api/exchange-rate');
      if (res.ok) {
        const json = await res.json();
        if (json?.USD && json?.EUR) setRates({ USD: json.USD, EUR: json.EUR });
      }
    } catch {
      // fall back to defaults already set
    }
  };

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === 'today') {
      const t = toDateStr(now);
      setDateFrom(t);
      setDateTo(t);
    } else if (p === 'week') {
      setDateFrom(toDateStr(startOfWeek(now)));
      setDateTo(toDateStr(now));
    } else if (p === 'month') {
      setDateFrom(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
      setDateTo(toDateStr(now));
    } else if (p === 'year') {
      setDateFrom(toDateStr(new Date(now.getFullYear(), 0, 1)));
      setDateTo(toDateStr(now));
    } else if (p === 'all') {
      setDateFrom('2000-01-01');
      setDateTo(toDateStr(now));
    }
  };

  const convertToUzs = useCallback(
    (amount: number, currency: string): number => {
      if (currency === 'UZS' || !currency) return amount;
      if (currency === 'USD') return amount * rates.USD;
      if (currency === 'EUR') return amount * rates.EUR;
      return amount;
    },
    [rates]
  );

  const fetchTransactions = async (from: string, to: string) => {
    setLoading(true);
    try {
      const { data: financesData } = await supabase
        .from('camp_finances')
        .select('*')
        .gte('transaction_date', from)
        .lte('transaction_date', to);

      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .gte('transaction_date', from)
        .lte('transaction_date', to);

      const txns: LedgerTxn[] = [];

      (financesData || []).forEach((item: any) => {
        const isIncome = item.type === 'income';
        const amount = Number(item.original_amount ?? item.amount_uzs) || 0;
        const currency = item.currency || 'UZS';
        const amountUzs = Number(item.amount_uzs) || convertToUzs(amount, currency);

        txns.push({
          id: `cf-${item.id}`,
          type: isIncome ? 'income' : 'expense',
          category: isIncome ? 'Guest Income' : (item.category || 'Other'),
          label: isIncome
            ? (item.guest_name || 'Guest income')
            : (item.worker_name || item.category || 'Expense'),
          description: item.description || '',
          amount,
          currency,
          amount_uzs: amountUzs,
          txn_date: item.transaction_date || (item.created_at ? item.created_at.split('T')[0] : ''),
          created_at: item.created_at || item.transaction_date,
          source: 'camp_finances',
          finance_id: item.id,
          worker_name: item.worker_name || null,
        });
      });

      (paymentsData || []).forEach((item: any) => {
        const amount = Number(item.amount_original) || 0;
        const currency = item.currency_original || 'USD';
        const amountUzs = convertToUzs(amount, currency);
        const base = {
          amount,
          currency,
          amount_uzs: amountUzs,
          txn_date: item.transaction_date || (item.created_at ? item.created_at.split('T')[0] : ''),
          created_at: item.created_at,
          method: item.method || null,
        };

        if (item.exchange_id) {
          txns.push({
            id: `pm-${item.id}`,
            type: item.type === 'expense' ? 'expense' : 'income',
            category: 'Currency Exchange',
            label: 'Currency Exchange',
            description: item.note || '',
            source: 'payment_exchange',
            ...base,
          });
        } else if (item.note && String(item.note).startsWith('Stock purchase:')) {
          txns.push({
            id: `pm-${item.id}`,
            type: 'expense',
            category: 'Stock Purchase',
            label: 'Stock Purchase',
            description: item.note || '',
            source: 'payment_restock',
            ...base,
          });
        } else if (item.type === 'sale' && item.booking_id) {
          txns.push({
            id: `pm-${item.id}`,
            type: 'income',
            category: 'Booking Payment',
            label: item.note || 'Booking tab payment',
            description: item.note || 'Tab payment',
            source: 'booking_payment',
            booking_id: item.booking_id,
            ...base,
          });
        } else if (item.type === 'sale') {
          txns.push({
            id: `pm-${item.id}`,
            type: 'income',
            category: 'POS Sale',
            label: item.note || 'Walk-in POS sale',
            description: item.note || 'Walk-in POS sale',
            source: 'payment_sale',
            ...base,
          });
        } else if (item.type === 'expense') {
          txns.push({
            id: `pm-${item.id}`,
            type: 'expense',
            category: 'Other Payment',
            label: item.note || 'Payment expense',
            description: item.note || '',
            source: 'payment_sale',
            ...base,
          });
        }
      });

      txns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Bulk-fetch guest/booking detail for all booking-payment rows up front,
      // so the guest name (not the receipt note) shows directly in the list.
      const bookingIds = Array.from(
        new Set(txns.filter((t) => t.source === 'booking_payment' && t.booking_id).map((t) => t.booking_id as number))
      );

      if (bookingIds.length > 0) {
        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('id, guest_name, total_price, collected_amount, currency, payment_status, is_prepaid, is_accommodation_prepaid, is_food_prepaid')
          .in('id', bookingIds);

        const freshBookingCache: Record<number, BookingDetail | null> = {};
        (bookingsData || []).forEach((b: any) => {
          freshBookingCache[b.id] = {
            id: b.id,
            guest_name: b.guest_name,
            total_price: Number(b.total_price) || 0,
            collected_amount: Number(b.collected_amount) || 0,
            currency: b.currency || 'USD',
            payment_status: b.payment_status,
            is_prepaid: !!b.is_prepaid,
            is_accommodation_prepaid: !!b.is_accommodation_prepaid,
            is_food_prepaid: !!b.is_food_prepaid,
          };
        });
        setBookingCache((prev) => ({ ...prev, ...freshBookingCache }));

        txns.forEach((t) => {
          if (t.source === 'booking_payment' && t.booking_id && freshBookingCache[t.booking_id]) {
            t.label = freshBookingCache[t.booking_id]!.guest_name || t.label;
          }
        });
      }

      setRawTxns(txns);
      setExpandedId(null);
    } catch (error) {
      console.error('Error fetching ledger transactions:', error);
      setRawTxns([]);
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    rawTxns.forEach((t) => set.add(t.category));
    return Array.from(set).sort();
  }, [rawTxns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawTxns.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (q) {
        const haystack = `${t.label} ${t.description} ${t.worker_name || ''} ${t.category}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rawTxns, typeFilter, categoryFilter, search]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    filtered.forEach((t) => {
      if (t.type === 'income') income += t.amount_uzs;
      else expense += t.amount_uzs;
    });
    return { income, expense, net: income - expense };
  }, [filtered]);

  const formatNumber = (num: number): string => {
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
    return `${sign}${abs.toFixed(0)}`;
  };

  const formatUzs = (num: number) => `${formatNumber(num)} UZS`;
  const formatOriginal = (amount: number, currency: string) => `${formatNumber(amount)} ${currency}`;

  const toggleExpand = async (txn: LedgerTxn) => {
    if (expandedId === txn.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(txn.id);

    // Lazy-load itemized breakdown for camp_finances expenses
    if (txn.source === 'camp_finances' && txn.type === 'expense' && txn.finance_id) {
      if (!lineItemsCache[txn.finance_id]) {
        setDetailLoading(txn.id);
        try {
          const { data } = await supabase
            .from('camp_finance_items')
            .select('id, item_name, quantity, unit_price, line_total')
            .eq('finance_id', txn.finance_id);
          setLineItemsCache((prev) => ({
            ...prev,
            [txn.finance_id!]: (data || []).map((it: any) => ({
              id: it.id,
              item_name: it.item_name,
              quantity: Number(it.quantity) || 0,
              unit_price: Number(it.unit_price) || 0,
              line_total: Number(it.line_total) || 0,
            })),
          }));
        } catch (error) {
          console.error('Error fetching line items:', error);
          setLineItemsCache((prev) => ({ ...prev, [txn.finance_id!]: [] }));
        } finally {
          setDetailLoading(null);
        }
      }
    }

    // Lazy-load booking detail for booking-payment income rows
    if (txn.source === 'booking_payment' && txn.booking_id) {
      if (!(txn.booking_id in bookingCache)) {
        setDetailLoading(txn.id);
        try {
          const { data } = await supabase
            .from('bookings')
            .select('id, guest_name, total_price, collected_amount, currency, payment_status, is_prepaid, is_accommodation_prepaid, is_food_prepaid')
            .eq('id', txn.booking_id)
            .single();
          setBookingCache((prev) => ({
            ...prev,
            [txn.booking_id!]: data
              ? {
                  id: data.id,
                  guest_name: data.guest_name,
                  total_price: Number(data.total_price) || 0,
                  collected_amount: Number(data.collected_amount) || 0,
                  currency: data.currency || 'USD',
                  payment_status: data.payment_status,
                  is_prepaid: !!data.is_prepaid,
                  is_accommodation_prepaid: !!data.is_accommodation_prepaid,
                  is_food_prepaid: !!data.is_food_prepaid,
                }
              : null,
          }));
        } catch (error) {
          console.error('Error fetching booking detail:', error);
          setBookingCache((prev) => ({ ...prev, [txn.booking_id!]: null }));
        } finally {
          setDetailLoading(null);
        }
      }
    }
  };

  const categoryBadgeColor = (t: LedgerTxn) =>
    t.type === 'income' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' : 'bg-[#722F37]/20 text-[#722F37]';

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-[#1C232E] rounded-xl border border-[#5C4A2E]/30 p-4 space-y-3">
        {/* Date presets + custom range */}
        <div className="flex flex-wrap items-center gap-2">
          {(['today', 'week', 'month', 'year', 'all'] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all ${
                preset === p
                  ? 'bg-[#0B6E4F] text-[#C9A227]'
                  : 'bg-[#0F1419]/50 text-[#9C9384] hover:bg-[#2A1518]/50'
              }`}
            >
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'All Time'}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPreset('custom'); }}
              className="bg-[#0F1419]/50 border border-[#5C4A2E]/30 rounded-lg px-2 py-1.5 text-xs text-[#EDE6D6]"
            />
            <span className="text-[#9C9384] text-xs">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPreset('custom'); }}
              className="bg-[#0F1419]/50 border border-[#5C4A2E]/30 rounded-lg px-2 py-1.5 text-xs text-[#EDE6D6]"
            />
          </div>
        </div>

        {/* Type toggle + category + search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-[#0F1419]/50 rounded-lg p-1">
            {(['all', 'income', 'expense'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-md font-bold uppercase tracking-widest text-[10px] transition-all ${
                  typeFilter === t
                    ? t === 'income'
                      ? 'bg-[#0B6E4F] text-[#EDE6D6]'
                      : t === 'expense'
                      ? 'bg-[#722F37] text-[#EDE6D6]'
                      : 'bg-[#5C4A2E] text-[#EDE6D6]'
                    : 'text-[#9C9384] hover:text-[#EDE6D6]'
                }`}
              >
                {t === 'all' ? 'All' : t === 'income' ? 'Income' : 'Expenses'}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#0F1419]/50 border border-[#5C4A2E]/30 rounded-lg px-3 py-1.5 text-xs text-[#EDE6D6]"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest, worker, description…"
            className="flex-1 min-w-[180px] bg-[#0F1419]/50 border border-[#5C4A2E]/30 rounded-lg px-3 py-1.5 text-xs text-[#EDE6D6] placeholder:text-[#9C9384]"
          />
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
          <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Income</p>
          <p className="text-xl font-bold text-[#0B6E4F]">{formatUzs(summary.income)}</p>
        </div>
        <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
          <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Expense</p>
          <p className="text-xl font-bold text-[#722F37]">{formatUzs(summary.expense)}</p>
        </div>
        <div className="bg-[#1C232E] rounded-xl p-4 border border-[#5C4A2E]/30">
          <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Net</p>
          <p className={`text-xl font-bold ${summary.net >= 0 ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
            {formatUzs(summary.net)}
          </p>
        </div>
      </div>

      {/* Transaction List */}
      <div className="bg-[#1C232E] rounded-xl border border-[#5C4A2E]/30 overflow-hidden">
        {loading ? (
          <p className="text-xs text-[#9C9384] p-6 text-center">Loading transactions…</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-[#9C9384] p-6 text-center">No transactions match these filters.</p>
        ) : (
          <div className="divide-y divide-[#5C4A2E]/20">
            {filtered.map((t) => (
              <div key={t.id}>
                <button
                  onClick={() => toggleExpand(t)}
                  className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[#2A1518]/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#EDE6D6] truncate">{t.label}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${categoryBadgeColor(t)}`}>
                        {t.category}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#9C9384] mt-0.5">
                      {t.txn_date}{t.description ? ` · ${t.description}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-bold whitespace-nowrap ${t.type === 'income' ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatOriginal(t.amount, t.currency)}
                    </span>
                    <svg
                      className={`w-4 h-4 text-[#9C9384] transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedId === t.id && (
                  <div className="px-4 pb-4 border-t border-[#5C4A2E]/20 pt-3 bg-[#0F1419]/30">
                    {detailLoading === t.id ? (
                      <p className="text-xs text-[#9C9384]">Loading detail…</p>
                    ) : (
                      <>
                        {/* Itemized breakdown for camp_finances expenses */}
                        {t.source === 'camp_finances' && t.type === 'expense' && (
                          <div className="space-y-1">
                            {(lineItemsCache[t.finance_id!]?.length || 0) === 0 ? (
                              <p className="text-xs text-[#9C9384]">No itemized breakdown for this expense.</p>
                            ) : (
                              lineItemsCache[t.finance_id!].map((item) => (
                                <div key={item.id} className="flex justify-between text-xs">
                                  <span className="text-[#EDE6D6]">
                                    {item.item_name} <span className="text-[#9C9384]">×{item.quantity}</span>
                                  </span>
                                  <span className="text-[#9C9384]">{formatUzs(item.line_total)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* Booking detail for booking-payment income */}
                        {t.source === 'booking_payment' && t.booking_id && (
                          bookingCache[t.booking_id] ? (
                            (() => {
                              const b = bookingCache[t.booking_id!]!;
                              const accommodationPaid = b.is_prepaid || b.is_accommodation_prepaid;
                              const foodPaid = b.is_prepaid || b.is_food_prepaid;
                              const remaining = Math.max(b.total_price - b.collected_amount, 0);
                              return (
                                <div className="space-y-3">
                                  {/* Collected so far, front and center */}
                                  <div className="flex items-center justify-between bg-[#0F1419]/50 rounded-lg px-3 py-2">
                                    <span className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Collected</span>
                                    <span className="text-sm font-bold text-[#0B6E4F]">
                                      {formatOriginal(b.collected_amount, b.currency)}
                                      <span className="text-[#9C9384] font-normal"> / {formatOriginal(b.total_price, b.currency)}</span>
                                    </span>
                                  </div>

                                  {/* Paid / prepaid checklist */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className={accommodationPaid ? 'text-[#0B6E4F]' : 'text-[#722F37]'}>
                                        {accommodationPaid ? '✓' : '✕'}
                                      </span>
                                      <span className="text-[#EDE6D6]">Accommodation {accommodationPaid ? 'paid / prepaid' : 'not paid'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className={foodPaid ? 'text-[#0B6E4F]' : 'text-[#722F37]'}>
                                        {foodPaid ? '✓' : '✕'}
                                      </span>
                                      <span className="text-[#EDE6D6]">Food {foodPaid ? 'paid / prepaid' : 'not paid'}</span>
                                    </div>
                                  </div>

                                  {/* Total / paid / remaining, with currency */}
                                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#5C4A2E]/20">
                                    <div>
                                      <p className="text-[9px] font-black text-[#9C9384] uppercase tracking-widest">Total</p>
                                      <p className="text-xs text-[#EDE6D6] font-medium">{formatOriginal(b.total_price, b.currency)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-black text-[#9C9384] uppercase tracking-widest">Paid</p>
                                      <p className="text-xs text-[#0B6E4F] font-medium">{formatOriginal(b.collected_amount, b.currency)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-black text-[#9C9384] uppercase tracking-widest">Remaining</p>
                                      <p className={`text-xs font-medium ${remaining > 0 ? 'text-[#722F37]' : 'text-[#0B6E4F]'}`}>
                                        {formatOriginal(remaining, b.currency)}
                                      </p>
                                    </div>
                                  </div>

                                  {!accommodationPaid && !foodPaid && (
                                    <span className="inline-block text-[9px] font-black uppercase tracking-widest bg-[#722F37]/20 text-[#722F37] px-2 py-0.5 rounded-full">
                                      {b.payment_status || 'unpaid'}
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <p className="text-xs text-[#9C9384]">No linked booking found.</p>
                          )
                        )}

                        {/* Worker income period detail */}
                        {t.source === 'camp_finances' && t.category === 'workers income' && (
                          <p className="text-xs text-[#9C9384]">Worker: {t.worker_name || t.label}</p>
                        )}

                        {/* Generic payments (exchange / stock / POS) */}
                        {(t.source === 'payment_exchange' || t.source === 'payment_restock' || t.source === 'payment_sale') && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[#9C9384]">Method</span>
                            <span className="text-[#EDE6D6]">{t.method || '—'}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
