'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/language-context';

export function CashBoxSummary() {
  const { t } = useLanguage();
  const [cashIn, setCashIn] = useState(0);
  const [cashOut, setCashOut] = useState(0);
  const [onlineTotal, setOnlineTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const { data: payments } = await supabase
        .from('payments')
        .select('amount_original, method, type')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

      console.log('[CashBoxSummary] Raw payments data:', payments);

      const cashInSum = (payments || [])
        .filter((p: any) => p.method === 'Cash' && p.type === 'sale')
        .reduce((sum, p: any) => sum + (parseFloat(p.amount_original) || 0), 0);

      const cashOutSum = (payments || [])
        .filter((p: any) => p.method === 'Cash' && p.type === 'expense')
        .reduce((sum, p: any) => sum + (parseFloat(p.amount_original) || 0), 0);

      const onlinePayments = (payments || []).filter((p: any) => p.method === 'Online' && p.type === 'sale');
      console.log('[CashBoxSummary] Online payments filtered:', onlinePayments);
      const onlineSum = onlinePayments.reduce((sum, p: any) => sum + (parseFloat(p.amount_original) || 0), 0);

      setCashIn(cashInSum);
      setCashOut(cashOutSum);
      setOnlineTotal(onlineSum);
    } catch (err) {
      console.error('Error fetching cash box summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const netCashBox = cashIn - cashOut;

  return (
    <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-black text-[#C9A227]">{t('cashbox.title') || 'Cash Box Summary'}</h2>
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
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#0F1419] p-4 rounded-lg border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1">
              {t('cashbox.cash_in') || 'Cash In'}
            </p>
            <p className="text-lg md:text-xl font-black text-[#0B6E4F]">
              {cashIn.toLocaleString()} UZS
            </p>
          </div>
          <div className="bg-[#0F1419] p-4 rounded-lg border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1">
              {t('cashbox.cash_out') || 'Cash Out'}
            </p>
            <p className="text-lg md:text-xl font-black text-[#722F37]">
              {cashOut.toLocaleString()} UZS
            </p>
          </div>
          <div className="bg-[#0B6E4F]/10 p-4 rounded-lg border-2 border-[#0B6E4F]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F] mb-1">
              {t('cashbox.net_cash_box') || 'Net Cash Box'}
            </p>
            <p className="text-lg md:text-xl font-black text-[#0B6E4F]">
              {netCashBox.toLocaleString()} UZS
            </p>
          </div>
          <div className="bg-[#0F1419] p-4 rounded-lg border border-[#5C4A2E]/30">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1">
              {t('cashbox.online') || 'Online (not in box)'}
            </p>
            <p className="text-lg md:text-xl font-black text-[#C9A227]">
              {onlineTotal.toLocaleString()} UZS
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
