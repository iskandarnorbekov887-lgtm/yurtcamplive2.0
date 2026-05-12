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
  const { data: requests = [] } = useSWR('procurement_manager', fetchSentRequests);

  const updateItemField = async (itemId: string, field: string, value: number | string) => {
    await supabase.from('procurement_items').update({ [field]: value }).eq('id', itemId);
    mutate('procurement_manager');
  };

  const markAsReviewed = async (requestId: string) => {
    // Calculate total cost on the fly for the request
    const request = requests.find(r => r.id === requestId);
    const total = request?.procurement_items?.reduce((acc, item) => 
      acc + (item.actual_received_qty * item.unit_price), 0) || 0;

    await supabase.from('procurement_requests').update({ 
      status: 'reviewed',
      total_cost: total
    }).eq('id', requestId);
    
    mutate('procurement_manager');
  };

  return (
    <div className="min-h-screen bg-noir-950 text-white p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter flex items-center gap-4">
              <ShieldCheck className="text-emerald-500" size={36} />
              Fiscal Logistics
            </h1>
            <p className="text-slate-500 font-bold tracking-[0.3em] text-[10px] uppercase mt-2">Executive Review & Financial Audit</p>
          </div>
          <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl flex items-center gap-4">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-slate-300">Auditor Presence: Active</span>
          </div>
        </div>

        {/* Manifest Queue */}
        <div className="space-y-10">
          {requests.map((req) => (
            <motion.div 
              key={req.id}
              layout
              className="glass-card rounded-[48px] overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 p-8">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  req.status === 'sent' ? 'bg-electric-blue/10 text-electric-blue border border-electric-blue/20' :
                  req.status === 'reviewed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  'bg-white/5 text-slate-500'
                }`}>
                  {req.status}
                </span>
              </div>

              <div className="p-12">
                <div className="flex justify-between items-start mb-12">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">
                      <Truck className="text-slate-400" size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight">Supply Batch #{req.id.slice(0, 8)}</h2>
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Received: {new Date(req.created_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Financial Commitment</p>
                    <div className="flex items-baseline gap-2">
                       <span className="text-slate-500 text-lg font-black">$</span>
                       <motion.span 
                         key={req.total_cost}
                         initial={{ y: 20, opacity: 0 }}
                         animate={{ y: 0, opacity: 1 }}
                         className="text-5xl font-black tracking-tighter"
                       >
                         {req.total_cost.toLocaleString()}
                       </motion.span>
                    </div>
                  </div>
                </div>

                {/* Items Grid */}
                <div className="space-y-4">
                  {req.procurement_items?.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-6 bg-white/5 border border-white/5 rounded-3xl p-6 hover:bg-white/[0.07] transition-all items-center">
                      <div className="col-span-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-noir-800 flex items-center justify-center font-black text-slate-300 border border-white/5">
                          {item.inventory?.item_name[0]}
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-tight text-slate-200">{item.inventory?.item_name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Buy Unit: {item.inventory?.buy_unit}</p>
                        </div>
                      </div>

                      <div className="col-span-2">
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Expected</p>
                        <p className="text-xl font-black">{item.requested_qty} <span className="text-[10px] text-slate-500">{item.inventory?.use_unit}</span></p>
                      </div>

                      <div className="col-span-3">
                        <p className="text-[10px] text-electric-blue font-black uppercase tracking-widest mb-2">Actual Received ({item.inventory?.buy_unit})</p>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number"
                            disabled={req.status !== 'sent'}
                            value={item.actual_received_qty}
                            onChange={(e) => updateItemField(item.id, 'actual_received_qty', parseFloat(e.target.value))}
                            className="w-full bg-noir-800 border border-white/10 rounded-xl py-3 px-4 text-center font-black text-xl focus:border-electric-blue focus:ring-4 focus:ring-electric-blue/10 outline-none transition-all disabled:opacity-30"
                          />
                        </div>
                      </div>

                      <div className="col-span-3">
                        <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mb-2">Unit Price ($)</p>
                        <div className="relative">
                          <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                          <input 
                            type="number"
                            disabled={req.status !== 'sent'}
                            value={item.unit_price}
                            onChange={(e) => updateItemField(item.id, 'unit_price', parseFloat(e.target.value))}
                            className="w-full bg-noir-800 border border-white/10 rounded-xl py-3 pl-10 pr-4 font-black text-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all disabled:opacity-30"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footnote on Unit Conversion */}
                <div className="mt-8 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center gap-4">
                   <Info className="text-electric-blue" size={20} />
                   <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                     Smart Conversion: Data entered in <span className="text-electric-blue">Buy Units</span> will automatically synchronize to <span className="text-emerald-500">Usage Stock</span> upon finalization.
                   </p>
                </div>

                {req.status === 'sent' && (
                  <div className="mt-12 flex justify-end">
                    <button 
                      onClick={() => markAsReviewed(req.id)}
                      className="px-12 py-5 bg-emerald-500 text-white rounded-3xl font-black uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all shadow-[0_20px_50px_rgba(16,185,129,0.3)] active:scale-95 flex items-center gap-4"
                    >
                      Authorize & Send for Review
                      <ArrowRight size={24} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Sticky Financial Ledger Summary */}
      <div className="fixed bottom-10 right-10 left-10 pointer-events-none z-50">
        <div className="max-w-7xl mx-auto flex justify-end">
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="glass-card px-10 py-6 rounded-[32px] pointer-events-auto flex items-center gap-8 border-emerald-500/20"
          >
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pending Review</p>
              <p className="text-2xl font-black text-white">{requests.filter(r => r.status === 'sent').length}</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Finalized Volume</p>
              <p className="text-2xl font-black text-emerald-500">{requests.filter(r => r.status === 'finalized').length}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
