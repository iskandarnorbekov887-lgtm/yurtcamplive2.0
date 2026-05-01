'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type TransEntry = { driver: string; time: string; from: string; to: string; arrivalTime: string; price: string; };
type DayEntry = {
  date: string;
  lunch: boolean; lunchCount: number; lunchDietary: string;
  dinner: boolean; dinnerCount: number; dinnerDietary: string;
  guideService: boolean; guideNames: string[];
  transportation: boolean; transEntries: TransEntry[];
  cookingClass: boolean; cookingClassDescription: string;
  specialRequest: string;
};
const makeBlankDay = (date: string): DayEntry => ({
  date,
  lunch: false, lunchCount: 0, lunchDietary: '',
  dinner: false, dinnerCount: 0, dinnerDietary: '',
  guideService: false, guideNames: [''],
  transportation: false, transEntries: [{ driver: '', time: '', from: '', to: '', arrivalTime: '', price: '' }],
  cookingClass: false, cookingClassDescription: '',
  specialRequest: '',
});

interface Props {
  isOpen: boolean;
  selectedDate: string;
  onClose: () => void;
  onSuccess: () => void;
  isSystemOnly?: boolean;
}

export function ReserverIncomeForm({ isOpen, selectedDate, onClose, onSuccess, isSystemOnly = false }: Props) {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<{name: string, date: string} | null>(null);
  const [bypassDuplicateCheck, setBypassDuplicateCheck] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [bookingType, setBookingType] = useState<'international' | 'local' | 'pool'>('international');
  const [localStayType, setLocalStayType] = useState<'day' | 'night'>('day');
  const [accommodationType, setAccommodationType] = useState<'yurt' | 'camping'>('yurt');

  // Helper to determine guest category
  const getGuestCategory = (): 'international' | 'local' | 'camper' | 'pool' => {
    if (bookingType === 'pool') return 'pool';
    if (bookingType === 'local') return 'local';
    if (bookingType === 'international' && accommodationType === 'camping') return 'camper';
    return 'international';
  };
  const [guestNames, setGuestNames] = useState<string[]>(['']);
  const [guestCount, setGuestCount] = useState(1);
  const [childrenUnder12, setChildrenUnder12] = useState(0);
  const [poolEntryCount, setPoolEntryCount] = useState(1);
  const [checkIn, setCheckIn] = useState(selectedDate || '');
  const [checkOut, setCheckOut] = useState('');
  const [calViewYear, setCalViewYear] = useState(() => selectedDate ? new Date(selectedDate + 'T00:00:00').getFullYear() : new Date().getFullYear());
  const [calViewMonth, setCalViewMonth] = useState(() => selectedDate ? new Date(selectedDate + 'T00:00:00').getMonth() : new Date().getMonth());
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [iskyCampRequests, setIskyCampRequests] = useState('');
  const [currency, setCurrency] = useState<'UZS' | 'USD' | 'EUR'>('USD');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState<'in_camp' | 'all_paid' | 'partially_paid'>('in_camp');
  const [amount, setAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [description, setDescription] = useState('');

  const localDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    if (selectedDate) {
      setCheckIn(selectedDate);
      const ci = new Date(selectedDate + 'T00:00:00');
      setCalViewYear(ci.getFullYear());
      setCalViewMonth(ci.getMonth());
    }
  }, [selectedDate]);

  useEffect(() => {
    if (bookingType === 'pool' && checkIn) {
      setCheckOut(checkIn);
    }
  }, [bookingType, checkIn]);

  useEffect(() => {
    if (bookingType === 'local' && checkIn) {
      if (localStayType === 'day') {
        setCheckOut(checkIn);
      } else {
        // night stay = next day
        const nextDay = new Date(checkIn + 'T00:00:00');
        nextDay.setDate(nextDay.getDate() + 1);
        setCheckOut(nextDay.toISOString().split('T')[0]);
      }
    }
  }, [bookingType, localStayType, checkIn]);

  useEffect(() => {
    if (bookingType === 'local' || bookingType === 'pool') {
      setCurrency('UZS');
      setExchangeRate('1');
    } else {
      setCurrency('USD');
      setExchangeRate('1');
    }
  }, [bookingType]);

  useEffect(() => {
    if (!checkIn) return;
    const ci = new Date(checkIn + 'T00:00:00');
    const co = checkOut ? new Date(checkOut + 'T00:00:00') : ci;
    const numNights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
    const dates: string[] = [];
    for (let i = 0; i <= numNights; i++) {
      const d = new Date(ci); d.setDate(d.getDate() + i);
      dates.push(localDateStr(d));
    }
    setDayEntries(prev => dates.map(date => prev.find(d => d.date === date) || makeBlankDay(date)));
  }, [checkIn, checkOut]);

  const addGuestName = () => setGuestNames([...guestNames, '']);
  const removeGuestName = (index: number) => setGuestNames(guestNames.filter((_, i) => i !== index));
  const updateGuestName = (index: number, value: string) => { const u = [...guestNames]; u[index] = value; setGuestNames(u); };

  const updateDay = (index: number, updates: Partial<DayEntry>) =>
    setDayEntries(prev => prev.map((d, i) => i === index ? { ...d, ...updates } : d));

  const updateDayGuideName = (dayIndex: number, nameIndex: number, value: string) =>
    setDayEntries(prev => { const days = [...prev]; const names = [...days[dayIndex].guideNames]; names[nameIndex] = value; days[dayIndex] = { ...days[dayIndex], guideNames: names }; return days; });

  const updateDayTransEntry = (dayIndex: number, ei: number, field: string, value: string) =>
    setDayEntries(prev => { const days = [...prev]; const ents = [...days[dayIndex].transEntries]; ents[ei] = { ...ents[ei], [field]: value }; days[dayIndex] = { ...days[dayIndex], transEntries: ents }; return days; });

  const getTodayRate = async () => {
    try { const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD'); const data = await res.json(); if (data.rates?.UZS) setExchangeRate(data.rates.UZS.toString()); }
    catch { alert('Failed to fetch exchange rate'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setMessage('');
    const validGuestNames = guestNames.filter(n => n.trim());
    if (validGuestNames.length === 0) { setMessage('Error: At least one guest name is required'); setSubmitting(false); return; }
    const checkInDate = selectedDate || new Date().toISOString().split('T')[0];
    if (!bypassDuplicateCheck) {
      const { data: allOnDate } = await supabase.from('bookings')
        .select('id, guest_name, check_in, status')
        .eq('check_in', checkInDate);
      const guestKey = validGuestNames.join(', ');
      const existing = (allOnDate || []).filter((b: any) => b.guest_name === guestKey && b.status !== 'cancelled');
      if (existing.length > 0) {
        setDuplicateWarning({ name: guestKey, date: checkInDate });
        setSubmitting(false);
        return;
      }
    }
    setBypassDuplicateCheck(false);
    try {
      const amountValue = parseFloat(amount || '0');
      const rateValue = parseFloat(exchangeRate || '1');
      const amountUZS = currency === 'UZS' ? amountValue : amountValue * rateValue;
      const total_price = currency === 'USD' ? amountValue : amountUZS / rateValue;

      // Auto-calculate base price for camping (lower than yurt)
      let basePrice = total_price;
      if (bookingType === 'international' && accommodationType === 'camping' && !amount) {
        // Camping is typically 50% of yurt price - this is a placeholder
        // The actual pricing should come from a pricing table or config
        basePrice = 0; // Will be set by pricing system
      }

      const { error, data: bookingData } = await supabase.from('bookings').insert([{
        yurt_id: null, // Reserver bookings don't require specific yurt
        guest_name: validGuestNames.join(', '),
        check_in: checkIn || new Date().toISOString().split('T')[0],
        check_out: bookingType === 'pool' || (bookingType === 'local' && localStayType === 'day') ? checkIn : (checkOut || checkIn || new Date().toISOString().split('T')[0]),
        total_price: total_price || 0,
        number_of_people: guestCount,
        payment_status: (bookingType === 'pool' || bookingType === 'local') ? 'paid' : 'Unpaid',
        source: isSystemOnly ? 'System' : 'Manual',
        status: 'confirmed',
        notes: description || null,
        meal_notes: null,
        transportation: null,
        meal_preference: null,
        guide_required: dayEntries.some(d => d.guideService),
        special_requests: (() => {
          const f = dayEntries.filter(d => d.lunch || d.dinner || d.guideService || d.transportation || d.cookingClass || d.specialRequest.trim());
          const meta: any = f.length > 0 ? { days: f } : {};
          if (isSystemOnly) {
            meta.is_system_only = true;
            meta.is_manual_dates = true;
            meta.guest_category = getGuestCategory();
          }
          if (bookingType === 'pool') {
            meta.is_pool_visitor = true;
            meta.pool_entry_count = poolEntryCount;
          }
          if (bookingType === 'local') {
            meta.is_local_guest = true;
            meta.local_stay_type = localStayType;
          }
          if (bookingType === 'international') {
            meta.accommodation_type = accommodationType;
          }
          return Object.keys(meta).length > 0 ? JSON.stringify(meta) : null;
        })(),
        created_by_role: 'Manager',
        approved_by_manager: true,
        created_by_id: currentUserId || '',
        created_at: new Date().toISOString(),
        last_edited_by_id: currentUserId || '',
        last_edited_at: new Date().toISOString(),
        isky_camp_requests: iskyCampRequests || null,
        google_event_id: null, // System-only bookings don't sync to Google Calendar
        // Service fields
        guest_count: guestCount,
        children_under_12: childrenUnder12,
        nights: (bookingType === 'pool' || (bookingType === 'local' && localStayType === 'day')) ? '0' : (checkOut && checkIn) ? Math.round((new Date(checkOut + 'T00:00:00').getTime() - new Date(checkIn + 'T00:00:00').getTime()) / 86400000).toString() : null,
        guide_service: dayEntries.some(d => d.guideService),
        guide_names: dayEntries.filter(d => d.guideService).flatMap(d => d.guideNames.filter(n => n.trim())).join(', ') || null,
        guide_amount: null,
        has_transportation: dayEntries.some(d => d.transportation),
        transportation_details: (() => { const lines = dayEntries.filter(d => d.transportation).flatMap(d => d.transEntries.map(e => { const dd = new Date(d.date + 'T00:00:00'); const lbl = `${dd.getDate()} ${dd.toLocaleString('en-US', { month: 'long' })}`; const parts: string[] = [lbl]; if (e.driver?.trim()) parts.push(`Driver: ${e.driver}`); if (e.time && !e.time.startsWith(':') && !e.time.endsWith(':')) parts.push(`Pickup: ${e.time}`); if (e.from?.trim()) parts.push(`From: ${e.from}`); if (e.to?.trim()) parts.push(`To: ${e.to}`); if (e.arrivalTime && !e.arrivalTime.startsWith(':') && !e.arrivalTime.endsWith(':')) parts.push(`Arrival: ${e.arrivalTime}`); if (e.price?.trim()) parts.push(`Price: ${e.price} USD`); return parts.join(' · '); })); return lines.length ? lines.join('\n') : null; })(),
        lunch: dayEntries.some(d => d.lunch),
        lunch_count: dayEntries.reduce((s, d) => s + (d.lunch ? (d.lunchCount || 0) : 0), 0),
        lunch_dietary: dayEntries.filter(d => d.lunch && d.lunchDietary).map(d => d.lunchDietary).join('; ') || null,
        dinner: dayEntries.some(d => d.dinner),
        dinner_count: dayEntries.reduce((s, d) => s + (d.dinner ? (d.dinnerCount || 0) : 0), 0),
        dinner_dietary: dayEntries.filter(d => d.dinner && d.dinnerDietary).map(d => d.dinnerDietary).join('; ') || null,
        drinks: false,
        drinks_count: 0,
        laundry: false,
        laundry_price: null,
        laundry_currency: 'UZS',
        payment_method: (bookingType === 'pool' || bookingType === 'local') ? 'paid' : paymentMethod,
        payment_note: paymentNote || null,
        currency: currency,
        exchange_rate: rateValue,
        amount: amountValue,
        description: description,
        cooking_class: dayEntries.some(d => d.cookingClass),
        cooking_class_description: dayEntries.filter(d => d.cookingClass && d.cookingClassDescription).map(d => d.cookingClassDescription).join('; ') || null,
      }]).select();
      if (error) throw error;

      // For pool and local bookings (non-manager), record payment to booking_receipts
      // Manager bookings (isSystemOnly) will have payment set at check-in
      if (!isSystemOnly && (bookingType === 'pool' || bookingType === 'local') && bookingData && bookingData[0]) {
        const bookingId = bookingData[0].id;
        const paymentDate = checkIn || new Date().toISOString().split('T')[0];
        await supabase.from('booking_receipts').insert([{
          booking_id: bookingId,
          amount: amountValue || 0,
          currency: currency,
          settled_at: paymentDate,
          created_at: new Date().toISOString(),
          created_by_id: currentUserId || '',
          note: bookingType === 'pool'
            ? `Pool entry payment for ${poolEntryCount} visitors`
            : `Local guest payment (${localStayType === 'day' ? 'day visit' : 'night stay'})`,
        }]);
      }

      setMessage('Booking saved successfully!'); setTimeout(() => { onSuccess(); resetForm(); setMessage(''); }, 1000);
    } catch (err: any) { setMessage(`Error: ${err.message}`); } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setBookingType('international');
    setLocalStayType('day');
    setAccommodationType('yurt');
    setGuestNames(['']); setGuestCount(1); setChildrenUnder12(0); setPoolEntryCount(1);
    setCheckIn(selectedDate || ''); setCheckOut('');
    setDayEntries(selectedDate ? [makeBlankDay(selectedDate)] : []); setIskyCampRequests('');
    setCurrency('USD'); setExchangeRate('1'); setPaymentMethod('in_camp'); setAmount(''); setPaymentNote(''); setDescription('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-slate-800">New Booking</h2>
            <button type="button" onClick={resetForm} className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all">Clear</button>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        {message && <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{message}</div>}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Booking Type Toggle */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
            {(['international', 'local', 'pool'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setBookingType(type)}
                className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold capitalize transition-all ${
                  bookingType === type 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {type === 'pool' ? '🏊 Pool Only' : type}
              </button>
            ))}
          </div>

          {/* Accommodation Type Toggle for International */}
          {bookingType === 'international' && (
            <div className="flex gap-2 p-1 bg-indigo-50 rounded-xl border border-indigo-200">
              {(['yurt', 'camping'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAccommodationType(type)}
                  className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold capitalize transition-all ${
                    accommodationType === type 
                      ? 'bg-white text-indigo-900 shadow-sm' 
                      : 'text-indigo-600 hover:text-indigo-800'
                  }`}
                >
                  {type === 'yurt' ? '🏕️ Standard Yurt' : '⛺ Camping Spot'}
                </button>
              ))}
            </div>
          )}

          {/* Local Stay Type Toggle */}
          {bookingType === 'local' && (
            <div className="flex gap-2 p-1 bg-amber-50 rounded-xl border border-amber-200">
              {(['day', 'night'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setLocalStayType(type)}
                  className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold capitalize transition-all ${
                    localStayType === type 
                      ? 'bg-white text-amber-900 shadow-sm' 
                      : 'text-amber-600 hover:text-amber-800'
                  }`}
                >
                  {type === 'day' ? '☀️ Day Visit' : '🌙 Night Stay'}
                </button>
              ))}
            </div>
          )}

          {/* Guest Names */}
          <div>
            <label className="block text-sm font-black text-slate-900 mb-2">Guest Names *</label>
            {guestNames.map((name, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input type="text" value={name} onChange={(e) => updateGuestName(index, e.target.value)} placeholder={`Guest ${index + 1} name`}
                  className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" />
                {guestNames.length > 1 && <button type="button" onClick={() => removeGuestName(index)} className="px-3 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-bold text-xs">✕</button>}
              </div>
            ))}
            <button type="button" onClick={addGuestName} className="mt-1 flex items-center gap-1 text-sm text-emerald-600 font-bold"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Guest</button>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-black text-slate-900 mb-2">Total Guests</label>
              <input type="number" min="1" value={guestCount} onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
            {bookingType === 'pool' ? (
              <div><label className="block text-sm font-black text-slate-900 mb-2">Pool Entry Count</label>
                <input type="number" min="1" value={poolEntryCount} onChange={(e) => setPoolEntryCount(parseInt(e.target.value) || 1)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
            ) : (
              <div><label className="block text-sm font-black text-slate-900 mb-2">Children Under 12</label>
                <input type="number" min="0" value={childrenUnder12} onChange={(e) => setChildrenUnder12(parseInt(e.target.value) || 0)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" /></div>
            )}
          </div>

          {/* Mini Check-out Calendar - hide for pool and local types */}
          {bookingType !== 'pool' && bookingType !== 'local' && (() => {
            const pad2 = (n: number) => String(n).padStart(2, '0');
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
            const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
            const nights = (checkOut && checkIn)
              ? Math.round((new Date(checkOut + 'T00:00:00').getTime() - new Date(checkIn + 'T00:00:00').getTime()) / 86400000)
              : 0;
            const prevMonth = () => { if (calViewMonth === 0) { setCalViewMonth(11); setCalViewYear(y => y - 1); } else setCalViewMonth(m => m - 1); };
            const nextMonth = () => { if (calViewMonth === 11) { setCalViewMonth(0); setCalViewYear(y => y + 1); } else setCalViewMonth(m => m + 1); };
            return (
              <div className="flex items-start gap-4">
                <div className="w-56 flex-shrink-0">
                  <label className="block text-xs font-black text-slate-900 mb-1">
                    {selectedDate ? 'Check-out Date' : 'Check-in & Check-out'}
                    {nights > 0 && <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">{nights}n</span>}
                    {!checkIn && !selectedDate && <span className="ml-1.5 text-slate-400 font-normal text-[10px]">tap a date to start</span>}
                  </label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden select-none text-[11px]">
                    <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border-b border-slate-200">
                      <button type="button" onClick={prevMonth} className="text-slate-400 hover:text-slate-800 font-black leading-none w-5 h-5 flex items-center justify-center">‹</button>
                      <span className="font-black text-slate-800 text-[11px]">{monthNames[calViewMonth].slice(0,3)} {calViewYear}</span>
                      <button type="button" onClick={nextMonth} className="text-slate-400 hover:text-slate-800 font-black leading-none w-5 h-5 flex items-center justify-center">›</button>
                    </div>
                    <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
                      {['S','M','T','W','T','F','S'].map((d, i) => (
                        <div key={i} className="text-center text-[9px] font-black text-slate-400 py-0.5">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 p-1 gap-px">
                      {Array.from({ length: firstDay }).map((_, i) => <div key={`b${i}`} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const ds = `${calViewYear}-${pad2(calViewMonth + 1)}-${pad2(day)}`;
                        const isCI = ds === checkIn;
                        const isCO = ds === checkOut;
                        const inRange = !!(checkIn && checkOut && ds > checkIn && ds < checkOut);
                        const before = !!(selectedDate && ds < selectedDate);
                        const frozenCI = isCI && !!selectedDate;
                        const handleClick = () => {
                          if (before) return;
                          if (!checkIn || (!selectedDate && ds <= checkIn)) {
                            setCheckIn(ds); setCheckOut('');
                          } else {
                            setCheckOut(ds);
                          }
                        };
                        return (
                          <button
                            key={day} type="button" disabled={before || frozenCI}
                            onClick={handleClick}
                            onDoubleClick={() => {
                              if (isCI || isCO) {
                                if (!selectedDate) { setCheckIn(''); setCheckOut(''); }
                                else setCheckOut('');
                              }
                            }}
                            className={[
                              'w-full aspect-square text-[10px] font-bold rounded flex items-center justify-center transition-all',
                              frozenCI ? 'bg-emerald-500 text-white cursor-default' : '',
                              isCI && !frozenCI ? 'bg-emerald-500 text-white' : '',
                              isCO ? 'bg-emerald-600 text-white' : '',
                              inRange ? 'bg-emerald-100 text-emerald-700' : '',
                              before ? 'text-slate-200 cursor-not-allowed' : '',
                              !isCI && !isCO && !inRange && !before ? 'hover:bg-slate-100 text-slate-700 cursor-pointer' : '',
                            ].join(' ')}
                          >{day}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          <div>
            <label className="block text-sm font-black text-slate-900 mb-2">Isky Camp Request</label>
            <input type="text" value={iskyCampRequests} onChange={e => setIskyCampRequests(e.target.value)} placeholder="e.g. 2 camps, separate beds (optional)" className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-semibold text-sm" />
          </div>

          {/* Day-by-Day Services - hidden for manager bookings */}
          {isSystemOnly ? (
            <p className="text-xs text-slate-400 text-center border-2 border-dashed border-slate-200 rounded-xl py-3">Services can be added after check-in through the calendar</p>
          ) : bookingType === 'pool' ? (
            <p className="text-xs text-slate-400 text-center border-2 border-dashed border-slate-200 rounded-xl py-3">Pool visitors do not require meal or transport services</p>
          ) : !checkOut && dayEntries.length <= 1 ? (
            <p className="text-xs text-slate-400 text-center border-2 border-dashed border-slate-200 rounded-xl py-3">Pick a check-out date above to expand services per day</p>
          ) : dayEntries.map((day, dayIndex) => {
            const d = new Date(day.date + 'T00:00:00');
            const dateLabel = `${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' })}`;
            const isFirst = dayIndex === 0;
            const isLast = dayIndex === dayEntries.length - 1 && dayEntries.length > 1;
            return (
              <div key={day.date} className="border-2 border-slate-200 rounded-xl overflow-hidden">
                <div className={`px-4 py-3 flex items-center gap-3 border-b-2 ${isFirst ? 'bg-emerald-50 border-emerald-200' : isLast ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`font-black text-base ${isFirst ? 'text-emerald-700' : isLast ? 'text-amber-700' : 'text-slate-800'}`}>{dateLabel}</span>
                  {isFirst && <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Arrival</span>}
                  {isLast && <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Departure</span>}
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-4 items-center">
                    {bookingType === 'international' && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={day.lunch} onChange={e => updateDay(dayIndex, { lunch: e.target.checked })} className="w-5 h-5 border-2 border-slate-300 text-emerald-600 rounded" />
                          <span className="text-sm font-semibold text-slate-900">Lunch</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={day.dinner} onChange={e => updateDay(dayIndex, { dinner: e.target.checked })} className="w-5 h-5 border-2 border-slate-300 text-emerald-600 rounded" />
                          <span className="text-sm font-semibold text-slate-900">Dinner</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={day.cookingClass} onChange={e => updateDay(dayIndex, { cookingClass: e.target.checked })} className="w-5 h-5 border-2 border-slate-300 text-emerald-600 rounded" />
                          <span className="text-sm font-semibold text-slate-900">Cooking Class</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={day.guideService} onChange={e => updateDay(dayIndex, { guideService: e.target.checked })} className="w-5 h-5 border-2 border-slate-300 text-emerald-600 rounded" />
                          <span className="text-sm font-semibold text-slate-900">Guide</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={day.transportation} onChange={e => updateDay(dayIndex, { transportation: e.target.checked })} className="w-5 h-5 border-2 border-slate-300 text-emerald-600 rounded" />
                          <span className="text-sm font-semibold text-slate-900">Transport</span>
                        </label>
                      </>
                    )}
                    {bookingType === 'local' && (
                      <>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={day.lunch} onChange={e => updateDay(dayIndex, { lunch: e.target.checked })} className="w-5 h-5 border-2 border-slate-300 text-emerald-600 rounded" />
                          <span className="text-sm font-semibold text-slate-900">Lunch</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={day.dinner} onChange={e => updateDay(dayIndex, { dinner: e.target.checked })} className="w-5 h-5 border-2 border-slate-300 text-emerald-600 rounded" />
                          <span className="text-sm font-semibold text-slate-900">Dinner</span>
                        </label>
                      </>
                    )}
                  </div>
                  {(day.lunch || day.dinner) && (
                    <input type="text" value={day.lunchDietary}
                      onChange={e => updateDay(dayIndex, { lunchDietary: e.target.value, dinnerDietary: e.target.value })}
                      placeholder={`Food request${day.lunch && day.dinner ? ' (lunch & dinner)' : day.lunch ? ' (lunch)' : ' (dinner)'} e.g. vegetarian`}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                  )}
                  {day.cookingClass && (
                    <textarea value={day.cookingClassDescription} onChange={e => updateDay(dayIndex, { cookingClassDescription: e.target.value })}
                      placeholder="Cooking class details (optional)" rows={2}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                  )}
                  {day.guideService && (
                    <div className="space-y-2">
                      {day.guideNames.map((name, ni) => (
                        <div key={ni} className="flex gap-2">
                          <input type="text" value={name} onChange={e => updateDayGuideName(dayIndex, ni, e.target.value)}
                            placeholder={`Guide ${ni + 1} name`} className="flex-1 px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                          {day.guideNames.length > 1 && <button type="button" onClick={() => updateDay(dayIndex, { guideNames: day.guideNames.filter((_, i) => i !== ni) })} className="px-2 py-1 bg-rose-600 text-white rounded-lg font-bold text-xs">✕</button>}
                        </div>
                      ))}
                      <button type="button" onClick={() => updateDay(dayIndex, { guideNames: [...day.guideNames, ''] })} className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Guide
                      </button>
                    </div>
                  )}
                  {day.transportation && (
                    <div className="space-y-2">
                      {day.transEntries.map((entry, ei) => (
                        <div key={ei} className="p-3 border-2 border-slate-200 rounded-xl space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-600">Trip {ei + 1}</span>
                            {day.transEntries.length > 1 && <button type="button" onClick={() => updateDay(dayIndex, { transEntries: day.transEntries.filter((_, i) => i !== ei) })} className="px-2 py-0.5 bg-rose-600 text-white rounded font-bold text-xs">✕</button>}
                          </div>
                          <input type="text" value={entry.driver} onChange={e => updateDayTransEntry(dayIndex, ei, 'driver', e.target.value)} placeholder="Driver name" className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-bold text-slate-600 block mb-1">Pickup</label>
                              <div className="flex gap-1">
                                <select value={entry.time.split(':')[0] || ''} onChange={e => updateDayTransEntry(dayIndex, ei, 'time', `${e.target.value}:${entry.time.split(':')[1] || '00'}`)} className="flex-1 px-1 py-1 border-2 border-slate-300 rounded-lg text-xs font-bold text-black">
                                  <option value="">Hr</option>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                                </select>
                                <select value={entry.time.split(':')[1] || ''} onChange={e => updateDayTransEntry(dayIndex, ei, 'time', `${entry.time.split(':')[0] || '00'}:${e.target.value}`)} className="flex-1 px-1 py-1 border-2 border-slate-300 rounded-lg text-xs font-bold text-black">
                                  <option value="">Min</option>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-600 block mb-1">Arrival</label>
                              <div className="flex gap-1">
                                <select value={entry.arrivalTime.split(':')[0] || ''} onChange={e => updateDayTransEntry(dayIndex, ei, 'arrivalTime', `${e.target.value}:${entry.arrivalTime.split(':')[1] || '00'}`)} className="flex-1 px-1 py-1 border-2 border-slate-300 rounded-lg text-xs font-bold text-black">
                                  <option value="">Hr</option>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                                </select>
                                <select value={entry.arrivalTime.split(':')[1] || ''} onChange={e => updateDayTransEntry(dayIndex, ei, 'arrivalTime', `${entry.arrivalTime.split(':')[0] || '00'}:${e.target.value}`)} className="flex-1 px-1 py-1 border-2 border-slate-300 rounded-lg text-xs font-bold text-black">
                                  <option value="">Min</option>{Array.from({ length: 60 }, (_, i) => <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={entry.from} onChange={e => updateDayTransEntry(dayIndex, ei, 'from', e.target.value)} placeholder="From" className="px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                            <input type="text" value={entry.to} onChange={e => updateDayTransEntry(dayIndex, ei, 'to', e.target.value)} placeholder="To" className="px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                          </div>
                          <div className="flex gap-2 items-center">
                            <input type="number" min="0" step="0.01" value={entry.price} onChange={e => updateDayTransEntry(dayIndex, ei, 'price', e.target.value)} placeholder="Price" className="flex-1 px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black" />
                            <span className="text-sm font-bold text-slate-600">USD</span>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => updateDay(dayIndex, { transEntries: [...day.transEntries, { driver: '', time: '', from: '', to: '', arrivalTime: '', price: '' }] })} className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add Trip
                      </button>
                    </div>
                  )}
                  <input type="text" value={day.specialRequest} onChange={e => updateDay(dayIndex, { specialRequest: e.target.value })}
                    placeholder="Special request for this day (optional)"
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-bold text-black" />
                </div>
              </div>
            );
          })}

          {/* Payment Section - hidden for manager bookings, set at check-in */}
          {isSystemOnly ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50">
              <label className="block text-sm font-black text-slate-900">Pricing</label>
              <p className="text-xs text-slate-500 text-center">Price will be set during check-in through the Settlement Tab</p>
            </div>
          ) : bookingType === 'pool' || bookingType === 'local' ? (
            <div className={`border-2 rounded-xl p-4 space-y-4 ${bookingType === 'pool' ? 'bg-cyan-50 border-cyan-200' : 'bg-amber-50 border-amber-200'}`}>
              <label className={`block text-sm font-black ${bookingType === 'pool' ? 'text-cyan-900' : 'text-amber-900'}`}>
                {bookingType === 'pool' ? 'Pool Entry Payment *' : 'Local Guest Payment *'}
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className={`block text-xs font-bold ${bookingType === 'pool' ? 'text-cyan-700' : 'text-amber-700'} mb-1`}>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    className={`w-full px-3 py-2 border-2 rounded-lg text-sm font-bold text-black focus:border-500 ${bookingType === 'pool' ? 'border-cyan-300 focus:border-cyan-500' : 'border-amber-300 focus:border-amber-500'}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold ${bookingType === 'pool' ? 'text-cyan-700' : 'text-amber-700'} mb-1`}>Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => { setCurrency(e.target.value as 'UZS' | 'USD' | 'EUR'); setExchangeRate(e.target.value === 'UZS' ? '1' : exchangeRate); }}
                    className={`px-3 py-2 border-2 rounded-lg text-sm font-bold text-black focus:border-500 ${bookingType === 'pool' ? 'border-cyan-300 focus:border-cyan-500' : 'border-amber-300 focus:border-amber-500'}`}
                  >
                    <option value="UZS">UZS (SUM)</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div className={`text-xs font-semibold ${bookingType === 'pool' ? 'text-cyan-600' : 'text-amber-600'}`}>
                {bookingType === 'pool'
                  ? `Payment will be recorded for ${checkIn} and shown on all calendars`
                  : `Payment will be recorded for ${localStayType === 'day' ? checkIn : `${checkIn} - ${checkOut}`} and shown on all calendars`
                }
              </div>
            </div>
          ) : (
            <div className="border-2 border-slate-200 rounded-xl p-4 space-y-4">
              <label className="block text-sm font-black text-slate-900">Payment Method *</label>
              <div className="space-y-3">

                {/* Option 1: To be paid in the camp */}
                <div className={`rounded-xl border-2 p-3 transition-all ${paymentMethod === 'in_camp' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="paymentMethod" checked={paymentMethod === 'in_camp'} onChange={() => setPaymentMethod('in_camp')} className="w-5 h-5 border-2 border-slate-300 text-emerald-600" />
                    <span className="text-slate-900 font-bold">To be paid in the camp</span>
                  </label>
                  {paymentMethod === 'in_camp' && (
                    <div className="mt-3 space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-600 mb-1">Amount</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="Enter amount (optional)"
                            className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1">Currency *</label>
                          <select
                            value={currency}
                            onChange={(e) => { setCurrency(e.target.value as 'UZS' | 'USD' | 'EUR'); setExchangeRate(e.target.value === 'UZS' ? '1' : exchangeRate); }}
                            className="px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-emerald-500"
                          >
                            <option value="USD">USD</option>
                            <option value="UZS">UZS</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Option 2: All paid */}
                <div className={`rounded-xl border-2 p-3 transition-all ${paymentMethod === 'all_paid' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="paymentMethod" checked={paymentMethod === 'all_paid'} onChange={() => setPaymentMethod('all_paid')} className="w-5 h-5 border-2 border-slate-300 text-blue-600" />
                    <span className="text-slate-900 font-bold">All paid</span>
                  </label>
                  {paymentMethod === 'all_paid' && (
                    <div className="mt-3">
                      <label className="block text-xs font-bold text-slate-600 mb-1">Message (optional)</label>
                      <textarea
                        value={paymentNote}
                        onChange={(e) => setPaymentNote(e.target.value)}
                        placeholder="Optional note..."
                        rows={2}
                        className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Option 3: Partially paid */}
                <div className={`rounded-xl border-2 p-3 transition-all ${paymentMethod === 'partially_paid' ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="paymentMethod" checked={paymentMethod === 'partially_paid'} onChange={() => setPaymentMethod('partially_paid')} className="w-5 h-5 border-2 border-slate-300 text-amber-600" />
                    <span className="text-slate-900 font-bold">Partially paid</span>
                  </label>
                  {paymentMethod === 'partially_paid' && (
                    <div className="mt-3">
                      <label className="block text-xs font-bold text-slate-600 mb-1">Message <span className="text-red-500">*</span></label>
                      <textarea
                        value={paymentNote}
                        onChange={(e) => setPaymentNote(e.target.value)}
                        placeholder="Describe what has been paid and what is remaining..."
                        rows={2}
                        className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black focus:border-amber-500"
                        required
                      />
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-black text-slate-900 mb-2">Additional Notes (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Additional notes..." rows={3} className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 text-slate-900 font-bold text-black" />
          </div>

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                <div>
                  <p className="font-black text-amber-800 text-sm">Duplicate Booking Detected</p>
                  <p className="text-amber-700 text-xs mt-1 font-bold">A booking for <span className="font-black">{duplicateWarning.name}</span> already exists on <span className="font-black">{(() => { const d = new Date(duplicateWarning.date + 'T00:00:00'); return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' })}`; })()}</span>. Do you want to book anyway?</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setDuplicateWarning(null)} className="flex-1 px-4 py-2 bg-white border-2 border-amber-300 text-amber-700 rounded-lg font-bold text-sm hover:bg-amber-50 transition-all">Go Back</button>
                <button type="button" onClick={() => { setDuplicateWarning(null); setBypassDuplicateCheck(true); setTimeout(() => formRef.current?.requestSubmit(), 50); }} className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition-all">Book Anyway</button>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all">Cancel</button>
            <button type="submit" disabled={submitting} className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
              {submitting ? 'Processing...' : (bookingType === 'international' ? 'Create Booking' : 'Pay')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
