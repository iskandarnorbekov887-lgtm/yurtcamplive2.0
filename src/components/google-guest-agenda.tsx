'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';

import { supabase, type Booking, type UserRole } from '@/lib/supabase';
import { PrivateCalendarView } from '@/components/private-calendar-view';
import { BookingModal } from '@/components/BookingModal';
import { 
  localDateStr, 
  formatSpace, 
  isGcCancelled, 
  handleApproveDatesLogic,
  sanitizeNotes
} from '@/utils/calendar-logic';
import { sendDateChangeNotification } from '@/utils/notify';


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

interface Drink {
  id: number;
  name: string;
  original_price: number;
  sold_price: number;
  currency: 'UZS' | 'USD' | 'EUR';
  available: boolean;
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
  userRole?: UserRole;
  currentUserId?: string;
  onCheckIn?: (id: number) => Promise<void> | void;
  onCheckOut?: (id: number) => Promise<void> | void;
  onUpdateBooking?: (id: number, data: Partial<Booking>) => Promise<void> | void;
  onCancelBooking?: (id: number) => Promise<void> | void;
  onAddNewBooking?: (data: Partial<Booking>) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
}


export function GoogleGuestAgenda({
  bookings, userRole, currentUserId, onCheckIn, onCheckOut, onUpdateBooking, onCancelBooking, onAddNewBooking, onRefresh,
}: Props) {
  const [gcEvents, setGcEvents] = useState<CalEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const sel = selectedItem?.booking ?? null;

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
  const [svcChildren, setSvcChildren] = useState(0);
  const [svcAmount, setSvcAmount] = useState(0);
  const [svcDiscount, setSvcDiscount] = useState(0);
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
  const [isPrepaid, setIsPrepaid] = useState(false); // Toggle for prepaid accommodation
  const [isLunchPrepaid, setIsLunchPrepaid] = useState(false);
  const [isDinnerPrepaid, setIsDinnerPrepaid] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(localDateStr(new Date()));
  const [nowTime, setNowTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const currentHour = nowTime.getHours();
  const currentMinute = nowTime.getMinutes();
  const isAfterNoon = currentHour >= 12;
  const isAfterTwo = currentHour >= 14;
  const [editingDates, setEditingDates] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [showServices, setShowServices] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  
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
  const [showFinalReceipt, setShowFinalReceipt] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [historyPayments, setHistoryPayments] = useState<any[]>([]);
  const [dateAdjAmount, setDateAdjAmount] = useState('');
  const [dbSettledReceipts, setDbSettledReceipts] = useState<any[]>([]);

  useEffect(() => {
    if (sel?.id) {
      const loadHistory = async () => {
        const { data } = await supabase.from('payments').select('*').eq('booking_id', sel.id).order('created_at', { ascending: false });
        setHistoryPayments(data || []);
      };
      loadHistory();
    } else {
      setHistoryPayments([]);
    }
  }, [sel?.id, showFinalReceipt]);

  useEffect(() => {
    if (!sel?.id) { setDbSettledReceipts([]); return; }
    const loadReceipts = async () => {
      try {
        const { data } = await supabase
          .from('booking_receipts')
          .select('*')
          .eq('booking_id', sel.id)
          .order('created_at', { ascending: false });
        const rows = (data as any[]) || [];
        const snapshots = rows.map(r => r.snapshot).filter(Boolean);
        setDbSettledReceipts(snapshots);
      } catch {
        // Table may not exist yet in some environments; fall back to special_requests
        setDbSettledReceipts([]);
      }
    };
    loadReceipts();
  }, [sel?.id, sel?.collected_amount, sel?.special_requests]);

  const getSettledReceiptsForSel = () => {
    if (dbSettledReceipts.length) return dbSettledReceipts;
    let meta: any = {};
    try {
      if (!sel?.special_requests) return [];
      const parsed = typeof sel.special_requests === 'string'
        ? JSON.parse(sel.special_requests || '{}')
        : (sel.special_requests || {});
      meta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
      const receipts = meta.settled_receipts || [];
      // Sort by settled_at date so oldest tab is first
      return receipts.sort((a: any, b: any) => {
        const dateA = new Date(a.settled_at || a.date).getTime();
        const dateB = new Date(b.settled_at || b.date).getTime();
        return dateA - dateB;
      });
    } catch (err) {
      console.error('Metadata parse error:', err);
      return [];
    }
  };
  
  const DEFAULT_PRICING = {
    lunch_price: 10,
    dinner_price: 10,
    guide_price: 40,
    usd_to_uzs: 12500,
    usd_to_eur: 0.92
  };
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [valError, setValError] = useState<string | null>(null);

  // Calculate totals at top level for scope availability
  const sTotal_calc = (
    (svcLunch && !isLunchPrepaid ? svcLunchCount * (pricing.lunch_price) : 0) +
    (svcDinner && !isDinnerPrepaid ? svcDinnerCount * (pricing.dinner_price) : 0) +
    (svcGuide ? svcGuidePrice : 0) +
    (svcTransport ? svcTransList.reduce((s: number, t: any) => s + (t.price || 0), 0) : 0) +
    (svcLaundry ? svcLaundryPrice : 0) +
    (svcCooking ? svcCookingPrice : 0)
  );
  const dTotal_calc = Object.entries(selectedDrinks).reduce((sum: number, [id, qty]: [string, number]) => {
    const drink = drinks.find((d: any) => d.id === parseInt(id));
    return sum + (qty * (drink?.sold_price || 0));
  }, 0);
  const eTotal_calc = extraServices.reduce((sum: number, s: any) => sum + (parseFloat(s.price) || 0), 0);
  const gTotal = Math.max(0, (isPrepaid ? 0 : svcAmount) + sTotal_calc + dTotal_calc + eTotal_calc - svcDiscount);
  
  const tPaidUsd = svcPayList.reduce((sum, p) => {
    const amt = parseFloat(p.amount) || 0;
    if (p.currency === 'USD') return sum + amt;
    const rate = p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92);
    return sum + (amt / rate);
  }, 0);
  
  const prepaidLunchAmt = isLunchPrepaid && svcLunch ? svcLunchCount * (pricing?.lunch_price || 0) : 0;
  const prepaidDinnerAmt = isDinnerPrepaid && svcDinner ? svcDinnerCount * (pricing?.dinner_price || 0) : 0;

  // Logic for what is ALREADY accounted for (Pre-paid or DB)
  // For the active tab, we only care about pre-paid items for THIS tab.
  // Previous stay payments (sel.collected_amount) should NOT offset the current tab's items.
  // MATCH BALANCE should always get the current open tab (gTotal)
  const debtRemaining = gTotal;

  const canFinalize = isPrepaid || (svcAmount > 0) || (sTotal_calc + dTotal_calc + eTotal_calc > 0);
  const isBalanceMatched = Math.abs(tPaidUsd - debtRemaining) < 1.00;
  
  const today = localDateStr(new Date());

  useEffect(() => {
    fetchPricing();
  }, []);

  async function fetchPricing() {
    try {
      const { data } = await supabase.from('service_pricing').select('*').eq('id', 1);
      if (data && data.length > 0) {
        setPricing({
          ...DEFAULT_PRICING,
          ...data[0]
        });
      }
    } catch (err) {
      console.error('Error fetching pricing:', err);
    }
  }

  useEffect(() => {
    fetch('/api/calendar/events', { cache: 'no-store' })
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
                let m: any = {};
                try {
                  const parsed = typeof b.special_requests === 'string' ? JSON.parse(b.special_requests || '{}') : (b.special_requests || {});
                  m = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
                  if (!m.is_manual_dates) {
                    warnings[b.id] = 'dates_changed';
                  }
                } catch {
                  warnings[b.id] = 'dates_changed';
                }
            }
          });
          setSyncWarnings(warnings);

          // Auto-notify Managers about date changes
          bookings.filter(b => b.google_event_id && b.check_in >= cutoff).forEach(b => {
            const ev = events.find(e => e.id === b.google_event_id);
            if (ev && (ev.start !== b.check_in || ev.end !== b.check_out)) {
              let m: any = {};
              try {
                const parsed = typeof b.special_requests === 'string' ? JSON.parse(b.special_requests || '{}') : (b.special_requests || {});
                m = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
                if (!m.is_manual_dates) {
                  sendDateChangeNotification(
                    b.id,
                    b.guest_name,
                    { checkIn: b.check_in, checkOut: b.check_out },
                    { checkIn: ev.start, checkOut: ev.end }
                  );
                }
              } catch { /* skip */ }
            }
          });

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
    if (toSync.length === 0) { setTimeout(() => setDidSyncNotes(true), 0); return; }
    (async () => {
      for (const b of toSync) {
        const ev = gcEvents.find(e => e.id === b.google_event_id)!;
        const live = cleanDesc(ev.description);
        try { await supabase.from('bookings').update({ notes: live }).eq('id', b.id); }
        catch (err) { console.error('Notes sync failed for booking', b.id, err); }
      }
      setTimeout(() => setDidSyncNotes(true), 0);
      onRefresh?.();
    })();
  }, [gcEvents, bookings, didSyncNotes, onRefresh]);

  useEffect(() => {
    if (selectedItem?.booking) {
      const updated = bookings.find(b => b.id === selectedItem.booking!.id);
      if (updated) {
        // Deep compare to prevent unnecessary re-renders that could close modals
        const currentStr = JSON.stringify(selectedItem.booking);
        const updatedStr = JSON.stringify(updated);
        if (currentStr !== updatedStr) {
          setTimeout(() => setSelectedItem(prev => prev ? { ...prev, booking: updated } : prev), 0);
        }
      }
    }
  }, [bookings, selectedItem?.booking]);

  // Reset receipt view only when guest ID actually changes
  useEffect(() => {
    setTimeout(() => setSelectedReceipt(null), 0);
  }, [sel?.id]);

  // --- AUTO-CHECKOUT WORKER ---
  useEffect(() => {
    if (!onCheckOut) return;
    const checkAutoCO = async () => {
      const now = new Date();
      const todayStr = localDateStr(now);
      const isPostNoon = now.getHours() >= 12;
      
      // Auto-checkout if:
      // 1. Status is 'checked_in'
      // 2. Checkout day is BEFORE today (past days)
      // 3. Debt is basically 0
      const toAutoCO = bookings.filter(b => {
        if (b.status !== 'checked_in') return false;
        if (b.check_out >= todayStr) return false; // Stay active if checkout is today or future
        const debt = (b.total_price || 0) - (b.collected_amount || 0);
        return debt < 1.00;
      });
      
      for (const b of toAutoCO) {
        try {
          await onCheckOut(b.id);
          console.log(`Auto-checked out settled guest: ${b.guest_name}`);
        } catch (e) {
          console.error('Auto-checkout failed for', b.id, e);
        }
      }
    };
    
    const interval = setInterval(checkAutoCO, 300000); // Run every 5 minutes
    checkAutoCO();
    return () => clearInterval(interval);
  }, [bookings, onCheckOut]);




  const calendarOnlyItems = useMemo(() => gcEvents
    .filter(ev => !bookings.some(b => b.google_event_id === ev.id))
    .map(ev => ({ key: `ev-${ev.id}`, name: ev.summary, start: ev.start, end: ev.end, source: 'calendar' as const, booking: null, event: ev })), [gcEvents, bookings]);

  const bookingItems = useMemo(() => bookings.map(b => {
    const linkedEv = gcEvents.find(e => e.id === b.google_event_id) || null;
    
    // THE FIX: If manual dates are on, use DB dates. Otherwise, use Google.
    const displayStart = b.is_manual_dates ? b.check_in : (linkedEv?.start || b.check_in);
    const displayEnd = b.is_manual_dates ? b.check_out : (linkedEv?.end || b.check_out);

    const effB: Booking = b.status === 'confirmed' && linkedEv && isGcCancelled(linkedEv)
      ? { ...b, status: 'cancelled', check_in: displayStart, check_out: displayEnd }
      : { ...b, check_in: displayStart, check_out: displayEnd };

    return {
      key: `db-${b.id}`, name: effB.guest_name, start: effB.check_in, end: effB.check_out,
      source: 'db' as const, booking: effB, event: linkedEv,
    };
  }), [bookings, gcEvents]);

  const D = selectedCalendarDay;

  const arrivingItems = useMemo(() => [
    ...bookingItems.filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in === D),
    ...calendarOnlyItems.filter(i => i.event!.start === D && !isGcCancelled(i.event!)),
  ].sort((a, b) => a.start.localeCompare(b.start)), [bookingItems, calendarOnlyItems, D]);

  const stayingItems = useMemo(() => bookingItems
    .filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in < D && i.booking!.check_out > D)
    .sort((a, b) => a.start.localeCompare(b.start)), [bookingItems, D]);

  const checkedInItems = useMemo(() => bookingItems
    .filter(i => i.booking!.status === 'checked_in' && i.booking!.check_in <= D && i.booking!.check_out > D)
    .sort((a, b) => a.start.localeCompare(b.start)), [bookingItems, D]);

  const checkingOutItems = useMemo(() => bookingItems
    .filter(i => i.booking!.status === 'checked_in' && i.booking!.check_out === D)
    .sort((a, b) => a.start.localeCompare(b.start)), [bookingItems, D]);

  const checkedOutItems = useMemo(() => bookingItems
    .filter(i => i.booking!.status === 'completed' && i.booking!.check_out === D)
    .sort((a, b) => b.start.localeCompare(a.start)), [bookingItems, D]);

  const cancelledItems = useMemo(() => [
    ...bookingItems.filter(i => i.booking!.status === 'cancelled' && i.booking!.check_in <= D && i.booking!.check_out > D),
    ...calendarOnlyItems.filter(i => isGcCancelled(i.event!) && i.event!.start <= D && i.event!.end > D),
  ].sort((a, b) => b.start.localeCompare(a.start)), [bookingItems, calendarOnlyItems, D]);

  const gcEventsOnDay = useMemo(() => calendarOnlyItems.filter(i => i.event!.start <= D && i.event!.end > D && !isGcCancelled(i.event!) && i.event!.start !== D), [calendarOnlyItems, D]);

  const renderCard = (item: ListItem, isCancelled: boolean) => {
    const isSelected = selectedItem?.key === item.key;
    const booking = item.booking;
    const showApprove = !!booking && booking.status === 'checked_in' && syncWarnings[booking.id] === 'dates_changed' && userRole === 'Manager';
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
              {booking ? <p className="text-xs text-slate-500">Booking</p> : <p className="text-xs text-slate-400">calendar only</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {isCancelled
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">cancelled</span>
                : booking && (
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusColor(booking.status, booking)}`}>{String(booking.status).replace('_', ' ')}</span>
                    </div>
                  )
              }
              {booking && syncWarnings[booking.id] === 'deleted' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">⚠ removed</span>
              )}
              {booking && syncWarnings[booking.id] === 'dates_changed' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚠ dates ≠</span>
              )}
              {booking?.status === 'checked_in' && booking.check_out === today && (
                <>
                  {isAfterTwo ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">⚠ OVERDUE (2PM+)</span>
                  ) : isAfterNoon ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">⚠ LATE (12PM+)</span>
                  ) : (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 border border-indigo-200 italic">Auto-CO @ 11:59</span>
                  )}
                </>
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
            {loadingAction === `syncdates-${booking.id}` ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '⇵'}
            Approve dates
          </button>
        )}
      </div>
    );
  };

  const statusColor = (s?: string, booking?: any) => {
    // Check if this is a system-only booking
    let isSystemOnly = false;
    if (booking) {
      if (booking.source === 'System') {
        isSystemOnly = true;
      } else {
        try {
          const meta = typeof booking.special_requests === 'string' 
            ? JSON.parse(booking.special_requests || '{}') 
            : (booking.special_requests || {});
          if (meta.is_system_only) isSystemOnly = true;
        } catch {}
      }
    }

    // System bookings use purple styling
    if (isSystemOnly) {
      return 'bg-purple-100 text-purple-700 border border-purple-200';
    }

    return {
      checked_in: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      confirmed: 'bg-amber-100 text-amber-700 border border-amber-200',
      completed: 'bg-blue-100 text-blue-700 border border-blue-200',
      cancelled: 'bg-red-100 text-red-700 border border-red-200',
      pending: 'bg-slate-100 text-slate-600 border border-slate-200',
      no_arrival: 'bg-gray-200 text-gray-600 border border-gray-300',
    }[s ?? ''] ?? 'bg-slate-100 text-slate-500';
  };

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
    await handleApproveDatesLogic({
      booking,
      gcEvents,
      onUpdateBooking: onUpdateBooking as any,
      setLoadingAction,
      setSyncWarnings,
      flash,
      onRefresh: onRefresh as any
    });
  };

  const handleCreateFromEvent = async (doCheckIn = false) => {
    if (!selectedItem?.event) { flash('⚠ No event selected.'); return; }
    if (!currentUserId) { flash('⚠ Not logged in — please refresh and try again.'); return; }
    const ev = selectedItem.event;
    setLoadingAction('creating');
    try {
      // COLLISION GUARD: No Double Copies
      const { data: existing } = await supabase.from('bookings').select('*').eq('google_event_id', ev.id).maybeSingle();
      if (existing) {
        flash('⚠ Booking already exists — opening existing record.');
        handleSelect({ key: `db-${existing.id}`, name: existing.guest_name, start: existing.check_in, end: existing.check_out, source: 'db', booking: existing as Booking, event: ev });
        return;
      }

      const payload: any = {
        guest_name: String(ev.summary || "Unnamed Guest"),
        check_in: String(ev.start),
        check_out: String(ev.end || ev.start),
        status: doCheckIn ? 'checked_in' : 'confirmed',
        source: 'Manual',
        google_event_id: String(ev.id),
        total_price: 0,
        number_of_people: 1,
        payment_status: 'Unpaid',
        approved_by_manager: true,
        created_by_id: String(currentUserId),
        notes: sanitizeNotes(ev.description),
      };

      const { data: inserted, error: insertErr } = await supabase.from('bookings').insert(payload).select().single();
      if (insertErr) throw new Error(insertErr.message);
      
      const insertedId = inserted?.id;
      if (doCheckIn && insertedId && onCheckIn) await onCheckIn(insertedId);
      flash(doCheckIn ? '✓ Guest checked in from calendar event.' : '✓ Booking created from calendar event.');
      setSelectedItem(null);
      if (onRefresh) await onRefresh();
    } catch (e: any) {
      console.error('Create from event error:', e);
      flash(`⚠ ${String(e.message || e).slice(0, 100)}`);
    } finally { setLoadingAction(''); }
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
    setShowServices(false); setShowFinalReceipt(false); setShowNotes(true); 
    
    if (item.booking) {
      const b = item.booking;
      let existingDays: DayEntry[] = [];
      let draft: any = null;
      try { 
        if (b.special_requests) {
          const parsed = JSON.parse(b.special_requests);
          if (Array.isArray(parsed)) {
            existingDays = parsed;
          } else {
            existingDays = parsed.days || [];
            draft = parsed.draft || null;
          }
        }
      } catch (e) { console.error('Failed to parse special_requests', e); }
      
      const ci = new Date(b.check_in + 'T00:00:00');
      const co = new Date(b.check_out + 'T00:00:00');
      const numNights = Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86400000));
      const entries: DayEntry[] = [];
      for (let i = 0; i <= numNights; i++) {
        const d = new Date(ci); d.setDate(d.getDate() + i);
        const ds = localDateStr(d);
        const found = existingDays.find(ex => ex.date === ds);
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

      const receipts = getSettledReceiptsForSel();
      const hasSettled = receipts.length > 0 || (b.collected_amount || 0) > 0;

      // Load draft/saved states with priority for draft
      setIsPrepaid(draft?.isPrepaid ?? (hasSettled ? true : (b.payment_note?.includes('Accommodation') || false)));
      setIsLunchPrepaid(draft?.isLunchPrepaid ?? (b.payment_note?.includes('Lunch') || false));
      setIsDinnerPrepaid(draft?.isDinnerPrepaid ?? (b.payment_note?.includes('Dinner') || false));
      
      setSvcLunch(draft?.svcLunch ?? b.lunch ?? false);
      setSvcLunchCount(draft?.svcLunchCount ?? b.lunch_count ?? 0);
      setSvcDinner(draft?.svcDinner ?? b.dinner ?? false);
      setSvcDinnerCount(draft?.svcDinnerCount ?? b.dinner_count ?? 0);
      setSvcGuide(draft?.svcGuide ?? b.guide_service ?? false);
      setSvcGuideNames(draft?.svcGuideNames ?? (b.guide_names ? b.guide_names.split(', ') : ['']));
      setSvcGuidePrice(draft?.svcGuidePrice ?? (parseFloat(b.guide_amount || '0') || (pricing.guide_price)));
      setSvcTransport(draft?.svcTransport ?? b.has_transportation ?? false);
      
      if (draft?.svcTransList) {
        setSvcTransList(draft.svcTransList);
      } else {
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
          setSvcTransList([{ name: '', details: '', price: 0 }]);
        }
      }

      setSvcCooking(draft?.svcCooking ?? b.cooking_class ?? false);
      setSvcCookingPrice(draft?.svcCookingPrice ?? (parseFloat(b.cooking_class_amount || '0') || 0));
      setSvcLaundry(draft?.svcLaundry ?? b.laundry ?? false);
      setSvcLaundryPrice(draft?.svcLaundryPrice ?? (parseFloat(b.laundry_price || '0') || 0));
      setSvcAdults(draft?.svcAdults ?? b.number_of_people ?? 1);
      setSvcChildren(draft?.svcChildren ?? b.children_under_12 ?? 0);
      
      // If already settled Tab 1, new tab starts at $0 accommodation by default
      setSvcAmount(draft?.svcAmount ?? (hasSettled ? 0 : Math.max(0, b.total_price - (b.collected_amount || 0))));

      setSvcDiscount(draft?.svcDiscount ?? 0);

      // Always start with a fresh payment input list for the current tab
      setSvcPayList([{ amount: '', currency: b.collected_currency || 'USD', method: 'Cash' }]);
      setPayModified(false);
    } else {
      setDayEntries([]);
      setSvcLunch(false); setSvcLunchCount(0);
      setSvcDinner(false); setSvcDinnerCount(0);
      setSvcGuide(false); setSvcGuideNames(['']); setSvcGuidePrice(40);
      setSvcTransport(false); setSvcTransList([{ name: '', details: '', price: 0 }]);
      setSvcCooking(false); setSvcCookingPrice(0);
      setSvcLaundry(false); setSvcLaundryPrice(0);
      setSvcAdults(1); setSvcChildren(0);
      setSvcAmount(0);
      setSvcDiscount(0);
      setSvcPayList([{ amount: '0', currency: 'USD', method: 'Cash' }]);
      setPayModified(false);
    }
  };

  // AUTO-SAVE effect for "Choices" (Prepaid toggles, service selections)
  useEffect(() => {
    if (!sel || !onUpdateBooking) return;
    
    const timer = setTimeout(async () => {
      // Only auto-save if we are in an active session
      const draft = {
        isPrepaid, isLunchPrepaid, isDinnerPrepaid,
        svcLunch, svcLunchCount, svcDinner, svcDinnerCount,
        svcGuide, svcGuidePrice, svcGuideNames,
        svcTransport, svcTransList,
        svcCooking, svcCookingPrice,
        svcLaundry, svcLaundryPrice,
        svcAdults, svcChildren, svcAmount, svcDiscount
      };
      
      try {
        const payload = JSON.stringify({ days: dayEntries, draft });
        await supabase.from('bookings').update({ special_requests: payload }).eq('id', sel.id);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [
    sel?.id, isPrepaid, isLunchPrepaid, isDinnerPrepaid,
    svcLunch, svcLunchCount, svcDinner, svcDinnerCount,
    svcGuide, svcGuidePrice, svcGuideNames,
    svcTransport, svcTransList,
    svcCooking, svcCookingPrice,
    svcLaundry, svcLaundryPrice,
    svcAdults, svcChildren, svcAmount, svcDiscount,
    dayEntries
  ]);

  const updateDay = (index: number, updates: Partial<DayEntry>) =>
    setDayEntries(prev => prev.map((d, i) => i === index ? { ...d, ...updates } : d));

  const updateDayGuideName = (dayIndex: number, nameIndex: number, value: string) =>
    setDayEntries(prev => { const days = [...prev]; const names = [...days[dayIndex].guideNames]; names[nameIndex] = value; days[dayIndex] = { ...days[dayIndex], guideNames: names }; return days; });

  const updateDayTransEntry = (dayIndex: number, ei: number, field: string, value: string) =>
    setDayEntries(prev => { const days = [...prev]; const ents = [...days[dayIndex].transEntries]; ents[ei] = { ...ents[ei], [field]: value }; days[dayIndex] = { ...days[dayIndex], transEntries: ents }; return days; });

  const daysUntilCheckIn = sel
    ? Math.ceil((new Date(sel.check_in + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : 999;
  const isGracePeriodActive = false;

  const canCheckIn = sel?.status === 'confirmed' && daysUntilCheckIn <= 2 && !!onCheckIn;
  const isComingSoon = sel?.status === 'confirmed' && daysUntilCheckIn > 2;
  const canCheckOut = (sel?.status === 'checked_in' || isGracePeriodActive) && !!onCheckOut;
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
    const receipts = getSettledReceiptsForSel();
    const hasSettled = receipts.length > 0 || (sel.collected_amount || 0) > 0;

    if (svcAdults <= 0 && !hasSettled) {
      flash('⚠ Number of adults is required for check-out.');
      setShowServices(true);
      return;
    }
    if (!isPrepaid && svcAmount <= 0 && !hasSettled) {
      flash('⚠ Stay Price (Accommodation) is required for the first tab.');
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
        (svcLunch ? svcLunchCount * (pricing.lunch_price) : 0) +
        (svcDinner ? svcDinnerCount * (pricing.dinner_price) : 0) +
        (svcGuide ? svcGuidePrice : 0) +
        (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
        (svcLaundry ? svcLaundryPrice : 0) +
        (svcCooking ? svcCookingPrice : 0)
      );

      // --- GENERATE RECEIPT SNAPSHOT ---
      const now = new Date();
      const datePart = now.toISOString().split('T')[0].replace(/-/g, '').slice(2); // YYMMDD
      const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
      const receiptId = `RCP-${datePart}-${randPart}`;
      
      const snapshot = {
        id: receiptId,
        date: now.toISOString(),
        settled_at: now.toISOString(),
        items: {
          accommodation: svcAmount,
          isPrepaid: isPrepaid,
          meals: { 
            lunch: svcLunch ? svcLunchCount : 0, 
            dinner: svcDinner ? svcDinnerCount : 0,
            isLunchPrepaid: isLunchPrepaid,
            isDinnerPrepaid: isDinnerPrepaid
          },
          services: { 
            guide: svcGuide ? svcGuidePrice : 0, 
            transport: svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0, 
            laundry: svcLaundry ? svcLaundryPrice : 0, 
            cooking: svcCooking ? svcCookingPrice : 0 
          },
          extras: [...extraServices],
          drinks: drinkTab
        },
        total: gTotal,
        payments: svcPayList.filter(p => parseFloat(p.amount) > 0)
      };

      let currentMeta: any = {};
      try {
        const parsed = typeof sel.special_requests === 'string'
          ? JSON.parse(sel.special_requests || '{}')
          : (sel.special_requests || {});
        currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
      } catch {
        currentMeta = {};
      }
      const settledReceipts = [...(currentMeta.settled_receipts || []), snapshot];

      const totalPaidUsd = svcPayList.reduce((sum, p) => {
        const amt = parseFloat(p.amount) || 0;
        const rate = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
        return sum + (p.currency === 'USD' ? amt : (amt / rate));
      }, 0);

      // Save payments ... (same loop as before)
      for (const p of svcPayList) {
        const amt = parseFloat(p.amount) || 0;
        if (amt <= 0) continue;
        const rate = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
        const usdEquiv = p.currency === 'USD' ? amt : (amt / rate);
        await supabase.from('payments').insert({
          booking_id: sel.id,
          amount_original: amt,
          currency_original: p.currency,
          method: p.method,
          exchange_rate_used: rate,
          amount_usd_equivalent: usdEquiv,
          note: `Receipt #${receiptId}`
        });
      }

      // Persist the receipt snapshot so closed tabs are never lost
      try {
        await supabase.from('booking_receipts').insert({
          booking_id: sel.id,
          receipt_id: receiptId,
          snapshot,
          total_usd: gTotal,
        });
      } catch {
        // If the table doesn't exist yet, we still keep the fallback in special_requests
      }

      const updates: Partial<Booking> = {
        total_price: (sel.total_price || 0) + gTotal,
        collected_amount: (sel.collected_amount || 0) + totalPaidUsd,
        collected_currency: 'USD',
        payment_status: 'Paid',
        lunch: false, lunch_count: 0,
        dinner: false, dinner_count: 0,
        guide_service: false, guide_amount: null, guide_names: null,
        has_transportation: false, transportation_details: null,
        cooking_class: false, cooking_class_amount: null,
        laundry: false, laundry_price: null,
        drinks_tab: undefined,
        extra_services: undefined,
        special_requests: JSON.stringify({ ...currentMeta, settled_receipts: settledReceipts, days: dayEntries, draft: null }), 
        amount: 0
      };
      
      if (onUpdateBooking) await onUpdateBooking(sel.id, updates);
      if (onRefresh) await onRefresh();
      
      // Update local selectedItem so the Modal sees the new collected_amount immediately
      const updatedBooking = { ...sel, ...updates };
      setSelectedItem(prev => prev ? { ...prev, booking: updatedBooking } : null);
      
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.7 } });
      flash('✓ Tab Settled & Archived. Receipt is ready below.');
      setSelectedReceipt(snapshot);
      
      // Reset local UI states for the new tab
      setSvcAmount(0); setSvcDiscount(0);
      setIsPrepaid(false); setIsLunchPrepaid(false); setIsDinnerPrepaid(false);
      setSvcLunch(false); setSvcLunchCount(0); setSvcDinner(false); setSvcDinnerCount(0);
      setSvcGuide(false); setSvcGuidePrice(40); setSvcGuideNames(['']);
      setSvcTransport(false); setSvcTransList([{ name: '', details: '', price: 0 }]);
      setSvcLaundry(false); setSvcLaundryPrice(0);
      setSvcCooking(false); setSvcCookingPrice(0);
      setExtraServices([]); setSelectedDrinks({});
      setSvcPayList([{ amount: '', currency: 'USD', method: 'Cash' }]);
      setPayModified(false);

    } catch (err) { 
      console.error('Finalize Tab failed:', err);
      flash('⚠ Failed to settle tab.'); 
    }
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
        (svcLunch ? svcLunchCount * (pricing.lunch_price) : 0) +
        (svcDinner ? svcDinnerCount * (pricing.dinner_price) : 0) +
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
        total_price: svcAmount + sTotal + dTotal + eTotal - svcDiscount
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
        ((svcLunch ? svcLunchCount * (pricing.lunch_price) : 0) +
        (svcDinner ? svcDinnerCount * (pricing.dinner_price) : 0) +
        (svcGuide ? svcGuidePrice : 0) +
        (svcLaundry ? svcLaundryPrice : 0) +
        (svcCooking ? svcCookingPrice : 0)) +
        Object.entries(selectedDrinks).reduce((sum, [id, qty]) => {
          const d = drinks.find(x => x.id === Number(id));
          return sum + (d ? d.sold_price * (qty as number) : 0);
        }, 0) +
        extraServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0) - svcDiscount
      );
      setTimeout(() => setSvcPayList([{ amount: gTotal.toString(), currency: 'USD', method: 'Cash' }]), 0);
    }
  }, [svcAmount, svcDiscount, svcLunch, svcLunchCount, svcDinner, svcDinnerCount, svcGuide, svcGuidePrice, svcTransport, svcTransList, svcLaundry, svcLaundryPrice, svcCooking, svcCookingPrice, selectedDrinks, extraServices, pricing, payModified]);

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
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
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border-b border-amber-100">● Arriving · {arrivingItems.length}</p>
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

        <div className="overflow-x-auto pb-4 lg:pb-0">
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
      </div>

      <BookingModal 
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        userRole={String(userRole || 'Manager')}
        currentUserId={String(currentUserId)}
        pricing={pricing}
        setPricing={setPricing}
        loadingAction={loadingAction}
        setLoadingAction={setLoadingAction}
        actionMsg={actionMsg}
        flash={flash}
        syncWarnings={syncWarnings}
        setSyncWarnings={setSyncWarnings}
        onRefresh={() => onRefresh?.()}
        onUpdateBooking={onUpdateBooking as any}
        onCheckIn={onCheckIn as any}
        onCheckOut={onCheckOut as any}
        onCancelBooking={onCancelBooking as any}
        svcAdults={svcAdults}
        setSvcAdults={setSvcAdults}
        svcChildren={svcChildren}
        setSvcChildren={setSvcChildren}
        svcAmount={svcAmount}
        setSvcAmount={setSvcAmount}
        isPrepaid={isPrepaid}
        setIsPrepaid={setIsPrepaid}
        isLunchPrepaid={isLunchPrepaid}
        setIsLunchPrepaid={setIsLunchPrepaid}
        isDinnerPrepaid={isDinnerPrepaid}
        setIsDinnerPrepaid={setIsDinnerPrepaid}
        svcLunch={svcLunch}
        setSvcLunch={setSvcLunch}
        svcLunchCount={svcLunchCount}
        setSvcLunchCount={setSvcLunchCount}
        svcDinner={svcDinner}
        setSvcDinner={setSvcDinner}
        svcDinnerCount={svcDinnerCount}
        setSvcDinnerCount={setSvcDinnerCount}
        svcGuide={svcGuide}
        setSvcGuide={setSvcGuide}
        svcGuidePrice={svcGuidePrice}
        setSvcGuidePrice={setSvcGuidePrice}
        svcGuideNames={svcGuideNames}
        setSvcGuideNames={setSvcGuideNames}
        svcTransport={svcTransport}
        setSvcTransport={setSvcTransport}
        svcTransList={svcTransList}
        setSvcTransList={setSvcTransList}
        svcCooking={svcCooking}
        setSvcCooking={setSvcCooking}
        svcCookingPrice={svcCookingPrice}
        setSvcCookingPrice={setSvcCookingPrice}
        svcLaundry={svcLaundry}
        setSvcLaundry={setSvcLaundry}
        svcLaundryPrice={svcLaundryPrice}
        setSvcLaundryPrice={setSvcLaundryPrice}
        svcDiscount={svcDiscount}
        setSvcDiscount={setSvcDiscount}
        svcPayList={svcPayList}
        setSvcPayList={setSvcPayList}
        setPayModified={setPayModified}
        showDrinks={showDrinks}
        setShowDrinks={setShowDrinks}
        drinks={drinks}
        selectedDrinks={selectedDrinks}
        setSelectedDrinks={setSelectedDrinks}
        extraServices={extraServices}
        setExtraServices={setExtraServices}
        newExtraName={newExtraName}
        setNewExtraName={setNewExtraName}
        newExtraPrice={newExtraPrice}
        setNewExtraPrice={setNewExtraPrice}
        showServices={showServices}
        setShowServices={setShowServices}
        showNotes={showNotes}
        setShowNotes={setShowNotes}
        showFinalReceipt={showFinalReceipt}
        setShowFinalReceipt={setShowFinalReceipt}
        selectedReceipt={selectedReceipt}
        setSelectedReceipt={setSelectedReceipt}
        editingDates={editingDates}
        setEditingDates={setEditingDates}
        editCheckIn={editCheckIn}
        setEditCheckIn={setEditCheckIn}
        editCheckOut={editCheckOut}
        setEditCheckOut={setEditCheckOut}
        dateAdjAmount={dateAdjAmount}
        setDateAdjAmount={setDateAdjAmount}
        valError={valError}
        setValError={setValError}
        getSettledReceiptsForSel={getSettledReceiptsForSel}
        handleCheckIn={handleCheckIn}
        handleCheckOut={handleCheckOut}
        handleCancel={handleCancel}
        handleCreateFromEvent={handleCreateFromEvent}
        fetchCbuRate={fetchCbuRate}
        gTotal={gTotal}
        debtRemaining={debtRemaining}
        tPaidUsd={tPaidUsd}
        isBalanceMatched={isBalanceMatched}
        today={today}
        gcEvents={gcEvents}
        dayEntries={dayEntries}
      />
    </div>
  );
}
