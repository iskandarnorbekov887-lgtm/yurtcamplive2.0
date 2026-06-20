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
    <div className="min-h-screen bg-[#0F1419] text-[#EDE6D6] p-8 font-sans overflow-x-hidden">
      
      {/* ── Overlays ── */}
      <AnimatePresence>
        {lastScan && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="bg-[#1C232E] text-[#C9A227] px-16 py-10 border border-[#5C4A2E]/30 shadow-2xl flex flex-col items-center gap-2">
              <CheckCircle2 size={80} className="mb-4 text-[#0B6E4F]" />
              <p className="text-8xl font-mono font-black tracking-tighter uppercase">{lastScan.weight}</p>
              <p className="text-2xl font-bold opacity-80 uppercase tracking-widest">{lastScan.unit} OF {lastScan.name}</p>
            </div>
          </motion.div>
        )}
        {stockError && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="bg-[#1C232E] border-2 border-[#5C4A2E]/30 text-[#EDE6D6] px-16 py-10 shadow-2xl flex flex-col items-center gap-2">
              <XCircle size={80} className="mb-4 text-[#722F37]" />
              <p className="text-4xl font-black tracking-tighter uppercase">Stock Limit</p>
              <p className="text-7xl font-mono font-black my-2">{stockError.available} {stockError.unit}</p>
              <p className="text-xl font-bold opacity-80 uppercase tracking-widest text-center">Available stock for {stockError.name} is only {stockError.available}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header HUD */}
        <div className="flex justify-between items-end border-b-2 border-[#5C4A2E]/30 pb-6">
          <div className="flex items-center gap-6">
             <div className="w-12 h-12 border border-[#5C4A2E]/30 flex items-center justify-center bg-[#1C232E] shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
                <Cpu className="text-[#EDE6D6]" size={24} />
             </div>
             <div>
                <h1 className="text-3xl font-black text-[#EDE6D6] uppercase tracking-tighter">Hybrid Usage Station</h1>
                <p className="text-[#9C9384] font-black text-[10px] uppercase tracking-[0.2em] mt-1">Real-Time Inventory Augmentation</p>
             </div>
          </div>

          <div className="flex bg-[#1C232E] p-1 border border-[#5C4A2E]/30 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)]">
             <button 
               onClick={() => setMode('scale')}
               className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'scale' ? 'bg-[#0B6E4F] text-[#C9A227]' : 'text-[#EDE6D6] hover:bg-[#2A1518]'}`}
             >
               <Scale size={14} /> Scale Mode
             </button>
             <button 
               onClick={() => setMode('manual')}
               className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mode === 'manual' ? 'bg-[#0B6E4F] text-[#C9A227]' : 'text-[#EDE6D6] hover:bg-[#2A1518]'}`}
             >
               <Keyboard size={14} /> Manual Mode
             </button>
          </div>
        </div>

        {/* ── Main Command Center ── */}
        <div className="grid grid-cols-12 gap-8 items-start">
          
          <div className="col-span-12 lg:col-span-8 space-y-8">
            
            {/* Input Engine */}
            <section className={`bg-[#1C232E] p-10 relative overflow-hidden transition-all border border-[#5C4A2E]/30 shadow-[8px_8px_0px_0px_rgba(92,74,46,0.3)] ${mode === 'scale' ? 'bg-[#1C232E]/50' : ''}`}>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-4 mb-12">
                   <span className="px-3 py-1 border border-[#5C4A2E]/30 bg-[#1C232E] text-[#EDE6D6] text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${mode === 'scale' ? 'bg-[#0B6E4F] animate-pulse' : 'bg-[#9C9384]'}`} />
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
                    className="w-full bg-transparent text-center text-6xl font-mono font-black tracking-tighter placeholder:text-[#9C9384]/30 focus:outline-none text-[#EDE6D6] uppercase"
                    autoComplete="off"
                  />
                  
                  {/* Manual Mode Dropdown */}
                  <AnimatePresence>
                    {mode === 'manual' && searchQuery && !selectedItem && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute top-full left-0 right-0 mt-4 bg-[#1C232E] border border-[#5C4A2E]/30 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)] z-50 max-h-60 overflow-y-auto"
                      >
                        {(filteredItems || []).length > 0 ? filteredItems.map(item => (
                          <button 
                            key={item.id} 
                            onClick={() => handleSelectItem(item)}
                            className="w-full px-6 py-4 text-left hover:bg-[#2A1518] hover:text-[#C9A227] transition-colors flex justify-between items-center group border-b border-[#5C4A2E]/30 last:border-0"
                          >
                            <span className="font-black text-sm uppercase tracking-tight text-[#EDE6D6]">{item.item_name}</span>
                             <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-black opacity-60 text-[#9C9384]">{item.current_stock} {item.use_unit}</span>
                              <div className="border border-[#5C4A2E]/30 p-1.5 bg-[#1C232E] group-hover:bg-[#2A1518]">
                                 <Plus size={16} className="text-[#EDE6D6] group-hover:text-[#C9A227]" />
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
                    <div className="bg-[#1C232E] p-8 border border-[#5C4A2E]/30 shadow-[8px_8px_0px_0px_rgba(92,74,46,0.3)]">
                       <div className="flex items-center gap-3 mb-6">
                          <Info className="text-[#EDE6D6]" size={18} />
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#EDE6D6]">Protocol: Manual Override</p>
                       </div>
                       <div className="flex gap-4">
                          <input 
                            ref={manualWeightRef}
                            type="number"
                            placeholder="0.00"
                            value={manualWeight}
                            onChange={(e) => setManualWeight(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && processUsage(selectedItem, parseFloat(manualWeight))}
                            className="flex-1 bg-[#1C232E] border border-[#5C4A2E]/30 px-6 py-4 text-4xl font-mono font-black tracking-tighter text-[#EDE6D6] outline-none focus:bg-[#2A1518] transition-all"
                          />
                          <button 
                            onClick={() => processUsage(selectedItem, parseFloat(manualWeight))}
                            className="px-8 py-4 bg-[#0B6E4F] text-[#C9A227] font-black uppercase tracking-[0.2em] text-xs hover:bg-[#0B6E4F]/80 transition-all border border-[#0B6E4F]/40"
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
              <div className="bg-[#1C232E] border border-[#5C4A2E]/30 shadow-[8px_8px_0px_0px_rgba(92,74,46,0.3)]">
                <div className="flex items-center justify-between p-6 border-b border-[#5C4A2E]/30">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-[#0B6E4F]" />
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-[#EDE6D6]">Resource Ledger</h2>
                  </div>
                  <span className="text-lg font-mono font-black text-[#EDE6D6]">{(todaysUsage || []).length}</span>
                </div>
                <div className="flex flex-col divide-y divide-[#5C4A2E]/30 px-2 max-h-[500px] overflow-y-auto">
                   <AnimatePresence>
                     {(todaysUsage || []).map((log) => (
                      <motion.div key={log.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between py-4 px-4 hover:bg-[#2A1518] transition-colors">
                        <div>
                          <span className="font-black text-[#EDE6D6] text-xs uppercase tracking-tight block truncate max-w-[140px]">{log.inventory?.item_name || 'UNKNOWN'}</span>
                          <span className="text-[9px] font-mono font-black text-[#9C9384] mt-1 block uppercase">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono text-base font-black text-[#EDE6D6]">{Math.abs(log.qty)}</span>
                          <span className="text-[9px] font-black text-[#9C9384] uppercase ml-2">{log.unit}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="p-4 border-t border-[#5C4A2E]/30 bg-[#1C232E]/50 flex justify-center">
                   <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#9C9384]">Ledger End of File</p>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Compact Inventory HUD */}
        <section className="space-y-6 pt-12 border-t-2 border-[#5C4A2E]/30">
          <div className="flex items-center gap-4">
            <Box className="text-[#EDE6D6]" size={20} />
            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#EDE6D6]">Stores Audit HUD</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {(items || []).map((item) => {
              const isLow = item.current_stock < item.min_threshold;
              return (
                <div key={item.id} className={`bg-[#1C232E] p-5 border shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)] transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[6px_6px_0px_0px_rgba(92,74,46,0.3)] ${isLow ? 'border-[#722F37] bg-[#722F37]/10' : 'border-[#5C4A2E]/30'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-8 h-8 border border-[#5C4A2E]/30 flex items-center justify-center ${isLow ? 'bg-[#722F37] text-[#EDE6D6]' : 'bg-[#1C232E] text-[#EDE6D6]'}`}>
                      {isLow ? <AlertTriangle size={14} /> : <Box size={14} />}
                    </div>
                    <span className="text-[9px] font-mono font-black text-[#9C9384] uppercase tracking-widest">{item.use_unit}</span>
                  </div>
                  <h3 className="text-[10px] font-black text-[#EDE6D6] truncate uppercase tracking-tighter mb-1">{item.item_name}</h3>
                  <p className={`font-mono text-2xl font-black tracking-tight ${isLow ? 'text-[#722F37]' : 'text-[#EDE6D6]'}`}>{item.current_stock.toFixed(1)}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
