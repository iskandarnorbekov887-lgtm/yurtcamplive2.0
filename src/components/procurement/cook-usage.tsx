'use client';

import { useState, useRef, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, type InventoryItem, type InventoryLedger } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Scale, Box, AlertTriangle, CheckCircle2, History, Zap, Plus, Search, Trash2, AlertCircle, XCircle, Keyboard, Cpu, Info } from 'lucide-react';

const fetchInventory = async () => {
  const { data } = await supabase.from('inventory_items').select('*').order('item_name');
  return (data || []) as InventoryItem[];
};

const fetchTodaysUsage = async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('inventory_ledger')
    .select('*, inventory:inventory_items(*)')
    .eq('type', 'OUT')
    .gte('created_at', today)
    .order('created_at', { ascending: false });
  return (data || []) as (InventoryLedger & { inventory: InventoryItem })[];
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

    const updated = (items || []).map(i => i.id === item.id ? { ...i, current_stock: i.current_stock - weight } : i);
    mutate('inventory', updated, false);

    await supabase.from('inventory_items').update({ current_stock: item.current_stock - weight }).eq('id', item.id);
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
      const item = (items || []).find(i => i.item_name.toLowerCase() === name);
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

  const filteredItems = (items || []).filter(i => 
    i.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white text-black p-8 font-sans overflow-x-hidden">
      
      {/* ── Overlays ── */}
      <AnimatePresence>
        {lastScan && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="bg-black text-white px-16 py-10 border border-white shadow-2xl flex flex-col items-center gap-2">
              <CheckCircle2 size={80} className="mb-4 text-emerald-400" />
              <p className="text-8xl font-mono font-black tracking-tighter uppercase">{lastScan.weight}</p>
              <p className="text-2xl font-bold opacity-80 uppercase tracking-widest">{lastScan.unit} OF {lastScan.name}</p>
            </div>
          </motion.div>
        )}
        {stockError && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="bg-white border-2 border-black text-black px-16 py-10 shadow-2xl flex flex-col items-center gap-2">
              <XCircle size={80} className="mb-4 text-red-600" />
              <p className="text-4xl font-black tracking-tighter uppercase">Stock Limit</p>
              <p className="text-7xl font-mono font-black my-2">{stockError.available} {stockError.unit}</p>
              <p className="text-xl font-bold opacity-80 uppercase tracking-widest text-center">Available stock for {stockError.name} is only {stockError.available}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header HUD */}
        <div className="flex justify-between items-end border-b-2 border-black pb-6">
          <div className="flex items-center gap-6">
             <div className="w-12 h-12 border border-black flex items-center justify-center bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <Cpu className="text-black" size={24} />
             </div>
             <div>
                <h1 className="text-3xl font-black text-black uppercase tracking-tighter">Hybrid Usage Station</h1>
                <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] mt-1">Real-Time Inventory Augmentation</p>
             </div>
          </div>

          <div className="flex bg-white p-1 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
             <button 
               onClick={() => setMode('scale')}
               className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'scale' ? 'bg-black text-white' : 'text-black hover:bg-zinc-50'}`}
             >
               <Scale size={14} /> Scale Mode
             </button>
             <button 
               onClick={() => setMode('manual')}
               className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'manual' ? 'bg-black text-white' : 'text-black hover:bg-zinc-50'}`}
             >
               <Keyboard size={14} /> Manual Mode
             </button>
          </div>
        </div>

        {/* ── Main Command Center ── */}
        <div className="grid grid-cols-12 gap-8 items-start">
          
          <div className="col-span-12 lg:col-span-8 space-y-8">
            
            {/* Input Engine */}
            <section className={`bg-white p-10 relative overflow-hidden transition-all border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] ${mode === 'scale' ? 'bg-zinc-50/50' : ''}`}>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-4 mb-12">
                   <span className="px-3 py-1 border border-black bg-white text-black text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${mode === 'scale' ? 'bg-emerald-500 animate-pulse' : 'bg-black'}`} />
                      {mode === 'scale' ? 'System: Listening' : 'System: Keyboard Input'}
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
                    placeholder={selectedItem ? `INPUT WEIGHT: ${selectedItem.item_name}` : "READY FOR PROTOCOL"}
                    inputMode={mode === 'scale' ? 'none' : 'text'}
                    className="w-full bg-transparent text-center text-6xl font-mono font-black tracking-tighter placeholder:text-zinc-100 focus:outline-none text-black uppercase"
                    autoComplete="off"
                  />
                  
                  {/* Manual Mode Dropdown */}
                  <AnimatePresence>
                    {mode === 'manual' && searchQuery && !selectedItem && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-full left-0 right-0 mt-4 bg-white border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-50 max-h-60 overflow-y-auto"
                      >
                        {(filteredItems || []).length > 0 ? filteredItems.map(item => (
                          <button 
                            key={item.id} 
                            onClick={() => handleSelectItem(item)}
                            className="w-full px-6 py-4 text-left hover:bg-black hover:text-white transition-colors flex justify-between items-center group border-b border-black last:border-0"
                          >
                            <span className="font-black text-sm uppercase tracking-tight">{item.item_name}</span>
                             <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-black opacity-60">{item.current_stock} {item.use_unit}</span>
                              <div className="border border-black p-1.5 bg-white group-hover:bg-zinc-800">
                                 <Plus size={16} className="text-black group-hover:text-white" />
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
                   <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-8 flex items-center gap-4 bg-black text-white px-6 py-3 border border-black">
                      <Zap className="text-emerald-400" size={14} />
                      <span className="font-black uppercase tracking-widest text-xs">{selectedItem.item_name} ACTIVE</span>
                      <button onClick={() => { setSelectedItem(null); setSearchQuery(''); }} className="text-zinc-500 hover:text-white transition-colors ml-4">
                        <Trash2 size={16} />
                      </button>
                   </motion.div>
                )}
              </div>
            </section>

            {/* Manual Weight Fallback (Hidden until needed) */}
            <AnimatePresence>
               {selectedItem && (
                 <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="bg-white p-8 border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                       <div className="flex items-center gap-3 mb-6">
                          <Info className="text-black" size={18} />
                          <p className="text-[10px] font-black uppercase tracking-widest text-black">Protocol: Manual Override</p>
                       </div>
                       <div className="flex gap-4">
                          <input 
                            ref={manualWeightRef}
                            type="number"
                            placeholder="0.00"
                            value={manualWeight}
                            onChange={(e) => setManualWeight(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && processUsage(selectedItem, parseFloat(manualWeight))}
                            className="flex-1 bg-white border border-black px-6 py-4 text-4xl font-mono font-black tracking-tighter text-black outline-none focus:bg-zinc-50 transition-all"
                          />
                          <button 
                            onClick={() => processUsage(selectedItem, parseFloat(manualWeight))}
                            className="px-8 py-4 bg-black text-white font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-800 transition-all border border-black"
                          >
                            LOG {selectedItem.use_unit}
                          </button>
                       </div>
                    </div>
                 </motion.div>
               )}
            </AnimatePresence>
          </div>

          {/* Sticky Notepad Sidebar (Col-4) */}
          <div className="col-span-12 lg:col-span-4">
            <section className="relative group">
              <div className="bg-white border border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center justify-between p-6 border-b border-black">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-black" />
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-black">Resource Ledger</h2>
                  </div>
                  <span className="text-lg font-mono font-black text-black">{(todaysUsage || []).length}</span>
                </div>
                <div className="flex flex-col divide-y divide-black/10 px-2 max-h-[500px] overflow-y-auto">
                   <AnimatePresence>
                     {(todaysUsage || []).map((log) => (
                      <motion.div key={log.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between py-4 px-4 hover:bg-zinc-50 transition-colors">
                        <div>
                          <span className="font-black text-black text-xs uppercase tracking-tight block truncate max-w-[140px]">{log.inventory?.item_name || 'UNKNOWN'}</span>
                          <span className="text-[9px] font-mono font-black text-slate-400 mt-1 block uppercase">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono text-base font-black text-black">{Math.abs(log.qty)}</span>
                          <span className="text-[9px] font-black text-slate-400 uppercase ml-2">{log.unit}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="p-4 border-t border-black bg-zinc-50/50 flex justify-center">
                   <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400">Ledger End of File</p>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Compact Inventory HUD */}
        <section className="space-y-6 pt-12 border-t-2 border-black">
          <div className="flex items-center gap-4">
            <Box className="text-black" size={20} />
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Stores Audit HUD</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {(items || []).map((item) => {
              const isLow = item.current_stock < item.min_threshold;
              return (
                <div key={item.id} className={`bg-white p-5 border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] ${isLow ? 'border-red-600 bg-red-50/10' : 'border-black'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-8 h-8 border border-black flex items-center justify-center ${isLow ? 'bg-red-600 text-white' : 'bg-white text-black'}`}>
                      {isLow ? <AlertTriangle size={14} /> : <Box size={14} />}
                    </div>
                    <span className="text-[9px] font-mono font-black text-slate-400 uppercase tracking-widest">{item.use_unit}</span>
                  </div>
                  <h3 className="text-[10px] font-black text-black truncate uppercase tracking-tighter mb-1">{item.item_name}</h3>
                  <p className={`font-mono text-2xl font-black tracking-tight ${isLow ? 'text-red-600' : 'text-black'}`}>{item.current_stock.toFixed(1)}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
