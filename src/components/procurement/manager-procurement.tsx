'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, type ProcurementRequest, type ProcurementItem } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ShieldCheck, Truck, Edit3, DollarSign, ArrowRight, CheckCircle2, MessageSquare, Info } from 'lucide-react';

const fetchSentRequests = async () => {
  const { data } = await supabase
    .from('procurement_requests')
    .select('*, procurement_items(*, inventory(*))')
    .in('status', ['sent', 'reviewed', 'finalized'])
    .order('created_at', { ascending: false });
  return data as ProcurementRequest[];
};

export function ManagerProcurement() {
  const { data: requestsData } = useSWR('procurement_manager', fetchSentRequests);
  const requests = requestsData || [];
  const [fiscalInputs, setFiscalInputs] = useState<Record<string, { amount: number; currency: 'UZS' | 'USD' | 'EUR'; rate: number }>>({});

  const getFiscal = (reqId: string) => fiscalInputs[reqId] || { amount: 0, currency: 'UZS', rate: 12500 };

  const updateFiscal = (reqId: string, field: string, value: any) => {
    setFiscalInputs(prev => ({
      ...prev,
      [reqId]: { ...getFiscal(reqId), [field]: value }
    }));
  };

  const updateItemField = async (itemId: string, field: string, value: number | string) => {
    await supabase.from('procurement_items').update({ [field]: value }).eq('id', itemId);
    mutate('procurement_manager');
  };

  const finalizePurchase = async (requestId: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const fiscal = getFiscal(requestId);
    const totalSpentUzs = fiscal.currency === 'UZS' ? fiscal.amount : fiscal.amount * fiscal.rate;

    // Distribute UZS across items based on their current unit_price weights
    const items = req.procurement_items || [];
    const totalCurrentValue = items.reduce((sum, item) => sum + (item.actual_received_qty * item.unit_price), 0);
    
    // Update each item with its distributed UZS price
    for (const item of items) {
      const weight = totalCurrentValue > 0 ? (item.actual_received_qty * item.unit_price) / totalCurrentValue : 1 / items.length;
      const distributedUzs = totalSpentUzs * weight;
      const unitPriceUzs = item.actual_received_qty > 0 ? distributedUzs / item.actual_received_qty : 0;

      await supabase.from('procurement_items').update({ 
        unit_price_uzs: unitPriceUzs 
      }).eq('id', item.id);

      // Update inventory master unit_price
      if (item.item_id) {
        await supabase.from('inventory_items').update({ 
          unit_price: unitPriceUzs // We store master price in UZS for accuracy
        }).eq('id', item.item_id);
      }
    }

    await supabase.from('procurement_requests').update({ 
      status: 'finalized',
      currency: fiscal.currency,
      exchange_rate: fiscal.rate,
      total_spent_uzs: totalSpentUzs,
      total_cost: fiscal.amount // Original currency amount
    }).eq('id', requestId);

    // Record entry in camp_finances for centralized auditing
    await supabase.from('camp_finances').insert([{
      type: 'EXPENSE',
      category: 'Procurement',
      amount_uzs: totalSpentUzs,
      original_amount: fiscal.amount,
      currency: fiscal.currency,
      exchange_rate: fiscal.rate,
      reference_id: requestId,
      description: `Supply Batch #${requestId.slice(0, 8)} finalized`,
      created_at: new Date().toISOString()
    }]);
    
    mutate('procurement_manager');
  };

  return (
    <div className="min-h-screen bg-[#0F1419] text-[#EDE6D6] p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-4">
              <ShieldCheck className="text-[#0B6E4F]" size={32} />
              Fiscal Logistics
            </h1>
            <p className="text-[#9C9384] font-black tracking-[0.2em] text-[10px] uppercase mt-1">Multi-Currency Procurement & Inventory Audit</p>
          </div>
          <div className="bg-[#1C232E] border border-[#5C4A2E]/30 px-4 py-2 rounded-none flex items-center gap-3 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
            <div className="w-2 h-2 bg-[#0B6E4F] rounded-full" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#EDE6D6]">Status: Auditor Active</span>
          </div>
        </div>

        {/* Manifest Queue */}
        <div className="space-y-10">
          {requests.map((req) => {
            const fiscal = getFiscal(req.id);
            const totalUzs = fiscal.currency === 'UZS' ? fiscal.amount : fiscal.amount * fiscal.rate;
            const isFinalized = req.status === 'finalized';

            return (
              <motion.div 
                key={req.id}
                layout
                className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-none overflow-hidden relative shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]"
              >
                <div className="absolute top-4 right-4 z-10">
                  <span className={`px-2.5 py-1 border border-[#5C4A2E]/30 text-[9px] font-black uppercase tracking-widest ${
                    req.status === 'sent' ? 'bg-[#B8860B] text-[#EDE6D6]' :
                    req.status === 'finalized' ? 'bg-[#0B6E4F] text-[#C9A227]' :
                    'bg-[#1C232E]/50 text-[#9C9384]'
                  }`}>
                    {req.status}
                  </span>
                </div>

                <div className="p-8">
                  <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 border border-[#5C4A2E]/30 flex items-center justify-center bg-[#1C232E] shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)]">
                        <Truck className="text-[#EDE6D6]" size={24} />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-black uppercase tracking-tight">Batch #{req.id.slice(0, 8)}</h2>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-0.5 font-mono">{req.created_at}</p>
                      </div>
                    </div>

                    {/* Fiscal Details Bento Card */}
                    {!isFinalized ? (
                      <div className="bg-[#FFFFFF] border border-black p-6 w-full lg:w-[450px] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] grid grid-cols-12 gap-4">
                        <div className="col-span-12 mb-2">
                           <p className="text-[10px] font-black uppercase tracking-widest text-black border-b border-black pb-1 mb-4">Payment Detail (Entry)</p>
                        </div>
                        
                        <div className="col-span-6">
                           <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Total Amount</label>
                           <input 
                             type="number"
                             value={fiscal.amount}
                             onChange={(e) => updateFiscal(req.id, 'amount', parseFloat(e.target.value) || 0)}
                             className="w-full bg-[#1C232E] border border-[#5C4A2E]/30 px-3 py-2 font-mono text-base font-black text-[#EDE6D6] outline-none focus:bg-[#2A1518]"
                           />
                        </div>

                        <div className="col-span-6">
                           <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Currency</label>
                           <select 
                             value={fiscal.currency}
                             onChange={(e) => updateFiscal(req.id, 'currency', e.target.value)}
                             className="w-full bg-[#1C232E] border border-[#5C4A2E]/30 px-3 py-2 font-mono text-base font-black text-[#EDE6D6] outline-none appearance-none"
                           >
                             <option value="UZS">UZS</option>
                             <option value="USD">USD</option>
                             <option value="EUR">EUR</option>
                           </select>
                        </div>

                        {fiscal.currency !== 'UZS' && (
                          <div className="col-span-12">
                             <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Exchange Rate</label>
                             <input 
                               type="number"
                               value={fiscal.rate}
                               onChange={(e) => updateFiscal(req.id, 'rate', parseFloat(e.target.value) || 0)}
                               className="w-full bg-[#1C232E] border border-[#5C4A2E]/30 px-3 py-2 font-mono text-base font-black text-[#EDE6D6] outline-none focus:bg-[#2A1518]"
                             />
                          </div>
                        )}

                        <div className="col-span-12 pt-4 border-t border-black mt-2">
                           <div className="flex justify-between items-baseline">
                              <span className="text-[10px] font-black uppercase text-[#EDE6D6]">Converted Total:</span>
                              <span className="text-2xl font-mono font-black text-[#EDE6D6]">{totalUzs.toLocaleString()} UZS</span>
                           </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#0B6E4F]/20 border border-[#5C4A2E]/30 p-6 w-full lg:w-[450px] shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
                         <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F] mb-4">Finalized Financial Record</p>
                         <div className="flex justify-between items-baseline mb-2">
                            <span className="text-[10px] font-black text-[#EDE6D6] uppercase">Spent (UZS):</span>
                            <span className="text-2xl font-mono font-black text-[#EDE6D6]">{(req.total_spent_uzs || 0).toLocaleString()} UZS</span>
                         </div>
                         <p className="text-[10px] font-black text-[#0B6E4F] uppercase tracking-tighter font-mono">
                            Original: {req.total_cost?.toLocaleString()} {req.currency} @ {req.exchange_rate?.toLocaleString()} RATE
                         </p>
                      </div>
                    )}
                  </div>

                  {/* Items Grid */}
                  <div className="space-y-4">
                    {req.procurement_items?.map((item) => (
                      <div key={item.id} className="grid grid-cols-12 gap-4 bg-[#1C232E] border border-[#5C4A2E]/30 p-5 hover:translate-x-[1px] hover:translate-y-[1px] transition-all items-center">
                        <div className="col-span-4 flex items-center gap-3">
                          <div className="w-10 h-10 border border-[#5C4A2E]/30 flex items-center justify-center font-black text-[#EDE6D6] text-sm bg-[#1C232E]/50">
                            {item.inventory?.item_name[0]}
                          </div>
                          <div>
                            <p className="font-black text-[#EDE6D6] text-sm uppercase tracking-tight">{item.inventory?.item_name}</p>
                            <p className="text-[9px] text-[#9C9384] font-black uppercase tracking-widest">{item.inventory?.buy_unit}</p>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Expected</p>
                          <p className="text-base font-mono font-black text-black">{item.requested_qty} <span className="text-[9px] uppercase">{item.inventory?.use_unit}</span></p>
                        </div>

                        <div className="col-span-3">
                          <p className="text-[9px] text-[#EDE6D6] font-black uppercase tracking-widest mb-1.5">Inbound ({item.inventory?.buy_unit})</p>
                          <input 
                            type="number"
                            disabled={isFinalized}
                            value={item.actual_received_qty ?? ''}
                            onChange={(e) => updateItemField(item.id, 'actual_received_qty', parseFloat(e.target.value) || 0)}
                            className="w-full bg-[#1C232E] border border-[#5C4A2E]/30 py-2 px-3 text-center font-mono text-lg font-black text-[#EDE6D6] outline-none disabled:bg-[#1C232E]/50"
                          />
                        </div>

                        <div className="col-span-3">
                          <p className="text-[9px] text-[#EDE6D6] font-black uppercase tracking-widest mb-1.5">Unit Ref ($)</p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9384] font-black">$</span>
                            <input 
                              type="number"
                              disabled={isFinalized}
                              value={item.unit_price ?? ''}
                              onChange={(e) => updateItemField(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-full bg-[#1C232E] border border-[#5C4A2E]/30 py-2 pl-8 pr-3 font-mono text-lg font-black text-[#EDE6D6] outline-none disabled:bg-[#1C232E]/50"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isFinalized && (
                    <div className="mt-8 flex justify-end">
                      <button 
                        onClick={() => finalizePurchase(req.id)}
                        className="px-10 py-4 bg-black text-white rounded-none font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-800 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] flex items-center gap-3 border border-black"
                      >
                        Finalize & Mark as Bought
                        <CheckCircle2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Financial Ledger HUD */}
      <div className="fixed bottom-10 right-10 z-50">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-[#1C232E] border-2 border-[#5C4A2E]/30 p-8 rounded-none shadow-[8px_8px_0px_0px_rgba(92,74,46,0.3)] flex flex-col gap-4"
        >
          <div>
            <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest border-b border-[#5C4A2E]/30 pb-1 mb-2">Daily Audit</p>
            <div className="flex items-baseline gap-4">
               <span className="text-[10px] font-black text-[#EDE6D6] uppercase">Finalized Total:</span>
               <span className="text-3xl font-mono font-black text-[#0B6E4F]">
                  {requests.filter(r => r.status === 'finalized').reduce((sum, r) => sum + (r.total_spent_uzs || 0), 0).toLocaleString()} UZS
               </span>
            </div>
          </div>
          <div className="flex justify-between items-center text-[9px] font-black text-[#9C9384] uppercase tracking-widest">
            <span>Pending: {requests.filter(r => r.status === 'sent').length}</span>
            <span>Completed: {requests.filter(r => r.status === 'finalized').length}</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
