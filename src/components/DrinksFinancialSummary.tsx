'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Purchase {
  id: string;
  note: string;
  amount_original: number;
  transaction_date: string;
}

export function DrinksFinancialSummary() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cashSales, setCashSales] = useState(0);
  const [onlineSales, setOnlineSales] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
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
      // Fetch restock records (purchases)
      const { data: purchaseData } = await supabase
        .from('payments')
        .select('id, note, amount_original, transaction_date')
        .eq('type', 'expense')
        .ilike('note', 'Stock purchase:%')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: false });

      // Fetch walk-in POS sales payments (booking_id IS NULL, type = 'sale', note = 'Walk-in POS sale')
      const { data: salesData } = await supabase
        .from('payments')
        .select('amount_original, method, transaction_date')
        .eq('type', 'sale')
        .is('booking_id', null)
        .ilike('note', 'Walk-in POS sale')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

      const purchaseList: Purchase[] = (purchaseData || []).map((p: any) => ({
        id: p.id,
        note: p.note?.replace('Stock purchase: ', '') || 'Unknown',
        amount_original: parseFloat(p.amount_original) || 0,
        transaction_date: p.transaction_date
      }));

      const cashSum = (salesData || [])
        .filter((s: any) => s.method === 'Cash')
        .reduce((sum, s: any) => sum + (parseFloat(s.amount_original) || 0), 0);

      const onlineSum = (salesData || [])
        .filter((s: any) => s.method === 'Online')
        .reduce((sum, s: any) => sum + (parseFloat(s.amount_original) || 0), 0);

      const spentSum = purchaseList.reduce((sum, p) => sum + p.amount_original, 0);

      setPurchases(purchaseList);
      setCashSales(cashSum);
      setOnlineSales(onlineSum);
      setTotalSpent(spentSum);
    } catch (err) {
      console.error('Error fetching drinks financial summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const totalNet = cashSales + onlineSales - totalSpent;

  return (
    <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-black text-[#C9A227]">Drinks Financial Summary</h2>
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
        <p className="text-[#9C9384] italic">Loading...</p>
      ) : (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0F1419] p-4 rounded-lg border border-[#5C4A2E]/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1">
                Sales — Cash
              </p>
              <p className="text-lg md:text-xl font-black text-[#0B6E4F]">
                {cashSales.toLocaleString()} UZS
              </p>
            </div>
            <div className="bg-[#0F1419] p-4 rounded-lg border border-[#5C4A2E]/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1">
                Sales — Online
              </p>
              <p className="text-lg md:text-xl font-black text-[#C9A227]">
                {onlineSales.toLocaleString()} UZS
              </p>
            </div>
            <div className="bg-[#0F1419] p-4 rounded-lg border border-[#5C4A2E]/30">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384] mb-1">
                Purchases
              </p>
              <p className="text-lg md:text-xl font-black text-[#722F37]">
                {totalSpent.toLocaleString()} UZS
              </p>
            </div>
            <div className="bg-[#0B6E4F]/10 p-4 rounded-lg border-2 border-[#0B6E4F]">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F] mb-1">
                Total Net
              </p>
              <p className="text-lg md:text-xl font-black text-[#0B6E4F]">
                {totalNet.toLocaleString()} UZS
              </p>
            </div>
          </div>

          {/* Purchases Table */}
          {purchases.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-[#EDE6D6] mb-3 uppercase tracking-widest">Purchases</h3>
              <div className="bg-[#0F1419] rounded-lg border border-[#5C4A2E]/30 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1C232E] border-b border-[#5C4A2E]/30">
                      <th className="text-left p-3 text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Item</th>
                      <th className="text-left p-3 text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Date</th>
                      <th className="text-right p-3 text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.id} className="border-b border-[#5C4A2E]/20 last:border-0">
                        <td className="p-3 text-[#EDE6D6]">{purchase.note}</td>
                        <td className="p-3 text-[#9C9384]">
                          {new Date(purchase.transaction_date).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right font-bold text-[#722F37]">
                          {purchase.amount_original.toLocaleString()} UZS
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
