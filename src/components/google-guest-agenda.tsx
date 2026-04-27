'use client';

import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { supabase, type Booking, type UserRole, type Drink } from '@/lib/supabase';
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
  userRole?: UserRole;
  currentUserId?: string;
  onCheckIn?: (id: number) => Promise<void> | void;
  onCheckOut?: (id: number) => Promise<void> | void;
  onUpdateBooking?: (id: number, data: Partial<Booking>) => Promise<void> | void;
  onCancelBooking?: (id: number) => Promise<void> | void;
  onAddNewBooking?: (data: Partial<Booking>) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const formatSpace = (num: number, decimals = 2) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num).replace(/,/g, ' ');
};

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
  }, [sel?.id]);

  const getSettledReceiptsForSel = () => {
    if (dbSettledReceipts.length) return dbSettledReceipts;
    try {
      if (!sel?.special_requests) return [];
      const parsed = typeof sel.special_requests === 'string'
        ? JSON.parse(sel.special_requests || '{}')
        : (sel.special_requests || {});
      const meta = Array.isArray(parsed) ? {} : (parsed || {});
      return meta.settled_receipts || [];
    } catch {
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
    (svcLunch ? svcLunchCount * (pricing.lunch_price) : 0) +
    (svcDinner ? svcDinnerCount * (pricing.dinner_price) : 0) +
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
  const recordedPaid = (isPrepaid ? svcAmount : 0) + prepaidLunchAmt + prepaidDinnerAmt;
  const debtRemaining = gTotal - recordedPaid;

  const canFinalize = isPrepaid || (svcAmount > 0) || (sTotal_calc + dTotal_calc + eTotal_calc > 0);
  const isBalanceMatched = Math.abs(tPaidUsd - debtRemaining) < 1.00;
  
  const today = localDateStr(new Date());

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
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
              try {
                const m = typeof b.special_requests === 'string' ? JSON.parse(b.special_requests || '{}') : (b.special_requests || {});
                if (!m.is_manual_dates) {
                  warnings[b.id] = 'dates_changed';
                }
              } catch {
                warnings[b.id] = 'dates_changed';
              }
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
      if (updated) {
        // Deep compare to prevent unnecessary re-renders that could close modals
        const currentStr = JSON.stringify(selectedItem.booking);
        const updatedStr = JSON.stringify(updated);
        if (currentStr !== updatedStr) {
          setSelectedItem(prev => prev ? { ...prev, booking: updated } : prev);
        }
      }
    }
  }, [bookings, selectedItem?.booking]);

  // Reset receipt view only when guest ID actually changes
  useEffect(() => {
    setSelectedReceipt(null);
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
      // 2. Checkout day is today (or past)
      // 3. It's past 12:00 PM
      // 4. Debt is basically 0
      const toAutoCO = bookings.filter(b => {
        if (b.status !== 'checked_in') return false;
        if (b.check_out > todayStr) return false;
        if (b.check_out === todayStr && !isPostNoon) return false;
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
              {booking ? <p className="text-xs text-slate-500">Booking</p> : <p className="text-xs text-slate-400">calendar only</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {isCancelled
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">cancelled</span>
                : booking && (
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusColor(booking.status)}`}>{booking.status.replace('_', ' ')}</span>
                      {(() => {
                        try {
                          const m = typeof booking.special_requests === 'string' ? JSON.parse(booking.special_requests || '{}') : (booking.special_requests || {});
                          const rCount = m.settled_receipts?.length || 0;
                          if (rCount > 0) return (
                            <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200 uppercase tracking-widest flex items-center gap-1.5 shadow-sm animate-in fade-in slide-in-from-right-1">
                              <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              TAB {rCount}
                            </span>
                          );
                        } catch { return null; }
                        return null;
                      })()}
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
      setSvcAmount(b.total_price - (b.collected_amount || 0));

      // Load draft/saved states with priority for draft
      setIsPrepaid(draft?.isPrepaid ?? (b.payment_note?.includes('Accommodation') || false));
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
      setSvcAmount(draft?.svcAmount ?? b.amount ?? 0);
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
    if (svcAdults <= 0 && (sel.collected_amount || 0) === 0) {
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
        (svcLunch ? svcLunchCount * (pricing.lunch_price) : 0) +
        (svcDinner ? svcDinnerCount * (pricing.dinner_price) : 0) +
        (svcGuide ? svcGuidePrice : 0) +
        (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
        (svcLaundry ? svcLaundryPrice : 0) +
        (svcCooking ? svcCookingPrice : 0)
      );

      // --- GENERATE RECEIPT SNAPSHOT ---
      const receiptId = 'RCP-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      const snapshot = {
        id: receiptId,
        date: new Date().toISOString(),
        items: {
          accommodation: svcAmount,
          isPrepaid: isPrepaid,
          meals: { lunch: svcLunchCount, dinner: svcDinnerCount },
          services: { guide: svcGuidePrice, transport: svcTransList.reduce((s, t) => s + (t.price || 0), 0), laundry: svcLaundryPrice, cooking: svcCookingPrice },
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
      
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.7 } });
      flash('✓ Tab Settled & Archived. Receipt is ready below.');
      setSelectedReceipt(snapshot);
      
      // Reset local UI states for the new tab
      setSvcAmount(0); setSvcDiscount(0);
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
      setSvcPayList([{ amount: gTotal.toString(), currency: 'USD', method: 'Cash' }]);
    }
  }, [svcAmount, svcDiscount, svcLunch, svcLunchCount, svcDinner, svcDinnerCount, svcGuide, svcGuidePrice, svcTransport, svcTransList, svcLaundry, svcLaundryPrice, svcCooking, svcCookingPrice, selectedDrinks, extraServices, pricing, payModified]);

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
                  <p className="text-sm text-slate-500 mt-0.5">{sel.check_in} → {sel.check_out}{sel.nights ? ` · ${sel.nights}n` : ''}{(sel.guest_count || sel.number_of_people) ? ` · ${sel.guest_count || sel.number_of_people} pax` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {(sel.notes || sel.description) && (
                    <button 
                      onClick={() => setShowNotes(!showNotes)}
                      className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 transition-all active:scale-95"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showNotes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      {showNotes ? 'Hide Notes' : 'View Notes'}
                    </button>
                  )}
                  <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${statusColor(sel.status)} flex items-center gap-1`}>
                    {statusIcon(sel.status) && <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>}
                    {sel.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {showNotes && (sel.notes || sel.description) && (
                <div className="bg-amber-50 rounded-[20px] p-4 border border-amber-100 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Google Calendar Notes</p>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">{sel.notes || sel.description}</p>
                </div>
              )}

              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{actionMsg}</div>
              )}

              {syncWarnings[sel.id] === 'deleted' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <p className="font-bold mb-0.5">⚠ Calendar event deleted</p>
                  <p className="text-xs">The linked Google Calendar event was removed. The booking remains here.</p>
                </div>
              )}

              {sel.status === 'checked_in' && sel.check_out === today && isAfterNoon && (
                <div className={`border-2 rounded-2xl p-4 flex items-center gap-4 ${isAfterTwo ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isAfterTwo ? 'bg-rose-100' : 'bg-amber-100'}`}>
                    <span className="text-2xl">⚠</span>
                  </div>
                  <div>
                    <p className="font-black uppercase tracking-widest text-xs">
                      {isAfterTwo ? 'Critical: Guest Not Checked Out' : 'Late Checkout Warning'}
                    </p>
                    <p className="text-sm font-bold opacity-80">
                      Standard checkout time is 12:00 PM. {isAfterTwo ? 'It is past 2:00 PM. Please check the guest immediately.' : 'Please coordinate with the guest.'}
                    </p>
                    {isAfterTwo && (
                      <p className="text-[10px] mt-2 font-black text-rose-600 bg-white px-2 py-1 rounded w-fit border border-rose-200">
                        CEO MESSAGE: CHECK OUT TIME IS 12 PM
                      </p>
                    )}
                  </div>
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
                        {loadingAction === `syncdates-${sel.id}` ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '⇵'}
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

              {sel.status === 'completed' && !isGracePeriodActive && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{sel.status.replace('_', ' ')}</span>
                </div>
              )}

              {(userRole === 'Manager' || userRole === 'CEO') && sel.status !== 'no_arrival' && sel.status !== 'cancelled' && (sel.status !== 'completed' || isGracePeriodActive) && (
                <div className="flex flex-wrap gap-2">
                  {sel.status === 'checked_in' && !editingDates && (
                    <div className="w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1.5">
                          <span className="px-4 py-2 bg-emerald-100 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200 flex items-center gap-2">
                            ✓ Checked In
                          </span>
                          {(() => {
                            try {
                              const rCount = getSettledReceiptsForSel().length || 0;
                              if (rCount > 0) return (
                                <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl border border-indigo-200 uppercase tracking-widest flex items-center gap-2 w-fit shadow-sm animate-in fade-in slide-in-from-left-2">
                                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                  TAB {rCount}
                                </span>
                              );
                            } catch { return null; }
                            return null;
                          })()}
                        </div>
                        <button
                          onClick={() => { setEditingDates(true); setEditCheckIn(sel.check_in); setEditCheckOut(sel.check_out); }}
                          className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 underline underline-offset-2 decoration-indigo-200 transition-all">
                          Edit Dates
                        </button>
                      </div>
                    </div>
                  )}
                  {editingDates && (
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Edit Stay Dates</p>
                        {(sel.collected_amount || 0) > 0 && (
                          <span className="text-[9px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded uppercase">Tab Settled</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check In</label>
                          <input
                            type="date"
                            value={editCheckIn}
                            disabled
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check Out</label>
                          <input
                            type="date"
                            value={editCheckOut}
                            onChange={e => {
                              const v = e.target.value;
                              setEditCheckOut(v);
                              if (v === sel.check_out) setDateAdjAmount('');
                            }}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                          />
                        </div>
                      </div>

                      {editCheckOut > sel.check_out && (
                        <div className="pt-2 border-t border-slate-200 animate-in fade-in slide-in-from-top-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-tight mb-1 block">
                            Stay Extension Price (USD)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                              +
                            </span>
                            <input
                              type="number"
                              value={dateAdjAmount}
                              onChange={e => setDateAdjAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-black text-black focus:border-indigo-500 outline-none transition-all"
                            />
                          </div>
                          <p className="text-[8px] text-slate-400 font-bold mt-1 uppercase italic">
                            * This amount will be added to the current open tab as Accommodation.
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`Update dates to ${editCheckIn} → ${editCheckOut}?`)) return;
                            setLoadingAction('editdates');
                            try {
                              const adj = parseFloat(dateAdjAmount) || 0;
                              const isExtension = editCheckOut > sel.check_out;
                              const updates: Partial<Booking> = { 
                                check_in: editCheckIn,
                                check_out: editCheckOut
                              };

                              if (isExtension) {
                                if (adj > 0) {
                                  updates.total_price = (sel.total_price || 0) + adj;
                                  setSvcAmount(v => (parseFloat(String(v)) || 0) + adj);
                                  flash(`✓ Extended to ${editCheckOut}. +$${adj} added to Open Tab (Accommodation).`);
                                } else {
                                  flash(`✓ Extended to ${editCheckOut}.`);
                                }
                              } else {
                                flash('✓ Dates updated.');
                              }

                                let currentMeta: any = {};
                                try {
                                  const parsed = typeof sel.special_requests === 'string'
                                    ? JSON.parse(sel.special_requests || '{}')
                                    : (sel.special_requests || {});
                                  currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
                                } catch {
                                  currentMeta = {};
                                }
                                updates.special_requests = JSON.stringify({ ...currentMeta, is_manual_dates: true, days: dayEntries });
                                await onUpdateBooking?.(sel.id, updates);

                                flash('✓ Dates updated in System. Google Calendar remains unchanged.');
                                setEditingDates(false);
                                setDateAdjAmount('');
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



                  {/* Premium Add to Tab Dashboard */}
                  {(sel.status === 'checked_in' || sel.status === 'confirmed') && (userRole === 'Manager' || userRole === 'CEO') && (
                    <div className="bg-white border-2 border-slate-100 rounded-[32px] p-6 shadow-xl shadow-slate-100/50 mb-6">
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-tight">Add to Tab</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Post new charges for this guest</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => setShowServices(v => !v)} 
                          className={`text-[10px] font-black px-5 py-2.5 rounded-xl border-2 transition-all active:scale-95 ${showServices ? 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100' : 'bg-indigo-600 text-white border-indigo-700 shadow-lg shadow-indigo-100 hover:bg-indigo-700'}`}
                        >
                          {showServices ? 'HIDE OPTIONS' : 'START NEW ORDER'}
                        </button>
                      </div>
                      
                      {!showServices && (
                        <div 
                          className="group relative flex items-center justify-center py-10 border-2 border-dashed border-slate-200 rounded-[24px] bg-slate-50/50 cursor-pointer hover:bg-white hover:border-indigo-300 transition-all duration-300 overflow-hidden" 
                          onClick={() => setShowServices(true)}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="relative flex flex-col items-center">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md mb-3 group-hover:scale-110 transition-transform">
                              <span className="text-indigo-600 text-3xl font-light">+</span>
                            </div>
                            <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-indigo-600 transition-colors">Select Meals or Services</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {showServices && (sel.status === 'checked_in' || sel.status === 'confirmed') && (userRole === 'Manager' || userRole === 'CEO') && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
                  {/* Accommodation - Always show on first tab or if extended */}
                  {(svcAmount > 0 || (sel.collected_amount || 0) === 0) && (
                    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white animate-in slide-in-from-top-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accommodation Extension</p>
                          <button onClick={() => { 
                              const next = !isPrepaid;
                              setIsPrepaid(next);
                              if (next) setSvcAmount(0); 
                            }}
                            className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border transition-all ${isPrepaid ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                            {isPrepaid ? '✓ Pre-paid' : 'Pre-paid'}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adults *</label>
                            <input 
                              type="number" 
                              value={svcAdults || ''} 
                              onChange={e => setSvcAdults(parseInt(e.target.value) || 0)}
                              disabled={(sel.collected_amount || 0) > 0}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-black focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Children</label>
                            <input 
                              type="number" 
                              value={svcChildren || ''} 
                              onChange={e => setSvcChildren(parseInt(e.target.value) || 0)}
                              disabled={(sel.collected_amount || 0) > 0}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-black focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stay Price (USD)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                              type="number" 
                              value={svcAmount || ''} 
                              onChange={e => setSvcAmount(parseFloat(e.target.value) || 0)}
                              disabled={isPrepaid}
                              className="w-full pl-8 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-lg font-black text-black focus:border-indigo-500 outline-none transition-all disabled:opacity-50"
                            />
                          </div>
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest italic">
                            {isPrepaid ? '* Accommodation is marked as pre-paid.' : '* Enter total price for the EXTENDED period.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Food</p>
                      <button onClick={() => {
                        const next = !(isLunchPrepaid || isDinnerPrepaid);
                        setIsLunchPrepaid(next);
                        setIsDinnerPrepaid(next);
                      }}
                        className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border transition-all ${(isLunchPrepaid || isDinnerPrepaid) ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                        {(isLunchPrepaid || isDinnerPrepaid) ? '✓ Pre-paid' : 'Pre-paid'}
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer min-w-[80px]">
                            <input type="checkbox" checked={svcLunch} onChange={e => { setSvcLunch(e.target.checked); if (e.target.checked && svcLunchCount <= 0) setSvcLunchCount(1); }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Lunch</span>
                          </label>
                          {svcLunch && <input type="number" value={svcLunchCount} onChange={e => setSvcLunchCount(parseInt(e.target.value) || 0)} placeholder="Qty"
                            className={`w-16 px-2 py-1.5 border-2 ${svcLunchCount <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-sm font-bold text-black focus:border-indigo-500 transition-all`} />}
                        </div>
                        <div className="flex items-center gap-2">
                          {svcLunch && pricing?.lunch_price && pricing.lunch_price > 0 && (
                            <span className={`text-xs font-bold text-slate-500 ${isLunchPrepaid ? 'line-through opacity-50' : ''}`}>${(svcLunchCount * pricing.lunch_price).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer min-w-[80px]">
                            <input type="checkbox" checked={svcDinner} onChange={e => { setSvcDinner(e.target.checked); if (e.target.checked && svcDinnerCount <= 0) setSvcDinnerCount(1); }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Dinner</span>
                          </label>
                          {svcDinner && <input type="number" value={svcDinnerCount} onChange={e => setSvcDinnerCount(parseInt(e.target.value) || 0)} placeholder="Qty"
                            className={`w-16 px-2 py-1.5 border-2 ${svcDinnerCount <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-sm font-bold text-black focus:border-indigo-500 transition-all`} />}
                        </div>
                        <div className="flex items-center gap-2">
                          {svcDinner && pricing?.dinner_price && pricing.dinner_price > 0 && (
                            <span className={`text-xs font-bold text-slate-500 ${isDinnerPrepaid ? 'line-through opacity-50' : ''}`}>${(svcDinnerCount * pricing.dinner_price).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Other Services */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Other Services</p>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={svcGuide} onChange={e => { 
                              setSvcGuide(e.target.checked); 
                              if (e.target.checked) { 
                                setSvcGuidePrice(pricing?.guide_price || 0); 
                                setSvcGuideNames(['']); 
                              } 
                            }} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">Guide Service</span>
                              {pricing?.guide_price && pricing.guide_price > 0 && (
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">System Price: ${pricing.guide_price} / guide</span>
                              )}
                            </div>
                          </label>
                          {svcGuide && (
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setSvcGuidePrice(v => Math.max(0, v - 5))} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-sm transition-all shadow-sm">－</button>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">$</span>
                                <input type="number" value={svcGuidePrice} onChange={e => setSvcGuidePrice(parseFloat(e.target.value) || 0)}
                                  className="w-20 pl-5 pr-2 py-1.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-black text-black focus:border-indigo-500 outline-none text-center" />
                              </div>
                              <button type="button" onClick={() => setSvcGuidePrice(v => v + 5)} className="w-8 h-8 flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-black text-sm transition-all shadow-sm">＋</button>
                            </div>
                          )}
                        </div>
                        {svcGuide && (
                          <div className="space-y-2">
                            {svcGuideNames.map((name, ni) => (
                              <div key={ni} className="flex gap-2">
                                <input type="text" value={name || ''} onChange={e => { const next = [...svcGuideNames]; next[ni] = e.target.value; setSvcGuideNames(next); }}
                                  placeholder={`Guide ${ni + 1} name...`}
                                  className={`flex-1 px-3 py-2 border-2 ${!name.trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-sm font-bold text-black focus:border-indigo-500 transition-all`} />
                                {svcGuideNames.length > 1 && <button type="button" onClick={() => { setSvcGuideNames(v => v.filter((_, i) => i !== ni)); setSvcGuidePrice(v => Math.max(0, v - 40)); }}
                                  className="text-rose-500 hover:text-rose-600 font-black text-xl px-1">×</button>}
                              </div>
                            ))}
                            <button type="button" onClick={() => { setSvcGuideNames(v => [...v, '']); setSvcGuidePrice(v => v + 40); }}
                              className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all">+ Add Another Guide ($40)</button>
                          </div>
                        )}
                      </div>
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
                                  {svcTransList.length > 1 && <button type="button" onClick={() => setSvcTransList(v => v.filter((_, i) => i !== ti))} className="text-rose-600 hover:text-rose-700 font-bold text-xs">✕ Remove</button>}
                                </div>
                                <input type="text" value={trans.name} onChange={e => setSvcTransList(v => v.map((t, i) => i === ti ? { ...t, name: e.target.value } : t))} placeholder="Driver Name..."
                                  className={`w-full px-3 py-1.5 border-2 ${!trans.name.trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`} />
                                <div className="flex gap-2">
                                  <input type="text" value={trans.details} onChange={e => setSvcTransList(v => v.map((t, i) => i === ti ? { ...t, details: e.target.value } : t))} placeholder="From/To..."
                                    className={`flex-1 px-3 py-1.5 border-2 ${!trans.details.trim() ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`} />
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400">$</span>
                                    <input type="number" value={trans.price} onChange={e => setSvcTransList(v => v.map((t, i) => i === ti ? { ...t, price: parseFloat(e.target.value) || 0 } : t))} placeholder="Price"
                                      className={`w-20 px-2 py-1.5 border-2 ${trans.price <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`} />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <button type="button" onClick={() => setSvcTransList(v => [...v, { name: '', details: '', price: 0 }])}
                              className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all">+ Add Transfer</button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={svcCooking} onChange={e => setSvcCooking(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Cooking Class</span>
                          </label>
                          {svcCooking && <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-400">$</span>
                            <input type="number" value={svcCookingPrice} onChange={e => setSvcCookingPrice(parseFloat(e.target.value) || 0)} placeholder="Price"
                              className={`w-24 px-3 py-1.5 border-2 ${svcCookingPrice <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`} /></div>}
                        </div>
                      </div>
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div className="flex justify-between items-center">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={svcLaundry} onChange={e => setSvcLaundry(e.target.checked)} className="w-5 h-5 border-2 border-slate-300 text-indigo-600 rounded" />
                            <span className="text-sm font-bold text-slate-900">Laundry</span>
                          </label>
                          {svcLaundry && <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-400">$</span>
                            <input type="number" value={svcLaundryPrice} onChange={e => setSvcLaundryPrice(parseFloat(e.target.value) || 0)} placeholder="Price"
                              className={`w-24 px-3 py-1.5 border-2 ${svcLaundryPrice <= 0 ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'} rounded-lg text-xs font-bold text-black focus:border-indigo-500 transition-all`} /></div>}
                        </div>
                      </div>
                    </div>
                  </div>
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
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Tab Summary</p>
                    <svg className="w-5 h-5 text-indigo-300 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  </div>
                  
                  <div className="space-y-2">
                    {(svcAmount > 0 || isPrepaid) && (
                      <div className="flex justify-between items-center opacity-90 border-b border-white/20 pb-2 mb-2">
                        <span className="font-bold">Accommodation</span>
                        {isPrepaid ? (
                          <span className="text-[10px] font-black bg-emerald-400 text-emerald-900 px-2 py-0.5 rounded-md uppercase tracking-wider">Prepaid</span>
                        ) : (
                          <div className="flex items-center gap-1 group relative">
                            <span className="text-white/40 font-bold text-[10px] uppercase tracking-tighter">Edit: $</span>
                            <input 
                              type="number" 
                              value={svcAmount} 
                              onChange={(e) => setSvcAmount(parseFloat(e.target.value) || 0)}
                              className="bg-white/10 hover:bg-white/20 border-none text-right font-black w-24 focus:outline-none focus:ring-1 focus:ring-white/40 rounded px-2 py-0.5 text-white transition-all"
                            />
                            <div className="absolute -top-6 right-0 bg-black text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                              Click to edit Accommodation price
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
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
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">
                            {gTotal > 0 ? 'Current Open Tab' : 'Tab Settled (Ready)'}
                          </p>
                          <span className="text-[8px] font-black bg-white/20 px-1.5 py-0.5 rounded text-white/80 uppercase">
                            {gTotal > 0 ? 'Supposed to pay' : 'Balance: $0.00'}
                          </span>
                        </div>
                        {((sel.collected_amount || 0) > 0 || gTotal > 0.01) && (
                          <div className="flex flex-col items-end gap-2">
                             {(() => {
                                const rCount = getSettledReceiptsForSel().length;
                                return (
                                  <div className="flex flex-col items-end gap-2">
                                     <button 
                                        onClick={() => { setSelectedReceipt(null); setShowFinalReceipt(true); }}
                                        className={`bg-white/10 hover:bg-white/20 p-2 rounded-xl border border-white/20 transition-all group flex items-center gap-2 ${gTotal > 0.01 ? 'ring-2 ring-white/30 shadow-lg' : ''}`}
                                      >
                                        <svg className="w-4 h-4 text-white/80 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        <span className="text-[9px] font-black text-white uppercase tracking-widest">{gTotal > 0.01 ? 'Current Folio' : 'Open Tab'}</span>
                                      </button>
                                      {rCount > 0 && (
                                        <div className="flex flex-wrap justify-end gap-2 max-w-[160px]">
                                          {getSettledReceiptsForSel().map((r: any, idx: number) => (
                                            <button 
                                              key={r.id || `tab-${idx}`}
                                              onClick={(e) => { 
                                                e.preventDefault();
                                                e.stopPropagation(); 
                                                setSelectedReceipt(r); 
                                                setShowFinalReceipt(true); 
                                              }}
                                              className="bg-white/20 hover:bg-white/40 px-3 py-1.5 rounded-lg border border-white/30 text-[10px] font-black text-white transition-all uppercase tracking-widest shadow-sm active:scale-95"
                                            >
                                              Tab {idx + 1}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                                );
                              })()}
                          </div>
                        )}
                      </div>
                      <p className="text-3xl font-black tracking-tighter leading-none mb-2">
                        ${gTotal.toFixed(2)}
                      </p>
                      
                       {/* Status Display - Hide if completed or settled */}
                       {sel.status !== 'completed' && gTotal > 0.01 && (
                         <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-200 bg-black/10 rounded-lg px-2 py-1.5 w-fit">
                           <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                           TAB OPEN: ${gTotal.toFixed(2)}
                         </div>
                       )}
                       
                       {sel.status !== 'completed' && gTotal <= 0.01 && (sel.collected_amount || 0) > 0 && (
                         <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300 bg-emerald-950/20 rounded-lg px-2 py-1.5 w-fit border border-emerald-500/20">
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                           ALL TABS PAID
                         </div>
                       )}
                    </div>
                    <div className="bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-white/10 ml-4">
                      <p className="text-[10px] font-bold text-indigo-100">USD</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Collection Logic */}
              {(userRole === 'Manager' || userRole === 'CEO') && sel.status !== 'completed' && (
                  debtRemaining > 1.00 && (
                    <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Collection</p>
                        {isBalanceMatched || (tPaidUsd >= debtRemaining - 1.00) ? (
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                            Paid
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
                            Remaining: ${(debtRemaining - tPaidUsd).toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="space-y-4">
                        {svcPayList.map((pay, pi) => {
                          const currentRate = pay.currency === 'USD' ? 1 : (pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                          
                          return (
                            <div key={pi} className="space-y-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100 animate-in slide-in-from-top-2 duration-300">
                              <div className="flex justify-between items-center">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment {pi + 1}</label>
                                {svcPayList.length > 1 && (
                                  <button onClick={() => setSvcPayList(v => v.filter((_, i) => i !== pi))} className="text-[10px] font-bold text-rose-500 hover:text-rose-700">✕ Remove</button>
                                )}
                              </div>

                              <div className="grid grid-cols-12 gap-4 items-end">
                                <div className="col-span-12 space-y-1.5">
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Pay in</span>
                                  <select 
                                    value={pay.currency}
                                      onChange={e => {
                                        const newCurr = e.target.value as any;
                                        const newRate = newCurr === 'USD' ? 1 : (newCurr === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                        
                                        // Calculate what is already covered by OTHER rows
                                        const otherRowsPaidUsd = svcPayList
                                          .filter((_, idx) => idx !== pi)
                                          .reduce((sum, p) => {
                                            const amt = parseFloat(p.amount) || 0;
                                            const r = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                            return sum + (amt / r);
                                          }, 0);
                                        
                                        const stillOwedUsd = Math.max(0, debtRemaining - otherRowsPaidUsd);

                                        setSvcPayList(v => v.map((p, i) => {
                                          if (i !== pi) return p;
                                          const updates: any = { ...p, currency: newCurr };
                                          // Auto-fill based on remaining balance
                                          if (newCurr !== 'USD') {
                                            updates.amount = (stillOwedUsd * newRate).toFixed(newCurr === 'UZS' ? 0 : 2);
                                          } else {
                                            updates.amount = stillOwedUsd.toFixed(2);
                                          }
                                          return updates;
                                        }));
                                      }}
                                    className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-2xl text-base font-black text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
                                  >
                                    <option value="USD">USD ($)</option>
                                    <option value="UZS">UZS (Sum)</option>
                                    <option value="EUR">EUR (€)</option>
                                  </select>
                                </div>

                                {pay.currency !== 'USD' && (
                                  <div className="col-span-12 space-y-1.5 animate-in slide-in-from-left-2">
                                    <div className="flex justify-between items-center px-1">
                                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Edit Exchange Rate (1 USD =)</span>
                                      <button 
                                        onClick={() => fetchCbuRate(pay.currency as 'UZS' | 'EUR')}
                                        disabled={fetchingRate === pay.currency}
                                        className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 underline decoration-indigo-200 underline-offset-2"
                                      >
                                        {fetchingRate === pay.currency ? '...' : 'Get Live Rate'}
                                      </button>
                                    </div>
                                    <div className="relative group">
                                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs uppercase tracking-tight group-focus-within:text-indigo-500 transition-colors">Rate:</div>
                                      <input
                                        type="number"
                                        value={pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92)}
                                        onChange={e => {
                                          const val = parseFloat(e.target.value) || 0;
                                          setPricing((prev) => prev ? { ...prev, [pay.currency === 'UZS' ? 'usd_to_uzs' : 'usd_to_eur']: val } : prev);
                                        }}
                                        className="w-full pl-14 pr-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
                                      />
                                    </div>
                                    <p className="text-[8px] text-slate-400 font-bold px-1 uppercase tracking-wider italic">
                                      * This rate is used to calculate the USD equivalent for your {pay.currency} payment.
                                    </p>
                                  </div>
                                )}

                                <div className="col-span-12 space-y-1.5 animate-in slide-in-from-top-1">
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Method</span>
                                  <div className="flex gap-2">
                                    {(['Cash', 'Card/Online'] as const).map(m => (
                                      <button
                                        key={m}
                                        onClick={() => setSvcPayList(v => v.map((p, i) => i === pi ? { ...p, method: m } : p))}
                                        className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-tighter transition-all border-2 ${
                                          pay.method === m 
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
                                            : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-100 hover:text-indigo-500'
                                        }`}
                                      >
                                        {m === 'Card/Online' ? 'Card / Online' : m}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="col-span-12 space-y-1.5 animate-in fade-in zoom-in-95">
                                  <div className="flex justify-between items-center px-1">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Money to Collect ({pay.currency})</span>
                                    <button 
                                      onClick={() => {
                                        const otherRowsPaidUsd = svcPayList
                                          .filter((_, idx) => idx !== pi)
                                          .reduce((sum, p) => {
                                            const amt = parseFloat(p.amount) || 0;
                                            const r = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                            return sum + (amt / r);
                                          }, 0);
                                        const stillOwedUsd = Math.max(0, debtRemaining - otherRowsPaidUsd);
                                        const r = pay.currency === 'USD' ? 1 : (pay.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
                                        const matchAmt = stillOwedUsd * r;
                                        setSvcPayList(v => v.map((p, i) => i === pi ? { ...p, amount: matchAmt > 0 ? (pay.currency === 'UZS' ? Math.round(matchAmt).toString() : matchAmt.toFixed(2)) : '' } : p));
                                      }}
                                      className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 transition-all active:scale-95"
                                    >
                                      MATCH BALANCE
                                    </button>
                                  </div>
                                  <div className="relative">
                                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 ${pay.currency === 'UZS' ? 'text-[9px]' : 'text-sm'}`}>
                                      {pay.currency === 'USD' ? '$' : pay.currency === 'EUR' ? '€' : 'SUM'}
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={pay.amount || ''}
                                      onChange={e => {
                                        setPayModified(true);
                                        setSvcPayList(v => v.map((p, i) => i === pi ? { ...p, amount: e.target.value } : p));
                                      }}
                                      placeholder="0.00"
                                      className={`w-full ${pay.currency === 'UZS' ? 'pl-11' : 'pl-8'} pr-4 py-4 bg-white border-2 border-slate-200 rounded-3xl text-xl font-black text-black focus:border-indigo-500 outline-none transition-all shadow-md`}
                                    />
                                  </div>
                                </div>

                                {/* Row 5: Produced USD Equivalent or Summary */}
                                {pay.currency !== 'USD' ? (
                                  <div className="col-span-12 animate-in slide-in-from-bottom-2">
                                    <div className="px-6 py-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <span className="text-xs font-black text-emerald-700 uppercase tracking-tight">Covers USD Balance</span>
                                      </div>
                                      <span className="text-xl font-black text-emerald-600">
                                        ${formatSpace(parseFloat(pay.amount || '0') / currentRate, 2)}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                    <div className="col-span-12 px-1">
                                        <p className="text-[9px] text-slate-400 font-bold italic">Subtracts directly from USD total bill.</p>
                                    </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        <button
                          onClick={() => {
                            const remaining = Math.max(0, debtRemaining - tPaidUsd);
                            setSvcPayList(v => [...v, { 
                              amount: remaining > 1.00 ? remaining.toFixed(2) : '', 
                              currency: 'USD', 
                              method: 'Cash' 
                            }]);
                          }}
                          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-2 bg-slate-50/30"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                          Add Another Currency
                        </button>

                        <button
                          onClick={() => {
                            if (!isPrepaid && svcAmount <= 0 && (sel.collected_amount || 0) === 0) {
                              setValError('Stay Price is missing. Please enter the guest\'s accommodation cost before proceeding.');
                              return;
                            }
                            if (!isBalanceMatched) {
                              setValError(`Payment balance mismatch. You are trying to collect ${tPaidUsd.toFixed(2)} USD, but the debt is ${debtRemaining.toFixed(2)} USD. Please use the "Match Balance" button to even the tab.`);
                              return;
                            }
                            setSelectedReceipt(null);
                            setShowFinalReceipt(true);
                          }}
                          disabled={loadingAction === 'checkout'}
                          className={`w-full py-3 rounded-xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${loadingAction === 'checkout' ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100 hover:scale-[1.02] active:scale-95'}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Paid
                        </button>
                      </div>
                    </div>
                  )
              )}


              {/* Receipt / Confirmation Modal */}
              {showFinalReceipt && sel && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowFinalReceipt(false)} />
                  <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                      <div className="bg-indigo-600 px-6 py-8 text-white text-center relative">
                        <div className="absolute top-4 right-4">
                          <button onClick={() => setShowFinalReceipt(false)} className="text-white/60 hover:text-white transition-all text-2xl font-bold">×</button>
                        </div>
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30">
                          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Final Receipt</h3>
                        <div className="flex flex-col items-center gap-1 mt-1">
                          <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest">
                            {selectedReceipt ? `Receipt #${selectedReceipt.id}` : 'Statement of Account'}
                          </p>
                          <div className="px-2 py-0.5 bg-white/10 rounded text-[9px] font-black text-white/80 border border-white/20 uppercase tracking-tighter">
                            {selectedReceipt ? `Settled: ${new Date(selectedReceipt.date).toLocaleString()}` : `Guest Folio: #${sel.id?.toString().padStart(4, '0')}`}
                          </div>
                        </div>
                      </div>

                    <div className="p-6 space-y-4">

                      {/* Guest Info */}
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

                      {/* Charges Section */}
                      {selectedReceipt ? (
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded w-fit">Tab #{selectedReceipt.id}</p>
                            {/* Accommodation always first */}
                            {((selectedReceipt.items?.accommodation || 0) > 0 || selectedReceipt.items?.isPrepaid) && (
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600 font-bold">Accommodation</span>
                                {selectedReceipt.items?.isPrepaid ? (
                                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded uppercase tracking-wider">Prepaid</span>
                                ) : (
                                  <span className="text-slate-900 font-black">${(selectedReceipt.items.accommodation || 0).toFixed(2)}</span>
                                )}
                              </div>
                            )}
                            {/* Food items */}
                            {(selectedReceipt.items?.meals?.lunch || 0) > 0 && (
                              <div className="flex justify-between text-xs text-slate-500"><span>Lunch ×{selectedReceipt.items.meals.lunch}</span><span>${(selectedReceipt.items.meals.lunch * (pricing?.lunch_price || 0)).toFixed(2)}</span></div>
                            )}
                            {(selectedReceipt.items?.meals?.dinner || 0) > 0 && (
                              <div className="flex justify-between text-xs text-slate-500"><span>Dinner ×{selectedReceipt.items.meals.dinner}</span><span>${(selectedReceipt.items.meals.dinner * (pricing?.dinner_price || 0)).toFixed(2)}</span></div>
                            )}
                            {/* Services */}
                            {Object.entries(selectedReceipt.items?.services || {}).map(([k, v]: [string, any]) => (v > 0 ? <div key={k} className="flex justify-between text-xs text-slate-500 capitalize"><span>{k}</span><span>${parseFloat(v).toFixed(2)}</span></div> : null))}
                            {/* Drinks */}
                            {(selectedReceipt.items?.drinks || []).map((d: any, i: number) => (<div key={i} className="flex justify-between text-xs text-slate-500"><span>{d.drink_name} ×{d.quantity}</span><span>${(d.price * d.quantity).toFixed(2)}</span></div>))}
                            {/* Extras */}
                            {(selectedReceipt.items?.extras || []).map((ex: any, i: number) => (<div key={i} className="flex justify-between text-xs text-slate-500"><span>{ex.name}</span><span>${parseFloat(ex.price || 0).toFixed(2)}</span></div>))}
                            <div className="flex justify-between text-sm pt-2 border-t border-slate-100 mt-2"><span className="font-bold text-slate-900">Tab Total</span><span className="font-black text-indigo-600">${(selectedReceipt.total || 0).toFixed(2)}</span></div>
                            <div className="bg-emerald-50 rounded-xl p-3 space-y-1.5 mt-2">
                              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest text-center">Payments Received</p>
                              {(selectedReceipt.payments || []).map((p: any, i: number) => (
                                <div key={i} className="flex justify-between text-xs font-bold text-emerald-700"><span>{p.currency} · {p.method}</span><span>{formatSpace(parseFloat(p.amount || '0'), p.currency === 'UZS' ? 0 : 2)} {p.currency}</span></div>
                              ))}
                              <div className="flex justify-between text-xs font-black text-emerald-600 pt-1.5 border-t border-emerald-100">
                                <span>Total Paid (USD Equiv.)</span>
                                <span>${(selectedReceipt.total || 0).toFixed(2)}</span>
                              </div>
                            </div>
                        </div>
                      ) : (
                        <div className="space-y-4">


                          {/* Current Tab Charges */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest text-center">{(sel.collected_amount || 0) > 0 ? 'Current Open Tab' : 'Charges Breakdown'}</p>
                            <div className="space-y-1.5 bg-white rounded-xl border border-slate-100 p-3">
                              {/* Accommodation first */}
                              {(svcAmount > 0 || (isPrepaid && (sel.collected_amount || 0) === 0)) && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-600 font-bold">{(sel.collected_amount || 0) > 0 ? 'Extended Stay' : 'Accommodation'}</span>
                                  {isPrepaid && (sel.collected_amount || 0) === 0 ? (
                                    <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded uppercase tracking-wider">Prepaid</span>
                                  ) : (
                                    <span className="text-slate-900 font-black">${svcAmount.toFixed(2)}</span>
                                  )}
                                </div>
                              )}
                              {/* Food */}
                              {svcLunch && svcLunchCount > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Lunch ×{svcLunchCount}</span><span>${(svcLunchCount * (pricing?.lunch_price || 0)).toFixed(2)}</span></div>}
                              {svcDinner && svcDinnerCount > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Dinner ×{svcDinnerCount}</span><span>${(svcDinnerCount * (pricing?.dinner_price || 0)).toFixed(2)}</span></div>}
                              {/* Services */}
                              {svcGuide && svcGuidePrice > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Guide</span><span>${svcGuidePrice.toFixed(2)}</span></div>}
                              {(() => {
                                const tPrice = svcTransList.reduce((s, t) => s + (t.price || 0), 0);
                                if (!svcTransport || tPrice <= 0) return null;
                                return <div className="flex justify-between text-xs text-slate-500"><span>Transport</span><span>${tPrice.toFixed(2)}</span></div>;
                              })()}
                              {svcCooking && svcCookingPrice > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Cooking Class</span><span>${svcCookingPrice.toFixed(2)}</span></div>}
                              {svcLaundry && svcLaundryPrice > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Laundry</span><span>${svcLaundryPrice.toFixed(2)}</span></div>}
                              {/* Drinks & Extras */}
                              {dTotal_calc > 0 && <div className="flex justify-between text-xs text-slate-500"><span>Drinks</span><span>${dTotal_calc.toFixed(2)}</span></div>}
                              {extraServices.map((ex, i) => {
                                const p = parseFloat(ex.price) || 0;
                                if (p <= 0) return null;
                                return <div key={i} className="flex justify-between text-xs text-slate-500"><span>{ex.name}</span><span>${p.toFixed(2)}</span></div>;
                              })}
                              {svcDiscount > 0 && <div className="flex justify-between text-xs text-rose-500"><span>Discount</span><span>-${svcDiscount.toFixed(2)}</span></div>}
                              <div className="flex justify-between text-sm pt-2 border-t border-slate-100 mt-1"><span className="font-bold text-slate-900">Tab Total</span><span className="font-black text-indigo-600">${gTotal.toFixed(2)}</span></div>
                              {gTotal === 0 && (sel.collected_amount || 0) > 0 && (
                                <p className="text-[10px] text-indigo-400 italic text-center mt-2">This folio is currently empty. View settled tabs in the history below.</p>
                              )}
                            </div>
                          </div>

                          {/* Collected Payments */}
                          <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest text-center">Payments Received</p>
                            <div className="space-y-1.5">
                              {svcPayList.filter(p => parseFloat(p.amount) > 0).length > 0 ? (
                                <>
                                  {svcPayList.filter(p => parseFloat(p.amount) > 0).map((p, i) => (
                                    <div key={i} className="flex justify-between text-xs font-bold text-indigo-700"><span>{p.currency} · {p.method}</span><span>{formatSpace(parseFloat(p.amount || '0'), p.currency === 'UZS' ? 0 : 2)} {p.currency}</span></div>
                                  ))}
                                  <div className="flex justify-between text-xs font-black text-indigo-600 pt-1.5 border-t border-indigo-100 mt-1">
                                    <span>Total Received</span>
                                    <span>${tPaidUsd.toFixed(2)}</span>
                                  </div>
                                </>
                              ) : (
                                <p className="text-xs text-indigo-400 italic text-center">No payments entered yet</p>
                              )}
                            </div>
                            {debtRemaining > 0.01 && !isBalanceMatched && (
                              <div className="flex justify-between text-xs font-bold text-rose-600 pt-1 border-t border-indigo-100"><span>Still Owed</span><span>${(debtRemaining - tPaidUsd).toFixed(2)}</span></div>
                            )}
                          </div>

                          {(() => {
                            try {
                              const s = getSettledReceiptsForSel();
                              if (!s.length) return null;
                              return (
                                <div className="space-y-3">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Settled Tabs History</p>
                                  <div className="space-y-2">
                                    {s.map((r: any, idx: number) => (
                                      <button
                                        key={r.id || idx}
                                        onClick={() => setSelectedReceipt(r)}
                                        className="w-full text-left bg-white rounded-2xl border border-slate-200 p-3 hover:bg-slate-50 transition-all"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-xs font-black text-slate-900 truncate">Tab {idx + 1}</p>
                                            <p className="text-[10px] text-slate-400 font-bold">
                                              {r.date ? new Date(r.date).toLocaleString() : '—'}
                                            </p>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <p className="text-xs font-black text-emerald-700">${(r.total || 0).toFixed(2)}</p>
                                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">paid</p>
                                          </div>
                                        </div>

                                        <div className="mt-2 space-y-1">
                                          {((r.items?.accommodation || 0) > 0 || r.items?.isPrepaid) && (
                                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                              <span>Accommodation</span>
                                              <span>{r.items?.isPrepaid ? 'Prepaid' : `$${(r.items?.accommodation || 0).toFixed(2)}`}</span>
                                            </div>
                                          )}
                                          {(r.items?.meals?.lunch || 0) > 0 && (
                                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                              <span>Lunch ×{r.items.meals.lunch}</span>
                                              <span>${(r.items.meals.lunch * (pricing?.lunch_price || 0)).toFixed(2)}</span>
                                            </div>
                                          )}
                                          {(r.items?.meals?.dinner || 0) > 0 && (
                                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                              <span>Dinner ×{r.items.meals.dinner}</span>
                                              <span>${(r.items.meals.dinner * (pricing?.dinner_price || 0)).toFixed(2)}</span>
                                            </div>
                                          )}
                                          {Object.entries(r.items?.services || {}).map(([k, v]: [string, any]) => (v > 0 ? (
                                            <div key={k} className="flex justify-between text-[10px] font-bold text-slate-500 capitalize">
                                              <span>{k}</span>
                                              <span>${parseFloat(v).toFixed(2)}</span>
                                            </div>
                                          ) : null))}
                                          {(r.items?.drinks || []).slice(0, 3).map((d: any, i: number) => (
                                            <div key={i} className="flex justify-between text-[10px] font-bold text-slate-500">
                                              <span>{d.drink_name} ×{d.quantity}</span>
                                              <span>${(d.price * d.quantity).toFixed(2)}</span>
                                            </div>
                                          ))}
                                          {(r.items?.drinks || []).length > 3 && (
                                            <div className="text-[10px] font-bold text-slate-400">+{(r.items.drinks.length - 3)} more drinks</div>
                                          )}
                                          {(r.items?.extras || []).slice(0, 2).map((ex: any, i: number) => (
                                            <div key={i} className="flex justify-between text-[10px] font-bold text-slate-500">
                                              <span>{ex.name}</span>
                                              <span>${parseFloat(ex.price || 0).toFixed(2)}</span>
                                            </div>
                                          ))}
                                          {(r.items?.extras || []).length > 2 && (
                                            <div className="text-[10px] font-bold text-slate-400">+{(r.items.extras.length - 2)} more extras</div>
                                          )}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            } catch (e) {
                              console.error('History parse error:', e);
                              return null;
                            }
                          })()}
                        </div>
                      )}

                      {(selectedReceipt || sel.status === 'completed' || (sel.status === 'checked_in' && gTotal === 0 && (sel.collected_amount || 0) > 0)) ? (
                        <div className="w-full py-4 bg-emerald-50 text-emerald-700 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 border-2 border-emerald-200 shadow-inner">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          PAID & SETTLED
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            const needsAccom = (sel.collected_amount || 0) === 0 && !isPrepaid && svcAmount <= 0;
                            if (needsAccom) {
                              setValError('Stay Price is missing. Please enter the guest\'s accommodation cost before proceeding.');
                              setShowFinalReceipt(false);
                              setShowServices(true);
                              return;
                            }
                            await handleCheckOut();
                          }}
                          disabled={loadingAction === 'checkout' || !isBalanceMatched || gTotal <= 0}
                          className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl ${(!isBalanceMatched || gTotal <= 0) ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-50 shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100'}`}
                        >
                          {loadingAction === 'checkout' ? <span className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" /> : 'Confirm & Settle Tab'}
                        </button>
                      )}
                      {/* Small View Check Buttons at the bottom */}
                      {(() => {
                        try {
                          const s = getSettledReceiptsForSel();
                          if (!s.length) return null;
                          return (
                            <div className="pt-4 border-t border-slate-100 space-y-3">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Settled Receipts History</p>
                              <div className="flex flex-wrap justify-center gap-2">
                                <button 
                                  onClick={() => setSelectedReceipt(null)}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${!selectedReceipt ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'}`}
                                >
                                  Current Folio
                                </button>
                                {s.map((r: any, idx: number) => (
                                  <button 
                                    key={r.id || idx} 
                                    onClick={() => setSelectedReceipt(r)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${selectedReceipt?.id === r.id ? 'bg-emerald-600 border-emerald-700 text-white shadow-md' : 'bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100'}`}
                                  >
                                    Tab {idx + 1}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        } catch (e) { 
                          console.error('History parse error:', e);
                          return null; 
                        }
                      })()}
                      <p className="text-[10px] text-center text-slate-400 font-bold">
                        {sel.status === 'completed' ? 'This receipt is finalized.' : 'Settling the tab clears the current bill. Guest stays checked-in for extensions.'}
                      </p>
                    </div>
                  </div>
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

    {/* Stylish Validation Error Modal */}
    {valError && (
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setValError(null)} />
        <div className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-rose-500 p-8 text-white text-center relative">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/30 animate-bounce">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-2xl font-black uppercase tracking-tight">Checkout Blocked</h3>
            <p className="text-rose-100 text-[10px] font-bold uppercase tracking-widest mt-1">Validation Required</p>
          </div>
          <div className="p-8 space-y-6">
            <p className="text-slate-600 text-sm font-medium leading-relaxed text-center">
              {valError}
            </p>
            <button 
              onClick={() => setValError(null)}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
            >
              I Understand
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
