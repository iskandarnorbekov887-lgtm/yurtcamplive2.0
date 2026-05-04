'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import { supabase, type Booking, type UserRole, type Profile } from '@/lib/supabase';

interface Props { 
  bookings: Booking[]; 
  userRole: UserRole;
  currentUserId?: string;
  staff?: Profile[];
  onCancelBooking?: (id: number) => Promise<void>;
  onCheckIn?: (id: number) => Promise<void>;
  onCheckOut?: (id: number) => Promise<void>;
  onUpdateBooking?: (id: number, updates: Partial<Booking>) => Promise<void>;
  onAddNewBooking?: (date: string) => void;
  onRefresh?: () => void;
  onDayClick?: (date: string) => void;
}
interface EventInfo { booking: Booking; colStart: number; colEnd: number; lane: number; }

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Helper to get display ID with prefix based on guest category
function getDisplayId(booking: Booking): string {
  const currentMeta = (() => {
    try {
      return booking.special_requests ? JSON.parse(booking.special_requests) : {};
    } catch {
      return {};
    }
  })();

  // Google Calendar sync
  if (booking.google_event_id && !currentMeta.is_system_only) {
    return `G-${booking.id}`;
  }

  // Manager-created bookings
  if (currentMeta.is_system_only) {
    const category = currentMeta.guest_category || 'international';
    const prefixMap: Record<string, string> = {
      'international': 'M',
      'local': 'L',
      'camper': 'C',
      'pool': 'P'
    };
    const prefix = prefixMap[category] || 'M';
    return `${prefix}-${booking.id}`;
  }

  // Default
  return `${booking.id}`;
}

function getCalendarWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const weeks: Date[][] = [];
  const cur = new Date(start);
  while (cur <= last || weeks.length < 5) {
    if (cur > last && weeks.length >= 5) break;
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
    weeks.push(week);
  }
  return weeks;
}

function assignLanes(evs: Omit<EventInfo,'lane'>[]): EventInfo[] {
  const sorted = [...evs].sort((a,b) => a.colStart - b.colStart);
  const ends: number[] = [];
  return sorted.map(ev => {
    let lane = ends.findIndex(e => e < ev.colStart);
    if (lane === -1) { lane = ends.length; ends.push(ev.colEnd); }
    else ends[lane] = ev.colEnd;
    return { ...ev, lane };
  });
}

const PALETTE = [
  { bg: '#F59E0B', text: '#78350F' },
  { bg: '#3B82F6', text: '#1E3A5F' },
  { bg: '#10B981', text: '#064E3B' },
  { bg: '#8B5CF6', text: '#3B0764' },
  { bg: '#F97316', text: '#7C2D12' },
  { bg: '#EC4899', text: '#831843' },
  { bg: '#06B6D4', text: '#164E63' },
];

function getBookingStatus(b: Booking, today: string): 'checked-in' | 'checked-out' | 'upcoming' | 'overdue-checkin' | 'neglected-checkin' | 'cancelled' | 'no-arrival' {
  if (b.status === 'cancelled') return 'cancelled';
  if (b.status === 'no_arrival') return 'no-arrival';
  if (b.status === 'checked_in') return 'checked-in';
  if (b.status === 'completed') return 'checked-out';
  if (b.status === 'confirmed') {
    if (b.check_in < today) return 'overdue-checkin';
    // Check if it's the check-in day and after 6PM — only if booking was made before today
    if (b.check_in === today) {
      const now = new Date();
      const createdToday = b.created_at && b.created_at.startsWith(today);
      if (now.getHours() >= 18 && !createdToday) return 'neglected-checkin';
    }
    return 'upcoming';
  }
  return 'upcoming';
}

function isPoolVisitor(b: Booking): boolean {
  try {
    const meta = typeof b.special_requests === 'string' 
      ? JSON.parse(b.special_requests || '{}') 
      : (b.special_requests || {});
    return meta.is_pool_visitor === true || meta.guest_category === 'pool';
  } catch {
    return false;
  }
}

function isLocalGuest(b: Booking): boolean {
  try {
    const meta = typeof b.special_requests === 'string' 
      ? JSON.parse(b.special_requests || '{}') 
      : (b.special_requests || {});
    return meta.is_local_guest === true || meta.guest_category === 'local';
  } catch {
    return false;
  }
}

function color(b: Booking, today: string, userRole: UserRole) {
  // Check if this is a system-only booking (not from Google Calendar)
  let isSystemOnly = false;
  if (b.source === 'System') {
    isSystemOnly = true;
  } else {
    try {
      const meta = typeof b.special_requests === 'string'
        ? JSON.parse(b.special_requests || '{}')
        : (b.special_requests || {});
      if (meta.is_system_only) isSystemOnly = true;
    } catch {}
  }

  // Manager view: System bookings show in emerald green when active
  if (isSystemOnly && userRole === 'Manager') {
    const status = getBookingStatus(b, today);
    switch (status) {
      case 'checked-in':
        return { bg: '#10B981', text: '#FFFFFF' }; // Emerald green for active
      case 'checked-out':
        return { bg: '#059669', text: '#FFFFFF' }; // Darker green
      case 'upcoming':
        return { bg: '#6EE7B7', text: '#064E3B' }; // Light green
      default:
        return { bg: '#10B981', text: '#FFFFFF' }; // Emerald green
    }
  }

  // CEO view: System bookings use purple styling to differentiate from Google Calendar bookings
  if (isSystemOnly && userRole === 'CEO') {
    const status = getBookingStatus(b, today);
    switch (status) {
      case 'checked-in':
        return { bg: '#8B5CF6', text: '#FFFFFF' }; // Purple
      case 'checked-out':
        return { bg: '#A78BFA', text: '#FFFFFF' }; // Light purple
      case 'upcoming':
        return { bg: '#C4B5FD', text: '#4C1D95' }; // Lighter purple
      default:
        return { bg: '#8B5CF6', text: '#FFFFFF' }; // Purple
    }
  }

  // Google Calendar bookings use original colors
  const status = getBookingStatus(b, today);
  switch (status) {
    case 'checked-in':
      return { bg: '#10B981', text: '#064E3B' }; // Bright green
    case 'checked-out':
      return { bg: '#3B82F6', text: '#1E3A5F' }; // Blue
    case 'upcoming':
      return { bg: '#F59E0B', text: '#78350F' }; // Yellow
    case 'overdue-checkin':
      return { bg: '#F59E0B', text: '#78350F' }; // Yellow
    case 'neglected-checkin':
      return { bg: '#EF4444', text: '#7F1D1D' }; // Red (attention)
    case 'cancelled':
      return { bg: '#EF4444', text: '#7F1D1D' }; // Red
    case 'no-arrival':
      return { bg: '#9CA3AF', text: '#374151' }; // Gray
    default:
      return PALETTE[(b.id || 0) % PALETTE.length];
  }
}

