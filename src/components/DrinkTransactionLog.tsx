'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/language-context';

interface LogEntry {
  id: string;
  type: 'sale' | 'restock';
  date: string;
  label: string;
  quantity: number | null;
  amount: number;
  method: string;
}

export function DrinkTransactionLog() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const [salesRes, restocksRes, paymentsRes] = await Promise.all([
        supabase
          .from('drink_sales')
          .select('id, quantity, price_at_sale, sold_at, drink_variants!inner(unit, drinks!inner(name))')
          .gte('sold_at', `${startDate}T00:00:00`)
          .lte('sold_at', `${endDate}T23:59:59`)
          .order('sold_at', { ascending: false }),
        supabase
          .from('payments')
          .select('id, amount_original, currency_original, note, method, transaction_date')
          .eq('type', 'expense')
          .ilike('note', 'Stock purchase:%')
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('payments')
          .select('id, amount_original, method, transaction_date')
          .eq('type', 'sale')
          .is('booking_id', null)
          .ilike('note', 'Walk-in POS sale')
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate)
          .order('transaction_date', { ascending: false })
      ]);

      // Group drink_sales by exact sold_at timestamp (to the second)
      const salesByTimestamp = new Map<string, any[]>();
      (salesRes.data || []).forEach((s: any) => {
        const timestamp = s.sold_at.split('.')[0]; // Remove milliseconds for exact second matching
        if (!salesByTimestamp.has(timestamp)) {
          salesByTimestamp.set(timestamp, []);
        }
        salesByTimestamp.get(timestamp)!.push(s);
      });

      // Create a map of payment methods by exact transaction_date timestamp (to the second)
      const paymentMethodMap = new Map<string, string>();
      (paymentsRes.data || []).forEach((p: any) => {
        const timestamp = p.transaction_date.split('.')[0]; // Remove milliseconds
        paymentMethodMap.set(timestamp, p.method);
      });

      // Map sales to payment methods using exact timestamp matching
      const sales: LogEntry[] = [];
      salesByTimestamp.forEach((salesGroup, timestamp) => {
        const method = paymentMethodMap.get(timestamp) || 'Unknown';
        salesGroup.forEach((s: any) => {
          sales.push({
            id: `sale-${s.id}`,
            type: 'sale',
            date: s.sold_at,
            label: `${s.drink_variants?.drinks?.name || 'Unknown'} (${s.drink_variants?.unit || ''})`,
            quantity: s.quantity,
            amount: s.quantity * s.price_at_sale,
            method
          });
        });
      });

      const restocks: LogEntry[] = (restocksRes.data || []).map((p: any) => ({
        id: `restock-${p.id}`,
        type: 'restock',
        date: p.transaction_date,
        label: p.note?.replace('Stock purchase: ', '') || 'Restock',
        quantity: null,
        amount: p.amount_original,
        method: p.method || 'Cash'
      }));

      const combined = [...sales, ...restocks].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setEntries(combined);
    } catch (err) {
      console.error('Error fetching drink transaction log:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  return (
    <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-black text-[#C9A227]">{t('drinks.transaction_log') || 'Drink Transactions'}</h2>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-[#0F1419] border border-[#5C4A2E]/30 rounded-lg px-2 py-1 text-[#EDE6D6]"
          />
          <span className="text-[#9C9384]">-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-[#0F1419] border border-[#5C4A2E]/30 rounded-lg px-2 py-1 text-[#EDE6D6]"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-[#9C9384] italic">{t('btn.loading') || 'Loading...'}</p>
      ) : entries.length === 0 ? (
        <p className="text-[#9C9384] italic">{t('pos.no_sales') || 'No transactions in this range'}</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-[#0F1419] p-3 rounded-lg border border-[#5C4A2E]/30 flex justify-between items-center"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${
                    entry.type === 'sale'
                      ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]'
                      : 'bg-[#722F37]/20 text-[#722F37]'
                  }`}
                >
                  {entry.type === 'sale' ? 'Sale' : 'Restock'}
                </span>
                <div>
                  <p className="font-bold text-[#EDE6D6] text-sm">
                    {entry.label}{entry.quantity ? ` x${entry.quantity}` : ''}
                  </p>
                  <p className="text-xs text-[#9C9384]">
                    {new Date(entry.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{entry.method}
                  </p>
                </div>
              </div>
              <p className={`font-black text-sm ${entry.type === 'sale' ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
                {entry.type === 'sale' ? '+' : '-'}{entry.amount.toLocaleString()} UZS
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
