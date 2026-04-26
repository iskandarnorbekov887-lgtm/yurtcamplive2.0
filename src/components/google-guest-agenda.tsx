'use client';

import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { supabase, type Booking, type Yurt, type UserRole, type Drink } from '@/lib/supabase';
import { PrivateCalendarView } from '@/components/private-calendar-view';

interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description?: string | null;
  location?: string | null;
  colorId?: string | null;
  status?: string | null;
}

interface DayEntry {
  date: string;
  lunch: boolean; lunchCount: number; lunchDietary: string;
  dinner: boolean; dinnerCount: number; dinnerDietary: string;
  guideService: boolean; guideNames: string[];
  transportation: boolean; transEntries: TransEntry[];
  cookingClass: boolean; cookingClassDescription: string;
  specialRequest: string;
}

interface TransEntry {
  driver: string;
  time: string;
  from: string;
  to: string;
  arrivalTime: string;
  price: string;
}

interface ListItem {
  key: string;
  name: string;
  start: string;
  end: string;
  source: 'both' | 'calendar' | 'db';
  booking: Booking | null;
  event: CalEvent | null;
}

interface Props {
  bookings: Booking[];
  yurts: Yurt[];
  userRole?: UserRole;
  currentUserId?: string;
  onCheckIn?: (id: number) => Promise<void> | void;
  onCheckOut?: (id: number) => Promise<void> | void;
  onUpdateBooking?: (id: number, updates: Partial<Booking>) => Promise<void> | void;
  onCancelBooking?: (id: number) => Promise<void> | void;
  onAddNewBooking?: (date: string) => void;
  onRefresh?: () => void;
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function GoogleGuestAgenda({
  bookings, yurts, userRole, currentUserId, onCheckIn, onCheckOut, onUpdateBooking, onCancelBooking, onAddNewBooking, onRefresh,
}: Props) {
  const [gcEvents, setGcEvents] = useState<CalEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);