export function OccupancyCalendar({ bookings, userRole, currentUserId, staff, onCancelBooking, onCheckIn, onCheckOut, onUpdateBooking, onAddNewBooking, onRefresh, onDayClick }: Props) {
  const { t } = useLanguage();
  const [cur, setCur]   = useState(new Date());
  const [sel, setSel]   = useState<Booking | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Booking>>({});
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editRequestData, setEditRequestData] = useState<Partial<Booking>>({});
  const [showDrinksPopup, setShowDrinksPopup] = useState(false);
  const [showExtraServicesPopup, setShowExtraServicesPopup] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [categoryData, setCategoryData] = useState({
    international: { stay_price: 0, cooking_class: false },
    local: { amount: 0, type: 'day' },
    pool: { amount: 0 }
  });
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementCurrency, setSettlementCurrency] = useState<'UZS' | 'USD' | 'EUR'>('UZS');
  const [settlementCookingClass, setSettlementCookingClass] = useState(false);
  const [drinks, setDrinks] = useState<Array<{ id: number; name: string; original_price: number; sold_price: number; currency: 'UZS' | 'USD' | 'EUR'; available: boolean }>>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<Array<{ drink_id: number; drink_name: string; quantity: number; price: number; currency: 'UZS' | 'USD' | 'EUR' }>>([]);
  const [newExtraService, setNewExtraService] = useState({ name: '', price: '', currency: 'USD' as 'UZS' | 'USD' | 'EUR' });
  const [collectedAmount, setCollectedAmount] = useState('');
  const [collectedCurrency, setCollectedCurrency] = useState<'UZS' | 'USD' | 'EUR'>('USD');
  const [preEditCheckoutRef, setPreEditCheckoutRef] = useState('');
  const [extFee, setExtFee] = useState('');
  const [redFee, setRedFee] = useState('');
  const originalCheckoutRef = useRef<string>('');


  const applyExtension = async () => {
    if (!sel || !onUpdateBooking) return;
    const amount = parseFloat(extFee) || 0;
    
    let currentMeta: any = {};
    try {
      const parsed = typeof sel.special_requests === 'string' ? JSON.parse(sel.special_requests || '{}') : (sel.special_requests || {});
      currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
    } catch { currentMeta = {}; }
    
    const prevAdj = parseFloat(currentMeta.last_adjustment) || 0;
    const newTotal = (sel.total_price || 0) - prevAdj + amount;
    
    setLoadingAction('applyExt');
    try {
      const newMeta = { ...currentMeta, last_adjustment: amount };
      await onUpdateBooking(sel.id, { 
        total_price: newTotal,
        special_requests: JSON.stringify(newMeta)
      });
      setExtFee(String(amount));
      setSel({ ...sel, total_price: newTotal, special_requests: JSON.stringify(newMeta) });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction('');
    }
  };

  const cleanPayloadByCategory = (category: string, raw: any) => {
    if (category === 'pool') {
      return {
        total_price: raw.total_price,
        currency: raw.currency,
        payment_status: 'paid',
        status: raw.status || 'checked_in',
        cooking_class: false,
        guide_service: false,
        lunch: false,
        dinner: false,
        has_transportation: false,
        amount: raw.total_price // Isolated cash amount
      };
    }
    if (category === 'local') {
      return {
        total_price: raw.total_price,
        currency: raw.currency,
        payment_status: 'paid',
        status: raw.status || 'checked_in',
        cooking_class: false,
        amount: raw.total_price
      };
    }
    // International / Camper (Room-Based Flow)
    return {
      total_price: raw.total_price,
      currency: raw.currency,
      payment_status: raw.payment_status || 'Unpaid',
      status: raw.status || 'checked_in',
      cooking_class: raw.cooking_class,
      is_room_stay: true // Ensure it stays as a room stay
    };
  };

  const applyReduction = async () => {
    if (!sel || !onUpdateBooking) return;
    const amount = parseFloat(redFee) || 0;

    let currentMeta: any = {};
    try {
      const parsed = typeof sel.special_requests === 'string' ? JSON.parse(sel.special_requests || '{}') : (sel.special_requests || {});
      currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
    } catch { currentMeta = {}; }

    const prevAdj = parseFloat(currentMeta.last_reduction) || 0; // Using separate field for reduction?
    const newTotal = Math.max(0, (sel.total_price || 0) + prevAdj - amount);
    
    setLoadingAction('applyRed');
    try {
      const newMeta = { ...currentMeta, last_reduction: amount };
      await onUpdateBooking(sel.id, { 
        total_price: newTotal,
        special_requests: JSON.stringify(newMeta)
      });
      setRedFee(String(amount));
      setSel({ ...sel, total_price: newTotal, special_requests: JSON.stringify(newMeta) });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction('');
    }
  };

  const getTabs = (booking: Booking | null) => {
    if (!booking) return [];
    let currentMeta: any = {};
    try {
      const parsed = typeof booking.special_requests === 'string' ? JSON.parse(booking.special_requests || '{}') : (booking.special_requests || {});
      currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
      const receipts = currentMeta.settled_receipts || [];
      // Sort by settled_at date so oldest tab is first
      return receipts.sort((a: any, b: any) => {
        const dateA = new Date(a.settled_at || a.date).getTime();
        const dateB = new Date(b.settled_at || b.date).getTime();
        return dateA - dateB;
      });
    } catch { return []; }
  };

  const getBookingsForDay = (dayStr: string) => {
    return bookings.filter(b => b.check_in <= dayStr && b.check_out >= dayStr);
  };

  // Store original checkout when a booking is selected
  useEffect(() => {
    if (sel) {
      originalCheckoutRef.current = sel.check_out || '';
      let currentMeta: any = {};
      try {
        const parsed = typeof sel.special_requests === 'string' ? JSON.parse(sel.special_requests || '{}') : (sel.special_requests || {});
        currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
        setExtFee(currentMeta.last_adjustment ? String(currentMeta.last_adjustment) : '');
        setRedFee(currentMeta.last_reduction ? String(currentMeta.last_reduction) : '');
      } catch {
        setExtFee('');
        setRedFee('');
      }
    }
  }, [sel]);

  const eventsForWeek = (week: Date[]): EventInfo[] => {
    const strs  = week.map(dateToStr);
    const wStart = strs[0], wEnd = strs[6];
    const evs: Omit<EventInfo,'lane'>[] = bookings
      .filter(b => b.check_in <= wEnd && b.check_out >= wStart)
      .map(b => {
        const es = b.check_in  < wStart ? wStart : b.check_in;
        const ee = b.check_out > wEnd   ? wEnd   : b.check_out;
        const cs = strs.indexOf(es); const ce = strs.indexOf(ee);
        return { booking: b, colStart: cs < 0 ? 0 : cs, colEnd: ce < 0 ? 6 : ce };
      });
    return assignLanes(evs);
  };

  const handleCancel = async () => {
    if (!sel || !onCancelBooking) return;
    if (confirm('Are you sure you want to cancel this trip?')) {
      const id = sel.id;
      setSel(null); 
      try {
        await onCancelBooking(id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCheckIn = async () => {
    if (!sel) return;

    // Check if this is a manager-created booking
    const currentMeta = (() => {
      try {
        return sel.special_requests ? JSON.parse(sel.special_requests) : {};
      } catch {
        return {};
      }
    })();

    // For manager bookings, open settlement modal
    if (currentMeta.is_system_only) {
      setShowSettlementModal(true);
      return;
    }

    // For regular bookings, proceed with normal check-in
    if (!onCheckIn) return;
    if (!confirm('Are you sure you want to check in ' + String(sel.guest_name) + '?')) return;
    const id = sel.id;
    setSel({ ...sel, status: 'checked_in' });
    try {
      await onCheckIn(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckOut = async () => {
    if (!sel || !onCheckOut) return;
    if (!confirm('Are you sure you want to check out ' + String(sel.guest_name) + '?')) return;
    const id = sel.id;
    setSel({ ...sel, status: 'completed' });
    try {
      await onCheckOut(id);
    } catch (err) {
      console.error(err);
    }
  };

  const syncToGoogleCalendar = async (booking: Booking) => {
    if (!booking.google_event_id) return;
    console.log('🔄 SYNCING TO GOOGLE CALENDAR:', {
      id: booking.google_event_id,
      start: booking.check_in,
      end: booking.check_out
    });
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: booking.google_event_id,
          start: booking.check_in,
          end: booking.check_out
        })
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('GC Sync Failed:', data.error);
      } else {
        console.log('✓ GC Sync Success');
      }
    } catch (err) {
      console.error('GC Sync Error:', err);
    }
  };

  const handleUpdate = async () => {
    if (!sel || !onUpdateBooking) return;

    // 1. Initialize metadata with a safe default to prevent ReferenceErrors
    let currentMeta: any = {}; 
    
    try {
      // 2. Safely parse existing metadata from special_requests
      const parsed = typeof sel.special_requests === 'string'
        ? JSON.parse(sel.special_requests || '{}')
        : (sel.special_requests || {});

      // 3. Ensure the result is an object, preserving previous day entries
      currentMeta = Array.isArray(parsed) ? { days: parsed } : (parsed || {});
    } catch (err) {
      console.error('Metadata parse error:', err);
      currentMeta = {}; // Fallback to empty object if JSON is broken
    }

    // 4. Prepare the update payload
    const updates: Partial<Booking> = {
      ...editData, // Spread the new check-in/out dates
      special_requests: JSON.stringify({ 
        ...currentMeta, 
        is_manual_dates: true // CRITICAL: Tells the map to ignore Google Calendar dates
      })
    };

    const updatedSel = { ...sel, ...updates } as Booking;
    setSel(updatedSel);
    setIsEditing(false);

    try {
      // 5. Execute backend update
      await onUpdateBooking(sel.id, updates);

      // 6. Sync local memory (Refs) so the UI doesn't revert
      if (originalCheckoutRef) {
        originalCheckoutRef.current = updates.check_out || '';
      }
      if (typeof setPreEditCheckoutRef === 'function') {
        setPreEditCheckoutRef(''); 
      }

      // 7. Success actions
      syncToGoogleCalendar(updatedSel);
      if (typeof onRefresh === 'function') onRefresh();
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const canEdit = (booking: Booking) => {
    if (userRole === 'CEO') return true;
    if (userRole === 'Cook') return false;
    if (!currentUserId) return false;
    if (userRole === 'Manager') return true;
    return false;
  };

  const canCancel = (booking: Booking) => {
    if (userRole === 'CEO') return true;
    if (userRole === 'Cook') return false;
    if (!currentUserId) return false;
    if (userRole === 'Manager') return true;
    return false;
  };

  const isCook = userRole === 'Cook';
  const today = dateToStr(new Date());
  const month = cur.getMonth();
  const year  = cur.getFullYear();
  const weeks = getCalendarWeeks(year, month);
  const allEvents = weeks.map(w => eventsForWeek(w));
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const completed = bookings.filter(b => b.status === 'completed');
  const cancelled = bookings.filter(b => b.status === 'cancelled');
  const totalIskyCamps = 0;
  const [activeTabIdx, setActiveTabIdx] = useState(-1);

  const dayOccupancy = (dayStr: string) =>
    [...confirmed, ...cancelled].filter(b => b.check_in <= dayStr && b.check_out >= dayStr).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden font-sans">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/30">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            {t(`month.${month}`)} <span className="text-slate-400 font-normal">{year}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {onAddNewBooking && (
            <button
              onClick={() => onAddNewBooking('')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Booking
            </button>
          )}
          <button onClick={() => setCur(new Date())}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
            Today
          </button>
          {[[-1,'M15 19l-7-7 7-7'],[1,'M9 5l7 7-7 7']].map(([dir,d]) => (
            <button key={String(dir)} onClick={() => setCur(new Date(year, month + (dir as number), 1))}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-all">
              <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={String(d)} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100">
        {[0,1,2,3,4,5,6].map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {t(`day.${d}`)}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const events   = allEvents[wi];
        const maxL     = events.length ? Math.max(...events.map(e=>e.lane))+1 : 0;
        const eventRows = Math.max(maxL, 1);

        return (
          <div key={wi} className="border-b border-slate-100 last:border-none">
            <div className="grid grid-cols-7">
              {week.map((day, di) => {
                const ds    = dateToStr(day);
                const occ   = dayOccupancy(ds);
                const full  = totalIskyCamps > 0 && occ >= totalIskyCamps;
                const isToday = ds === today;
                const isCurrentMonth = day.getMonth() === month;
                return (
                  <div 
                    key={di} 
                    className={`min-h-[40px] px-2 pt-2 border-r border-slate-100 last:border-r-0 cursor-pointer hover:bg-indigo-50 transition-colors ${!isCurrentMonth ? 'bg-slate-50/60' : ''}`}
                    onClick={() => {
                      if (onDayClick) {
                        onDayClick(ds);
                        return;
                      }
                      if (ds < today) {
                        alert('You cannot schedule a trip on a past date');
                        return;
                      }
                      setSelectedDay(ds);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                        {day.getDate()}
                      </span>
                      {full && (
                        <span className="text-[9px] font-black text-red-600 bg-red-50 px-1 rounded">FULL</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative px-0.5 pb-1.5" style={{ minHeight: `${eventRows * 24 + 4}px` }}>
              <div className="relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${eventRows}, 22px)`, gap: '2px 0' }}>
                {events.map((ev, ei) => {
                  const c = color(ev.booking, today, userRole);
                  const isPool = isPoolVisitor(ev.booking);
                  const isStart = ev.booking.check_in >= dateToStr(week[ev.colStart]);
                  const isEnd   = ev.booking.check_out <= dateToStr(week[ev.colEnd]);
                  const isCancelled = ev.booking.status === 'cancelled';
                  const isCheckedIn = ev.booking.status === 'checked_in';
                  const isCompleted = ev.booking.status === 'completed';
                  const bookingStatus = getBookingStatus(ev.booking, today);
                  const isNeglectedCheckIn = bookingStatus === 'neglected-checkin' || bookingStatus === 'overdue-checkin';
                  const checkOutDate = new Date(ev.booking.check_out);
                  const checkOutDateStr = checkOutDate.toISOString().split('T')[0];
                  const now = new Date();
                  const isNeglectedCheckout = ev.booking.status === 'checked_in' &&
                    checkOutDateStr === today &&
                    now.getHours() >= 12;

                  // Check if this is a manager-created booking
                  const currentMeta = (() => {
                    try {
                      return ev.booking.special_requests ? JSON.parse(ev.booking.special_requests) : {};
                    } catch {
                      return {};
                    }
                  })();
                  const isManagerBooking = currentMeta.is_system_only;
                  const displayId = getDisplayId(ev.booking);

                  const isLocal = isLocalGuest(ev.booking);
                  const isRoomStay = currentMeta.is_room_stay ?? (!isPool && !isLocal);
                  
                  // Financial Note Display for non-room stays (Local/Pool)
                  if (!isRoomStay && isManagerBooking) {
                    const pricePaid = ev.booking.collected_amount || ev.booking.total_price || 0;
                    return (
                      <button
                        key={ei}
                        onClick={() => { setSel(ev.booking); setIsEditing(false); }}
                        style={{
                          gridColumn: `${ev.colStart + 1} / ${ev.colStart + 2}`,
                          gridRow: `${ev.lane + 1}`,
                          backgroundColor: isPool ? '#06B6D4' : '#F59E0B',
                          color: '#FFFFFF',
                          borderRadius: '4px',
                          margin: '1px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 4px',
                          fontSize: '9px',
                          fontWeight: 'bold',
                          height: '20px',
                          border: (isManagerBooking && userRole === 'CEO') ? '2px solid #3B82F6' : 'none',
                        }}
                        className="truncate shadow-sm"
                      >
                        <span className="truncate">{ev.booking.guest_name} | {ev.booking.number_of_people}p | {pricePaid} UZS</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={ei}
                      onClick={() => {
                        setSel(ev.booking);
                        setEditData(ev.booking);
                        setIsEditing(false);
                      }}
                      title={`${ev.booking.guest_name} (${displayId})`}
                      style={{
                        gridColumn: `${ev.colStart + 1} / ${ev.colEnd + 2}`,
                        gridRow: `${ev.lane + 1}`,
                        backgroundColor: isCancelled ? '#fecaca' : c.bg,
                        color: isCancelled ? '#991b1b' : c.text,
                        borderRadius: isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '0',
                        marginLeft: isStart ? '2px' : '0',
                        marginRight: isEnd  ? '2px' : '0',
                        cursor: 'pointer',
                        border: (isManagerBooking && userRole === 'CEO') ? '2px solid #3B82F6' : 'none', // Blue border for CEO view only
                      }}
                      className="text-[11px] font-semibold px-2 truncate text-left flex items-center h-[20px] hover:brightness-90 transition-all"
                    >
                      <span className="flex-1 truncate">
                        {isStart ? (isCancelled ? `${ev.booking.guest_name} (CANCELLED)` : `${ev.booking.guest_name} ${userRole === 'CEO' ? `(${displayId})` : ''}`) : ''}
                      </span>
                      <span className="flex items-center gap-1 ml-1">
                        {isCheckedIn && (
                          <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {isCompleted && (
                          <svg className="w-3 h-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                          </svg>
                        )}
                        {(isNeglectedCheckIn || isNeglectedCheckout) && (
                          <svg className="w-3 h-3 text-red-600 flex-shrink-0 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {sel && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4" onClick={() => setSel(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="mb-6">
              <div className="flex justify-end gap-1 mb-3">
                {sel.status === 'checked_in' && onCancelBooking && (
                  <button onClick={handleCancel} disabled={!!loadingAction} className="p-1.5 hover:bg-rose-100 rounded-lg transition-all" title="Cancel Trip">
                    <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <button onClick={() => setSel(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex items-start gap-4 mb-5">
                <div className="w-6 h-6 rounded-lg flex-shrink-0 mt-1 shadow-sm" style={{ backgroundColor: color(sel, today, userRole).bg }} />
                <div>
                  <h3 className="text-2xl font-black text-slate-900 leading-none">{String(sel.guest_name)}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-sm font-black text-slate-600">
                      {String(sel.num_people || sel.number_of_people || sel.guest_count)} Pax
                    </p>
                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                    <p className="text-sm font-bold text-slate-500">
                      {sel.check_in} – {sel.check_out}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {(userRole === 'Manager' || userRole === 'CEO') && (
                <div className="col-span-2 space-y-6">
                  <div className="flex flex-wrap gap-2 items-center border-b border-slate-100 pb-4">
                    {getTabs(sel).map((tab: any, idx: number) => (
                      <button 
                        key={idx}
                        onClick={() => setActiveTabIdx(idx)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${activeTabIdx === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                      >
                        Tab {String(idx + 1)}
                      </button>
                    ))}
                    <button 
                      onClick={() => setActiveTabIdx(-1)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${activeTabIdx === -1 ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                    >
                      {getTabs(sel).length > 0 ? 'Open Folio' : 'Current Tab'}
                    </button>
                  </div>

                  <div className={`p-6 rounded-[2.5rem] border-2 transition-all ${activeTabIdx === -1 ? 'bg-white border-indigo-100 shadow-xl shadow-indigo-50' : 'bg-slate-50 border-slate-100 grayscale-[0.5]'}`}>
                    {(() => {
                      const tabs = getTabs(sel);
                      const isHistory = activeTabIdx !== -1;
                      const activeTab = isHistory ? tabs[activeTabIdx] : null;
                      const isClosed = isHistory;
                      const isTab1Closed = tabs.length > 0;
                      
                      const originalCheckout = isTab1Closed ? (tabs[0]?.original_checkout || tabs[0]?.check_out) : (preEditCheckoutRef || originalCheckoutRef.current);
                      const hasExtension = (sel?.check_out || '') > (originalCheckout || '') && (originalCheckout !== '');
                      const hasReduction = (sel?.check_out || '') < (originalCheckout || '') && (originalCheckout !== '');
                      
                      return (
                        <div className="space-y-6">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                              {isClosed ? `Receipt Archive: Tab ${String(activeTabIdx + 1)}` : 'Active Guest Folio'}
                            </h4>
                          </div>

                          <div className="space-y-4">
                            {(!isTab1Closed || activeTabIdx === 0) ? (
                              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Primary Stay (Master Tab)</label>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="opacity-75">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Pax & Base Price</p>
                                    <p className="text-sm font-black text-slate-900">{String(sel?.num_people || sel?.number_of_people || 0)} Guests @ ${String(sel?.total_price || 0)}</p>
                                  </div>
                                  <button 
                                    disabled={isTab1Closed}
                                    onClick={() => {
                                      if (!isTab1Closed) {
                                        setPreEditCheckoutRef(sel.check_out || '');
                                        setIsEditing(true);
                                      }
                                    }}
                                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${isTab1Closed ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                                  >
                                    {isTab1Closed ? 'Stay Locked' : 'Edit Base Stay'}
                                  </button>
                                </div>
                              </div>
                            ) : activeTabIdx === -1 && isTab1Closed ? (
                              <>
                                {hasExtension && (
                                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-2">Stay Extension Fee</label>
                                    <div className="flex gap-3 items-center">
                                      <input 
                                        type="number"
                                        placeholder="Extra amount..."
                                        value={extFee}
                                        onChange={e => setExtFee(e.target.value)}
                                        className="flex-1 px-4 py-2 bg-white border-2 border-amber-200 rounded-xl text-sm font-black text-amber-700 outline-none focus:border-amber-400"
                                      />
                                      <button 
                                        onClick={applyExtension}
                                        disabled={loadingAction === 'applyExt'}
                                        className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black uppercase shadow-sm"
                                      >
                                        Apply
                                      </button>
                                    </div>
                                    <p className="mt-2 text-[9px] text-amber-500 font-bold italic">* Added stay from {String(originalCheckout)} to {String(sel?.check_out)}</p>
                                  </div>
                                )}
                                {hasReduction && (
                                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-2">Stay Reduction (Discount)</label>
                                    <div className="flex gap-3 items-center">
                                      <input 
                                        type="number"
                                        placeholder="Discount amount..."
                                        value={redFee}
                                        onChange={e => setRedFee(e.target.value)}
                                        className="flex-1 px-4 py-2 bg-white border-2 border-emerald-200 rounded-xl text-sm font-black text-emerald-700 outline-none focus:border-emerald-400"
                                      />
                                      <button 
                                        onClick={applyReduction}
                                        disabled={loadingAction === 'applyRed'}
                                        className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase shadow-sm"
                                      >
                                        Apply
                                      </button>
                                    </div>
                                    <p className="mt-2 text-[9px] text-emerald-500 font-bold italic">* Reduced stay from {String(originalCheckout)} to {String(sel?.check_out)}</p>
                                  </div>
                                )}
                                <div className="mt-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Accommodation Status</p>
                                  <p className="text-xs font-bold text-indigo-600">Primary stay settled in Tab 1. Current tab accommodation set to $0.</p>
                                </div>
                              </>
                            ) : null}
                          </div>
                             <div className="flex justify-between items-center">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Charges & Services</p>
                               {!isClosed && (
                                 <button onClick={() => setIsEditing(true)} className="text-[9px] font-black text-indigo-600 uppercase hover:underline">Add Items</button>
                               )}
                             </div>
                             
                             <div className="space-y-2">
                                {(isClosed ? (activeTab?.items?.drinks || []) : (sel?.drinks_tab || []))?.map((line: any, lidx: number) => (
                                  <div key={lidx} className="flex justify-between text-xs font-bold text-slate-700">
                                    <span>{String(line?.drink_name)} x{String(line?.quantity)}</span>
                                    <span>${String(line?.price * line?.quantity)}</span>
                                  </div>
                                ))}
                                {(isClosed ? (activeTab?.items?.extras || []) : (sel?.extra_services || []))?.map((line: any, lidx: number) => (
                                  <div key={lidx} className="flex justify-between text-xs font-bold text-slate-700">
                                    <span>{String(line?.name)}</span>
                                    <span>${String(line?.price)}</span>
                                  </div>
                                ))}
                             </div>

                          {/* Tab Footer (Pay & Close) */}
                          <div className="pt-6 border-t border-slate-100 flex justify-between items-end">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tab Total</p>
                              <p className="text-2xl font-black text-slate-900">${String(isClosed ? activeTab.total : (sel.total_price || 0))}</p>
                            </div>
                            {!isClosed && (
                              <button 
                                onClick={handleCheckOut} // Placeholder for Pay & Close
                                className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg shadow-indigo-100 hover:scale-105 transition-all active:scale-95"
                              >
                                Pay & Close Tab
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
            
            {!isCook && (
              <div className="flex flex-col gap-3">
                {isEditing ? (
                  <div className="flex gap-3">
                    <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">Cancel</button>
                    <button onClick={handleUpdate} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">Save Changes</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      {onCheckIn && sel.status === 'confirmed' && sel.check_in === today && (
                        <button
                          onClick={handleCheckIn}
                          disabled={!!loadingAction}
                          className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                        >
                          {loadingAction === 'checkin' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('btn.check_in')}
                        </button>
                      )}
                      {onCheckIn && sel.status === 'confirmed' && sel.check_in !== today && (
                        <div className="flex-1 py-3 bg-amber-100 text-amber-700 rounded-xl font-bold text-center flex items-center justify-center">
                          Upcoming Guest
                        </div>
                      )}
                      {onCheckOut && sel?.status === 'checked_in' && (
                        today === sel?.check_out ? (
                          <button onClick={handleCheckOut} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                            Check Out Now
                          </button>
                        ) : (
                          <div className="flex-1 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-center flex items-center justify-center gap-2 border-2 border-indigo-100">
                             <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                             Active Stay
                          </div>
                        )
                      )}
                      {sel.status === 'completed' && (
                        <div className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-bold text-center flex items-center justify-center cursor-not-allowed">
                          Successful Check Out
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      {sel.status === 'checked_in' && (
                        <div className="flex-1 group relative">
                          <button
                            onClick={() => setIsEditing(true)}
                            className="w-full py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all"
                          >
                            Add Details
                          </button>
                        </div>
                      )}

                      {userRole === 'Manager' && sel.status === 'completed' && (
                        <button
                          onClick={() => {
                            setEditRequestData(sel);
                            setShowEditRequestModal(true);
                          }}
                          className="px-3 py-3 bg-amber-50 text-amber-600 rounded-xl font-bold hover:bg-amber-100 transition-all text-xs"
                        >
                          Request Change
                        </button>
                      )}

                      {/* Restore button for cancelled/no-arrival bookings (creator or CEO only) */}
                      {(sel.status === 'cancelled' || sel.status === 'no_arrival') && onUpdateBooking && (userRole === 'CEO' || currentUserId === sel.created_by_id) && (
                        <button
                          onClick={async () => {
                            setLoadingAction('restore');
                            await onUpdateBooking(sel.id, { status: 'confirmed' });
                            setLoadingAction(null);
                            setSel(null);
                          }}
                          disabled={!!loadingAction}
                          className="flex-1 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-all"
                        >
                          {loadingAction === 'restore' ? <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" /> : 'Restore Booking'}
                        </button>
                      )}

                      {onCancelBooking && sel.status !== 'completed' && sel.status !== 'cancelled' && sel.status !== 'no_arrival' && sel.status !== 'checked_in' && (
                        <div className="flex-1 group relative">
                          <button
                            onClick={handleCancel}
                            disabled={!!loadingAction || !canCancel(sel)}
                            className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${canCancel(sel) ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                          >
                            {loadingAction === 'cancel' ? <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" /> : 'Cancel Trip'}
                          </button>
                          {!canCancel(sel) && userRole !== 'CEO' && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                              You do not have permission to modify this booking
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* No Arrival button - appears after 1 day of supposed check-in */}
                    {(() => {
                      const checkInDate = new Date(sel.check_in);
                      const checkInDateStr = checkInDate.toISOString().split('T')[0];
                      const now = new Date();
                      const nowDateStr = now.toISOString().split('T')[0];
                      const daysSinceCheckIn = Math.floor((now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

                      if (sel.status === 'confirmed' && daysSinceCheckIn >= 1 && onUpdateBooking) {
                        return (
                          <button
                            onClick={async () => {
                              setLoadingAction('no-arrival');
                              await onUpdateBooking(sel.id, { status: 'no_arrival' });
                              setLoadingAction(null);
                              setSel(null);
                            }}
                            disabled={!!loadingAction}
                            className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-300 transition-all"
                          >
                            Mark as No Arrival
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
      )}

      {/* Edit Request Modal */}
      {showEditRequestModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowEditRequestModal(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800">Request Booking Edit</h2>
              <button onClick={() => setShowEditRequestModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-amber-800 font-semibold">
                  This request will be sent to the CEO and the booking person for approval.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Guest Name</label>
                <input
                  type="text"
                  value={editRequestData.guest_name || ''}
                  onChange={e => setEditRequestData({ ...editRequestData, guest_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Check-in Date</label>
                  <input
                    type="date"
                    value={editRequestData.check_in || ''}
                    onChange={e => setEditRequestData({ ...editRequestData, check_in: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Check-out Date</label>
                  <input
                    type="date"
                    value={editRequestData.check_out || ''}
                    onChange={e => setEditRequestData({ ...editRequestData, check_out: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Number of People</label>
                <input
                  type="number"
                  value={editRequestData.num_people || editRequestData.number_of_people || ''}
                  onChange={e => setEditRequestData({ ...editRequestData, num_people: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Special Requests</label>
                <textarea
                  value={editRequestData.special_requests || ''}
                  onChange={e => setEditRequestData({ ...editRequestData, special_requests: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowEditRequestModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    // If booking is completed and checkout date is changed, revert to checked-in
                    if (editRequestData.status === 'completed' && sel && editRequestData.check_out !== sel.check_out && onUpdateBooking) {
                      await onUpdateBooking(sel.id, {
                        ...editRequestData,
                        status: 'checked_in'
                      });
                      alert('Checkout date changed. Booking reverted to checked-in status. Check-out button is now available.');
                    } else {
                      alert('Edit request sent to CEO and booking person for approval.');
                    }
                    setShowEditRequestModal(false);
                  }}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                >
                  Send Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drinks Popup Modal */}
      {showDrinksPopup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowDrinksPopup(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-black">Add Drinks</h3>
              <button onClick={() => setShowDrinksPopup(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {/* Sample drinks - will be fetched from database */}
              {[
                { id: 1, name: 'Coca Cola', original_price: 1, sold_price: 2, currency: 'USD' as const, available: true },
                { id: 2, name: 'Water', original_price: 0.5, sold_price: 1, currency: 'USD' as const, available: true },
                { id: 3, name: 'Beer', original_price: 2, sold_price: 3, currency: 'USD' as const, available: true },
                { id: 4, name: 'Juice', original_price: 1.5, sold_price: 2.5, currency: 'USD' as const, available: true },
              ].map(drink => (
                <div key={drink.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-bold text-black">{drink.name}</p>
                    <p className="text-xs text-black">${drink.sold_price} {drink.currency}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const existing = selectedDrinks.find(d => d.drink_id === drink.id);
                        if (existing && existing.quantity > 1) {
                          setSelectedDrinks(selectedDrinks.map(d => d.drink_id === drink.id ? { ...d, quantity: d.quantity - 1 } : d));
                        } else if (existing) {
                          setSelectedDrinks(selectedDrinks.filter(d => d.drink_id !== drink.id));
                        }
                      }}
                      className="w-8 h-8 bg-slate-200 text-black rounded-lg font-bold hover:bg-slate-300 transition-all"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-bold text-black">
                      {selectedDrinks.find(d => d.drink_id === drink.id)?.quantity || 0}
                    </span>
                    <button
                      onClick={() => {
                        const existing = selectedDrinks.find(d => d.drink_id === drink.id);
                        if (existing) {
                          setSelectedDrinks(selectedDrinks.map(d => d.drink_id === drink.id ? { ...d, quantity: d.quantity + 1 } : d));
                        } else {
                          setSelectedDrinks([...selectedDrinks, { drink_id: drink.id, drink_name: drink.name, quantity: 1, price: drink.sold_price, currency: drink.currency }]);
                        }
                      }}
                      className="w-8 h-8 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowDrinksPopup(false);
                  setSelectedDrinks([]);
                }}
                className="flex-1 py-3 bg-slate-100 text-black rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (sel && onUpdateBooking && selectedDrinks.length > 0) {
                    const currentDrinks = sel.drinks_tab || [];
                    const updatedDrinks = [...currentDrinks];
                    selectedDrinks.forEach(selected => {
                      const existing = updatedDrinks.find(d => d.drink_id === selected.drink_id);
                      if (existing) {
                        existing.quantity += selected.quantity;
                      } else {
                        updatedDrinks.push(selected);
                      }
                    });
                    await onUpdateBooking(sel.id, { drinks_tab: updatedDrinks });
                    setShowDrinksPopup(false);
                    setSelectedDrinks([]);
                    setSel({ ...sel, drinks_tab: updatedDrinks });
                  }
                }}
                className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all"
              >
                Add to Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extra Services Popup Modal */}
      {showExtraServicesPopup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowExtraServicesPopup(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-black">Add Extra Service</h3>
              <button onClick={() => setShowExtraServicesPopup(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Service Name</label>
                <input
                  type="text"
                  value={newExtraService.name}
                  onChange={e => setNewExtraService({ ...newExtraService, name: e.target.value })}
                  placeholder="Service name"
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Price</label>
                <input
                  type="number"
                  value={newExtraService.price}
                  onChange={e => setNewExtraService({ ...newExtraService, price: e.target.value })}
                  placeholder="Price"
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Currency</label>
                <select
                  value={newExtraService.currency}
                  onChange={e => setNewExtraService({ ...newExtraService, currency: e.target.value as 'UZS' | 'USD' | 'EUR' })}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg text-sm font-bold text-black"
                >
                  <option value="USD">USD</option>
                  <option value="UZS">UZS</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setShowExtraServicesPopup(false);
                  setNewExtraService({ name: '', price: '', currency: 'USD' });
                }}
                className="flex-1 py-3 bg-slate-100 text-black rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (sel && onUpdateBooking && newExtraService.name && newExtraService.price) {
                    const currentServices = sel.extra_services || [];
                    const updatedServices = [...currentServices, { name: newExtraService.name, price: parseFloat(newExtraService.price), currency: newExtraService.currency }];
                    await onUpdateBooking(sel.id, { extra_services: updatedServices });
                    setShowExtraServicesPopup(false);
                    setNewExtraService({ name: '', price: '', currency: 'USD' });
                    setSel({ ...sel, extra_services: updatedServices });
                  }
                }}
                className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition-all"
              >
                Add Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800">{new Date(selectedDay).toLocaleDateString()}</h2>
              <button onClick={() => setSelectedDay(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            {(() => {
              const dayBookings = getBookingsForDay(selectedDay);
              if (dayBookings.length === 0) {
                return (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <p className="text-lg font-bold text-slate-400">Empty</p>
                    <p className="text-sm text-slate-500">No bookings for this day</p>
                  </div>
                );
              }
              
              return (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {dayBookings.map((booking) => (
                    <div 
                      key={booking.id} 
                      onClick={() => {
                        setSelectedDay(null);
                        setSel(booking);
                        setEditData(booking);
                        setIsEditing(false);
                      }}
                      className="p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg"
                      style={{
                        borderColor: color(booking, today, userRole).bg,
                        backgroundColor: color(booking, today, userRole).bg + '10'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{booking.guest_name}</p>
                          <p className="text-sm text-slate-500">{booking.check_in} → {booking.check_out}</p>
                        </div>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color(booking, today, userRole).bg }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {userRole === 'Manager' && selectedDay >= today && onAddNewBooking && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <button
                  onClick={() => {
                    setSelectedDay(null);
                    onAddNewBooking(selectedDay);
                  }}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add New Booking
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settlement Modal for Manager Bookings */}
      {showSettlementModal && sel && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowSettlementModal(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800">Settlement - Check-In</h2>
              <button onClick={() => setShowSettlementModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm font-bold text-slate-600">Guest: <span className="text-slate-900">{sel.guest_name}</span></p>
              <p className="text-sm font-bold text-slate-600">Category: <span className="text-slate-900 capitalize">{(() => {
                const meta = (() => {
                  try {
                    return sel.special_requests ? JSON.parse(sel.special_requests) : {};
                  } catch {
                    return {};
                  }
                })();
                return meta.guest_category || 'international';
              })()}</span></p>
            </div>

            <div className="space-y-4">
              {(() => {
                const meta = (() => {
                  try {
                    return sel.special_requests ? JSON.parse(sel.special_requests) : {};
                  } catch {
                    return {};
                  }
                })();
                const category = meta.guest_category || 'international';

                if (category === 'pool') {
                  return (
                    <div className="bg-cyan-50 border-2 border-cyan-200 rounded-xl p-4 space-y-3">
                      <label className="block text-sm font-black text-cyan-900 uppercase tracking-widest text-[10px]">Pool Entry Fee</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={categoryData.pool.amount || ''}
                          onChange={(e) => setCategoryData({ ...categoryData, pool: { ...categoryData.pool, amount: parseFloat(e.target.value) || 0 } })}
                          placeholder="Enter amount"
                          className="flex-1 px-3 py-2 border-2 border-cyan-300 rounded-lg text-sm font-bold text-black focus:border-cyan-500"
                        />
                        <div className="px-3 py-2 bg-cyan-100 text-cyan-900 rounded-lg text-sm font-black">UZS</div>
                      </div>
                      <p className="text-[10px] font-bold text-cyan-600">Isolated Service Bucket: Room data will be purged on save.</p>
                    </div>
                  );
                } else if (category === 'local') {
                  return (
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 space-y-3">
                      <label className="block text-sm font-black text-emerald-900 uppercase tracking-widest text-[10px]">Local Guest Fee</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={categoryData.local.amount || ''}
                          onChange={(e) => setCategoryData({ ...categoryData, local: { ...categoryData.local, amount: parseFloat(e.target.value) || 0 } })}
                          placeholder="Enter amount"
                          className="flex-1 px-3 py-2 border-2 border-emerald-300 rounded-lg text-sm font-bold text-black focus:border-emerald-500"
                        />
                        <div className="px-3 py-2 bg-emerald-100 text-emerald-900 rounded-lg text-sm font-black">UZS</div>
                      </div>
                    </div>
                  );
                } else {
                  // International / Camper (Room-Based)
                  const isCamper = category === 'camper';
                  return (
                    <div className={`${isCamper ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'} border-2 rounded-xl p-4 space-y-3`}>
                      <label className={`block text-sm font-black ${isCamper ? 'text-amber-900' : 'text-indigo-900'} uppercase tracking-widest text-[10px]`}>Stay Price</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={categoryData.international.stay_price || ''}
                          onChange={(e) => setCategoryData({ ...categoryData, international: { ...categoryData.international, stay_price: parseFloat(e.target.value) || 0 } })}
                          placeholder="Enter amount"
                          className={`flex-1 px-3 py-2 border-2 ${isCamper ? 'border-amber-300 focus:border-amber-500' : 'border-indigo-300 focus:border-indigo-500'} rounded-lg text-sm font-bold text-black`}
                        />
                        <select
                          value={settlementCurrency}
                          onChange={(e) => setSettlementCurrency(e.target.value as 'UZS' | 'USD' | 'EUR')}
                          className={`px-3 py-2 border-2 ${isCamper ? 'border-amber-300 focus:border-amber-500' : 'border-indigo-300 focus:border-indigo-500'} rounded-lg text-sm font-bold text-black`}
                        >
                          <option value="UZS">UZS</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          id="cooking-class-settle"
                          checked={categoryData.international.cooking_class}
                          onChange={(e) => setCategoryData({ ...categoryData, international: { ...categoryData.international, cooking_class: e.target.checked } })}
                          className={`w-4 h-4 ${isCamper ? 'text-amber-600 border-amber-300' : 'text-indigo-600 border-indigo-300'} rounded`}
                        />
                        <label htmlFor="cooking-class-settle" className={`text-sm font-bold ${isCamper ? 'text-amber-900' : 'text-indigo-900'}`}>Cooking Class</label>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSettlementModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!sel || !onCheckIn) return;
                  
                  // Get guest category
                  const meta = (() => {
                    try {
                      return sel.special_requests ? JSON.parse(sel.special_requests) : {};
                    } catch {
                      return {};
                    }
                  })();
                  const category = meta.guest_category || 'international';

                  let amountValue = 0;
                  let cookingClassValue = false;

                  if (category === 'pool') {
                    amountValue = categoryData.pool.amount;
                  } else if (category === 'local') {
                    amountValue = categoryData.local.amount;
                  } else {
                    amountValue = categoryData.international.stay_price;
                    cookingClassValue = categoryData.international.cooking_class;
                  }

                  if (amountValue <= 0 && category !== 'international') {
                    alert('Please enter a valid amount');
                    return;
                  }

                  // Cleaning Logic
                  const rawPayload = {
                    total_price: amountValue,
                    currency: (category === 'pool' || category === 'local') ? 'UZS' : settlementCurrency,
                    status: 'checked_in',
                    cooking_class: cookingClassValue
                  };
                  
                  const cleanedPayload = cleanPayloadByCategory(category, rawPayload);
                  
                  if (onUpdateBooking) {
                    await onUpdateBooking(sel.id, cleanedPayload);
                  } else {
                    await onCheckIn(sel.id);
                  }

                  setShowSettlementModal(false);
                  setSel({ ...sel, ...cleanedPayload });
                  
                  // Refresh cache
                  try { await supabase.rpc('reload_schema'); } catch {}
                }}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg transition-all"
              >
                PAY & SETTLE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
