'use client';

import { useState, useEffect } from 'react';
import { supabase, type Booking, type MealRequest } from '@/lib/supabase';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { Utensils, Send, X, Bell, Zap, ChefHat, CheckCircle2 } from 'lucide-react';
import { RecipeDisplay } from '@/components/RecipeDisplay';

interface MealDraft {
  meal_date: string;
  meal_type: 'Lunch' | 'Dinner';
  adult_qty: number;
  child_qty: number;
  dietary_type: 'Normal' | 'Vegetarian';
  sent: boolean;
}

interface ManagerMealRequestsProps {
  booking: Booking | null;
  onClose: () => void;
  onSent: () => void;
}

function normalizeDate(d: string | Date | null) {
  if (!d) return '';
  const s = typeof d === 'string' ? d : d.toISOString ? d.toISOString() : String(d);
  return s.split('T')[0];
}

const fetchMealStats = async (bookingId: number) => {
  const { data } = await supabase
    .from('meal_requests')
    .select('status')
    .eq('booking_id', bookingId);
  
  const stats = { accepted: 0, served: 0 };
  (data || []).forEach(m => {
    if (m.status === 'Accepted') stats.accepted++;
    else if (m.status === 'Served') stats.served++;
  });
  return stats;
};

export function ManagerMealRequests({ booking, onClose, onSent }: ManagerMealRequestsProps) {
  const [mealDrafts, setMealDrafts] = useState<MealDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentVersion, setSentVersion] = useState(0);

  const { data: stats, mutate: mutateStats } = useSWR(
    booking ? `meal-stats-${booking.id}` : null,
    () => fetchMealStats(booking!.id),
    { refreshInterval: 5000 }
  );

  useEffect(() => {
    if (!booking) return;

    const channel = supabase
      .channel(`manager-meals-${booking.id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'meal_requests',
        filter: `booking_id=eq.${booking.id}`
      }, () => {
        mutateStats();
        setSentVersion(v => v + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [booking]);

  useEffect(() => {
    if (!booking) {
      setMealDrafts([]);
      return;
    }

    setMealDrafts([]);
    const b = booking;

    async function generateDrafts() {
      setLoading(true);
      const [ciy, cim, cid] = normalizeDate(b.check_in).split('-').map(Number);
      const [coy, com, cod] = normalizeDate(b.check_out).split('-').map(Number);
      const checkIn = new Date(ciy, cim - 1, cid);
      const checkOut = new Date(coy, com - 1, cod);
      const drafts: MealDraft[] = [];

      const { data: existing } = await supabase
        .from('meal_requests')
        .select('meal_date, meal_type')
        .eq('booking_id', b.id);
      
      const existingKeys = new Set(
        (existing || []).map((e: any) => `${normalizeDate(e.meal_date)}|${e.meal_type}`)
      );

      for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`;
        const lunchKey = `${dateStr}|Lunch`;
        const dinnerKey = `${dateStr}|Dinner`;
        drafts.push({
          meal_date: dateStr,
          meal_type: 'Lunch',
          adult_qty: (b as any).number_of_people || (b as any).number_of_adults || b.guest_count || 1,
          child_qty: 0,
          dietary_type: 'Normal',
          sent: existingKeys.has(lunchKey),
        });
        drafts.push({
          meal_date: dateStr,
          meal_type: 'Dinner',
          adult_qty: (b as any).number_of_people || (b as any).number_of_adults || b.guest_count || 1,
          child_qty: 0,
          dietary_type: 'Normal',
          sent: existingKeys.has(dinnerKey),
        });
      }
      setMealDrafts(drafts);
      setLoading(false);
    }

    generateDrafts();
  }, [booking, sentVersion]);

  const handleSendOne = async (idx: number) => {
    if (!booking) return;
    const draft = mealDrafts[idx];
    if (draft.sent) return;

    const row = {
      booking_id: booking.id,
      meal_date: draft.meal_date,
      meal_type: draft.meal_type,
      adult_qty: draft.adult_qty,
      child_qty: draft.child_qty,
      dietary_type: draft.dietary_type,
      status: 'Pending',
    };

    const { error } = await supabase.from('meal_requests').insert(row);
    if (error) return;

    setMealDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, sent: true } : d)));
    setSentVersion((v) => v + 1);
    onSent();
  };

  const handleSendAll = async () => {
    if (!booking) return;
    const toSend = mealDrafts.filter((d) => !d.sent);
    if (toSend.length === 0) return;

    const rows = toSend.map((d) => ({
      booking_id: booking.id,
      meal_date: d.meal_date,
      meal_type: d.meal_type,
      adult_qty: d.adult_qty,
      child_qty: d.child_qty,
      dietary_type: d.dietary_type,
      status: 'Pending',
    }));

    const { error } = await supabase.from('meal_requests').insert(rows);
    if (error) return;

    setMealDrafts((prev) => prev.map((d) => ({ ...d, sent: true })));
    setSentVersion((v) => v + 1);
    onSent();
  };

  if (!booking) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-8 border-b border-black bg-white">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-4 mb-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fiscal Kitchen Request</p>
                {stats && (
                  <div className="flex items-center gap-1 border border-black bg-white px-2 py-0.5 font-mono text-[9px] font-black">
                    <span className="text-emerald-600">{stats.accepted} ACCEPTED</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-indigo-600">{stats.served} SERVED</span>
                  </div>
                )}
              </div>
              <h2 className="text-3xl font-black text-black uppercase tracking-tighter">
                {booking.guest_name}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 border border-black flex items-center justify-center hover:bg-zinc-50 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="flex justify-between items-center">
             <div className="text-xs font-mono font-black bg-zinc-50 border border-black px-3 py-1.5">
               {booking.check_in} → {booking.check_out}
             </div>
             
             {/* REAL-TIME STATUS COUNTER */}
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Confirmed:</span>
                <div className="bg-black text-white px-4 py-1.5 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex gap-4">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-mono font-black uppercase tracking-widest">
                         {(stats as any)?.lunch || 0} LUNCH
                      </span>
                   </div>
                   <div className="w-px h-3 bg-white/20 self-center" />
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                      <span className="text-[11px] font-mono font-black uppercase tracking-widest">
                         {(stats as any)?.dinner || 0} DINNER
                      </span>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 overflow-y-auto flex-1 bg-zinc-50/20">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-12 h-12 border-2 border-black border-t-zinc-200 rounded-full animate-spin mx-auto mb-6" />
              <p className="font-black text-xs uppercase tracking-widest">Generating Manifest...</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {mealDrafts.map((draft, idx) => (
                <div
                  key={`${booking.id}-${draft.meal_date}-${draft.meal_type}`}
                  className={`bg-white border border-black p-5 flex items-center gap-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                    draft.sent ? 'opacity-40 grayscale' : ''
                  }`}
                >
                  <div className="w-28 border-r border-black/10 pr-6 shrink-0">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">{draft.meal_type}</span>
                    <p className="text-sm font-mono font-black text-black">{draft.meal_date}</p>
                  </div>

                  {draft.sent ? (
                    <div className="flex-1 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="w-5 h-5 bg-black border border-black flex items-center justify-center">
                            <CheckCircle2 size={12} className="text-white" />
                         </div>
                         <span className="text-[10px] font-black text-black uppercase tracking-widest">Manifest Sent</span>
                      </div>
                      <span className="text-[10px] font-mono font-black text-slate-400">
                        {draft.adult_qty}A · {draft.child_qty}K
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-4 flex-1">
                        <div className="flex-1">
                          <input
                            type="number"
                            min={0}
                            value={draft.adult_qty}
                            onChange={(e) => {
                              const next = [...mealDrafts];
                              next[idx].adult_qty = parseInt(e.target.value) || 0;
                              setMealDrafts(next);
                            }}
                            className="w-full px-3 py-2 bg-white border border-black text-xs font-mono font-black text-black outline-none focus:bg-zinc-50"
                            placeholder="A"
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            type="number"
                            min={0}
                            value={draft.child_qty}
                            onChange={(e) => {
                              const next = [...mealDrafts];
                              next[idx].child_qty = parseInt(e.target.value) || 0;
                              setMealDrafts(next);
                            }}
                            className="w-full px-3 py-2 bg-white border border-black text-xs font-mono font-black text-black outline-none focus:bg-zinc-50"
                            placeholder="K"
                          />
                        </div>
                        <div className="flex-1">
                          <select
                            value={draft.dietary_type}
                            onChange={(e) => {
                              const next = [...mealDrafts];
                              next[idx].dietary_type = e.target.value as 'Normal' | 'Vegetarian';
                              setMealDrafts(next);
                            }}
                            className="w-full px-3 py-2 bg-white border border-black text-[10px] font-black text-black outline-none appearance-none"
                          >
                            <option value="Normal">STD</option>
                            <option value="Vegetarian">VEG</option>
                          </select>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSendOne(idx)}
                        className="px-6 py-2 bg-black text-white text-[10px] font-black uppercase tracking-widest border border-black hover:bg-zinc-800 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                      >
                        Transmit
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-black bg-white flex gap-4">
          <button
            onClick={handleSendAll}
            disabled={mealDrafts.every((d) => d.sent)}
            className={`flex-1 py-4 font-black uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-3 border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] ${
              mealDrafts.every((d) => d.sent)
                ? 'bg-zinc-100 text-slate-400 cursor-not-allowed border-zinc-200 shadow-none'
                : 'bg-black text-white hover:bg-zinc-800'
            }`}
          >
            <Send size={16} />
            Batch Transmit
          </button>
          <button
            onClick={onClose}
            className="px-10 py-4 bg-white text-black border border-black font-black uppercase tracking-[0.2em] text-xs hover:bg-zinc-50 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
