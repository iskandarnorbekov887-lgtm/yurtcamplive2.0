'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';

import { supabase, type Booking, type UserRole } from '@/lib/supabase';
import { PrivateCalendarView } from '@/components/private-calendar-view';
import { BookingModal } from '@/components/BookingModal';
import { 
  localDateStr, 
  formatSpace, 
  sanitizeNotes,
  isGcCancelled,
  handleApproveDatesLogic
} from '@/utils/calendar-logic';

import { ManagerIncomeForm } from '@/components/manager-income-form';


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
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const sel = selectedItem?.booking ?? null;

  const [loadingAction, setLoadingAction] = useState('');
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<Record<number, number>>({});
  const [showDrinks, setShowDrinks] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  
  const getPrefix = (item: ListItem) => {
    const booking = item.booking;
    if (!booking) return '';
    
    let category = '';
    try {
      const meta = typeof booking.special_requests === 'string' 
        ? JSON.parse(booking.special_requests || '{}') 
        : (booking.special_requests || {});
      category = meta.guest_category || '';
    } catch {}

    if (category === 'pool') return '🏊 ';
    if (category === 'local') return '🏠 ';
    return '';
  };

  const [svcAmount, setSvcAmount] = useState(0);
  const [svcDiscount, setSvcDiscount] = useState(0);
  const [svcPayList, setSvcPayList] = useState<Array<{ 
    amount: string; 
    currency: 'USD' | 'UZS' | 'EUR'; 
    method: 'Cash' | 'Card/Online';
    rate?: number;
    id?: number; 
  }>>([{ amount: '', currency: 'USD', method: 'Cash' }]);

  const [isPrepaid, setIsPrepaid] = useState(false);
  const [isLunchPrepaid, setIsLunchPrepaid] = useState(false);
  const [isDinnerPrepaid, setIsDinnerPrepaid] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(localDateStr(new Date()));
  const [editingDates, setEditingDates] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [nowTime, setNowTime] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [svcLunch, setSvcLunch] = useState(false);
  const [svcLunchCount, setSvcLunchCount] = useState(0);
  const [svcDinner, setSvcDinner] = useState(false);
  const [svcDinnerCount, setSvcDinnerCount] = useState(0);
  const [svcGuide, setSvcGuide] = useState(false);
  const [svcGuideNames, setSvcGuideNames] = useState<string[]>(['']);
  const [svcGuidePrice, setSvcGuidePrice] = useState(0);
  const [svcTransport, setSvcTransport] = useState(false);
  const [svcTransList, setSvcTransList] = useState<Array<{ name: string; details: string; price: number }>>([{ name: '', details: '', price: 0 }]);
  const [svcAdults, setSvcAdults] = useState(1);
  const [svcChildren, setSvcChildren] = useState(0);
  const [showFinalReceipt, setShowFinalReceipt] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [historyPayments, setHistoryPayments] = useState<any[]>([]);
  const [dateAdjAmount, setDateAdjAmount] = useState('');
  const [dbSettledReceipts, setDbSettledReceipts] = useState<any[]>([]);
  const [extraServices, setExtraServices] = useState<any[]>([]);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraPrice, setNewExtraPrice] = useState('');
  const [showServices, setShowServices] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [collectedAmount, setCollectedAmount] = useState('');
  const [collectedCurrency, setCollectedCurrency] = useState<'USD' | 'UZS' | 'EUR'>('USD');
  const [fetchingRate, setFetchingRate] = useState<'UZS' | 'EUR' | null>(null);
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [payModified, setPayModified] = useState(false);
  const [showDayAgenda, setShowDayAgenda] = useState(false);
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);

  const getSettledReceiptsForSel = () => {
    if (!sel) return [];
    try {
      const meta = typeof sel.special_requests === 'string' ? JSON.parse(sel.special_requests || '{}') : (sel.special_requests || {});
      return meta.settled_receipts || [];
    } catch { return []; }
  };

  const DEFAULT_PRICING = { lunch_price: 10, dinner_price: 10, guide_price: 40, usd_to_uzs: 12500, usd_to_eur: 0.92 };
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [valError, setValError] = useState<string | null>(null);

  const gTotal = Math.max(0, (isPrepaid ? 0 : svcAmount) + 
    (kitchenOrders || []).reduce((sum: number, o: any) => {
      if (o.status === 'confirmed' || o.status === 'served') {
        if (o.prepaid) return sum;
        const price = o.type.toLowerCase() === 'lunch' ? pricing.lunch_price : pricing.dinner_price;
        return sum + ((o.quantity || 0) * price);
      }
      return sum;
    }, 0) +
    (svcLunch && !isLunchPrepaid ? svcLunchCount * pricing.lunch_price : 0) +
    (svcDinner && !isDinnerPrepaid ? svcDinnerCount * pricing.dinner_price : 0) +
    (svcGuide ? svcGuidePrice : 0) +
    (svcTransport ? svcTransList.reduce((s: number, t: any) => s + (t.price || 0), 0) : 0) +
    Object.entries(selectedDrinks).reduce((sum: number, [id, qty]: [string, number]) => {
      const drink = drinks.find((d: any) => d.id === parseInt(id));
      return sum + (qty * (drink?.sold_price || 0));
    }, 0) +
    extraServices.reduce((sum: number, s: any) => sum + (parseFloat(s.price) || 0), 0) - svcDiscount);
  
  const debtRemaining = gTotal;
  const tPaidUsd = svcPayList.reduce((sum, p) => {
    const amt = parseFloat(p.amount) || 0;
    if (p.currency === 'USD') return sum + amt;
    const rate = p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92);
    return sum + (amt / rate);
  }, 0);
  const isBalanceMatched = Math.abs(tPaidUsd - debtRemaining) < 1.00;
  const today = localDateStr(new Date());
  const isAfterNoon = nowTime.getHours() >= 12;
  const isAfterTwo = nowTime.getHours() >= 14;

  useEffect(() => {
    supabase.from('service_pricing').select('*').eq('id', 1).then(({ data }) => {
      if (data?.[0]) setPricing({ ...DEFAULT_PRICING, ...data[0] });
    });
    supabase.from('drinks').select('*').eq('available', true).then(({ data }) => setDrinks(data || []));
  }, []);

  const [gcEvents, setGcEvents] = useState<CalEvent[]>([]);
  const [syncWarnings, setSyncWarnings] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/calendar/events');
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.indexOf('application/json') !== -1) {
          const data = await res.json();
          if (Array.isArray(data)) setGcEvents(data);
        } else {
          console.error(`Expected JSON, got ${contentType}`);
        }
      } catch (err) { console.error('Failed to fetch GC events:', err); }
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 60000); // Sync every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!sel) {
      setKitchenOrders([]);
      return;
    }

    const syncKitchen = async () => {
      const { data: dbMeals } = await supabase
        .from('meal_requests')
        .select('*')
        .eq('booking_id', sel.id);
      
      if (!dbMeals) return;

      const statusMap: Record<string, string> = { 'Pending': 'pending', 'Accepted': 'confirmed', 'Served': 'served' };
      const meta = typeof sel.special_requests === 'string' ? JSON.parse(sel.special_requests || '{}') : (sel.special_requests || {});
      const jsonOrders = meta.kitchen_orders || [];
      const settledReceipts = meta.settled_receipts || [];
      
      const paidMealIds = new Set();
      settledReceipts.forEach((r: any) => {
        if (r.snapshot?.kitchen_orders) {
          r.snapshot.kitchen_orders.forEach((ko: any) => {
            if (ko.meal_id) paidMealIds.add(ko.meal_id);
          });
        }
      });

      const synced = dbMeals.map(m => {
        const type = m.meal_type.toLowerCase();
        const isPaidInReceipt = paidMealIds.has(m.id);
        const jsonMatch = jsonOrders.find((jo: any) => jo.meal_id === m.id || (!jo.meal_id && jo.type === type));
        
        return {
          type,
          quantity: m.adult_qty,
          status: isPaidInReceipt ? 'paid' : (statusMap[m.status] || m.status.toLowerCase()),
          prepaid: jsonMatch ? jsonMatch.prepaid : (type === 'lunch' ? isLunchPrepaid : isDinnerPrepaid),
          meal_id: m.id
        };
      });
      setKitchenOrders(synced);
    };

    syncKitchen();
    
    const channel = supabase
      .channel(`kitchen-sync-${sel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_requests', filter: `booking_id=eq.${sel.id}` }, () => syncKitchen())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sel?.id, isLunchPrepaid, isDinnerPrepaid]);

  useEffect(() => {
    if (gcEvents.length === 0 || bookings.length === 0) return;
    const warnings: Record<string, string> = {};
    bookings.forEach(b => {
      if (!(b as any).google_event_id) return;
      const ev = gcEvents.find(e => e.id === (b as any).google_event_id);
      if (!ev) {
        if (b.status === 'confirmed' || b.status === 'checked_in') warnings[b.id] = 'deleted';
        return;
      }
      if (isGcCancelled(ev)) {
        if (b.status !== 'cancelled') warnings[b.id] = 'deleted';
        return;
      }
      if (!(b as any).is_manual_dates && (b.check_in !== ev.start || b.check_out !== ev.end)) {
        warnings[b.id] = 'dates_changed';
      }
    });
    setSyncWarnings(warnings);
  }, [gcEvents, bookings]);

  const gcItems = useMemo(() => gcEvents.map(ev => ({
    key: `gc-${ev.id}`, name: ev.summary, start: ev.start, end: ev.end, source: 'google' as const, booking: null, event: ev,
  })), [gcEvents]);

  const bookingItems = useMemo(() => bookings.map(b => ({
    key: `db-${b.id}`, name: b.guest_name, start: b.check_in, end: b.check_out, source: 'db' as const, booking: b, event: null,
  })), [bookings]);

  const D = selectedCalendarDay;

  const unlinkedGcItems = useMemo(() => {
    return gcItems.filter(gi => !bookings.some(b => (b as any).google_event_id === gi.event?.id) && !isGcCancelled(gi.event!));
  }, [gcItems, bookings]);

  const arrivingItems = useMemo(() => {
    const dbs = bookingItems.filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in === D);
    const gcs = unlinkedGcItems.filter(i => i.start === D);
    return [...dbs, ...gcs].sort((a, b) => a.start.localeCompare(b.start));
  }, [bookingItems, unlinkedGcItems, D]);

  const stayingItems = useMemo(() => {
    const dbs = bookingItems.filter(i => (i.booking!.status === 'confirmed' || i.booking!.status === 'checked_in') && i.booking!.check_in < D && i.booking!.check_out > D);
    const gcs = unlinkedGcItems.filter(i => i.start < D && i.end > D);
    return [...dbs, ...gcs].sort((a, b) => a.start.localeCompare(b.start));
  }, [bookingItems, unlinkedGcItems, D]);

  const checkedInItems = useMemo(() => {
    return bookingItems.filter(i => i.booking!.status === 'checked_in' && i.booking!.check_in <= D && i.booking!.check_out > D).sort((a, b) => a.start.localeCompare(b.start));
  }, [bookingItems, D]);

  const checkingOutItems = useMemo(() => {
    const dbs = bookingItems.filter(i => i.booking!.status === 'checked_in' && i.booking!.check_out === D);
    const gcs = unlinkedGcItems.filter(i => i.end === D);
    return [...dbs, ...gcs].sort((a, b) => a.start.localeCompare(b.start));
  }, [bookingItems, unlinkedGcItems, D]);

  const checkedOutItems = useMemo(() => bookingItems.filter(i => i.booking!.status === 'completed' && i.booking!.check_out === D).sort((a, b) => b.start.localeCompare(a.start)), [bookingItems, D]);
  const cancelledItems = useMemo(() => bookingItems.filter(i => i.booking!.status === 'cancelled' && i.booking!.check_in <= D && i.booking!.check_out > D).sort((a, b) => b.start.localeCompare(a.start)), [bookingItems, D]);

  useEffect(() => {
    if (selectedItem?.booking) {
      const updated = bookings.find(b => b.id === selectedItem.booking!.id);
      if (updated) {
        const currentStr = JSON.stringify(selectedItem.booking);
        const updatedStr = JSON.stringify(updated);
        if (currentStr !== updatedStr) {
          setTimeout(() => setSelectedItem(prev => prev ? { ...prev, booking: updated } : prev), 0);
        }
      }
    }
  }, [bookings, selectedItem?.booking]);

  useEffect(() => {
    setTimeout(() => setSelectedReceipt(null), 0);
  }, [sel?.id]);

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
                <span className="text-slate-400 font-medium mr-1">{getPrefix(item)}</span>
                {item.name}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 hc-mono font-data">{item.start} → {item.end}</p>
              {booking ? <p className="text-xs text-slate-500">Booking</p> : <p className="text-xs text-slate-400">calendar only</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {isCancelled
                ? <span className="text-[10px] font-bold px-2 py-0.5 border border-red-600 text-red-600 font-mono uppercase">cancelled</span>
                : booking ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 border border-black text-black font-mono uppercase ${statusColor(booking.status, booking)}`}>
                        {String(booking.status).replace('_', ' ')}
                      </span>
                      {(() => {
                        const isPrepaid = booking.payment_status === 'Prepaid';
                        const accommodation = booking.total_price || 0;
                        const collected = booking.collected_amount || 0;
                        const mealPrice = pricing?.lunch_price || 10;
                        const mealsBill = (booking.meal_requests || []).reduce((sum: number, m: any) => {
                          if (['Accepted', 'Served', 'confirmed', 'served'].includes(m.status)) {
                             return sum + ((m.adult_qty || 0) + (m.child_qty || 0)) * mealPrice;
                          }
                          return sum;
                        }, 0);
                        const liveTab = accommodation + mealsBill - collected;

                        return (
                          <span className={`text-[10px] font-mono font-black uppercase mt-1 ${isPrepaid ? 'text-emerald-600' : 'text-black'}`}>
                            {isPrepaid ? 'PREPAID' : `TAB: $${liveTab.toFixed(2)}`}
                          </span>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 border border-black text-black font-mono uppercase bg-white">
                      EXTERNAL PENDING
                    </span>
                  )
              }
              {booking && syncWarnings[booking.id] === 'deleted' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 border border-red-600 text-red-600 font-mono uppercase">⚠ REMOVED</span>
              )}
              {booking && syncWarnings[booking.id] === 'dates_changed' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 border border-black text-black font-mono uppercase bg-white">⚠ DATES ≠</span>
              )}
              {booking?.status === 'checked_in' && booking.check_out === today && (
                <>
                  {isAfterTwo ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">⚠ OVERDUE (2PM+)</span>
                  ) : isAfterNoon ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-white">⚠ LATE (12PM+)</span>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </button>

        {showApprove && booking && (
          <button
            onClick={e => { e.stopPropagation(); void handleApproveDates(booking); }}
            disabled={loadingAction === `syncdates-${booking.id}`}
            className="mt-2 w-full px-3 py-2 bg-[#047857] hover:bg-[#035e44] text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-60 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
          >
            {loadingAction === `syncdates-${booking.id}` ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '⇵'}
            Confirm Sync
          </button>
        )}
      </div>
    );
  };

  const statusColor = (s?: string, booking?: any) => {
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

    if (isSystemOnly) {
      return 'bg-white text-black border border-black font-mono uppercase';
    }

    return {
      checked_in: 'bg-white text-black border border-black font-mono uppercase',
      confirmed: 'bg-white text-black border border-black font-mono uppercase',
      completed: 'bg-white text-black border border-black font-mono uppercase text-opacity-40',
      cancelled: 'bg-white text-red-600 border border-red-600 font-mono uppercase',
      pending: 'bg-white text-black border border-black font-mono uppercase',
      no_arrival: 'bg-white text-slate-400 border border-slate-300 font-mono uppercase',
    }[s ?? ''] ?? 'bg-white text-slate-500 border border-slate-200 font-mono uppercase';
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
        status: doCheckIn || true ? 'checked_in' : 'confirmed',
        source: 'System',
        google_event_id: String(ev.id),
        total_price: 0,
        number_of_people: 1,
        payment_status: 'Unpaid',
        approved_by_manager: true,
        created_by_id: String(currentUserId),
        notes: sanitizeNotes(ev.description),
        special_requests: JSON.stringify({ is_system_only: true, is_manual_dates: true }),
      };

      const { data: inserted, error: insertErr } = await supabase.from('bookings').insert(payload).select().single();
      if (insertErr) throw new Error(insertErr.message);
      
      const insertedId = inserted?.id;
      if (doCheckIn && insertedId && onCheckIn) await onCheckIn(insertedId);
      
      try { await supabase.rpc('reload_schema'); } catch { }

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
      setEditCheckIn(b.check_in);
      setEditCheckOut(b.check_out);
      setEditingDates(false);
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
          specialRequest: '',
        });
      }
      setDayEntries(entries);

      const receipts = getSettledReceiptsForSel();
      const hasSettled = receipts.length > 0 || (b.collected_amount || 0) > 0;

      setIsPrepaid(draft?.isPrepaid ?? (hasSettled ? true : (b.payment_status === 'Prepaid' || b.payment_note?.includes('Accommodation') || false)));
      setIsLunchPrepaid(draft?.isLunchPrepaid ?? (b.payment_note?.includes('Lunch') || false));
      setIsDinnerPrepaid(draft?.isDinnerPrepaid ?? (b.payment_note?.includes('Dinner') || false));
      
      let kitchenOrders: any[] = [];
      try {
        const meta = typeof b.special_requests === 'string' ? JSON.parse(b.special_requests || '{}') : (b.special_requests || {});
        kitchenOrders = meta.kitchen_orders || [];
      } catch {}

      const { data: dbMeals } = await supabase
        .from('meal_requests')
        .select('meal_type, status, adult_qty, child_qty')
        .eq('booking_id', b.id);
      if (dbMeals && dbMeals.length > 0) {
        const statusMap: Record<string, string> = { 'Pending': 'pending', 'Accepted': 'confirmed' };
        for (const m of dbMeals) {
          if (m.status === 'Served') continue; 
          const type = m.meal_type.toLowerCase();
          const newStatus = statusMap[m.status] || m.status.toLowerCase();
          const existing = kitchenOrders.find((o: any) => o.type === type);
          if (existing) {
            existing.status = newStatus;
            existing.quantity = m.adult_qty;
          } else {
            kitchenOrders.push({ type, quantity: m.adult_qty, status: newStatus, prepaid: false, guest_name: b.guest_name, id: b.id, requested_at: new Date().toISOString() });
          }
        }
      }

      const accLunch = kitchenOrders.find((o: any) => o.type === 'lunch' && o.status === 'confirmed');
      const accDinner = kitchenOrders.find((o: any) => o.type === 'dinner' && o.status === 'confirmed');

      setSvcLunch(!!accLunch);
      setSvcLunchCount(accLunch?.quantity || 0);
      setSvcDinner(!!accDinner);
      setSvcDinnerCount(accDinner?.quantity || 0);

      setIsLunchPrepaid(accLunch?.prepaid ?? (draft?.isLunchPrepaid ?? (b.payment_note?.includes('Lunch') || false)));
      setIsDinnerPrepaid(accDinner?.prepaid ?? (draft?.isDinnerPrepaid ?? (b.payment_note?.includes('Dinner') || false)));
      
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
      
      setSvcAmount(draft?.svcAmount ?? (hasSettled ? 0 : Math.max(0, b.total_price - (b.collected_amount || 0))));
      setSvcDiscount(draft?.svcDiscount ?? 0);

      const initialSvcAmount = draft?.svcAmount ?? (hasSettled ? 0 : Math.max(0, b.total_price - (b.collected_amount || 0)));
      const initialIsPrepaid = draft?.isPrepaid ?? (hasSettled ? true : (b.payment_note?.includes('Accommodation') || false));
      const initialIsLunchPrepaid = accLunch?.prepaid ?? (draft?.isLunchPrepaid ?? (b.payment_note?.includes('Lunch') || false));
      const initialIsDinnerPrepaid = accDinner?.prepaid ?? (draft?.isDinnerPrepaid ?? (b.payment_note?.includes('Dinner') || false));
      
      const initialSTotal = (
        (accLunch && !initialIsLunchPrepaid ? (accLunch.quantity * pricing.lunch_price) : 0) +
        (accDinner && !initialIsDinnerPrepaid ? (accDinner.quantity * pricing.dinner_price) : 0) +
        ( (draft?.svcGuide ?? b.guide_service) ? (draft?.svcGuidePrice ?? (parseFloat(b.guide_amount || '0') || pricing.guide_price)) : 0 )
      );

      const initialGTotal = Math.max(0, (initialIsPrepaid ? 0 : initialSvcAmount) + initialSTotal - (draft?.svcDiscount ?? 0));

      let defaultCurrency: 'UZS' | 'USD' | 'EUR' = 'USD';
      try {
        const meta = typeof b.special_requests === 'string'
          ? JSON.parse(b.special_requests || '{}')
          : (b.special_requests || {});
        const cat = meta.guest_category || '';
        if (cat === 'local' || cat === 'pool') defaultCurrency = 'UZS';
      } catch {}
      const resolvedCurrency = defaultCurrency;
      setCollectedCurrency(resolvedCurrency);

      setSvcPayList([{ 
        amount: initialGTotal > 0 ? initialGTotal.toString() : '', 
        currency: resolvedCurrency, 
        method: 'Cash' 
      }]);
      setPayModified(false);
    } else {
      setDayEntries([]);
      setSvcLunch(false); setSvcLunchCount(0);
      setSvcDinner(false); setSvcDinnerCount(0);
      setSvcGuide(false); setSvcGuideNames(['']); setSvcGuidePrice(40);
      setSvcTransport(false); setSvcTransList([{ name: '', details: '', price: 0 }]);
      setSvcAmount(0);
      setSvcDiscount(0);
      setSvcPayList([{ amount: '0', currency: 'USD', method: 'Cash' }]);
      setPayModified(false);
    }
  };

  useEffect(() => {
    if (!sel || !onUpdateBooking) return;
    
    const timer = setTimeout(async () => {
      const draft = {
        isPrepaid, isLunchPrepaid, isDinnerPrepaid,
        svcLunch, svcLunchCount, svcDinner, svcDinnerCount,
        svcGuide, svcGuidePrice, svcGuideNames,
        svcTransport, svcTransList,
        svcAmount, svcDiscount
      };
      
      try {
        const { data: latest } = await supabase
          .from('bookings')
          .select('special_requests')
          .eq('id', sel.id)
          .single();
          
        const latestMeta = latest?.special_requests 
          ? (typeof latest.special_requests === 'string' ? JSON.parse(latest.special_requests) : latest.special_requests)
          : {};

        const updatedMeta = { 
          ...latestMeta, 
          days: dayEntries, 
          draft 
        };

        await supabase.from('bookings')
          .update({ special_requests: JSON.stringify(updatedMeta) })
          .eq('id', sel.id);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 2000); 

    return () => clearTimeout(timer);
  }, [
    sel?.id, isPrepaid, isLunchPrepaid, isDinnerPrepaid,
    svcLunch, svcLunchCount, svcDinner, svcDinnerCount,
    svcGuide, svcGuidePrice, svcGuideNames,
    svcTransport, svcTransList,
    svcAmount, svcDiscount,
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

  const handleCheckIn = async () => {
    if (!sel || !onCheckIn) return;
    setLoadingAction('checkin');
    try { await onCheckIn(sel.id); flash('✓ Guest checked in.'); }
    catch { flash('⚠ Check-in failed.'); }
    finally { setLoadingAction(''); }
  };

  const finalizeTab = async (): Promise<boolean> => {
    if (!sel || !onCheckOut) return false;
    const receipts = getSettledReceiptsForSel();
    const hasSettled = receipts.length > 0 || (sel.collected_amount || 0) > 0;

    if (!isPrepaid && svcAmount <= 0 && !hasSettled) {
      flash('⚠ Stay Price (Accommodation) is required for the first tab.');
      setShowServices(true);
      return false;
    }
    if ((svcLunch && svcLunchCount <= 0) || (svcDinner && svcDinnerCount <= 0)) {
      flash('⚠ Quantity is required for selected meals.');
      setShowServices(true);
      return false;
    }
    if (svcGuide && (svcGuideNames.some(n => !n.trim()) || svcGuidePrice <= 0)) {
      flash('⚠ Please enter guide name and amount.');
      setShowServices(true);
      return false;
    }
    if (svcTransport && svcTransList.some(t => !t.name.trim() || !t.details.trim() || t.price <= 0)) {
      flash('⚠ Please fill all transport fields (name, destination, amount).');
      setShowServices(true);
      return false;
    }
    setLoadingAction('checkout');
    try {
      const drinkTab = Object.entries(selectedDrinks).filter(([, q]) => q > 0).map(([id, qty]) => {
        const d = drinks.find(d => d.id === parseInt(id));
        return { drink_id: parseInt(id), drink_name: d?.name || '', quantity: qty, price: d?.sold_price || 0, currency: d?.currency || 'USD' };
      });
      let currentMeta: any = {};
      try {
        const { data: latest } = await supabase
          .from('bookings')
          .select('special_requests')
          .eq('id', sel.id)
          .single();
          
        const parsed = typeof latest?.special_requests === 'string'
          ? JSON.parse(latest.special_requests || '{}')
          : (latest?.special_requests || {});
        currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
      } catch {
        currentMeta = {};
      }
      
      const kitchenOrders = currentMeta.kitchen_orders || [];
      const accLunch = kitchenOrders.find((o: any) => o.type === 'lunch' && o.status === 'confirmed');
      const accDinner = kitchenOrders.find((o: any) => o.type === 'dinner' && o.status === 'confirmed');

      const sTotal = (
        (accLunch && !accLunch.prepaid && !isLunchPrepaid ? accLunch.quantity * (pricing.lunch_price) : 0) +
        (accDinner && !accDinner.prepaid && !isDinnerPrepaid ? accDinner.quantity * (pricing.dinner_price) : 0) +
        (svcGuide ? svcGuidePrice : 0) +
        (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0)
      );

      const now = new Date();
      const datePart = now.toISOString().split('T')[0].replace(/-/g, '').slice(2);
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
            isLunchPrepaid: accLunch?.prepaid || isLunchPrepaid,
            isDinnerPrepaid: accDinner?.prepaid || isDinnerPrepaid
          },
          services: { 
            guide: svcGuide ? svcGuidePrice : 0, 
            transport: svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0, 
          },
          extras: [...extraServices],
          drinks: drinkTab
        },
        total: gTotal,
        payments: svcPayList.filter(p => parseFloat(p.amount) > 0)
      };

      const settledReceipts = [...(currentMeta.settled_receipts || []), snapshot];

      const totalPaidUsd = svcPayList.reduce((sum, p) => {
        const amt = parseFloat(p.amount) || 0;
        const rate = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
        return sum + (p.currency === 'USD' ? amt : (amt / rate));
      }, 0);

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

      try {
        await supabase.from('booking_receipts').insert({
          booking_id: sel.id,
          receipt_id: receiptId,
          snapshot,
          total_usd: gTotal,
        });
      } catch {}

      const isCurrentlyPrepaid = isPrepaid || sel.payment_status === 'Prepaid';
      
      const updates: any = {
        is_manually_updated: true,
        total_price: gTotal,
        number_of_people: svcAdults,
        children_under_12: svcChildren,
        collected_amount: isCurrentlyPrepaid 
          ? gTotal
          : ((sel.collected_amount || 0) + totalPaidUsd),
        collected_currency: isCurrentlyPrepaid 
          ? (sel.currency || 'USD') 
          : 'USD',
        payment_status: isCurrentlyPrepaid ? 'Prepaid' : 'Paid',
        is_prepaid: isCurrentlyPrepaid,
        lunch: false, lunch_count: 0,
        dinner: false, dinner_count: 0,
        guide_service: false, guide_amount: null, guide_names: null,
        has_transportation: false, transportation_details: null,
        special_requests: JSON.stringify({ ...currentMeta, settled_receipts: settledReceipts, days: dayEntries, draft: null })
      };
      
      if (onUpdateBooking) await onUpdateBooking(sel.id, updates);
      if (onRefresh) await onRefresh();
      
      const updatedBooking = { ...sel, ...updates };
      setSelectedItem(prev => prev ? { ...prev, booking: updatedBooking } : null);
      
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.7 } });
      flash('✓ Tab Settled & Archived. Receipt is ready below.');
      setSelectedReceipt(snapshot);
      
      setSvcAmount(0); setSvcDiscount(0); setSvcAdults(1); setSvcChildren(0);
      setIsPrepaid(false); setIsLunchPrepaid(false); setIsDinnerPrepaid(false);
      setSvcLunch(false); setSvcLunchCount(0); setSvcDinner(false); setSvcDinnerCount(0);
      setSvcGuide(false); setSvcGuidePrice(40); setSvcGuideNames(['']);
      setSvcTransport(false); setSvcTransList([{ name: '', details: '', price: 0 }]);
      setExtraServices([]); setSelectedDrinks({});
      setSvcPayList([{ amount: '', currency: 'USD', method: 'Cash' }]);
      setPayModified(false);

      return true;
    } catch (err) { 
      console.error('Finalize Tab failed:', err);
      flash('⚠ Failed to settle tab.');
      return false;
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
        (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0)
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

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900">Guest Agenda</h2>
          <p className="text-xs text-slate-500">Today’s guest management portal</p>
        </div>
        <div className="flex items-center gap-2">
          {onAddNewBooking && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
            >
              <span>+</span>
              Add Booking
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="overflow-x-auto pb-4 lg:pb-0">
          <PrivateCalendarView
            bookings={bookings}
            calendarEvents={unlinkedGcItems.map(gi => ({ id: gi.event!.id, summary: gi.event!.summary, start: gi.start, end: gi.end }))}
            onDayChange={day => {
              setSelectedCalendarDay(day);
              setShowDayAgenda(true);
            }}
            onSelectBooking={b => setSelectedItem({ key: `db-${b.id}`, name: b.guest_name, start: b.check_in, end: b.check_out, source: 'db', booking: b, event: null })}
            onSelectCalendarEvent={ev => {
              const fullEvent = gcEvents.find(e => e.id === ev.id) || null;
              setSelectedItem({ key: `gc-${ev.id}`, name: ev.summary, start: ev.start, end: ev.end, source: 'calendar' as any, booking: null, event: fullEvent });
            }}
          />
        </div>
      </div>

      {(() => {
        const upcoming = [...bookingItems.filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in >= today && i.booking!.check_in <= localDateStr(new Date(Date.now() + 7 * 86400000))),
          ...unlinkedGcItems.filter(i => i.start >= today && i.start <= localDateStr(new Date(Date.now() + 7 * 86400000)))
        ].sort((a, b) => a.start.localeCompare(b.start));
        const checkedIn = bookingItems.filter(i => i.booking!.status === 'checked_in').sort((a, b) => a.start.localeCompare(b.start));
        if (upcoming.length === 0 && checkedIn.length === 0) return null;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Upcoming & Active
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Next 7 days · Bookings & Google Calendar</p>
            </div>
            <div className="divide-y divide-slate-100">
              {checkedIn.length > 0 && (
                <div className="px-4 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Checked In · {checkedIn.length}</p>
                  {checkedIn.map(item => (
                    <button key={item.key} onClick={() => handleSelect(item)} className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-emerald-50 transition-all group">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-data">{item.start} → {item.end}</p>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">✓ in</span>
                    </button>
                  ))}
                </div>
              )}
              {upcoming.length > 0 && (
                <div className="px-4 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Arriving Soon · {upcoming.length}</p>
                  {upcoming.map(item => (
                    <button key={item.key} onClick={() => {
                      if (item.booking) { handleSelect(item); }
                      else if (item.event) { setSelectedItem({ key: item.key, name: item.name, start: item.start, end: item.end, source: 'calendar' as any, booking: null, event: item.event }); }
                    }} className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-amber-50 transition-all group">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-data">{item.start} → {item.end}</p>
                      </div>
                      {item.booking
                        ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">confirmed</span>
                        : <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">📅 calendar</span>
                      }
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {showDayAgenda && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-black bg-white flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-600 mb-1">{D === today ? 'Today’s Operations' : 'Daily Schedule'}</p>
                <h3 className="text-lg font-black text-black hc-mono">
                  {new Date(D + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
              </div>
              <button 
                onClick={() => setShowDayAgenda(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {arrivingItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Arriving · {arrivingItems.length}
                  </p>
                  {arrivingItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {stayingItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    In Stay · {stayingItems.length}
                  </p>
                  {stayingItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {checkedInItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Checked In · {checkedInItems.length}
                  </p>
                  {checkedInItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {checkingOutItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Checking Out · {checkingOutItems.length}
                  </p>
                  {checkingOutItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {checkedOutItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-50 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Checked Out · {checkedOutItems.length}
                  </p>
                  {checkedOutItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {cancelledItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-700 bg-red-50 rounded-xl mb-1 flex items-center gap-2">
                    ✕ Cancelled · {cancelledItems.length}
                  </p>
                  {cancelledItems.map(item => renderCard(item, true))}
                </div>
              )}
            </div>
            <div className="p-4 bg-white border-t border-black">
              <button 
                onClick={() => setShowDayAgenda(false)}
                className="w-full py-3 bg-black text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all border border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              >
                Close Schedule
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setShowDayAgenda(false)} />
        </div>
      )}


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
        getSettledReceiptsForSel={getSettledReceiptsForSel}
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
        svcDiscount={svcDiscount}
        setSvcDiscount={setSvcDiscount}
        svcPayList={svcPayList}
        setSvcPayList={setSvcPayList}
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
        handleCheckOut={finalizeTab}
        finalizeTab={finalizeTab}
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
        handleCheckIn={handleCheckIn}
        handleCancel={async () => {}}
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

      <ManagerIncomeForm 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        selectedDate={selectedCalendarDay}
        onSuccess={() => {
          setShowAddModal(false);
          onRefresh?.();
        }}
      />
    </div>
  );
}
