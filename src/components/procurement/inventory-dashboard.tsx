'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, type InventoryItem, type InventoryLedger } from '@/lib/supabase';
import { Box, Activity, AlertCircle, TrendingUp, TrendingDown, Clock, Search, Filter } from 'lucide-react';

const fetchInventory = async () => {
  const { data } = await supabase.from('inventory').select('*').order('item_name');
  return data as InventoryItem[];
};

const fetchLedger = async () => {
  const { data } = await supabase
    .from('inventory_ledger')
    .select('*, inventory(*)')
    .order('created_at', { ascending: false })
    .limit(100);
  return data as (InventoryLedger & { inventory: InventoryItem })[];
};

export function InventoryDashboard() {
  const [showLedger, setShowLedger] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: items = [], mutate: mutateInv } = useSWR('inventory_list', fetchInventory);
  const { data: ledger = [], mutate: mutateLedger } = useSWR('inventory_ledger', fetchLedger);

  const filteredItems = items.filter(i => 
    i.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: items.length,
    low: items.filter(i => i.current_stock < i.min_threshold).length,
    inbound: ledger.filter(l => l.type === 'IN').length
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      
      {/* ── Stats HUD ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Stockpiles', val: stats.total, icon: Box, color: 'text-electric-blue' },
          { label: 'Critically Low', val: stats.low, icon: AlertCircle, color: 'text-safety-orange' },
          { label: 'Monthly Inbound', val: stats.inbound, icon: TrendingUp, color: 'text-emerald-500' }
        ].map((stat, i) => (
          <motion.div 
            key={i}
            whileHover={{ scale: 1.02 }}
            className="glass-card p-8 rounded-[32px] border border-white/5 flex items-center justify-between"
          >
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className={`text-4xl font-black ${stat.color}`}>{stat.val}</p>
            </div>
            <div className={`w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center ${stat.color} border border-white/5`}>
              <stat.icon size={28} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Inventory Control ── */}
      <div className="glass-card rounded-[48px] overflow-hidden">
        <div className="p-10 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 bg-noir-800 rounded-2xl px-6 py-3 border border-white/5 w-full max-w-md focus-within:border-electric-blue transition-all">
            <Search className="text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Filter stores..."
              className="bg-transparent w-full font-bold uppercase tracking-tight outline-none placeholder:text-slate-700"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowLedger(!showLedger)}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                showLedger ? 'bg-white text-noir-950 shadow-xl' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'
              }`}
            >
              <Clock size={14} />
              {showLedger ? 'Close Ledger' : 'View Ledger'}
            </button>
          </div>
        </div>

        <div className="p-10">
          <AnimatePresence mode="wait">
            {!showLedger ? (
              <motion.div 
                key="grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6"
              >
                {filteredItems.map((item) => {
                  const isLow = item.current_stock < item.min_threshold;
                  return (
                    <div 
                      key={item.id}
                      className={`p-6 rounded-[32px] border-2 transition-all bg-white/5 ${
                        isLow ? 'border-safety-orange/30 glow-pending' : 'border-white/5'
                      }`}
                    >
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{item.use_unit}</p>
                      <h3 className="font-bold text-slate-300 truncate uppercase tracking-tight mb-4">{item.item_name}</h3>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-black tracking-tighter ${isLow ? 'text-safety-orange' : 'text-white'}`}>
                          {item.current_stock.toFixed(1)}
                        </span>
                        {item.buy_unit && (
                          <span className="text-[9px] font-black text-slate-600 uppercase">
                            ≈ {(item.current_stock / (item.conversion_factor || 1)).toFixed(1)} {item.buy_unit}
                          </span>
                        )}
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
                className="space-y-4"
              >
                <div className="grid grid-cols-12 px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <div className="col-span-2">Timestamp</div>
                  <div className="col-span-4">Resource Allocation</div>
                  <div className="col-span-2 text-center">Movement</div>
                  <div className="col-span-2 text-center">Delta</div>
                  <div className="col-span-2 text-right">Reason</div>
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                  {ledger.map((log) => (
                    <div key={log.id} className="grid grid-cols-12 px-6 py-5 bg-white/5 border border-white/5 rounded-2xl items-center hover:bg-white/[0.07] transition-all">
                      <div className="col-span-2 text-[10px] font-bold text-slate-500">
                        {new Date(log.created_at).toLocaleDateString()}<br/>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="col-span-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-noir-800 border border-white/5 flex items-center justify-center font-black text-[10px] text-slate-400">
                          {log.inventory?.item_name[0]}
                        </div>
                        <span className="font-black uppercase tracking-tight text-slate-300">{log.inventory?.item_name}</span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          log.type === 'IN' ? 'bg-emerald-500/10 text-emerald-500' :
                          log.type === 'OUT' ? 'bg-electric-blue/10 text-electric-blue' :
                          'bg-safety-orange/10 text-safety-orange'
                        }`}>
                          {log.type}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`text-lg font-black tracking-tighter ${
                          log.qty > 0 ? 'text-emerald-500' : 'text-electric-blue'
                        }`}>
                          {log.qty > 0 ? '+' : ''}{log.qty.toFixed(2)}
                        </span>
                        <span className="ml-1 text-[9px] font-bold text-slate-600 uppercase">{log.unit}</span>
                      </div>
                      <div className="col-span-2 text-right text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate">
                        {log.reason || 'Manual Adjustment'}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
