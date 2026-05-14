'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, type InventoryItem, type InventoryLedger } from '@/lib/supabase';
import { Box, Activity, AlertCircle, TrendingUp, Search, Clock, ShieldCheck, DollarSign, PieChart } from 'lucide-react';

const fetchInventory = async () => {
  const { data } = await supabase.from('inventory_items').select('*').order('item_name');
  return (data || []) as InventoryItem[];
};

const fetchLedger = async () => {
  const { data } = await supabase
    .from('inventory_ledger')
    .select('*, inventory:inventory_items(*)')
    .order('created_at', { ascending: false })
    .limit(100);
  return (data || []) as (InventoryLedger & { inventory: InventoryItem })[];
};

export function InventoryDashboard() {
  const [showLedger, setShowLedger] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: items = [] } = useSWR('inventory_list', fetchInventory);
  const { data: ledger = [] } = useSWR('inventory_ledger', fetchLedger);

  const filteredItems = (items || []).filter(i => 
    i.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: (items || []).length,
    low: (items || []).filter(i => i.current_stock < i.min_threshold).length,
    inbound: (ledger || []).filter(l => l.type === 'IN').length,
    totalValueUzs: (items || []).reduce((sum, i) => sum + (i.current_stock * ((i as any).unit_price || 0)), 0)
  };

  if ((items || []).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <Box size={64} className="text-slate-200 mb-6" />
        <h2 className="text-2xl font-black text-black uppercase tracking-tighter">Inventory is currently empty</h2>
        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mt-2">Start fresh by adding products to the master record.</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      
      {/* ── Stats HUD ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          { label: 'Asset Volume', val: stats.total, icon: Box, color: 'text-black' },
          { label: 'Depletion Alerts', val: stats.low, icon: AlertCircle, color: isFinite(stats.low) && stats.low > 0 ? 'text-red-600' : 'text-black' },
          { label: 'Flow Events', val: stats.inbound, icon: TrendingUp, color: 'text-black' },
          { label: 'Net Asset Value', val: `${stats.totalValueUzs.toLocaleString()} UZS`, icon: PieChart, color: 'text-emerald-700', isCurrency: true }
        ].map((stat, i) => (
          <motion.div 
            key={i}
            className="bg-white p-8 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-4">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{stat.label}</p>
               <stat.icon size={18} className="text-black opacity-20" />
            </div>
            <p className={`text-2xl font-mono font-black tracking-tight ${stat.color}`}>
               {stat.val}
            </p>
          </motion.div>
        ))}
      </div>

      {/* ── Inventory Control ── */}
      <div className="bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="p-8 border-b border-black flex flex-col lg:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-4 bg-white border border-black px-6 py-4 w-full max-w-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus-within:bg-zinc-50 transition-all">
            <Search className="text-black" size={20} />
            <input 
              type="text" 
              placeholder="SEARCH ASSET INVENTORY..."
              className="bg-transparent w-full font-black text-xs uppercase tracking-widest outline-none placeholder:text-slate-200 text-black"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-6 w-full lg:w-auto">
            <button 
              onClick={() => setShowLedger(!showLedger)}
              className={`flex-1 lg:flex-none px-10 py-4 font-black uppercase tracking-[0.2em] text-[10px] transition-all border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] flex items-center justify-center gap-3 ${
                showLedger ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-50'
              }`}
            >
              <Clock size={16} />
              {showLedger ? 'CLOSE AUDIT' : 'VIEW AUDIT LEDGER'}
            </button>
          </div>
        </div>

        <div className="p-8 bg-zinc-50/30">
          <AnimatePresence mode="wait">
            {!showLedger ? (
              <motion.div 
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-8"
              >
                {filteredItems.map((item) => {
                  const isLow = item.current_stock < item.min_threshold;
                  const totalVal = item.current_stock * ((item as any).unit_price || 0);
                  return (
                    <div 
                      key={item.id}
                      className={`p-6 border transition-all bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between ${
                        isLow ? 'border-red-600 bg-red-50/10' : 'border-black'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-4">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.use_unit}</p>
                           {isLow && <AlertCircle size={14} className="text-red-600" />}
                        </div>
                        <h3 className="font-black text-black text-sm uppercase tracking-tight mb-6 line-clamp-1 border-b border-black/5 pb-2">
                          {item.item_name}
                        </h3>
                        <div className="space-y-4">
                           <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Available Quantity</p>
                              <p className={`font-mono text-3xl font-black tracking-tighter ${isLow ? 'text-red-600' : 'text-black'}`}>
                                {item.current_stock.toFixed(2)}
                              </p>
                           </div>
                           <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5">
                              <div>
                                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Unit ($)</p>
                                 <p className="font-mono text-xs font-black text-black">{((item as any).unit_price || 0).toLocaleString()}</p>
                              </div>
                              <div>
                                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Valuation</p>
                                 <p className="font-mono text-xs font-black text-black">{totalVal.toLocaleString()}</p>
                              </div>
                           </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div 
                key="ledger"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-12 px-6 py-4 text-[10px] font-black text-black uppercase tracking-[0.2em] border-b border-black bg-white">
                  <div className="col-span-2">Protocol TS</div>
                  <div className="col-span-4">Asset Specification</div>
                  <div className="col-span-2 text-center">Movement</div>
                  <div className="col-span-2 text-center">Delta</div>
                  <div className="col-span-2 text-right">Reference</div>
                </div>
                <div className="space-y-4 max-h-[700px] overflow-y-auto pr-4 custom-scrollbar">
                  {(ledger || []).map((log) => (
                    <div key={log.id} className="grid grid-cols-12 px-6 py-5 bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] items-center hover:bg-zinc-50 transition-all">
                      <div className="col-span-2 text-[10px] font-mono font-black text-slate-400">
                        {new Date(log.created_at).toLocaleDateString()}<br/>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </div>
                      <div className="col-span-4 flex items-center gap-4">
                        <div className="w-8 h-8 border border-black flex items-center justify-center font-black text-[10px] text-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          {log.inventory?.item_name?.[0] || '?'}
                        </div>
                        <span className="font-black text-sm text-black uppercase tracking-tight">{log.inventory?.item_name || 'NULL_SPEC'}</span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`px-4 py-1 border border-black text-[9px] font-black uppercase tracking-widest ${
                          log.type === 'IN' ? 'bg-black text-white' :
                          log.type === 'OUT' ? 'bg-white text-black' :
                          'bg-amber-400 text-black'
                        }`}>
                          {log.type}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`text-xl font-mono font-black tracking-tighter ${
                          log.qty > 0 ? 'text-black' : 'text-black'
                        }`}>
                          {log.qty > 0 ? '+' : ''}{log.qty.toFixed(2)}
                        </span>
                        <span className="ml-2 text-[9px] font-black text-slate-400 uppercase">{log.unit}</span>
                      </div>
                      <div className="col-span-2 text-right text-[10px] font-black text-slate-400 uppercase tracking-tight truncate">
                        {log.reason || 'MANUAL_OVERRIDE'}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      
      {/* ── Fiscal Summary Footnote ── */}
      <div className="p-8 border border-black bg-zinc-50 flex items-start gap-4">
         <ShieldCheck size={24} className="text-black" />
         <div>
            <h4 className="text-[10px] font-black text-black uppercase tracking-widest mb-1">Asset Integrity Audit</h4>
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tighter leading-relaxed">
              Inventory valuation is strictly calculated in UZS. Unit prices reflect the most recent supply handshake conversion. 
              Variance in stock weight is logged via the hybrid weighing station or manual manager adjustment.
            </p>
         </div>
      </div>
    </div>
  );
}
