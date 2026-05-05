'use client';

import { useState, useEffect } from 'react';
import { supabase, type Booking } from '@/lib/supabase';

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

export function ManagerMealRequests({ booking, onClose, onSent }: ManagerMealRequestsProps) {
  const [mealDrafts, setMealDrafts] = useState<MealDraft[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!booking) {
      setMealDrafts([]);
      return;
    }

    const b = booking; // capture for TypeScript narrowing

    async function generateDrafts() {
      setLoading(true);
      // Parse dates as local YYYY-MM-DD to avoid UTC drift
      const [ciy, cim, cid] = normalizeDate(b.check_in).split('-').map(Number);
      const [coy, com, cod] = normalizeDate(b.check_out).split('-').map(Number);
      const checkIn = new Date(ciy, cim - 1, cid);
      const checkOut = new Date(coy, com - 1, cod);
      const drafts: MealDraft[] = [];

      // Fetch existing meal requests for this booking to prevent double-ordering
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
          adult_qty: b.guest_count || b.number_of_people || 1,
          child_qty: b.children_under_12 || 0,
          dietary_type: 'Normal',
          sent: existingKeys.has(lunchKey),
        });
        drafts.push({
          meal_date: dateStr,
          meal_type: 'Dinner',
          adult_qty: b.guest_count || b.number_of_people || 1,
          child_qty: b.children_under_12 || 0,
          dietary_type: 'Normal',
          sent: existingKeys.has(dinnerKey),
        });
      }
      setMealDrafts(drafts);
      setLoading(false);
    }

    generateDrafts();
  }, [booking]);

  const handleSend = async () => {
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
    if (error) {
      console.error('Failed to send meal requests:', error);
      alert('Failed to send meal requests: ' + error.message);
      return;
    }

    setMealDrafts((prev) => prev.map((d) => ({ ...d, sent: true })));
    onSent();
  };

  if (!booking) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-slate-900">
              🍽️ Request Food — {booking.guest_name}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {booking.check_in} → {booking.check_out}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="font-bold">Loading meal dates...</p>
            </div>
          ) : mealDrafts.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No meal dates generated for this stay.</p>
          ) : (
            <>
              <div className="space-y-2">
                {mealDrafts.map((draft, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl p-3 border-2 flex items-center gap-3 transition-all ${
                      draft.sent ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="w-20 text-center">
                      <span className="text-xs font-bold text-slate-400 uppercase">{draft.meal_type}</span>
                      <p className="text-sm font-bold text-slate-700">{draft.meal_date}</p>
                    </div>

                    {draft.sent ? (
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Request Sent
                        </span>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-1">
                        <div className="flex-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Adults</label>
                          <input
                            type="number"
                            min={0}
                            value={draft.adult_qty}
                            onChange={(e) => {
                              const next = [...mealDrafts];
                              next[idx].adult_qty = parseInt(e.target.value) || 0;
                              setMealDrafts(next);
                            }}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:border-orange-500 outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Kids</label>
                          <input
                            type="number"
                            min={0}
                            value={draft.child_qty}
                            onChange={(e) => {
                              const next = [...mealDrafts];
                              next[idx].child_qty = parseInt(e.target.value) || 0;
                              setMealDrafts(next);
                            }}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:border-orange-500 outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Diet</label>
                          <select
                            value={draft.dietary_type}
                            onChange={(e) => {
                              const next = [...mealDrafts];
                              next[idx].dietary_type = e.target.value as 'Normal' | 'Vegetarian';
                              setMealDrafts(next);
                            }}
                            className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:border-orange-500 outline-none"
                          >
                            <option value="Normal">🍖 Normal</option>
                            <option value="Vegetarian">🥗 Vegetarian</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSend}
                  disabled={mealDrafts.every((d) => d.sent)}
                  className={`flex-1 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                    mealDrafts.every((d) => d.sent)
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-100'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send Meal Requests
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
