'use client';

import { useState, useRef, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, type InventoryItem, type InventoryLedger } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Scale, Box, AlertTriangle, CheckCircle2, History, Zap, Plus, Search, Trash2, AlertCircle, XCircle, Keyboard, Cpu, Info } from 'lucide-react';

const fetchInventory = async () => {
  const { data } = await supabase.from('inventory').select('*').order('item_name');
  return data as InventoryItem[];
};

const fetchTodaysUsage = async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('inventory_ledger')
    .select('*, inventory(*)')
    .eq('type', 'OUT')
    .gte('created_at', today)
    .order('created_at', { ascending: false });
  return data as (InventoryLedger & { inventory: InventoryItem })[];
};

export function CookUsage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'scale' | 'manual'>('scale');
  const [scaleInput, setScaleInput] = useState('');
  const [lastScan, setLastScan] = useState<{ name: string; weight: number; unit: string } | null>(null);
  const [stockError, setStockError] = useState<{ name: string; requested: number; available: number; unit: string } | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [manualWeight, setManualWeight] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const manualWeightRef = useRef<HTMLInputElement>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: items = [] } = useSWR('inventory', fetchInventory, { refreshInterval: 5000 });
  const { data: todaysUsage = [], mutate: mutateUsage } = useSWR('todays_usage', fetchTodaysUsage);

  // ── Auto-Focus Management ──────────────────────────────────
  useEffect(() => {
    const focus = () => {
      if (selectedItem) {
        manualWeightRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    };
    focus();
    const interval = setInterval(focus, 2000);
    return () => clearInterval(interval);
  }, [selectedItem, mode]);

  // ── Sound UI ───────────────────────────────────────────────
  const playSound = (type: 'success' | 'error') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      } else {
        osc.frequency.setValueAtTime(110, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      }
      osc.start();
      osc.stop(audioCtx.currentTime + (type === 'success' ? 0.1 : 0.3));
    } catch (e) { console.warn('Audio blocked'); }
  };

  const processUsage = async (item: InventoryItem, weight: number) => {
    if (weight > item.current_stock) {
      playSound('error');
      setStockError({ name: item.item_name, requested: weight, available: item.current_stock, unit: item.use_unit });
      setTimeout(() => setStockError(null), 4000);
      return;
    }

    playSound('success');
    setLastScan({ name: item.item_name, weight, unit: item.use_unit });
    setTimeout(() => setLastScan(null), 1800);

    const updated = items.map(i => i.id === item.id ? { ...i, current_stock: i.current_stock - weight } : i);
    mutate('inventory', updated, false);

    await supabase.from('inventory').update({ current_stock: item.current_stock - weight }).eq('id', item.id);
    await supabase.from('inventory_ledger').insert([{
      item_id: item.id,
      type: 'OUT',
      qty: -weight,
      unit: item.use_unit,
      reason: 'Cook Usage Log (Hybrid)',
      created_by: user?.id
    }]);
    
    mutate('inventory');
    mutateUsage();
    
    // Reset Manual state
    setSelectedItem(null);
    setSearchQuery('');
    setManualWeight('');
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
  };

  // ── Logic: The Hybrid Listener ────────────────────────────
  const handleInput = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const input = scaleInput.trim();
    setScaleInput('');

    // Case 1: Scale-First (Name + Number)
    const regex = /^([a-zA-Z\s]+)\s+([0-9.]+)/i;
    const match = input.match(regex);

    if (match) {
      const name = match[1].trim().toLowerCase();
      const weight = parseFloat(match[2]);
      const item = items.find(i => i.item_name.toLowerCase() === name);
      if (item) {
        await processUsage(item, weight);
        return;
      }
    }

    // Case 2: Partial Scale (Just number after manual select)
    if (selectedItem && !isNaN(parseFloat(input))) {
      await processUsage(selectedItem, parseFloat(input));
      return;
    }

    playSound('error');
  };

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setSearchQuery(item.item_name);
    
    // Start 3-second fallback timer
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      // If no scale data arrived, the auto-focus logic in useEffect will handle weight input focus
    }, 3000);
  };

  const filteredItems = items.filter(i => 
    i.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-noir-950 text-white p-8 font-sans selection:bg-electric-blue/30 overflow-x-hidden">
      
      {/* ── Overlays ── */}
      <AnimatePresence>
        {lastScan && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="bg-emerald-500 text-white px-16 py-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-2">
              <CheckCircle2 size={80} className="mb-4" />
              <p className="text-8xl font-black tracking-tighter uppercase">{lastScan.weight}</p>
              <p className="text-2xl font-bold opacity-80 uppercase tracking-widest">{lastScan.unit} OF {lastScan.name}</p>
            </div>
          </motion.div>
        )}
        {stockError && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="bg-safety-orange text-white px-16 py-10 rounded-[40px] shadow-2xl flex flex-col items-center gap-2 border-4 border-white/20">
              <XCircle size={80} className="mb-4" />
              <p className="text-4xl font-black tracking-tighter uppercase">Stock Limit</p>
              <p className="text-7xl font-black my-2">{stockError.available} {stockError.unit}</p>
              <p className="text-xl font-bold opacity-80 uppercase tracking-widest text-center">Available stock for {stockError.name} is only {stockError.available}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header HUD */}
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-6">
             <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center border border-white/10 group hover:border-electric-blue transition-all">
                <Cpu className="text-electric-blue group-hover:animate-spin" size={32} />
             </div>
             <div>
                <h1 className="text-4xl font-black tracking-tighter uppercase">Hybrid Intelligence</h1>
                <p className="text-slate-500 font-bold tracking-[0.3em] text-[10px] uppercase mt-2">Executive Logistics HUD v3.0</p>
             </div>
          </div>

          <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
             <button 
               onClick={() => setMode('scale')}
               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'scale' ? 'bg-electric-blue text-white shadow-lg' : 'text-slate-500'}`}
             >
               <Scale size={14} /> Scale Mode
             </button>
             <button 
               onClick={() => setMode('manual')}
               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'manual' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
             >
               <Keyboard size={14} /> Manual Mode
             </button>
          </div>
        </div>

        {/* ── Main Command Center ── */}
        <div className="grid grid-cols-12 gap-8 items-start">
          
          <div className="col-span-12 lg:col-span-8 space-y-8">
            
            {/* Input Engine */}
            <section className={`glass-card rounded-[48px] p-12 relative overflow-hidden transition-all duration-500 border-2 ${mode === 'scale' ? 'border-electric-blue animate-pulse-glow shadow-[0_0_50px_rgba(59,130,246,0.2)]' : 'border-white/5'}`}>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-4 mb-12">
                   <span className="px-4 py-1.5 rounded-full bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-widest border border-white/5 flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${mode === 'scale' ? 'bg-electric-blue animate-ping' : 'bg-slate-700'}`} />
                      {mode === 'scale' ? 'Listening for Scale Wedge' : 'Keyboard Input Active'}
                   </span>
                </div>

                <div className="w-full relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={scaleInput}
                    onChange={(e) => {
                      setScaleInput(e.target.value);
                      if (mode === 'manual') setSearchQuery(e.target.value);
                    }}
                    onKeyDown={handleInput}
                    placeholder={selectedItem ? `ENTER WEIGHT FOR ${selectedItem.item_name}...` : "READY FOR PROTOCOL..."}
                    inputMode={mode === 'scale' ? 'none' : 'text'}
                    className="w-full bg-transparent text-center text-7xl font-black tracking-tighter placeholder:text-slate-800 focus:outline-none uppercase"
                    autoComplete="off"
                  />
                  
                  {/* Manual Mode Dropdown */}
                  <AnimatePresence>
                    {mode === 'manual' && searchQuery && !selectedItem && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-full left-0 right-0 mt-6 bg-noir-800 border border-white/10 rounded-[32px] shadow-2xl z-50 max-h-80 overflow-y-auto p-4"
                      >
                        {filteredItems.length > 0 ? filteredItems.map(item => (
                          <button 
                            key={item.id} 
                            onClick={() => handleSelectItem(item)}
                            className="w-full px-8 py-5 text-left hover:bg-electric-blue rounded-2xl transition-all flex justify-between items-center group"
                          >
                            <span className="font-black text-xl uppercase tracking-tight">{item.item_name}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-bold text-slate-400 group-hover:text-white/80">{item.current_stock} {item.use_unit}</span>
                              <div className="bg-white/5 p-2 rounded-xl group-hover:bg-white/20">
                                 <Plus size={16} />
                              </div>
                            </div>
                          </button>
                        )) : (
                          <div className="py-12 text-center opacity-40">
                             <AlertCircle className="mx-auto mb-4" size={32} />
                             <p className="font-black uppercase tracking-widest text-xs">No matching resource</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Selected Item Indicator */}
                {selectedItem && (
                   <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 flex items-center gap-4 bg-electric-blue/10 border border-electric-blue/20 px-6 py-3 rounded-2xl">
                      <Zap className="text-electric-blue" size={16} />
                      <span className="font-black uppercase tracking-widest text-xs text-electric-blue">{selectedItem.item_name} SELECTED</span>
                      <button onClick={() => { setSelectedItem(null); setSearchQuery(''); }} className="text-slate-500 hover:text-white transition-colors">
                        <Trash2 size={14} />
                      </button>
                   </motion.div>
                )}
              </div>
            </section>

            {/* Manual Weight Fallback (Hidden until needed) */}
            <AnimatePresence>
               {selectedItem && (
                 <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="glass-card rounded-[40px] p-8 border border-emerald-500/20 bg-emerald-500/5">
                       <div className="flex items-center gap-4 mb-6">
                          <Info className="text-emerald-500" size={20} />
                          <p className="text-xs font-black uppercase tracking-widest text-emerald-500">Manual Weight Entry (Fallback)</p>
                       </div>
                       <div className="flex gap-4">
                          <input 
                            ref={manualWeightRef}
                            type="number"
                            placeholder="0.00"
                            value={manualWeight}
                            onChange={(e) => setManualWeight(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && processUsage(selectedItem, parseFloat(manualWeight))}
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-8 py-6 text-5xl font-black tracking-tighter text-white outline-none focus:border-emerald-500 transition-all"
                          />
                          <button 
                            onClick={() => processUsage(selectedItem, parseFloat(manualWeight))}
                            className="px-12 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-900/20"
                          >
                            Log {selectedItem.use_unit}
                          </button>
                       </div>
                    </div>
                 </motion.div>
               )}
            </AnimatePresence>

            {/* Desktop Helper Toggle */}
            <div className="flex justify-center opacity-40 hover:opacity-100 transition-opacity">
               <button 
                 onClick={() => setScaleInput(selectedItem ? '0.500' : 'Tomato 0.850')} 
                 className="text-[10px] font-black uppercase tracking-[0.4em] border-b border-white/10 pb-1"
               >
                 Simulate Input Protocol
               </button>
            </div>
          </div>

          {/* Sticky Notepad Sidebar (Col-4) */}
          <div className="col-span-12 lg:col-span-4 h-full">
            <section className="relative group h-full">
              <div className="absolute inset-0 bg-white/5 rounded-[40px] translate-x-2 translate-y-2 rotate-1" />
              <div className="relative glass-card rounded-[40px] p-8 border border-white/10 bg-noir-900 shadow-2xl -rotate-1 min-h-[440px]">
                <div className="absolute top-0 left-0 right-0 h-6 bg-electric-blue/20 border-b border-dashed border-white/10" />
                <div className="flex items-center justify-between mb-8 mt-4">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 bg-electric-blue rounded-full" />
                    <h2 className="text-sm font-black uppercase tracking-widest">Shift Log</h2>
                  </div>
                  <span className="text-[10px] font-black text-electric-blue">{todaysUsage.length}</span>
                </div>
                <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence>
                    {todaysUsage.map((log) => (
                      <motion.div key={log.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="relative pl-4 border-l border-white/10 flex items-center justify-between group/item">
                        <div>
                          <span className="font-black uppercase text-slate-200 text-[12px] block">{log.inventory?.item_name}</span>
                          <span className="text-[8px] font-bold text-slate-600 uppercase mt-1">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-white">{Math.abs(log.qty)}</span>
                          <span className="text-[7px] font-black text-slate-600 uppercase ml-1">{log.unit}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="absolute bottom-4 right-6 opacity-20 rotate-12">
                   <Scale size={48} />
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Compact Inventory HUD */}
        <section className="space-y-8 pt-12 border-t border-white/5">
          <div className="flex items-center gap-4">
            <Box className="text-slate-600" size={24} />
            <h2 className="text-xl font-black uppercase tracking-tighter text-slate-400">Stores HUD</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {items.map((item) => {
              const isLow = item.current_stock < item.min_threshold;
              return (
                <motion.div key={item.id} className={`glass-card p-4 rounded-[28px] border-2 transition-all ${isLow ? 'border-safety-orange/30 bg-safety-orange/5' : 'border-white/5'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-1.5 rounded-lg ${isLow ? 'bg-safety-orange/20 text-safety-orange' : 'bg-white/5 text-slate-500'}`}>
                      {isLow ? <AlertTriangle size={12} /> : <Box size={12} />}
                    </div>
                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded-md">{item.use_unit}</span>
                  </div>
                  <h3 className="text-[10px] font-black text-slate-400 truncate uppercase">{item.item_name}</h3>
                  <p className={`text-xl font-black mt-1 tracking-tighter ${isLow ? 'text-safety-orange' : 'text-slate-200'}`}>{item.current_stock.toFixed(1)}</p>
                </motion.div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