  const [loadingAction, setLoadingAction] = useState('');
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<Record<number, number>>({});
  const [showDrinks, setShowDrinks] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState('');
  const [collectedCurrency, setCollectedCurrency] = useState<'UZS' | 'USD' | 'EUR'>('USD');
  const [extraServices, setExtraServices] = useState<Array<{ name: string; price: string; currency: string }>>([]);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraPrice, setNewExtraPrice] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [svcPayList, setSvcPayList] = useState<Array<{ 
    amount: string; 
    currency: 'USD' | 'UZS' | 'EUR'; 
    method: 'Cash' | 'Card/Online';
    rate?: number;
    id?: number; 
  }>>([{ amount: '', currency: 'USD', method: 'Cash' }]);
  const [fetchingRate, setFetchingRate] = useState<string | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<Record<number, 'deleted' | 'dates_changed'>>({});
  const [payModified, setPayModified] = useState(false); // Track if user manually changed payment amount
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(localDateStr(new Date()));
  const [editingDates, setEditingDates] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [showServices, setShowServices] = useState(false);
  
  // Global service states for simplified Manager view
  const [svcLunch, setSvcLunch] = useState(false);
  const [svcLunchCount, setSvcLunchCount] = useState(0);
  const [svcDinner, setSvcDinner] = useState(false);
  const [svcDinnerCount, setSvcDinnerCount] = useState(0);
  const [svcGuide, setSvcGuide] = useState(false);
  const [svcGuideNames, setSvcGuideNames] = useState<string[]>(['']);
  const [svcGuidePrice, setSvcGuidePrice] = useState(0);
  const [svcTransport, setSvcTransport] = useState(false);
  const [svcTransList, setSvcTransList] = useState<Array<{ name: string; details: string; price: number }>>([{ name: '', details: '', price: 0 }]);
  const [svcCooking, setSvcCooking] = useState(false);
  const [svcCookingPrice, setSvcCookingPrice] = useState(0);
  const [svcLaundry, setSvcLaundry] = useState(false);
  const [svcLaundryPrice, setSvcLaundryPrice] = useState(0);
  const [svcAdults, setSvcAdults] = useState(1);
  const [svcChildren, setSvcChildren] = useState(0);
  const [svcAmount, setSvcAmount] = useState(0);
  const [showFinalReceipt, setShowFinalReceipt] = useState(false);
  
  const [pricing, setPricing] = useState<{ usd_to_uzs?: number; usd_to_eur?: number; guide_price?: number; lunch_price?: number; dinner_price?: number } | null>(null);

  // Calculate totals at top level for scope availability
  const sTotal_calc = (
    (svcLunch ? svcLunchCount * (pricing?.lunch_price || 0) : 0) +
    (svcDinner ? svcDinnerCount * (pricing?.dinner_price || 0) : 0) +
    (svcGuide ? svcGuidePrice : 0) +
    (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
    (svcLaundry ? svcLaundryPrice : 0) +
    (svcCooking ? svcCookingPrice : 0)
  );
  const dTotal_calc = Object.entries(selectedDrinks).reduce((sum, [id, qty]) => {
    const drink = drinks.find(d => d.id === parseInt(id));
    return sum + (qty * (drink?.sold_price || 0));
  }, 0);
  const eTotal_calc = extraServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
  const gTotal = svcAmount + sTotal_calc + dTotal_calc + eTotal_calc;
  
  const tPaidUsd = svcPayList.reduce((sum, p) => {
    const amt = parseFloat(p.amount) || 0;
    if (p.currency === 'USD') return sum + amt;
    const rate = p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92);
    return sum + (amt / rate);
  }, 0);
  
  const balance = gTotal - tPaidUsd;

  const today = localDateStr(new Date());

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const { data } = await supabase.from('service_pricing').select('*').eq('id', 1);
      if (data && data.length > 0) setPricing(data[0]);
    } catch (err) {
      console.error('Error fetching pricing:', err);
    }
  };

  useEffect(() => {
    fetch('/api/calendar/events')
      .then(r => r.json())
      .then((data: CalEvent[] | { error: string }) => {
        if ('error' in data) { setEventsError(data.error); setGcEvents([]); }
        else {
          const events = data as CalEvent[];
          setGcEvents(events);
          const cutoff = localDateStr(new Date(Date.now() - 7 * 86400000));
          const warnings: Record<number, 'deleted' | 'dates_changed'> = {};
          const toSilentlyDelete: number[] = [];
          bookings.filter(b => b.google_event_id && b.check_in >= cutoff).forEach(b => {
            const ev = events.find(e => e.id === b.google_event_id);
            if (!ev) {
              // GC event deleted: if booking never reached check-in, drop it silently
              if (b.status === 'confirmed') toSilentlyDelete.push(b.id);
              else warnings[b.id] = 'deleted';
            } else if (ev.start !== b.check_in || ev.end !== b.check_out) {
              warnings[b.id] = 'dates_changed';
            }
          });
          setSyncWarnings(warnings);
          if (toSilentlyDelete.length > 0) {
            (async () => {
              for (const id of toSilentlyDelete) {
                try { await supabase.from('bookings').delete().eq('id', id); }
                catch (err) { console.error('Silent delete failed for booking', id, err); }
              }
              onRefresh?.();
            })();
          }
        }
      })
      .catch(e => setEventsError(String(e)))
      .finally(() => setLoadingEvents(false));

    supabase.from('drinks').select('*').eq('available', true)
      .then(({ data }: { data: Drink[] | null }) => setDrinks(data || []));
  }, []);

  // Auto-sync notes: when a linked Google Calendar event's description changes,
  // update the booking's notes field to match.
  const [didSyncNotes, setDidSyncNotes] = useState(false);
  useEffect(() => {
    if (didSyncNotes || gcEvents.length === 0 || bookings.length === 0) return;
    const cleanDesc = (d: string | null | undefined) =>
      d && !d.includes('tasks.google.com') ? d.trim() : null;
    const toSync = bookings.filter(b => {
      if (!b.google_event_id) return false;
      const ev = gcEvents.find(e => e.id === b.google_event_id);
      if (!ev) return false;
      const live = cleanDesc(ev.description);
      const saved = (b.notes || '').trim() || null;
      return live !== saved;
    });
    if (toSync.length === 0) { setDidSyncNotes(true); return; }
    (async () => {
      for (const b of toSync) {
        const ev = gcEvents.find(e => e.id === b.google_event_id)!;
        const live = cleanDesc(ev.description);
        try { await supabase.from('bookings').update({ notes: live }).eq('id', b.id); }
        catch (err) { console.error('Notes sync failed for booking', b.id, err); }
      }
      setDidSyncNotes(true);
      onRefresh?.();
    })();
  }, [gcEvents, bookings, didSyncNotes, onRefresh]);

  useEffect(() => {
    if (selectedItem?.booking) {
      const updated = bookings.find(b => b.id === selectedItem.booking!.id);
      if (updated) setSelectedItem(prev => prev ? { ...prev, booking: updated } : prev);
    }
  }, [bookings]);

  const [lastBalance, setLastBalance] = useState(999999);
  
  // Confetti trigger
  useEffect(() => {
    // Only if balance just hit zero or below, and it was previously positive, and we are checked in
    if (sel?.status === 'checked_in' && balance <= 0.01 && lastBalance > 0.01 && tPaidUsd > 0) {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.7 },
        colors: ['#6366f1', '#10b981', '#f59e0b']
      });
    }
    setLastBalance(balance);
  }, [balance, lastBalance, tPaidUsd, sel?.status]);

  const getYurtName = (b: Booking) =>
    yurts.find(y => y.id === b.yurt_id)?.name || (b.yurt_id ? `Yurt #${b.yurt_id}` : '—');

  const isGcCancelled = (ev: CalEvent) =>
    ev.status === 'cancelled' || ev.colorId === '11' || ev.colorId === '4' ||
    (ev.summary?.toLowerCase() ?? '').includes('cancel');

  const calendarOnlyItems: ListItem[] = gcEvents
    .filter(ev => !bookings.some(b => b.google_event_id === ev.id))
    .map(ev => ({ key: `ev-${ev.id}`, name: ev.summary, start: ev.start, end: ev.end, source: 'calendar' as const, booking: null, event: ev }));

  // If a linked Google Calendar event is marked cancelled (red / colorId 11 / colorId 4 / 'cancel' in title),
  // surface the booking as cancelled in the UI. We do NOT write to the DB — so if the office reverts the
  // red color in Calendar, the original status (confirmed) returns automatically and Check In re-appears.
  // Only override 'confirmed' (not yet checked in) — never override checked_in / completed / no_arrival.
  const bookingItems: ListItem[] = bookings.map(b => {
    const linkedEv = gcEvents.find(e => e.id === b.google_event_id) || null;
    const effB: Booking = b.status === 'confirmed' && linkedEv && isGcCancelled(linkedEv)
      ? { ...b, status: 'cancelled' }
      : b;
    return {
      key: `db-${b.id}`, name: effB.guest_name, start: effB.check_in, end: effB.check_out,
      source: 'db' as const, booking: effB, event: linkedEv,
    };
  });

  const D = selectedCalendarDay;

  // Left panel filtered by selected calendar day
  const arrivingItems = [
    ...bookingItems.filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in === D),
    ...calendarOnlyItems.filter(i => i.event!.start === D && !isGcCancelled(i.event!)),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const stayingItems = bookingItems
    .filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in < D && i.booking!.check_out > D)
    .sort((a, b) => a.start.localeCompare(b.start));

  const checkedInItems = bookingItems
    .filter(i => i.booking!.status === 'checked_in' && i.booking!.check_in <= D && i.booking!.check_out > D)
    .sort((a, b) => a.start.localeCompare(b.start));

  const checkingOutItems = bookingItems
    .filter(i => i.booking!.status === 'checked_in' && i.booking!.check_out === D)
    .sort((a, b) => a.start.localeCompare(b.start));

  const checkedOutItems = bookingItems
    .filter(i => i.booking!.status === 'completed' && i.booking!.check_out === D)
    .sort((a, b) => b.start.localeCompare(a.start));

  const cancelledItems = [
    ...bookingItems.filter(i => i.booking!.status === 'cancelled' && i.booking!.check_in <= D && i.booking!.check_out > D),
    ...calendarOnlyItems.filter(i => isGcCancelled(i.event!) && i.event!.start <= D && i.event!.end > D),
  ].sort((a, b) => b.start.localeCompare(a.start));

  const gcEventsOnDay = calendarOnlyItems.filter(i => i.event!.start <= D && i.event!.end > D && !isGcCancelled(i.event!) && i.event!.start !== D);

  const renderCard = (item: ListItem, isCancelled: boolean) => {
    const isSelected = selectedItem?.key === item.key;
    const booking = item.booking;
    const showApprove = !!booking && booking.status === 'checked_in' && syncWarnings[booking.id] === 'dates_changed' && (userRole === 'Manager' || userRole === 'CEO');
    return (
      <div key={item.key} className={`w-full px-4 py-3 transition-all border-l-4 ${
        isCancelled
          ? 'border-red-300 bg-red-50/50'
          : isSelected
          ? 'bg-indigo-50 border-indigo-400'
          : booking?.status === 'checked_in'
          ? 'border-emerald-400 hover:bg-emerald-50'
          : booking?.status === 'confirmed'
          ? 'border-amber-400 hover:bg-amber-50'
          : booking?.status === 'completed'
          ? 'border-blue-300 hover:bg-blue-50'
          : 'border-slate-200 hover:bg-slate-50'
      }`}>
        <button
          className="w-full text-left"
          onClick={() => handleSelect(item)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-bold text-sm truncate ${isCancelled ? 'text-red-600 line-through' : 'text-slate-900'}`}>
                {item.name}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{item.start} → {item.end}</p>
              {booking ? <p className="text-xs text-slate-500">{getYurtName(booking)}</p> : <p className="text-xs text-slate-400">calendar only</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {isCancelled
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">cancelled</span>
                : booking && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusColor(booking.status)}`}>{booking.status.replace('_', ' ')}</span>
              }
              {booking && syncWarnings[booking.id] === 'deleted' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">⚠ removed</span>
              )}
              {booking && syncWarnings[booking.id] === 'dates_changed' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚠ dates ≠</span>
              )}
            </div>
          </div>
        </button>

        {showApprove && booking && (
          <button
            onClick={e => { e.stopPropagation(); void handleApproveDates(booking); }}
            disabled={loadingAction === `syncdates-${booking.id}`}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          >
            {loadingAction === `syncdates-${booking.id}` ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '↻'}
            Approve dates
          </button>
        )}
      </div>
    );
  };

  const statusColor = (s?: string) => ({
    checked_in: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    confirmed: 'bg-amber-100 text-amber-700 border border-amber-200',
    completed: 'bg-blue-100 text-blue-700 border border-blue-200',
    cancelled: 'bg-red-100 text-red-700 border border-red-200',
    pending: 'bg-slate-100 text-slate-600 border border-slate-200',
    no_arrival: 'bg-gray-200 text-gray-600 border border-gray-300',
  }[s ?? ''] ?? 'bg-slate-100 text-slate-500');

  const statusIcon = (s: string | undefined) => {
    if (s === 'checked_in') return '✓';
    if (s === 'completed') return '✈';
    if (s === 'cancelled') return '✕';
    if (s === 'no_arrival') return '⊘';
    return '';
  };
  const statusIconColor = (s: string | undefined) => {
    if (s === 'completed') return 'text-amber-500';
    return '';
  };

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 4000); };

  const handleApproveDates = async (booking: Booking) => {
    if (!onUpdateBooking) return;
    const linkedEv = gcEvents.find(e => e.id === booking.google_event_id);
    if (!linkedEv) { flash('⚠ Linked calendar event not found.'); return; }
    setLoadingAction(`syncdates-${booking.id}`);
    try {
      await onUpdateBooking(booking.id, { check_in: linkedEv.start, check_out: linkedEv.end } as Partial<Booking>);
      setSyncWarnings(w => {
        const next = { ...w };
        delete next[booking.id];
        return next;
      });
      flash('✓ Dates approved from calendar.');
      onRefresh?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      flash(`⚠ ${msg.slice(0, 100)}`);
    } finally {
      setLoadingAction('');
    }
  };

  const handleCreateFromEvent = async (doCheckIn = false) => {
    if (!selectedItem?.event) { flash('⚠ No event selected.'); return; }
    if (!currentUserId) { flash('⚠ Not logged in — please refresh and try again.'); return; }
    const ev = selectedItem.event;
    setLoadingAction('creating');
    try {
      // Guard: check if a booking for this event already exists
      const existing = bookings.find(b => b.google_event_id === ev.id) ?? null;
      if (existing) {
        flash('⚠ Booking for this event already exists — opening it.');
        handleSelect({ key: `db-${existing.id}`, name: existing.guest_name, start: existing.check_in, end: existing.check_out, source: 'db', booking: existing as Booking, event: ev });
        return;
      }

      const payload = {
        guest_name: ev.summary,
        check_in: ev.start,
        check_out: ev.end || ev.start,
        status: doCheckIn ? 'checked_in' : 'confirmed',
        source: 'Manual',
        google_event_id: ev.id,
        total_price: 0,
        number_of_people: 1,
        payment_status: 'Unpaid',
        approved_by_manager: true,
        created_by_id: currentUserId,
        notes: (ev.description && !ev.description.includes('tasks.google.com')) ? ev.description : null,
      };
      const insertResp: { data: unknown; error: unknown } = await supabase.from('bookings').insert(payload);
      if (insertResp?.error) throw insertResp.error;
      // Resolve inserted id — local fallback returns it; real Supabase needs a follow-up query
      let insertedId: number | undefined;
      const d = insertResp?.data as Array<{ id?: number }> | { id?: number } | null;
      insertedId = Array.isArray(d) ? d[0]?.id : d?.id;
      if (!insertedId) {
        const findResp: { data: Array<{ id: number }> | null } = await supabase.from('bookings').select('id').eq('google_event_id', ev.id);
        insertedId = findResp?.data?.[0]?.id;
      }
      if (doCheckIn && insertedId && onCheckIn) await onCheckIn(insertedId);
      flash(doCheckIn ? '✓ Guest checked in from calendar event.' : '✓ Booking created from calendar event.');
      setSelectedItem(null);
      onRefresh?.();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('Create from event:', msg); flash(`⚠ ${msg.slice(0, 100)}`); }
    finally { setLoadingAction(''); }
  };

  const fetchCbuRate = async (currency: 'UZS' | 'EUR') => {
    setFetchingRate(currency);
    try {
      const res = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/');
      const data = await res.json();
      const code = currency === 'UZS' ? 'USD' : (currency === 'EUR' ? 'EUR' : '');
      const rateObj = data.find((r: any) => r.Ccy === code);
      if (rateObj && pricing) {
        const rate = parseFloat(rateObj.Rate);
        if (currency === 'UZS') {
          setPricing({ ...pricing, usd_to_uzs: rate });
        } else if (currency === 'EUR') {
          const usdRate = data.find((r: any) => r.Ccy === 'USD')?.Rate;
          if (usdRate) {
            const usdToEur = parseFloat(usdRate) / rate;
            setPricing({ ...pricing, usd_to_eur: usdToEur });
          }
        }
        flash(`✓ CBU Rate updated: ${rate}`);
      }
    } catch (err) {
      console.error('CBU Rate error:', err);
      flash('⚠ Failed to fetch CBU rate.');
    } finally {
      setFetchingRate(null);
    }
  };

  const handleSelect = async (item: ListItem) => {
    setSelectedItem(item);
    setCollectedAmount(''); setSelectedDrinks({}); setExtraServices([]);
    setNewExtraName(''); setNewExtraPrice(''); setShowDrinks(false); setActionMsg('');
    setShowServices(false);
    
    if (item.booking) {
      const b = item.booking;
      let existing: DayEntry[] = [];
      try { if (b.special_requests) existing = JSON.parse(b.special_requests); } catch (e) { console.error('Failed to parse special_requests', e); }
      
      const ci = new Date(b.check_in + 'T00:00:00');
      const co = new Date(b.check_out + 'T00:00:00');
      const numNights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
      const entries: DayEntry[] = [];
      for (let i = 0; i <= numNights; i++) {
        const d = new Date(ci); d.setDate(d.getDate() + i);
        const ds = localDateStr(d);
        const found = existing.find(ex => ex.date === ds);
        entries.push(found || {
          date: ds,
          lunch: false, lunchCount: 0, lunchDietary: '',
          dinner: false, dinnerCount: 0, dinnerDietary: '',
          guideService: false, guideNames: [''],
          transportation: false, transEntries: [{ driver: '', time: '', from: '', to: '', arrivalTime: '', price: '' }],
          cookingClass: false, cookingClassDescription: '',
          specialRequest: '',
        });
      }
      setDayEntries(entries);
      
      setSvcLunch(b.lunch || false);
      setSvcLunchCount(b.lunch_count || 0);
      setSvcDinner(b.dinner || false);
      setSvcDinnerCount(b.dinner_count || 0);
      setSvcGuide(b.guide_service || false);
      setSvcGuideNames(b.guide_names ? b.guide_names.split(', ') : ['']);
      setSvcGuidePrice(parseFloat(b.guide_amount || '0') || (pricing?.guide_price || 0));
      setSvcTransport(b.has_transportation || false);
      const details = b.transportation_details || '';
      if (details.includes(' | Price: $')) {
        const lines = details.split('\n');
        const list = lines.map(line => {
          const namePart = line.split(' | ')[0] || '';
          const detailPart = line.split(' | ')[1] || '';
          const pricePart = line.split(' | Price: $')[1] || '0';
          return { name: namePart, details: detailPart, price: parseFloat(pricePart) || 0 };
        });
        setSvcTransList(list);
      } else {
        setSvcTransList([{ name: '', details: details, price: 0 }]);
      }
      setSvcCooking(b.cooking_class || false);
      setSvcCookingPrice(parseFloat(b.cooking_class_amount || '0') || 0);
      setSvcLaundry(b.laundry || false);
      setSvcLaundryPrice(parseFloat(b.laundry_price || '0') || 0);
      setSvcAdults(b.number_of_people || 1);
      setSvcChildren(b.children_under_12 || 0);
      setSvcAmount(b.amount || 0);

      // Load payments
      const { data: pData } = await supabase.from('payments').select('*').eq('booking_id', b.id);
      if (pData && pData.length > 0) {
        setSvcPayList(pData.map((p: any) => ({
          id: p.id,
          amount: p.amount_original.toString(),
          currency: p.currency_original,
          method: p.method,
          rate: p.exchange_rate_used
        })));
        setPayModified(true);
      } else {
        setSvcPayList([{ amount: (b.total_price || b.amount || 0).toString(), currency: b.collected_currency || 'USD', method: 'Cash' }]);
        setPayModified(false);
      }
    } else {
      setDayEntries([]);
      setSvcLunch(false); setSvcLunchCount(0);
      setSvcDinner(false); setSvcDinnerCount(0);
      setSvcGuide(false); setSvcGuideNames(['']); setSvcGuidePrice(0);
      setSvcTransport(false); setSvcTransList([{ name: '', details: '', price: 0 }]);
      setSvcCooking(false); setSvcCookingPrice(0);
      setSvcLaundry(false); setSvcLaundryPrice(0);
      setSvcAdults(1); setSvcChildren(0);
      setSvcAmount(0);
      setSvcPayList([{ amount: '0', currency: 'USD', method: 'Cash' }]);
      setPayModified(false);
    }
  };

  const updateDay = (index: number, updates: Partial<DayEntry>) =>
    setDayEntries(prev => prev.map((d, i) => i === index ? { ...d, ...updates } : d));

  const updateDayGuideName = (dayIndex: number, nameIndex: number, value: string) =>
    setDayEntries(prev => { const days = [...prev]; const names = [...days[dayIndex].guideNames]; names[nameIndex] = value; days[dayIndex] = { ...days[dayIndex], guideNames: names }; return days; });

  const updateDayTransEntry = (dayIndex: number, ei: number, field: string, value: string) =>
    setDayEntries(prev => { const days = [...prev]; const ents = [...days[dayIndex].transEntries]; ents[ei] = { ...ents[ei], [field]: value }; days[dayIndex] = { ...days[dayIndex], transEntries: ents }; return days; });

  const sel = selectedItem?.booking ?? null;
  const daysUntilCheckIn = sel
    ? Math.ceil((new Date(sel.check_in + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : 999;
  const canCheckIn = sel?.status === 'confirmed' && daysUntilCheckIn <= 2 && !!onCheckIn;
  const isComingSoon = sel?.status === 'confirmed' && daysUntilCheckIn > 2;
  const canCheckOut = sel?.status === 'checked_in' && !!onCheckOut && today >= (sel?.check_out ?? '9999');
  const canCancel = sel && ['confirmed', 'pending'].includes(sel.status) && !!onCancelBooking;

  // Color rules are SYSTEM-ONLY — we never push status colors back to Google Calendar.
  // Google Calendar's red color (colorId '11') is still READ as a cancellation signal via isGcCancelled.

  const handleCheckIn = async () => {
    if (!sel || !onCheckIn) return;
    setLoadingAction('checkin');
    try { await onCheckIn(sel.id); flash('✓ Guest checked in.'); }
    catch { flash('⚠ Check-in failed.'); }
    finally { setLoadingAction(''); }
  };

  const handleCheckOut = async () => {
    if (!sel || !onCheckOut) return;
    if (svcAdults <= 0) {
      flash('⚠ Number of adults is required for check-out.');
      setShowServices(true);
      return;
    }
    if ((svcLunch && svcLunchCount <= 0) || (svcDinner && svcDinnerCount <= 0)) {
      flash('⚠ Quantity is required for selected meals.');
      setShowServices(true);
      return;
    }
    if (svcGuide && (svcGuideNames.some(n => !n.trim()) || svcGuidePrice <= 0)) {
      flash('⚠ Please enter guide name and amount.');
      setShowServices(true);
      return;
    }
    if (svcTransport && svcTransList.some(t => !t.name.trim() || !t.details.trim() || t.price <= 0)) {
      flash('⚠ Please fill all transport fields (name, destination, amount).');
      setShowServices(true);
      return;
    }
    if (svcLaundry && svcLaundryPrice <= 0) {
      flash('⚠ Please enter laundry amount.');
      setShowServices(true);
      return;
    }
    if (svcCooking && svcCookingPrice <= 0) {
      flash('⚠ Please enter cooking class amount.');
      setShowServices(true);
      return;
    }
    setLoadingAction('checkout');
    try {
      const drinkTab = Object.entries(selectedDrinks).filter(([, q]) => q > 0).map(([id, qty]) => {
        const d = drinks.find(d => d.id === parseInt(id));
        return { drink_id: parseInt(id), drink_name: d?.name || '', quantity: qty, price: d?.sold_price || 0, currency: d?.currency || 'USD' };
      });
      const dTotal = drinkTab.reduce((s, d) => s + (d.price * d.quantity), 0);
      const eTotal = extraServices.reduce((s, e) => s + (parseFloat(e.price) || 0), 0);
      const sTotal = (
        (svcLunch ? svcLunchCount * (pricing?.lunch_price || 0) : 0) +
        (svcDinner ? svcDinnerCount * (pricing?.dinner_price || 0) : 0) +
        (svcGuide ? svcGuidePrice : 0) +
        (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
        (svcLaundry ? svcLaundryPrice : 0) +
        (svcCooking ? svcCookingPrice : 0)
      );

      const totalPaidUsd = svcPayList.reduce((sum, p) => {
        const amt = parseFloat(p.amount) || 0;
        const rate = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
        return sum + (p.currency === 'USD' ? amt : (amt / rate));
      }, 0);

      const gTotal = svcAmount + sTotal + dTotal + eTotal;
      const isFullyPaid = totalPaidUsd >= (gTotal - 0.01);
      
      // Save individual payments
      for (const p of svcPayList) {
        const amt = parseFloat(p.amount) || 0;
        if (amt <= 0) continue;
        const rate = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
        const usdEquiv = p.currency === 'USD' ? amt : (amt / rate);
        
        const payData = {
          booking_id: sel.id,
          amount_original: amt,
          currency_original: p.currency,
          method: p.method,
          exchange_rate_used: rate,
          amount_usd_equivalent: usdEquiv
        };
        
        if (p.id) {
          await supabase.from('payments').update(payData).eq('id', p.id);
        } else {
          await supabase.from('payments').insert(payData);
        }
      }
      
      const updates: Partial<Booking> = {
        total_price: gTotal,
        collected_amount: totalPaidUsd,
        collected_currency: 'USD',
        payment_status: isFullyPaid ? 'Paid' : 'Partial',
        payment_note: `Split Payment: ${svcPayList.map(p => `${p.amount} ${p.currency} (${p.method})`).join(', ')}`
      };
      if (drinkTab.length) updates.drinks_tab = drinkTab;
      if (extraServices.length) updates.extra_services = extraServices.map(e => ({ name: e.name, price: parseFloat(e.price) || 0, currency: e.currency as 'UZS' | 'USD' | 'EUR' }));
      if (onUpdateBooking) await onUpdateBooking(sel.id, updates);
      
      if (isFullyPaid) {
        await onCheckOut(sel.id);
        flash('✓ Fully Paid & Checked out. Finance record created.');
      } else {
        flash('✓ Payment records updated (Partial).');
      }
    } catch { flash('⚠ Checkout failed.'); }
    finally { setLoadingAction(''); }
  };

  const handleSaveServices = async () => {
    if (!sel || !onUpdateBooking) return;
    if ((svcLunch && svcLunchCount <= 0) || (svcDinner && svcDinnerCount <= 0)) {
      flash('⚠ Please enter quantity for selected meals.');
      return;
    }
    if (svcGuide && (svcGuideNames.some(n => !n.trim()) || svcGuidePrice <= 0)) {
      flash('⚠ Please enter guide name and amount.');
      return;
    }
    if (svcTransport && svcTransList.some(t => !t.name.trim() || !t.details.trim() || t.price <= 0)) {
      flash('⚠ Please enter all transport details.');
      return;
    }
    if (svcLaundry && svcLaundryPrice <= 0) {
      flash('⚠ Please enter laundry amount.');
      return;
    }
    if (svcCooking && svcCookingPrice <= 0) {
      flash('⚠ Please enter cooking class amount.');
      return;
    }
    setLoadingAction('saveservices');
    try {
      const dTotal = Object.entries(selectedDrinks).reduce((sum, [id, qty]) => {
        const drink = drinks.find(d => d.id === parseInt(id));
        return sum + (qty * (drink?.sold_price || 0));
      }, 0);
      const eTotal = extraServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
      const sTotal = (
        (svcLunch ? svcLunchCount * (pricing?.lunch_price || 0) : 0) +
        (svcDinner ? svcDinnerCount * (pricing?.dinner_price || 0) : 0) +
        (svcGuide ? svcGuidePrice : 0) +
        (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
        (svcLaundry ? svcLaundryPrice : 0) +
        (svcCooking ? svcCookingPrice : 0)
      );

      const updates: Partial<Booking> = {
        lunch: svcLunch,
        lunch_count: svcLunch ? svcLunchCount : 0,
        dinner: svcDinner,
        dinner_count: svcDinner ? svcDinnerCount : 0,
        guide_service: svcGuide,
        guide_names: svcGuide ? svcGuideNames.filter(n => n.trim()).join(', ') : null,
        guide_amount: svcGuide ? svcGuidePrice.toString() : null,
        has_transportation: svcTransport,
        transportation_details: svcTransport 
          ? svcTransList.filter(t => t.name.trim() || t.details.trim() || t.price > 0)
              .map(t => `${t.name.trim()} | ${t.details.trim()} | Price: $${t.price}`)
              .join('\n') || null
          : null,
        cooking_class: svcCooking,
        cooking_class_amount: svcCooking ? svcCookingPrice.toString() : null,
        laundry: svcLaundry,
        laundry_price: svcLaundry ? svcLaundryPrice.toString() : null,
        laundry_currency: 'USD',
        number_of_people: svcAdults,
        children_under_12: svcChildren,
        amount: svcAmount,
        currency: 'USD',
        total_price: svcAmount + sTotal + dTotal + eTotal
      };
      await onUpdateBooking(sel.id, updates);
      flash('✓ Services updated.');
      setShowServices(false);
    } catch {
      flash('⚠ Failed to save services.');
    } finally {
      setLoadingAction('');
    }
  };

  const fetchLiveRate = async (curr: 'UZS' | 'EUR') => {
    setFetchingRate(curr);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data && data.rates && data.rates[curr]) {
        const rate = data.rates[curr];
        setPricing((prev: typeof pricing) => prev ? { 
          ...prev, 
          [curr === 'UZS' ? 'usd_to_uzs' : 'usd_to_eur']: rate 
        } : prev);
        flash(`✓ Updated ${curr} rate to ${rate}`);
      }
    } catch {
      flash('⚠ Failed to fetch live rate.');
    } finally {
      setFetchingRate(null);
    }
  };

  const handleCancel = async () => {
    if (!sel || !onCancelBooking) return;
    if (!confirm(`Cancel booking for ${sel.guest_name}?`)) return;
    setLoadingAction('cancel');
    try { await onCancelBooking(sel.id); flash('Booking cancelled.'); }
    catch { flash('⚠ Cancel failed.'); }
    finally { setLoadingAction(''); }
  };

  useEffect(() => {
    if (!payModified && svcPayList.length === 1 && svcPayList[0].currency === 'USD') {
      const gTotal = (
        svcAmount + 
        ((svcLunch ? svcLunchCount * (pricing?.lunch_price || 0) : 0) +
         (svcDinner ? svcDinnerCount * (pricing?.dinner_price || 0) : 0) +
         (svcGuide ? svcGuidePrice : 0) +
         (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
         (svcLaundry ? svcLaundryPrice : 0) +
         (svcCooking ? svcCookingPrice : 0)) +
        Object.entries(selectedDrinks).reduce((sum, [id, qty]) => {
          const drink = drinks.find(d => d.id === parseInt(id));
          return sum + (qty * (drink?.sold_price || 0));
        }, 0) +
        extraServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0)
      );
      setSvcPayList([{ amount: gTotal.toString(), currency: 'USD' }]);
    }
  }, [svcAmount, svcLunch, svcLunchCount, svcDinner, svcDinnerCount, svcGuide, svcGuidePrice, svcTransport, svcTransList, svcLaundry, svcLaundryPrice, svcCooking, svcCookingPrice, selectedDrinks, extraServices, pricing, payModified]);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900">Guest Agenda</h2>
          <p className="text-xs text-slate-500">Today’s guests · synced from Google Calendar</p>
        </div>
        <div className="flex items-center gap-2">
          {loadingEvents && <span className="text-xs text-slate-400 flex items-center gap-1"><span className="w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin inline-block" />Syncing...</span>}
          {eventsError && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-200">⚠ Calendar: {eventsError.slice(0, 60)}</span>}
          {!loadingEvents && !eventsError && <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">● {gcEvents.length} calendar events</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Left — Today's Guest List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[680px]">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{D === today ? 'Today' : 'Selected Day'}</p>
            <h3 className="text-sm font-black text-slate-900">
              {new Date(D + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto">
            {arrivingItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border-b border-amber-100">◐ Arriving · {arrivingItems.length}</p>
                {arrivingItems.map(item => renderCard(item, false))}
              </div>
            )}
            {stayingItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border-b border-indigo-100">→ In Stay · {stayingItems.length}</p>
                {stayingItems.map(item => renderCard(item, false))}
              </div>
            )}
            {checkedInItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border-b border-emerald-100">● Checked In · {checkedInItems.length}</p>
                {checkedInItems.map(item => renderCard(item, false))}
              </div>
            )}
            {checkingOutItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 border-b border-blue-100">↓ Checking Out · {checkingOutItems.length}</p>
                {checkingOutItems.map(item => renderCard(item, false))}
              </div>
            )}
            {checkedOutItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-50 border-b border-slate-100">✓ Checked Out · {checkedOutItems.length}</p>
                {checkedOutItems.map(item => renderCard(item, false))}
              </div>
            )}
            {gcEventsOnDay.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 border-b border-violet-100">◊ Google Events · {gcEventsOnDay.length}</p>
                {gcEventsOnDay.map(item => renderCard(item, false))}
              </div>
            )}
            {cancelledItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-700 bg-red-50 border-b border-red-100">✕ Cancelled · {cancelledItems.length}</p>
                {cancelledItems.map(item => renderCard(item, true))}
              </div>
            )}
            {arrivingItems.length === 0 && stayingItems.length === 0 && checkedInItems.length === 0 && checkingOutItems.length === 0 && checkedOutItems.length === 0 && gcEventsOnDay.length === 0 && cancelledItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <p className="text-sm font-medium">No guests today</p>
              </div>
            )}
          </div>
        </div>

        <PrivateCalendarView
          bookings={bookings}
          gcEvents={gcEvents}
          onDayChange={day => setSelectedCalendarDay(day)}
          onSelectBooking={b => handleSelect({ key: `db-${b.id}`, name: b.guest_name, start: b.check_in, end: b.check_out, source: 'db', booking: b, event: null })}
          onSelectCalendarEvent={ev => {
            const linked = bookings.find(b => b.google_event_id === ev.id) || null;
            handleSelect({ key: linked ? `db-${linked.id}` : `ev-${ev.id}`, name: linked ? linked.guest_name : ev.summary, start: linked ? linked.check_in : ev.start, end: linked ? linked.check_out : ev.end, source: linked ? 'both' : 'calendar', booking: linked, event: ev });
          }}
        />
      </div>

      {/* Event / Booking popup modal */}
    {selectedItem && (
      <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-16" onClick={() => setSelectedItem(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
              {sel ? 'Booking Details' : 'Google Calendar Event'}
            </p>
            <button onClick={() => setSelectedItem(null)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-all text-slate-500 font-bold text-xl">×</button>
          </div>

          {!sel ? (
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selectedItem.event?.summary}</h2>
                  <p className="text-sm text-slate-500">{selectedItem.start} → {selectedItem.end}</p>
                </div>
                {selectedItem.event && isGcCancelled(selectedItem.event) && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                    ✕ cancelled
                  </span>
                )}
              </div>
              {selectedItem.event?.description && !selectedItem.event.description.includes('tasks.google.com') && <p className="text-sm text-black bg-slate-50 rounded-xl p-3">{selectedItem.event.description}</p>}
              {selectedItem.event?.location && <p className="text-sm text-slate-500">📍 {selectedItem.event.location}</p>}
              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{actionMsg}</div>
              )}
              {(() => {
                const days = Math.ceil((new Date(selectedItem.start + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
                if (selectedItem.event && isGcCancelled(selectedItem.event)) {
                  return (
                    <div className="w-full py-3 px-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700 text-center flex items-center justify-center gap-2">
                      <span>✕</span> Cancelled
                    </div>
                  );
                }
                return days <= 2 ? (
                  <button onClick={() => handleCreateFromEvent(true)} disabled={loadingAction === 'creating'}
                    className="w-full py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {loadingAction === 'creating' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                    Check In
                  </button>
                ) : (
                  <div className="w-full py-2.5 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700 text-center">
                    ⏰ Coming in {days} day{days !== 1 ? 's' : ''}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {(() => {
                return (
                  <>
                  <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{sel.guest_name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{getYurtName(sel)} · {sel.check_in} → {sel.check_out}{sel.nights ? ` · ${sel.nights}n` : ''}{(sel.guest_count || sel.number_of_people) ? ` · ${sel.guest_count || sel.number_of_people} pax` : ''}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${statusColor(sel.status)} flex items-center gap-1`}>
                  {statusIcon(sel.status) && <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>}
                  {sel.status.replace('_', ' ')}
                </span>
              </div>

              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{actionMsg}</div>
              )}

              {syncWarnings[sel.id] === 'deleted' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <p className="font-bold mb-0.5">⚠ Calendar event deleted</p>
                  <p className="text-xs">The linked Google Calendar event was removed. The booking remains here.</p>
                </div>
              )}

              {syncWarnings[sel.id] === 'dates_changed' && (() => {
                const linkedEv = gcEvents.find(e => e.id === sel.google_event_id);
                if (!linkedEv) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-bold text-amber-800">⚠ Dates changed in Google Calendar</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white rounded-lg p-2 border border-amber-100">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saved</p>
                        <p className="text-black font-bold">{sel.check_in} → {sel.check_out}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-emerald-200">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Calendar</p>
                        <p className="text-black font-bold">{linkedEv.start} → {linkedEv.end}</p>
                      </div>
                    </div>
                    {(userRole === 'Manager' || userRole === 'CEO') && onUpdateBooking && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Approve new booking dates from Calendar: ${linkedEv.start} → ${linkedEv.end}?`)) return;
                          await handleApproveDates(sel);
                        }}
                        disabled={loadingAction === `syncdates-${sel.id}`}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                        {loadingAction === `syncdates-${sel.id}` ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '↻'}
                        Approve dates
                      </button>
                    )}
                  </div>
                );
              })()}

              {(sel.status === 'no_arrival' || sel.status === 'cancelled') && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{sel.status.replace('_', ' ')}</span>
                  {sel.status === 'no_arrival' && <span className="text-[10px] font-medium opacity-70">· permanent</span>}
                </div>
              )}

              {sel.status === 'completed' && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{sel.status.replace('_', ' ')}</span>
                </div>
              )}

              {(userRole === 'Manager' || userRole === 'CEO') && sel.status !== 'no_arrival' && sel.status !== 'cancelled' && (
                <div className="flex flex-wrap gap-2">
                  {sel.status === 'checked_in' && !editingDates && (
                    <button
                      onClick={() => { setEditingDates(true); setEditCheckIn(sel.check_in); setEditCheckOut(sel.check_out); }}
                      className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200 transition-all flex items-center gap-2">
                      ✓ Checked In · Edit Dates
                    </button>
                  )}
                  {editingDates && (
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Edit Stay Dates</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check In</label>
                          <input
                            type="date"
                            value={editCheckIn}
                            onChange={e => setEditCheckIn(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check Out</label>
                          <input
                            type="date"
                            value={editCheckOut}
                            onChange={e => setEditCheckOut(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`Update dates to ${editCheckIn} → ${editCheckOut}?`)) return;
                            setLoadingAction('editdates');
                            try {
                              await onUpdateBooking?.(sel.id, { check_in: editCheckIn, check_out: editCheckOut });
                              if (userRole === 'CEO') {
                                flash('✓ Dates updated. ALERT: CEO has modified booking dates.');
                                // Additional alert for CEO edits - could integrate with notification system here
                                alert(`CEO EDIT NOTIFICATION:\n\nBooking: ${sel.guest_name}\nOld dates: ${sel.check_in} → ${sel.check_out}\nNew dates: ${editCheckIn} → ${editCheckOut}\n\nThis change has been recorded.`);
                              } else {
                                flash('✓ Dates updated.');
                              }
                              setEditingDates(false);
                              onRefresh?.();
                            } catch (e: unknown) {
                              const msg = e instanceof Error ? e.message : String(e);
                              flash(`⚠ ${msg.slice(0, 100)}`);
                            } finally {
                              setLoadingAction('');
                            }
                          }}
                          disabled={loadingAction === 'editdates' || !editCheckIn || !editCheckOut || editCheckIn > editCheckOut}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                          {loadingAction === 'editdates' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDates(false)}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-lg transition-all">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {canCheckIn && (
                    <button onClick={handleCheckIn} disabled={loadingAction === 'checkin'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2">
                      {loadingAction === 'checkin' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                      Check In
                    </button>
                  )}
                  {isComingSoon && (
                    <div className="px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700">
                      ⏰ Coming in {daysUntilCheckIn} day{daysUntilCheckIn !== 1 ? 's' : ''}
                    </div>
                  )}
                  {canCheckOut && !editingDates && (
                    <button onClick={() => setShowFinalReceipt(true)} disabled={loadingAction === 'checkout'}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2 shadow-lg shadow-indigo-100">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      Finalize & Paid
                    </button>
                  )}
                  {canCancel && !editingDates && (
                    <button onClick={handleCancel} disabled={loadingAction === 'cancel'}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold rounded-xl border border-red-200 transition-all disabled:opacity-60">Cancel Booking</button>
                  )}

                  {sel.status === 'confirmed' && sel.check_in < today && onUpdateBooking && !editingDates && (
                    <button onClick={async () => { if (!confirm(`Mark ${sel.guest_name} as No Arrival? This is PERMANENT and cannot be undone.`)) return; setLoadingAction('na'); try { await onUpdateBooking(sel.id, { status: 'no_arrival' } as Partial<Booking>); flash('Marked as No Arrival.'); } catch { flash('⚠ Failed.'); } finally { setLoadingAction(''); } }} disabled={loadingAction === 'na'}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold rounded-xl border border-gray-300 transition-all disabled:opacity-60">⊘ No Arrival</button>
                  )}
                </div>
              )}

              {canCheckOut && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collect Payment</p>
                  <div className="flex gap-2">
                    <input type="number" value={collectedAmount} onChange={e => setCollectedAmount(e.target.value)} placeholder="Amount collected"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-black" />
                    <select value={collectedCurrency} onChange={e => setCollectedCurrency(e.target.value as 'UZS' | 'USD' | 'EUR')}
                      className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none text-black bg-white">
                      <option>USD</option><option>UZS</option><option>EUR</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Simplified Global Services */}
              {(sel.status === 'checked_in' || sel.status === 'confirmed') && (userRole === 'Manager' || userRole === 'CEO') && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Services (Food, Guide, Transport)</p>
                    <button onClick={() => setShowServices(v => !v)} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">
                      {showServices ? '− Hide' : '+ Manage Services'}
                    </button>
                  </div>
                  
                  {showServices && (
                    <div className="space-y-4 pt-2">
                      {/* Guest Counts */}
                      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adults *</label>
                          <input
                            type="number"
                            min="1"
                            value={svcAdults}
                            onChange={e => setSvcAdults(parseInt(e.target.value) || 0)}
                            className={`w-full px-3 py-2 border-2 ${svcAdults <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-xl text-sm font-black text-black focus:border-indigo-500 transition-all`}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Children</label>
                          <input
                            type="number"
                            min="0"
                            value={svcChildren}
                            onChange={e => setSvcChildren(parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border-2 border-slate-200 bg-white rounded-xl text-sm font-black text-black focus:border-indigo-500 transition-all"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="pb-4 border-b border-slate-100">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stay Price Total (USD)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input
                              type="number"
                              value={svcAmount}
                              onChange={e => setSvcAmount(parseFloat(e.target.value) || 0)}
                              className="w-full pl-7 pr-3 py-2 border-2 border-slate-200 bg-white rounded-xl text-sm font-black text-black focus:border-indigo-500 transition-all"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>                      <div className="grid grid-cols-1 gap-4">
                        {/* Lunch */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer min-w-[100px]">
                              <input type="checkbox" checked={svcLunch} onChange={e => {
                                setSvcLunch(e.target.checked);
                                if (e.target.checked && svcLunchCount <= 0) setSvcLunchCount(1);
                              }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                              <span className="text-sm font-bold text-slate-900">Lunch</span>
                            </label>
                            {svcLunch && (
                              <input
                                type="number"
                                value={svcLunchCount}
                                onChange={e => setSvcLunchCount(parseInt(e.target.value) || 0)}
                                placeholder="Qty"
                                className={`w-20 px-3 py-1.5 border-2 ${svcLunchCount <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-sm font-bold text-black focus:border-indigo-500 transition-all`}
                              />
                            )}
                          </div>
                          {svcLunch && pricing?.lunch_price && pricing.lunch_price > 0 && (
                            <span className="text-xs font-bold text-slate-500">
                              ${(svcLunchCount * pricing.lunch_price).toFixed(2)}
                              <span className="ml-1 opacity-50">(${pricing.lunch_price}/ea)</span>
                            </span>
                          )}
                        </div>

                        {/* Dinner */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 cursor-pointer min-w-[100px]">
                              <input type="checkbox" checked={svcDinner} onChange={e => {
                                setSvcDinner(e.target.checked);
                                if (e.target.checked && svcDinnerCount <= 0) setSvcDinnerCount(1);
                              }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                              <span className="text-sm font-bold text-slate-900">Dinner</span>
                            </label>
                            {svcDinner && (
                              <input
                                type="number"
                                value={svcDinnerCount}
                                onChange={e => setSvcDinnerCount(parseInt(e.target.value) || 0)}
                                placeholder="Qty"
                                className={`w-20 px-3 py-1.5 border-2 ${svcDinnerCount <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-sm font-bold text-black focus:border-indigo-500 transition-all`}
                              />
                            )}
                          </div>
                          {svcDinner && pricing?.dinner_price && pricing.dinner_price > 0 && (
                            <span className="text-xs font-bold text-slate-500">
                              ${(svcDinnerCount * pricing.dinner_price).toFixed(2)}
                              <span className="ml-1 opacity-50">(${pricing.dinner_price}/ea)</span>
                            </span>
                          )}
                        </div>



                        {/* Guide */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={svcGuide} onChange={e => {
                                setSvcGuide(e.target.checked);
                                if (e.target.checked) {
                                  setSvcGuidePrice(pricing?.guide_price || 0);
                                  setSvcGuideNames(['']);
                                }
                              }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                              <span className="text-sm font-bold text-slate-900">Guide Service</span>
                            </label>
                            {svcGuide && (
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setSvcGuidePrice(v => Math.max(0, v - 5))} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-sm transition-all shadow-sm">－</button>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">$</span>
                                  <input
                                    type="number"
                                    value={svcGuidePrice}
                                    onChange={e => setSvcGuidePrice(parseFloat(e.target.value) || 0)}
                                    className="w-20 pl-5 pr-2 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-black text-indigo-600 focus:border-indigo-500 outline-none text-center"
                                  />
                                </div>
                                <button type="button" onClick={() => setSvcGuidePrice(v => v + 5)} className="w-8 h-8 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-black text-sm transition-all shadow-sm">＋</button>
                              </div>
                            )}
                          </div>
                          {svcGuide && (
                            <div className="space-y-2">
                              {svcGuideNames.map((name, ni) => (
                                <div key={ni} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={name || ''}
                                    onChange={e => {
                                      const next = [...svcGuideNames];
                                      next[ni] = e.target.value;
                                      setSvcGuideNames(next);
                                    }}
                                    placeholder={`Guide ${ni + 1} name...`}
                                    className={`flex-1 px-3 py-2 border-2 ${!name.trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-sm font-bold text-black focus:border-indigo-500 transition-all`}
                                  />
                                  {svcGuideNames.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSvcGuideNames(v => v.filter((_, i) => i !== ni));
                                        setSvcGuidePrice(v => Math.max(0, v - (pricing?.guide_price || 0)));
                                      }}
                                      className="text-rose-500 hover:text-rose-600 font-black text-xl px-1"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setSvcGuideNames(v => [...v, '']);
                                  setSvcGuidePrice(v => v + (pricing?.guide_price || 0));
                                }}
                                className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all"
                              >
                                + Add Another Guide
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Transport */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={svcTransport} onChange={e => setSvcTransport(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Transport</span>
                          </label>
                          
                          {svcTransport && (
                            <div className="space-y-3">
                              {svcTransList.map((trans, ti) => (
                                <div key={ti} className="p-3 border border-slate-100 rounded-xl bg-slate-50/50 space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transfer {ti + 1}</span>
                                    {svcTransList.length > 1 && (
                                      <button type="button" onClick={() => setSvcTransList(v => v.filter((_, i) => i !== ti))} className="text-rose-600 hover:text-rose-700 font-bold text-xs">✕ Remove</button>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      value={trans.name}
                                      onChange={e => setSvcTransList(v => v.map((t, i) => i === ti ? { ...t, name: e.target.value } : t))}
                                      placeholder="Driver Name..."
                                      className={`w-full px-3 py-1.5 border-2 ${!trans.name.trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`}
                                    />
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        value={trans.details}
                                        onChange={e => setSvcTransList(v => v.map((t, i) => i === ti ? { ...t, details: e.target.value } : t))}
                                        placeholder="From/To details..."
                                        className={`flex-1 px-3 py-1.5 border-2 ${!trans.details.trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`}
                                      />
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-slate-400">$</span>
                                        <input
                                          type="number"
                                          value={trans.price}
                                          onChange={e => setSvcTransList(v => v.map((t, i) => i === ti ? { ...t, price: parseFloat(e.target.value) || 0 } : t))}
                                          placeholder="Price"
                                          className={`w-20 px-2 py-1.5 border-2 ${trans.price <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => setSvcTransList(v => [...v, { name: '', details: '', price: 0 }])}
                                className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all"
                              >
                                + Add Another Transfer
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Cooking Class */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={svcCooking} onChange={e => setSvcCooking(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                              <span className="text-sm font-bold text-slate-900">Cooking Class</span>
                            </label>
                            {svcCooking && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">$</span>
                                <input
                                  type="number"
                                  value={svcCookingPrice}
                                  onChange={e => setSvcCookingPrice(parseFloat(e.target.value) || 0)}
                                  placeholder="Price"
                                  className={`w-24 px-3 py-1.5 border-2 ${svcCookingPrice <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Laundry */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={svcLaundry} onChange={e => setSvcLaundry(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                              <span className="text-sm font-bold text-slate-900">Laundry Service</span>
                            </label>
                            {svcLaundry && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">$</span>
                                <input
                                  type="number"
                                  value={svcLaundryPrice}
                                  onChange={e => setSvcLaundryPrice(parseFloat(e.target.value) || 0)}
                                  placeholder="Price"
                                  className={`w-24 px-3 py-1.5 border-2 ${svcLaundryPrice <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleSaveServices}
                        disabled={loadingAction === 'saveservices'}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                      >
                        {loadingAction === 'saveservices' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
                        Update All Services
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Extra Services */}
              {(canCheckOut || sel.status === 'checked_in') && (userRole === 'Manager' || userRole === 'CEO') && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Extra Services</p>
                  <button onClick={() => setShowDrinks(v => !v)} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">{showDrinks ? '− Hide Drinks' : '+ Add Drinks'}</button>
                  {showDrinks && drinks.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {drinks.map(d => (
                        <div key={d.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <span className="text-xs text-black flex-1 truncate">{d.name}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedDrinks(p => ({ ...p, [d.id]: Math.max(0, (p[d.id] || 0) - 1) }))} className="w-5 h-5 rounded bg-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-300">−</button>
                            <span className="w-5 text-center text-xs font-bold text-black">{selectedDrinks[d.id] || 0}</span>
                            <button onClick={() => setSelectedDrinks(p => ({ ...p, [d.id]: (p[d.id] || 0) + 1 }))} className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 text-xs font-bold hover:bg-indigo-200">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="text" value={newExtraName} onChange={e => setNewExtraName(e.target.value)} placeholder="Service name"
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black" />
                    <input type="number" value={newExtraPrice} onChange={e => setNewExtraPrice(e.target.value)} placeholder="Price"
                      className="w-20 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none text-black" />
                    <button onClick={() => { if (!newExtraName.trim()) return; setExtraServices(p => [...p, { name: newExtraName.trim(), price: newExtraPrice, currency: collectedCurrency }]); setNewExtraName(''); setNewExtraPrice(''); }}
                      className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">Add</button>
                  </div>
                  {extraServices.length > 0 && (
                    <div className="space-y-1">
                      {extraServices.map((s, i) => (
                        <div key={i} className="flex justify-between items-center text-xs bg-indigo-50 px-3 py-1.5 rounded-lg">
                          <span className="text-black">{s.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-700">{s.price} {s.currency}</span>
                            <button onClick={() => setExtraServices(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 font-bold">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Grand Total Tab */}
              {(userRole === 'Manager' || userRole === 'CEO') && (
                <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-xl shadow-indigo-200 animate-in fade-in zoom-in duration-500">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Final Tab (Total Sum)</p>
                    <svg className="w-5 h-5 text-indigo-300 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center opacity-90 border-b border-white/20 pb-2 mb-2">
                      <span className="font-bold">Accommodation</span>
                      <span className="font-black">${svcAmount.toFixed(2)}</span>
                    </div>
                    
                    {(() => {
                      const sTotal = (
                        (svcLunch ? svcLunchCount * (pricing?.lunch_price || 0) : 0) +
                        (svcDinner ? svcDinnerCount * (pricing?.dinner_price || 0) : 0) +
                        (svcGuide ? svcGuidePrice : 0) +
                        (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
                        (svcLaundry ? svcLaundryPrice : 0) +
                        (svcCooking ? svcCookingPrice : 0)
                      );
                      if (sTotal <= 0) return null;
                      return (
                        <div className="flex justify-between items-center opacity-90">
                          <span className="font-bold">Services & Food</span>
                          <span className="font-black">${sTotal.toFixed(2)}</span>
                        </div>
                      );
                    })()}

                    {(() => {
                      const dTotal = Object.entries(selectedDrinks).reduce((sum, [id, qty]) => {
                        const drink = drinks.find(d => d.id === parseInt(id));
                        return sum + (qty * (drink?.sold_price || 0));
                      }, 0);
                      if (dTotal <= 0) return null;
                      return (
                        <div className="flex justify-between items-center opacity-90">
                          <span className="font-bold">Drinks Tab</span>
                          <span className="font-black">${dTotal.toFixed(2)}</span>
                        </div>
                      );
                    })()}

                    {(() => {
                      const eTotal = extraServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
                      if (eTotal <= 0) return null;
                      return (
                        <div className="flex justify-between items-center opacity-90">
                          <span className="font-bold">Extra Services</span>
                          <span className="font-black">${eTotal.toFixed(2)}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="mt-4 pt-4 border-t border-indigo-400 flex justify-between items-end">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300 leading-none">Grand Total</p>
                        <span className="text-[8px] font-black bg-white/20 px-1.5 py-0.5 rounded text-white/80 uppercase">Supposed to pay</span>
                      </div>
                      <p className="text-3xl font-black tracking-tighter leading-none mb-2">
                        ${gTotal.toFixed(2)}
                      </p>
                      
                      {/* Live Math */}
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-200 bg-black/10 rounded-lg px-2 py-1.5 w-fit">
                        <span>${gTotal.toFixed(2)}</span>
                        <span className="opacity-50">−</span>
                        <span className={tPaidUsd > 0 ? 'text-white' : ''}>${tPaidUsd.toFixed(2)} (Paid)</span>
                        <span className="opacity-50">=</span>
                        {Math.abs(balance) < 0.01 ? (
                          <span className="text-emerald-300 font-black">PAYMENT DONE</span>
                        ) : (
                          <span className={balance > 0 ? 'text-rose-300' : 'text-sky-300'}>
                            ${Math.abs(balance).toFixed(2)} {balance > 0 ? 'REMAINING' : 'CHANGE'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-white/10 ml-4">
                      <p className="text-[10px] font-bold text-indigo-100">USD</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Collection */}
              {(userRole === 'Manager' || userRole === 'CEO') && (
                <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Collection</p>
                    {balance > 0.01 ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100 animate-pulse">
                        Remaining: ${balance.toFixed(2)}
                      </span>
                    ) : balance < -0.01 ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                        Change: ${Math.abs(balance).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                        ✓ Fully Paid
                      </span>
                    )}
                  </div>

                  <div className="space-y-4">
                    {svcPayList.map((pay, pi) => {
                      const usdAmt = parseFloat(pay.amount) || 0;
                      const currentRate = pay.currency === 'USD' ? 1 : (pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                      const guestPays = usdAmt * currentRate;

                      return (
                        <div key={pi} className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2 duration-300">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment {pi + 1}</label>
                            {svcPayList.length > 1 && (
                              <button onClick={() => setSvcPayList(v => v.filter((_, i) => i !== pi))} className="text-[10px] font-bold text-rose-500 hover:text-rose-700">✕ Remove</button>
                            )}
                          </div>

                          <div className="grid grid-cols-12 gap-3 items-end">
                            {/* Amount Due in this currency */}
                            <div className="col-span-12">
                              <div className="flex items-center justify-between px-3 py-2 bg-slate-100 rounded-xl border border-slate-200">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount Due in {pay.currency}</span>
                                <span className="text-xs font-black text-indigo-600">
                                  {(balance * currentRate).toLocaleString(undefined, { minimumFractionDigits: pay.currency === 'UZS' ? 0 : 2, maximumFractionDigits: pay.currency === 'UZS' ? 0 : 2 })} {pay.currency}
                                </span>
                              </div>
                            </div>

                            {/* USD Target */}
                            <div className="col-span-4 space-y-1.5">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                                {svcPayList.length === 1 ? 'Total Bill' : 'Amount (USD)'}
                              </span>
                              <div className="relative">
                                <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold ${pay.currency === 'UZS' ? 'text-[9px]' : 'text-xs'}`}>
                                  {pay.currency === 'USD' ? '$' : pay.currency === 'UZS' ? 'SUM' : '€'}
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={pay.amount || ''}
                                  onChange={e => {
                                    const valStr = e.target.value;
                                    setPayModified(true);
                                    setSvcPayList(v => v.map((p, i) => i === pi ? { ...p, amount: valStr } : p));
                                  }}
                                  placeholder="0.00"
                                  className={`w-full ${pay.currency === 'UZS' ? 'pl-9' : 'pl-6'} py-3 bg-white border-2 border-slate-200 rounded-2xl text-base font-black text-black focus:border-indigo-500 outline-none transition-all shadow-sm`}
                                />
                              </div>
                            </div>

                            {/* Currency Selector */}
                            <div className="col-span-3 space-y-1.5">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Pay in</span>
                              <select 
                                value={pay.currency}
                                onChange={e => setSvcPayList(v => v.map((p, i) => i === pi ? { ...p, currency: e.target.value as any } : p))}
                                className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-indigo-600 outline-none"
                              >
                                <option value="USD">USD ($)</option>
                                <option value="UZS">UZS (Sum)</option>
                                <option value="EUR">EUR (€)</option>
                              </select>
                            </div>

                            {/* Method Selector */}
                            <div className="col-span-5 space-y-1.5">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Method</span>
                              <div className="flex gap-1.5">
                                {(['Cash', 'Card/Online'] as const).map(m => (
                                  <button
                                    key={m}
                                    onClick={() => setSvcPayList(v => v.map((p, i) => i === pi ? { ...p, method: m } : p))}
                                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all border-2 ${
                                      pay.method === m 
                                        ? 'bg-indigo-600 border-indigo-600 text-white' 
                                        : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-100 hover:text-indigo-500'
                                    }`}
                                  >
                                    {m === 'Card/Online' ? 'Card' : m}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Guest Pays (Result) */}
                            <div className="col-span-12 space-y-1.5">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Guest Pays</span>
                              <div className="px-4 py-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100 flex justify-between items-center border border-white/20">
                                <span className="text-sm font-black tracking-tight">
                                  {guestPays.toLocaleString(undefined, { minimumFractionDigits: pay.currency === 'UZS' ? 0 : 2, maximumFractionDigits: pay.currency === 'UZS' ? 0 : 2 })}
                                </span>
                                <span className="text-[10px] font-black opacity-80 uppercase tracking-widest">{pay.currency}</span>
                              </div>
                            </div>
                          </div>

                          {/* Rate Control (Only for non-USD) */}
                          {pay.currency !== 'USD' && pricing && (
                            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 mt-2">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">
                                Conversion: $1 = {currentRate.toLocaleString()} {pay.currency}
                              </p>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="text-[9px] font-black text-slate-400 uppercase whitespace-nowrap">1 USD =</span>
                                  <input
                                    type="number"
                                    value={pay.currency === 'UZS' ? pricing.usd_to_uzs : pricing.usd_to_eur}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setPricing((prev) => prev ? { ...prev, [pay.currency === 'UZS' ? 'usd_to_uzs' : 'usd_to_eur']: val } : prev);
                                    }}
                                    className="w-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-indigo-600 outline-none"
                                  />
                                  <span className="text-[9px] font-black text-slate-400 uppercase">{pay.currency}</span>
                                </div>
                                <button 
                                  onClick={() => fetchCbuRate(pay.currency as 'UZS' | 'EUR')}
                                  disabled={fetchingRate === pay.currency}
                                  className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-lg hover:bg-indigo-100 transition-all flex items-center gap-1 disabled:opacity-50 border border-indigo-100"
                                >
                                  {fetchingRate === pay.currency ? '...' : 'Fetch CBU Rate'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      onClick={() => setSvcPayList(v => [...v, { amount: '', currency: 'USD', method: 'Cash' }])}
                      className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-2 bg-slate-50/30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      Add Another Currency
                    </button>

                    <button
                      onClick={() => setShowFinalReceipt(true)}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Paid
                    </button>
                  </div>
                </div>
              )}

              {/* Receipt / Confirmation Modal */}
              {showFinalReceipt && sel && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowFinalReceipt(false)} />
                  <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-indigo-600 px-6 py-8 text-white text-center relative">
                      <div className="absolute top-4 right-4">
                        <button onClick={() => setShowFinalReceipt(false)} className="text-white/60 hover:text-white transition-all text-2xl font-bold">×</button>
                      </div>
                      <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Final Receipt</h3>
                      <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mt-1">Payment Summary</p>
                    </div>

                    <div className="p-6 space-y-4">
                      <div className="space-y-2 border-b border-slate-100 pb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-bold">Guest</span>
                          <span className="text-slate-900 font-black">{sel.guest_name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 font-bold">Stay</span>
                          <span className="text-slate-900 font-black">{sel.check_in} → {sel.check_out}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Charges Breakdown</p>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Accommodation</span>
                            <span className="text-slate-900 font-bold">${svcAmount.toFixed(2)}</span>
                          </div>
                          {sTotal > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Services & Food</span>
                              <span className="text-slate-900 font-bold">${sTotal.toFixed(2)}</span>
                            </div>
                          )}
                          {dTotal > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Drinks Tab</span>
                              <span className="text-slate-900 font-bold">${dTotal.toFixed(2)}</span>
                            </div>
                          )}
                          {eTotal > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Extra Services</span>
                              <span className="text-slate-900 font-bold">${eTotal.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-indigo-50 rounded-2xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total Bill (USD)</span>
                          <span className="text-xl font-black text-indigo-700">
                            ${gTotal.toFixed(2)}
                          </span>
                        </div>
                        
                        <div className="pt-2 border-t border-indigo-100">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Collected Money</p>
                          <div className="space-y-1.5">
                            {svcPayList.map((p, i) => (
                              <div key={i} className="flex justify-between text-xs font-bold text-slate-700">
                                <span>{p.currency}</span>
                                <span>{parseFloat(p.amount || '0').toLocaleString(undefined, { minimumFractionDigits: p.currency === 'UZS' ? 0 : 2 })} {p.currency}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {Math.abs(balance) > 0.01 && (
                          <div className={`pt-2 border-t ${balance > 0 ? 'border-rose-100' : 'border-indigo-100'} flex justify-between items-center`}>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${balance > 0 ? 'text-rose-500' : 'text-indigo-500'}`}>
                              {balance > 0 ? 'Remaining' : 'Change Due'}
                            </span>
                            <span className={`text-sm font-black ${balance > 0 ? 'text-rose-600' : 'text-indigo-600'}`}>
                              ${Math.abs(balance).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={async () => {
                          setShowFinalReceipt(false);
                          await handleCheckOut();
                        }}
                        disabled={loadingAction === 'checkout'}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2"
                      >
                        {loadingAction === 'checkout' ? <span className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" /> : 'Confirm & Check Out'}
                      </button>
                      <p className="text-[10px] text-center text-slate-400 font-bold">This action is permanent and cannot be undone.</p>
                    </div>
                  </div>
                </div>
              )}



              {(sel.notes || sel.description) && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-black whitespace-pre-wrap">{sel.notes || sel.description}</p>
                </div>
              )}
            </>
          );
        })()}
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
}
