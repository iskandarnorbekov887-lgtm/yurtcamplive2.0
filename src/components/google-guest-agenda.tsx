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
    
    const category = booking.guest_category || '';

    if (category === 'pool') return '🏊 ';
    if (category === 'local') return '🏠 ';
    return '';
  };

  const [svcAmount, setSvcAmount] = useState(0);
  const [svcDiscount, setSvcDiscount] = useState(0);
  const [svcPayList, setSvcPayList] = useState<Array<{ 
    amount: string; 
    currency: 'USD' | 'UZS' | 'EUR'; 
    method: 'Cash' | 'Online';
    rate?: number;
    id?: number; 
  }>>([{ amount: '', currency: 'USD', method: 'Cash' }]);

  const [svcDateAdjustment, setSvcDateAdjustment] = useState<number>(0);

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
  const [activeMeals, setActiveMeals] = useState<any[]>([]);

  const getSettledReceiptsForSel = () => {
    if (!sel) return [];
    return sel.settled_receipts || [];
  };

  const DEFAULT_PRICING = { lunch_price: 10, dinner_price: 10, guide_price: 40, usd_to_uzs: 12500, usd_to_eur: 0.92 };
  const [pricing, setPricing] = useState(DEFAULT_PRICING);
  const [valError, setValError] = useState<string | null>(null);

  const gTotal = useMemo(() => {
    // 1. Calculate Meal Debt from meal_requests table (Single Source of Truth)
    const unpaidMeals = activeMeals.filter(m => 
      !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
    );
    const mealDebt = unpaidMeals.reduce((sum, m) => {
      if (m.prepaid) return sum; // Prepaid meals contribute $0.00
      const price = m.meal_type === 'Lunch' ? pricing.lunch_price : pricing.dinner_price;
      return sum + ((m.adult_qty || 0) * price);
    }, 0);

    // 2. Aggregate Other Services
    const otherServices = (
      (svcGuide ? svcGuidePrice : 0) +
      (svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0) +
      Object.entries(selectedDrinks).reduce((sum, [id, qty]: [string, number]) => {
        const drink = drinks.find(d => d.id === parseInt(id));
        return sum + (qty * (drink?.sold_price || 0));
      }, 0) +
      extraServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0)
    );

    // 3. Final Tab calculation
    const total = (isPrepaid ? 0 : svcAmount) + mealDebt + otherServices + svcDateAdjustment - svcDiscount;
    
    return Math.max(0, total);
  }, [activeMeals, svcAmount, svcDateAdjustment, svcDiscount, svcGuide, svcGuidePrice, svcTransport, svcTransList, selectedDrinks, drinks, extraServices, pricing, isPrepaid]);
  
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
      setActiveMeals([]);
      return;
    }

    const syncKitchen = async () => {
      const { data: dbMeals } = await supabase
        .from('meal_requests')
        .select('*')
        .eq('booking_id', sel.id);
      
      if (!dbMeals) return;

      const statusMap: Record<string, string> = { 'Pending': 'pending', 'Accepted': 'confirmed', 'Served': 'served', 'Paid': 'paid' };

      const synced = dbMeals.map(m => {
        return {
          meal_id: m.id,
          id: m.id,
          meal_type: m.meal_type,     // Preserve original casing for user logic
          type: m.meal_type.toLowerCase(),
          adult_qty: m.adult_qty,     // Preserve for user logic
          quantity: m.adult_qty,
          status: statusMap[m.status] || m.status.toLowerCase(),
          prepaid: m.prepaid || false,
          is_paid: m.is_paid || false,
          meal_date: m.created_at ? m.created_at.split('T')[0] : ''
        };
      });
      setActiveMeals(synced);

      const { data: dbServices } = await supabase
        .from('booking_services')
        .select('*')
        .eq('booking_id', sel.id);
        
      if (dbServices) {
        const guides = dbServices.filter((s: any) => s.service_type === 'guide');
        if (guides.length > 0) {
          setSvcGuide(true);
          setSvcGuidePrice(guides[0].unit_price || pricing.guide_price);
          setSvcGuideNames(guides[0].details?.names ? guides[0].details.names.split(', ') : ['']);
        }
        
        const transports = dbServices.filter((s: any) => s.service_type === 'transportation');
        if (transports.length > 0) {
          setSvcTransport(true);
          setSvcTransList(transports.map((t: any) => ({
            name: t.details?.name || '',
            details: t.details?.destination || '',
            price: t.unit_price || 0
          })));
        }
      }
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
          ? 'border-red-300 bg-[#722F37]/10/50'
          : isSelected
          ? 'bg-[#0B6E4F]/10 border-[#0B6E4F]/40'
          : booking?.status === 'checked_in'
          ? 'border-[#0B6E4F]/40 hover:bg-[#0B6E4F]/10'
          : booking?.status === 'confirmed'
          ? 'border-[#B8860B]/40 hover:bg-[#B8860B]/10'
          : booking?.status === 'completed'
          ? 'border-[#5C4A2E]/40 hover:bg-[#5C4A2E]/10'
          : 'border-[#5C4A2E]/30 hover:bg-[#2A1518]'
      }`}>
        <button
          className="w-full text-left"
          onClick={() => handleSelect(item)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-bold text-sm truncate ${isCancelled ? 'text-[#722F37] line-through' : 'text-[#EDE6D6]'}`}>
                <span className="text-[#9C9384] font-medium mr-1">{getPrefix(item)}</span>
                {item.name}
              </p>
              <p className="text-xs text-[#9C9384] mt-0.5 font-data">{item.start} → {item.end}</p>
              {booking ? <p className="text-xs text-[#9C9384]">Booking</p> : <p className="text-xs text-[#9C9384]">calendar only</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {isCancelled
                ? <span className="text-[10px] font-bold px-2 py-0.5 border border-red-600 text-red-600 font-mono uppercase">cancelled</span>
                : booking ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 border border-[#5C4A2E]/30 text-[#EDE6D6] font-mono uppercase ${statusColor(booking.status, booking)}`}>
                        {String(booking.status).replace('_', ' ')}
                      </span>
                      {(() => {
                        const isPrepaid = booking.payment_status === 'Prepaid';
                        const accommodation = booking.total_price || 0;
                        // collected defined below
                        const mealPrice = pricing?.lunch_price || 10;
                        const mealsBill = (booking.meal_requests || []).reduce((sum: number, m: any) => {
                          if (['Accepted', 'Served', 'confirmed', 'served'].includes(m.status)) {
                             return sum + ((m.adult_qty || 0) + (m.child_qty || 0)) * mealPrice;
                          }
                          return sum;
                        }, 0);
                        const collected = ((booking as any).settled_receipts || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
                        const liveTab = accommodation + mealsBill - collected;

                        return (
                          <span className={`text-[10px] font-mono font-black uppercase mt-1 ${isPrepaid ? 'text-[#0B6E4F]' : 'text-[#EDE6D6]'}`}>
                            {isPrepaid ? 'PREPAID' : `TAB: $${liveTab.toFixed(2)}`}
                          </span>
                        );
                      })()}
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 border border-[#5C4A2E]/30 text-[#EDE6D6] font-mono uppercase bg-[#1C232E]">
                      EXTERNAL PENDING
                    </span>
                  )
              }
              {booking && syncWarnings[booking.id] === 'deleted' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 border border-[#722F37] text-[#722F37] font-mono uppercase">⚠ REMOVED</span>
              )}
              {booking && syncWarnings[booking.id] === 'dates_changed' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 border border-[#5C4A2E]/30 text-[#EDE6D6] font-mono uppercase bg-[#1C232E]">⚠ DATES ≠</span>
              )}
              {booking?.status === 'checked_in' && booking.check_out === today && (
                <>
                  {isAfterTwo ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">⚠ OVERDUE (2PM+)</span>
                  ) : isAfterNoon ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#C9A227]/100 text-white">⚠ LATE (12PM+)</span>
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
            className="mt-2 w-full px-3 py-2 bg-[#047857] hover:bg-[#035e44] text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-60 border border-[#5C4A2E]/30 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
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
          const meta = (booking.meta || {});
          if (meta.is_system_only) isSystemOnly = true;
        } catch {}
      }
    }

    if (isSystemOnly) {
      return 'bg-[#1C232E] text-[#EDE6D6] border border-[#5C4A2E]/30 font-mono uppercase';
    }

    return {
      checked_in: 'bg-[#1C232E] text-[#EDE6D6] border border-[#5C4A2E]/30 font-mono uppercase',
      confirmed: 'bg-[#1C232E] text-[#EDE6D6] border border-[#5C4A2E]/30 font-mono uppercase',
      completed: 'bg-[#1C232E] text-[#EDE6D6]/40 border border-[#5C4A2E]/30 font-mono uppercase',
      cancelled: 'bg-[#1C232E] text-[#722F37] border border-[#722F37]/40 font-mono uppercase',
      pending: 'bg-[#1C232E] text-[#EDE6D6] border border-[#5C4A2E]/30 font-mono uppercase',
      no_arrival: 'bg-[#1C232E] text-[#9C9384] border border-[#5C4A2E]/30 font-mono uppercase',
    }[s ?? ''] ?? 'bg-[#1C232E] text-[#9C9384] border border-[#5C4A2E]/30 font-mono uppercase';
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
        status: 'checked_in',
        source: 'System',
        google_event_id: String(ev.id),
        total_price: 0,
        number_of_adults: 1,
        number_of_children: 0,
        payment_status: 'Unpaid',
        approved_by_manager: true,
        created_by: String(currentUserId),
        notes: sanitizeNotes(ev.description),
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

      // ── Read directly from database columns ──
      let existingDays: DayEntry[] = [];
      let guestCategory = b.guest_category || '';

      // ── CRITICAL: Read directly from database columns (never from draft) ──
      setSvcAdults(b.number_of_adults || b.guest_count || 1);
      setSvcChildren(b.number_of_children || 0);
      setSvcDateAdjustment(0); // Adjustments are per-session, not persisted
      
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

      const hasSettled = (b.collected_amount || 0) > 0;

      // ── Stay Price: Use total_price from DB ──
      const stayPrice = b.total_price || 0;
      setSvcAmount(stayPrice);
      setSvcDiscount(0);

      // ── Prepaid flags from DB columns ──
      setIsPrepaid(hasSettled ? (b.payment_status === 'Prepaid' || b.is_prepaid || false) : (b.payment_status === 'Prepaid' || b.payment_note?.includes('Accommodation') || false));
      setIsLunchPrepaid(b.payment_note?.includes('Lunch') || false);
      setIsDinnerPrepaid(b.payment_note?.includes('Dinner') || false);
      
      // ── Services will be fetched via useEffect syncData ──
      setSvcGuide(false);
      setSvcGuideNames(['']);
      setSvcGuidePrice(pricing.guide_price);
      setSvcTransport(false);
      setSvcTransList([{ name: '', details: '', price: 0 }]);

      // ── Payment line defaults ──
      let defaultCurrency: 'UZS' | 'USD' | 'EUR' = 'USD';
      if (guestCategory === 'local' || guestCategory === 'pool') defaultCurrency = 'UZS';
      setCollectedCurrency(defaultCurrency);

      // Calculate initial total for payment line
      const initialGTotal = Math.max(0, 
        (b.payment_status === 'Prepaid' || b.is_prepaid ? 0 : stayPrice)
      );

      setSvcPayList([{ 
        amount: initialGTotal > 0 ? initialGTotal.toString() : '', 
        currency: defaultCurrency, 
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
          .select('meta')
          .eq('id', sel.id)
          .single();
          
        const latestMeta = latest?.meta || {};

        const updatedMeta = { 
          ...latestMeta, 
          days: dayEntries, 
          draft 
        };

        await supabase.from('bookings')
          .update({ 
            draft 
          })
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
    try {
      await onCheckIn(sel.id);

      // Sync flat columns removed, no longer needed
      try {
        if (onUpdateBooking) await onUpdateBooking(sel.id, {});
      } catch (syncErr) {
        console.error('Update during check-in failed:', syncErr);
      }

      flash('✓ Guest checked in.');
    }
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
      // ── STEP 1: Identify unpaid meals from the table ──
      const mealsToPay = activeMeals.filter(m => 
        !m.is_paid && (m.status === 'confirmed' || m.status === 'served')
      );
      const mealIds = mealsToPay.map(m => m.id).filter(Boolean);

      // ── STEP 2: Calculate payment totals ──
      const totalPaidUsd = svcPayList.reduce((sum, p) => {
        const amt = parseFloat(p.amount) || 0;
        const rate = p.currency === 'USD' ? 1 : (p.currency === 'UZS' ? (pricing?.usd_to_uzs || 12500) : (pricing?.usd_to_eur || 0.92));
        return sum + (p.currency === 'USD' ? amt : (amt / rate));
      }, 0);

      const drinkTab = Object.entries(selectedDrinks).filter(([, q]) => q > 0).map(([id, qty]) => {
        const d = drinks.find(d => d.id === parseInt(id));
        return { drink_id: parseInt(id), drink_name: d?.name || '', quantity: qty, price: d?.sold_price || 0, currency: d?.currency || 'USD' };
      });

      // ── STEP 3: Generate receipt snapshot ──
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
          settled_meal_ids: mealIds,
          services: { 
            guide: svcGuide ? svcGuidePrice : 0, 
            transport: svcTransport ? svcTransList.reduce((s, t) => s + (t.price || 0), 0) : 0, 
          },
          stay_adjustment: svcDateAdjustment,
          extras: [...extraServices],
          drinks: drinkTab
        },
        total: gTotal,
        payments: svcPayList.filter(p => parseFloat(p.amount) !== 0)
      };

      // ── STEP 4: Record payments in payments table ──
      for (const p of svcPayList) {
        const amt = parseFloat(p.amount) || 0;
        if (amt === 0) continue;
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

      // ── STEP 5: Archive receipt ──
      try {
        await supabase.from('booking_receipts').insert({
          booking_id: sel.id,
          receipt_id: receiptId,
          snapshot,
          total_usd: gTotal,
        });
      } catch {}

      // ── STEP 6: Flip meal_requests to Paid (Single Source of Truth) ──
      if (mealIds.length > 0) {
        await supabase
          .from('meal_requests')
          .update({ is_paid: true, status: 'Paid' })
          .in('id', mealIds);
      }

      const updates = {
        collected_amount: Math.max(0, newCollectedAmount),
        number_of_adults: svcAdults,
        number_of_children: svcChildren,
        total_price: hasSettled ? ((sel.total_price || 0) + finalAdjustment) : (svcAmount + finalAdjustment),
        payment_status: isCurrentlyPrepaid ? 'Prepaid' : 'Paid',
        payment_method: svcPayList.length > 0 ? svcPayList[svcPayList.length - 1].method : 'Cash',
        is_prepaid: isCurrentlyPrepaid
      };
      
      if (onUpdateBooking) {
        const payloadToSave = { ...updates } as any;
        await onUpdateBooking(sel.id, payloadToSave);
      }

      // ── STEP 8: Refresh from server, then celebrate ──
      if (onRefresh) await onRefresh();
      
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.7 } });
      flash('✓ Tab Settled Successfully');
      setSelectedReceipt(snapshot);
      
      // ── STEP 9: HARD RESET all React state ──
      setActiveMeals([]);
      setSvcAmount(0); setSvcDiscount(0); setSvcDateAdjustment(0); 
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

      const isTab1Closed = (getSettledReceiptsForSel ? getSettledReceiptsForSel() : []).length > 0 || (sel.collected_amount || 0) > 0;

      // Manually insert services since booking columns are removed
      if (svcLunch) {
        await supabase.from('meal_requests').insert({
          booking_id: sel.id, meal_date: today, meal_type: 'Lunch', adult_qty: svcLunchCount, child_qty: 0, status: 'Pending'
        });
      }
      if (svcDinner) {
        await supabase.from('meal_requests').insert({
          booking_id: sel.id, meal_date: today, meal_type: 'Dinner', adult_qty: svcDinnerCount, child_qty: 0, status: 'Pending'
        });
      }
      if (svcGuide) {
        await supabase.from('booking_services').insert({
          booking_id: sel.id, service_type: 'guide', unit_price: svcGuidePrice, quantity: 1, currency: 'USD',
          details: { names: svcGuideNames.join(', ') }
        });
      }
      if (svcTransport) {
        for (const t of svcTransList) {
          if (t.name.trim() || t.details.trim() || t.price > 0) {
            await supabase.from('booking_services').insert({
              booking_id: sel.id, service_type: 'transportation', unit_price: t.price || 0, quantity: 1, currency: 'USD',
              details: { name: t.name, destination: t.details }
            });
          }
        }
      }

      const updates: Partial<Booking> = {
        total_price: isTab1Closed 
          ? ((sel.total_price || 0) + svcDateAdjustment)
          : (svcAmount + svcDateAdjustment + sTotal + dTotal + eTotal - svcDiscount),
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
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1C232E] rounded-2xl border border-[#5C4A2E]/30 px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-[#EDE6D6]">Guest Agenda</h2>
          <p className="text-xs text-[#9C9384]">Today’s guest management portal</p>
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
          <div className="bg-[#1C232E] rounded-2xl border border-[#5C4A2E]/30 shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#5C4A2E]/30">
              <h3 className="text-sm font-black text-[#EDE6D6] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B] animate-pulse" />
                Upcoming & Active
              </h3>
              <p className="text-[10px] text-[#9C9384] mt-0.5">Next 7 days · Bookings & Google Calendar</p>
            </div>
            <div className="divide-y divide-[#5C4A2E]/20">
              {checkedIn.length > 0 && (
                <div className="px-4 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#0B6E4F] mb-1 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#0B6E4F]" />Checked In · {checkedIn.length}</p>
                  {checkedIn.map(item => (
                    <button key={item.key} onClick={() => handleSelect(item)} className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#0B6E4F]/10 transition-all group">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#EDE6D6] truncate">{item.name}</p>
                        <p className="text-[10px] text-[#9C9384] font-data">{item.start} → {item.end}</p>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40">✓ in</span>
                    </button>
                  ))}
                </div>
              )}
              {upcoming.length > 0 && (
                <div className="px-4 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#C9A227]/100 animate-pulse" />Arriving Soon · {upcoming.length}</p>
                  {upcoming.map(item => (
                    <button key={item.key} onClick={() => {
                      if (item.booking) { handleSelect(item); }
                      else if (item.event) { setSelectedItem({ key: item.key, name: item.name, start: item.start, end: item.end, source: 'calendar' as any, booking: null, event: item.event }); }
                    }} className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#B8860B]/10 transition-all group">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#EDE6D6] truncate">{item.name}</p>
                        <p className="text-[10px] text-[#9C9384] font-data">{item.start} → {item.end}</p>
                      </div>
                      {item.booking
                        ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#B8860B]/20 text-[#B8860B] border border-[#B8860B]/40">confirmed</span>
                        : <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#1C232E]/20 text-[#9C9384] border border-[#5C4A2E]/30">📅 calendar</span>
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
            className="bg-[#1C232E] border-2 border-[#5C4A2E]/30 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[#5C4A2E]/30 bg-[#1C232E] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B6E4F] mb-1">{D === today ? 'Today’s Operations' : 'Daily Schedule'}</p>
                <h3 className="text-lg font-black text-[#EDE6D6] hc-mono">
                  {new Date(D + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
              </div>
              <button 
                onClick={() => setShowDayAgenda(false)}
                className="p-2 hover:bg-[#2A1518] rounded-full transition-colors text-[#9C9384]"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {arrivingItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#C9A227] bg-[#C9A227]/10 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C9A227]/100 animate-pulse" />
                    Arriving · {arrivingItems.length}
                  </p>
                  {arrivingItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {stayingItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#0B6E4F] bg-[#0B6E4F]/10 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0B6E4F]/100" />
                    In Stay · {stayingItems.length}
                  </p>
                  {stayingItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {checkedInItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#0B6E4F] bg-[#0B6E4F]/10 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0B6E4F]/100" />
                    Checked In · {checkedInItems.length}
                  </p>
                  {checkedInItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {checkingOutItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#0B6E4F] bg-[#0B6E4F]/10 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0B6E4F]/100" />
                    Checking Out · {checkingOutItems.length}
                  </p>
                  {checkingOutItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {checkedOutItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#9C9384] bg-[#1C232E]/50 rounded-xl mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#9C9384]" />
                    Checked Out · {checkedOutItems.length}
                  </p>
                  {checkedOutItems.map(item => renderCard(item as any, false))}
                </div>
              )}
              {cancelledItems.length > 0 && (
                <div className="mb-4">
                  <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#722F37] bg-[#722F37]/10 rounded-xl mb-1 flex items-center gap-2">
                    ✕ Cancelled · {cancelledItems.length}
                  </p>
                  {cancelledItems.map(item => renderCard(item, true))}
                </div>
              )}
            </div>
            <div className="p-4 bg-[#1C232E] border-t border-[#5C4A2E]/30">
              <button 
                onClick={() => setShowDayAgenda(false)}
                className="w-full py-3 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#0B6E4F]/80 transition-all border border-[#0B6E4F]/40 shadow-[4px_4px_0px_0px_rgba(92,74,46,0.3)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
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
        svcDateAdjustment={svcDateAdjustment}
        setSvcDateAdjustment={setSvcDateAdjustment}
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
        activeMeals={activeMeals}
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
