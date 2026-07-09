'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, Booking } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Globe, Home, Waves } from 'lucide-react';

interface Props {
  isOpen: boolean;
  selectedDate: string;
  onClose: () => void;
  onSuccess: () => void;
  isSystemOnly?: boolean;
}

export function ManagerIncomeForm({ isOpen, selectedDate, onClose, onSuccess, isSystemOnly = false }: Props) {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  
  // Category State
  type MainCategory = 'international' | 'local' | 'pool';
  const [mainCategory, setMainCategory] = useState<MainCategory>('international');
  const [isCamper, setIsCamper] = useState(false);
  const [localType, setLocalType] = useState<'day' | 'night'>('day');

  // Fields
  const [guestName, setGuestName] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [checkIn, setCheckIn] = useState(selectedDate || new Date().toISOString().split('T')[0]);
  const [checkOut, setCheckOut] = useState('');
  const [amountUZS, setAmountUZS] = useState('');

  useEffect(() => {
    if (selectedDate) {
      setCheckIn(selectedDate);
    }
  }, [selectedDate]);

  // Switch-Reset Rule: Reset form when category changes
  const handleCategoryChange = (newCat: MainCategory) => {
    setGuestName('');
    setGuestCount(1);
    setAmountUZS('');
    setCheckOut('');
    setIsCamper(false); // Reset camper toggle
    setMainCategory(newCat);
  };

  // Default checkout for stays
  useEffect(() => {
    const isRoomStay = mainCategory === 'international';
    if ((isRoomStay || (mainCategory === 'local' && localType === 'night')) && checkIn && !checkOut) {
      const d = new Date(checkIn + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      setCheckOut(d.toISOString().split('T')[0]);
    } else if ((mainCategory === 'pool' || (mainCategory === 'local' && localType === 'day')) && checkIn) {
      setCheckOut(checkIn);
    }
  }, [mainCategory, localType, checkIn, checkOut]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) { setMessage('Error: Guest Name is required'); return; }
    setSubmitting(true);
    setMessage('');

    try {
      const isFinancial = mainCategory === 'local' || mainCategory === 'pool';
      const isRoomStay = mainCategory === 'international';
      const isDayVisit = mainCategory === 'pool' || (mainCategory === 'local' && localType === 'day');
      const finalCategory = isRoomStay && isCamper ? 'camper' : mainCategory;
      const price = isFinancial ? parseFloat(amountUZS) || 0 : 0;
      
      let teamId = null;
      if (currentUserId) {
        try {
          const { data: profile } = await supabase.from('profiles').select('team_id').eq('id', currentUserId).single();
          if (profile) teamId = profile.team_id;
        } catch (e) {
          console.error('Could not fetch team_id', e);
        }
      }

      const payload: any = {
        guest_name: guestName.trim(),
        check_in: checkIn,
        check_out: checkOut || checkIn,
        number_of_adults: guestCount,
        status: isFinancial ? 'completed' : 'checked_in', // Local (Day/Night) and Pool are instant-completed
        source: 'manual',
        total_price: price, // Unified Financial Fix
        payment_status: isFinancial ? 'paid' : 'Unpaid',
        currency: 'UZS',
        exchange_rate: 1,
        created_by: currentUserId,
        approved_by_manager: true,
        is_manual_dates: true,
        guest_category: finalCategory,
        local_stay_type: mainCategory === 'local' ? localType : null,
        team_id: teamId,
        meta: {
          is_pool_visitor: mainCategory === 'pool',
          is_room_stay: isRoomStay,
          is_system_only: true
        }
      };

      if (isFinancial) {
        payload.collected_amount = price;
        payload.collected_currency = 'UZS';
      }

      const { data: bookingData, error } = await supabase.from('bookings').insert([payload]).select().single();
      if (error) throw error;

      // If financial, record receipt
      if (isFinancial && bookingData) {
        try {
          await supabase.from('booking_receipts').insert([{
            booking_id: bookingData.id,
            receipt_id: `RCP-${bookingData.id}-${Date.now()}`,
            amount: price,
            currency: 'UZS',
            total_usd: price / 12500, // Safe generic fallback for USD equivalent
            settled_at: checkIn,
            created_by: currentUserId,
            snapshot: { note: mainCategory === 'pool' ? 'Instant Pool Payment' : `Local ${localType} payment` }
          }]);
        } catch (e) {
          console.error('Failed to create booking receipt:', e);
        }
      }

      // Refresh cache
      try { await supabase.rpc('reload_schema'); } catch {}

      setMessage('Success!');
      setTimeout(() => {
        onSuccess();
        onClose();
        resetForm();
      }, 1000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setMainCategory('international');
    setIsCamper(false);
    setGuestName('');
    setGuestCount(1);
    setAmountUZS('');
    setCheckIn(selectedDate || new Date().toISOString().split('T')[0]);
    setCheckOut('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F1419]/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1C232E] rounded-[32px] shadow-2xl border border-[#5C4A2E]/30 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#0B6E4F] px-8 py-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-[#C9A227] uppercase tracking-tight">New Manager Booking</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-[#1C232E]/20 text-[#C9A227] hover:bg-[#1C232E]/30 transition-all">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Main Category Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#1C232E]/50 rounded-[20px] border border-[#5C4A2E]/30">
            {(['international', 'local', 'pool'] as const).map(c => {
              const isActive = mainCategory === c;
              return (
                <button key={c} type="button" onClick={() => handleCategoryChange(c)}
                  className={`py-3 px-2 rounded-[14px] text-[10px] font-black uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1.5 ${
                    isActive 
                      ? 'bg-[#0B6E4F] text-[#C9A227] shadow-md border border-[#5C4A2E]/30' 
                      : 'text-[#9C9384] hover:text-[#EDE6D6]'
                  }`}>
                  {c === 'international' && <Globe size={18} strokeWidth={2} className={isActive ? 'text-[#C9A227]' : 'text-[#9C9384]'} />}
                  {c === 'local' && <Home size={18} strokeWidth={2} className={isActive ? 'text-[#C9A227]' : 'text-[#9C9384]'} />}
                  {c === 'pool' && <Waves size={18} strokeWidth={2} className={isActive ? 'text-[#C9A227]' : 'text-[#9C9384]'} />}
                  <span>{c === 'international' ? 'International' : c === 'local' ? 'Local' : 'Pool'}</span>
                </button>
              );
            })}
          </div>

          {mainCategory === 'international' && (
            <div className={`flex items-center justify-between p-4 rounded-2xl border-2 animate-in slide-in-from-top-2 transition-all ${isCamper ? 'bg-[#B8860B]/20 border-[#B8860B]/40 shadow-sm' : 'bg-[#1C232E] border-[#5C4A2E]/30'}`}>
              <div className="flex flex-col">
                <span className={`text-sm font-bold ${isCamper ? 'text-[#B8860B]' : 'text-[#EDE6D6]'}`}>Guest is a Camper</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isCamper ? 'text-[#B8860B]' : 'text-[#9C9384]'}`}>Registers as 'camper' category</span>
              </div>
              <button type="button" onClick={() => setIsCamper(!isCamper)}
                className={`w-12 h-6 rounded-full transition-all relative ${isCamper ? 'bg-[#B8860B]' : 'bg-[#5C4A2E]/50'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-[#EDE6D6] rounded-full transition-all ${isCamper ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          )}

          {mainCategory === 'local' && (
            <div className="flex gap-2 p-1 bg-[#B8860B]/20 rounded-xl border border-[#B8860B]/40">
              {(['day', 'night'] as const).map(t => (
                <button key={t} type="button" onClick={() => setLocalType(t)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${localType === t ? 'bg-[#1C232E] text-[#B8860B] shadow-sm' : 'text-[#B8860B]'}`}>
                  {t === 'day' ? '☀️ Day Visit' : '🌙 Night Stay'}
                </button>
              ))}
            </div>
          )}

          {/* Core Fields */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest ml-1">Guest Name *</label>
              <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Full Name..."
                className="w-full px-5 py-4 bg-[#1C232E]/50 border-2 border-[#5C4A2E]/30 rounded-[20px] text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest ml-1">Guest Count</label>
                <div className="relative">
                  <input type="number" min="1" value={guestCount} onChange={e => setGuestCount(parseInt(e.target.value) || 1)}
                    className="w-full px-5 py-4 bg-[#1C232E]/50 border-2 border-[#5C4A2E]/30 rounded-[20px] text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
                </div>
              </div>

              {(mainCategory === 'international' || (mainCategory === 'local' && localType === 'night')) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest ml-1">Check-out</label>
                  <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)}
                    className="w-full px-5 py-4 bg-[#1C232E]/50 border-2 border-[#5C4A2E]/30 rounded-[20px] text-sm font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
                </div>
              )}
            </div>

            {(mainCategory === 'local' || mainCategory === 'pool') && (
              <div className="space-y-1.5 animate-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest ml-1">Payment Amount (UZS) *</label>
                <div className="relative">
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[#9C9384] font-black text-xs">SUM</span>
                  <input type="number" value={amountUZS} onChange={e => setAmountUZS(e.target.value)} placeholder="0.00"
                    className="w-full px-5 py-4 bg-[#1C232E]/50 border-2 border-[#5C4A2E]/30 rounded-[20px] text-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
                </div>
              </div>
            )}
          </div>

          {message && (
            <div className={`p-4 rounded-2xl text-xs font-bold text-center ${message.startsWith('Error') ? 'bg-[#722F37]/20 text-[#722F37] border border-[#722F37]/40' : 'bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40'}`}>
              {message}
            </div>
          )}

          {/* Action Button */}
          <button type="submit" disabled={submitting}
            className={`w-full py-5 rounded-[24px] text-sm font-black uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 disabled:opacity-50 ${
              (mainCategory === 'local' || mainCategory === 'pool') 
                ? 'bg-[#0B6E4F] text-[#C9A227] hover:bg-[#0B6E4F]/80 shadow-[#0B6E4F]/20' 
                : 'bg-[#C9A227] text-[#1C232E] hover:bg-[#C9A227]/80 shadow-[#C9A227]/20'
            }`}>
            {submitting ? 'Processing...' : (mainCategory === 'local' || mainCategory === 'pool' ? 'PAY & REGISTER' : 'CREATE BOOKING')}
          </button>
        </form>
      </div>
    </div>
  );
}
