'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/lib/language-context';
import { supabase, type Booking, type UserRole, type Profile } from '@/lib/supabase';
import { SignaturePad } from '@/components/signature-pad';

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
      return booking.meta || {};
    } catch {
      return {};
    }
  })();

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
    const meta = (b.meta || {});
    return meta.is_pool_visitor === true || meta.guest_category === 'pool';
  } catch {
    return false;
  }
}

function isLocalGuest(b: Booking): boolean {
  try {
    const meta = (b.meta || {});
    return meta.is_local_guest === true || meta.guest_category === 'local';
  } catch {
    return false;
  }
}

function color(b: Booking, today: string, userRole: UserRole) {
  const status = getBookingStatus(b, today);
  
  if (userRole === 'Manager') {
    switch (status) {
      case 'checked-in': return { bg: '#10B981', text: '#FFFFFF' };
      case 'checked-out': return { bg: '#059669', text: '#FFFFFF' };
      case 'upcoming': return { bg: '#6EE7B7', text: '#064E3B' };
      case 'cancelled': return { bg: '#EF4444', text: '#FFFFFF' };
      case 'no-arrival': return { bg: '#9CA3AF', text: '#FFFFFF' };
      default: return { bg: '#10B981', text: '#FFFFFF' };
    }
  }

  if (userRole === 'CEO') {
    switch (status) {
      case 'checked-in': return { bg: '#8B5CF6', text: '#FFFFFF' };
      case 'checked-out': return { bg: '#A78BFA', text: '#FFFFFF' };
      case 'upcoming': return { bg: '#C4B5FD', text: '#4C1D95' };
      case 'cancelled': return { bg: '#EF4444', text: '#FFFFFF' };
      default: return { bg: '#8B5CF6', text: '#FFFFFF' };
    }
  }

  // Fallback
  switch (status) {
    case 'checked-in': return { bg: '#10B981', text: '#064E3B' };
    case 'checked-out': return { bg: '#3B82F6', text: '#1E3A5F' };
    case 'upcoming':
    case 'overdue-checkin': return { bg: '#F59E0B', text: '#78350F' };
    case 'neglected-checkin': return { bg: '#EF4444', text: '#7F1D1D' };
    case 'cancelled': return { bg: '#EF4444', text: '#7F1D1D' };
    case 'no-arrival': return { bg: '#9CA3AF', text: '#374151' };
    default: return PALETTE[(b.id || 0) % PALETTE.length];
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
    international: { stay_price: 0 },
    local: { amount: 0, type: 'day' },
    pool: { amount: 0 }
  });
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementCurrency, setSettlementCurrency] = useState<'UZS' | 'USD' | 'EUR'>('UZS');
  const [drinks, setDrinks] = useState<Array<{ id: number; name: string; original_price: number; sold_price: number; currency: 'UZS' | 'USD' | 'EUR'; available: boolean }>>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<Array<{ drink_id: number; drink_name: string; quantity: number; price: number; currency: 'UZS' | 'USD' | 'EUR' }>>([]);
  const [newExtraService, setNewExtraService] = useState({ name: '', price: '', currency: 'USD' as 'UZS' | 'USD' | 'EUR' });
  const [collectedAmount, setCollectedAmount] = useState('');
  const [collectedCurrency, setCollectedCurrency] = useState<'UZS' | 'USD' | 'EUR'>('USD');
  const [preEditCheckoutRef, setPreEditCheckoutRef] = useState('');
  const [extFee, setExtFee] = useState('');
  const [redFee, setRedFee] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [showSignatureStep, setShowSignatureStep] = useState(false);
  const originalCheckoutRef = useRef<string>('');


  const applyExtension = async () => {
    if (!sel || !onUpdateBooking) return;
    const amount = parseFloat(extFee) || 0;
    
    const currentMeta = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});
    
    const prevAdj = parseFloat(currentMeta.last_adjustment) || 0;
    const newTotal = (sel.total_price || 0) - prevAdj + amount;
    
    setLoadingAction('applyExt');
    try {
      await onUpdateBooking(sel.id, { 
        total_price: newTotal,
        last_adjustment: String(amount)
      });
      setExtFee(String(amount));
      setSel({ ...sel, total_price: newTotal, last_adjustment: String(amount) });
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
        status: raw.status || 'checked_in'
      };
    }
    if (category === 'local') {
      return {
        total_price: raw.total_price,
        currency: raw.currency,
        payment_status: 'paid',
        status: raw.status || 'checked_in'
      };
    }
    // International / Camper (Room-Based Flow)
    return {
      total_price: raw.total_price,
      currency: raw.currency,
      payment_status: raw.payment_status || 'Unpaid',
      status: raw.status || 'checked_in'
    };
  };

  const applyReduction = async () => {
    if (!sel || !onUpdateBooking) return;
    const amount = parseFloat(redFee) || 0;

    const currentMeta = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});

    const prevAdj = parseFloat(currentMeta.last_reduction) || 0; // Using separate field for reduction?
    const newTotal = Math.max(0, (sel.total_price || 0) + prevAdj - amount);
    
    setLoadingAction('applyRed');
    try {
      await onUpdateBooking(sel.id, { 
        total_price: newTotal,
        last_reduction: String(amount)
      });
      setRedFee(String(amount));
      setSel({ ...sel, total_price: newTotal, last_reduction: String(amount) });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction('');
    }
  };

  const getTabs = (booking: Booking | null) => {
    if (!booking) return [];
    const currentMeta = Array.isArray(booking.meta) ? { days: booking.meta } : (booking.meta || {});
    const receipts = currentMeta.settled_receipts || [];
    // Sort by settled_at date so oldest tab is first
    return receipts.sort((a: any, b: any) => {
      const dateA = new Date(a.settled_at || a.date).getTime();
      const dateB = new Date(b.settled_at || b.date).getTime();
      return dateA - dateB;
    });
  };

  const getBookingsForDay = (dayStr: string) => {
    return bookings.filter(b => b.check_in <= dayStr && b.check_out > dayStr);
  };

  // Store original checkout when a booking is selected
  useEffect(() => {
    if (sel) {
      setSignatureData(null);
      setShowSignatureStep(false);
      originalCheckoutRef.current = sel.check_out || '';
      const currentMeta = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});
      setExtFee(currentMeta.last_adjustment ? String(currentMeta.last_adjustment) : '');
      setRedFee(currentMeta.last_reduction ? String(currentMeta.last_reduction) : '');
    }
  }, [sel]);

  const eventsForWeek = (week: Date[]): EventInfo[] => {
    const strs  = week.map(dateToStr);
    const wStart = strs[0], wEnd = strs[6];
    const evs: Omit<EventInfo,'lane'>[] = bookings
      .filter(b => b.check_in <= wEnd && b.check_out > wStart)
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
    const currentMeta = sel.meta || {};

    // For manager bookings, open settlement modal
    if (currentMeta.is_system_only) {
      setShowSettlementModal(true);
      return;
    }

    // For regular bookings: show signature step first
    if (!showSignatureStep) {
      setShowSignatureStep(true);
      return;
    }

    if (!onCheckIn) return;
    const id = sel.id;
    setSel({ ...sel, status: 'checked_in' });
    try {
      // Save signature to booking metadata if present
      if (signatureData && onUpdateBooking) {
        await onUpdateBooking(id, {
          checkin_signature: signatureData,
          checkin_signed_at: new Date().toISOString()
        });
      }
      await onCheckIn(id);
      setShowSignatureStep(false);
      setSignatureData(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckOut = async () => {
    if (!sel || !onCheckOut) return;
    if (!confirm('Are you sure you want to check out ' + String(sel.guest_name) + '?')) return;
    const id = sel.id;
    setSel({ ...sel, status: 'completed', payment_status: 'paid' });
    try {
      await onCheckOut(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdate = async () => {
    if (!sel || !onUpdateBooking) return;

    const currentMeta = Array.isArray(sel.meta) ? { days: sel.meta } : (sel.meta || {});

    const updates: Partial<Booking> = {
      ...editData,
      is_manual_dates: true
    };

    const updatedSel = { ...sel, ...updates } as Booking;
    setSel(updatedSel);
    setIsEditing(false);

    try {
      await onUpdateBooking(sel.id, updates);
      if (originalCheckoutRef) {
        originalCheckoutRef.current = updates.check_out || '';
      }
      if (typeof setPreEditCheckoutRef === 'function') {
        setPreEditCheckoutRef(''); 
      }
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
    [...confirmed, ...cancelled]
      .filter(b => b.check_in <= dayStr && b.check_out > dayStr)
      .reduce((sum, b) => sum + (b.number_of_adults || 0) + (b.number_of_children || 0), 0);

  return (
    <div className="bento-card rounded-2xl overflow-hidden font-sans">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#5C4A2E]/30 bg-[#1C232E]">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-[#EDE6D6]">
            {t(`month.${month}`)} <span className="hc-body font-normal">{year}</span>
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
            className="px-3 py-1.5 text-xs font-semibold text-[#9C9384] border border-[#5C4A2E]/30 rounded-lg hover:bg-[#2A1518] transition-all">
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

      <div className="grid grid-cols-7 border-b border-black">
        {[0,1,2,3,4,5,6].map(d => (
          <div key={d} className="py-3 text-center text-xs sm:text-sm font-semibold hc-body uppercase tracking-wider">
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
                    className={`min-h-[56px] sm:min-h-[64px] px-2 sm:px-3 pt-2 sm:pt-3 border-r border-[#5C4A2E]/30 last:border-r-0 cursor-pointer transition-colors ${!isCurrentMonth ? 'bg-[#1C232E]/40' : ''}`}
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
                      <span className={`text-base sm:text-lg font-semibold w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                        {day.getDate()}
                      </span>
                      {full && (
                        <span className="text-[10px] sm:text-xs font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded">FULL</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative px-0.5 pb-2" style={{ minHeight: `${eventRows * 28 + 6}px` }}>
              <div className="relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${eventRows}, 26px)`, gap: '2px 0' }}>
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
                  const currentMeta = ev.booking.meta || {};
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
                        <span className="truncate">{ev.booking.guest_name} | {(ev.booking.number_of_adults || 0) + (ev.booking.number_of_children || 0) || ev.booking.guest_count}p | {pricePaid} UZS</span>
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
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 sm:p-4" onClick={() => setSel(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 w-full max-w-xl sm:max-w-2xl p-5 sm:p-8 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="mb-6">
              <div className="flex justify-end gap-1 mb-3">
                {sel.status === 'checked_in' && onCancelBooking && (
                  <button onClick={handleCancel} disabled={!!loadingAction} className="p-1.5 hover:bg-[#722F37]/30 rounded-lg transition-all" title="Cancel Trip">
                    <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <button onClick={() => setSel(null)} className="p-2 hover:bg-[#2A1518] rounded-lg transition-all">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex items-start gap-4 mb-5">
                <div className="w-6 h-6 rounded-lg flex-shrink-0 mt-1 shadow-sm" style={{ backgroundColor: color(sel, today, userRole).bg }} />
                <div>
                  <h3 className="text-2xl font-black text-[#EDE6D6] leading-none">{String(sel.guest_name)}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-sm font-black text-[#9C9384]">
                      {String((sel.number_of_adults || 0) + (sel.number_of_children || 0) || sel.guest_count)} Pax
                    </p>
                    <span className="w-1 h-1 bg-[#5C4A2E]/50 rounded-full" />
                    <p className="text-sm font-bold text-[#9C9384]">
                      {sel.check_in} – {sel.check_out}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {(userRole === 'Manager' || userRole === 'CEO') && (
                <div className="col-span-2 space-y-6">
                  <div className="flex flex-wrap gap-2 items-center border-b border-[#5C4A2E]/30 pb-4">
                    {getTabs(sel).map((tab: any, idx: number) => (
                      <button 
                        key={idx}
                        onClick={() => setActiveTabIdx(idx)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm border ${activeTabIdx === idx ? 'bg-[#0B6E4F] text-[#EDE6D6] border-[#0B6E4F]' : 'bg-[#1C232E]/50 text-[#9C9384] hover:text-[#EDE6D6] border-[#5C4A2E]/30'}`}
                      >
                        Tab {String(idx + 1)}
                      </button>
                    ))}
                    <button 
                      onClick={() => setActiveTabIdx(-1)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm border ${activeTabIdx === -1 ? 'bg-[#0B6E4F] text-[#C9A227] border-[#0B6E4F]' : 'bg-[#1C232E]/50 text-[#0B6E4F] hover:bg-[#0B6E4F]/20 border-[#0B6E4F]/30'}`}
                    >
                      {getTabs(sel).length > 0 ? 'Open Folio' : 'Current Tab'}
                    </button>
                  </div>

                  <div className={`p-6 rounded-[2.5rem] border-2 transition-all ${activeTabIdx === -1 ? 'bg-[#1C232E] border-[#0B6E4F]/40 shadow-xl shadow-[#0B6E4F]/20' : 'bg-[#1C232E]/50 border-[#5C4A2E]/30 grayscale-[0.5]'}`}>
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
                              <div className="p-4 bg-[#1C232E]/50 rounded-2xl border border-[#5C4A2E]/30">
                                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-2">Primary Stay (Master Tab)</label>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="opacity-75">
                                    <p className="text-[9px] font-bold text-[#9C9384] uppercase">Pax & Base Price</p>
                                    <p className="text-sm font-black text-[#EDE6D6]">{String((sel.number_of_adults || 0) + (sel.number_of_children || 0) || 0)} Guests @ ${String(sel?.total_price || 0)}</p>
                                  </div>
                                  <button 
                                    disabled={isTab1Closed}
                                    onClick={() => {
                                      if (!isTab1Closed) {
                                        setPreEditCheckoutRef(sel.check_out || '');
                                        setIsEditing(true);
                                      }
                                    }}
                                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${isTab1Closed ? 'bg-[#1C232E]/30 text-[#9C9384]/40 cursor-not-allowed border border-[#5C4A2E]/10' : 'bg-[#0B6E4F]/10 text-[#0B6E4F] hover:bg-[#0B6E4F]/20 border border-[#0B6E4F]/30'}`}
                                  >
                                    {isTab1Closed ? 'Stay Locked' : 'Edit Base Stay'}
                                  </button>
                                </div>
                              </div>
                            ) : activeTabIdx === -1 && isTab1Closed ? (
                              <>
                                {hasExtension && (
                                  <div className="p-4 bg-[#B8860B]/10 rounded-2xl border border-[#B8860B]/30 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[10px] font-black text-[#B8860B] uppercase tracking-widest block mb-2">Stay Extension Fee</label>
                                    <div className="flex gap-3 items-center">
                                      <input 
                                        type="number"
                                        placeholder="Extra amount..."
                                        value={extFee}
                                        onChange={e => setExtFee(e.target.value)}
                                        className="flex-1 px-4 py-2 bg-[#1C232E] border-2 border-[#B8860B]/40 rounded-xl text-sm font-black text-[#B8860B] outline-none focus:border-[#B8860B]"
                                      />
                                      <button 
                                        onClick={applyExtension}
                                        disabled={loadingAction === 'applyExt'}
                                        className="px-4 py-2 bg-[#B8860B] text-[#EDE6D6] hover:bg-[#B8860B]/80 rounded-xl text-xs font-black uppercase shadow-sm"
                                      >
                                        Apply
                                      </button>
                                    </div>
                                    <p className="mt-2 text-[9px] text-[#B8860B] font-bold italic">* Added stay from {String(originalCheckout)} to {String(sel?.check_out)}</p>
                                  </div>
                                )}
                                {hasReduction && (
                                  <div className="p-4 bg-[#0B6E4F]/10 rounded-2xl border border-[#0B6E4F]/30 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-[10px] font-black text-[#0B6E4F] uppercase tracking-widest block mb-2">Stay Reduction (Discount)</label>
                                    <div className="flex gap-3 items-center">
                                      <input 
                                        type="number"
                                        placeholder="Discount amount..."
                                        value={redFee}
                                        onChange={e => setRedFee(e.target.value)}
                                        className="flex-1 px-4 py-2 bg-[#1C232E] border-2 border-[#0B6E4F]/40 rounded-xl text-sm font-black text-[#0B6E4F] outline-none focus:border-[#0B6E4F]"
                                      />
                                      <button 
                                        onClick={applyReduction}
                                        disabled={loadingAction === 'applyRed'}
                                        className="px-4 py-2 bg-[#0B6E4F] text-[#EDE6D6] hover:bg-[#0B6E4F]/80 rounded-xl text-xs font-black uppercase shadow-sm"
                                      >
                                        Apply
                                      </button>
                                    </div>
                                    <p className="mt-2 text-[9px] text-[#0B6E4F] font-bold italic">* Reduced stay from {String(originalCheckout)} to {String(sel?.check_out)}</p>
                                  </div>
                                )}
                                <div className="mt-4 p-4 bg-[#1C232E] rounded-2xl border border-[#5C4A2E]/30">
                                  <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Accommodation Status</p>
                                  <p className="text-xs font-bold text-[#EDE6D6]">Primary stay settled in Tab 1. Current tab accommodation set to $0.</p>
                                </div>
                              </>
                            ) : null}
                          </div>
                             <div className="flex justify-between items-center">
                               <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Charges & Services</p>
                               {!isClosed && (
                                 <button onClick={() => setIsEditing(true)} className="text-[9px] font-black text-[#0B6E4F] uppercase hover:text-[#0B6E4F]/80 hover:underline">Add Items</button>
                               )}
                             </div>
                             
                             <div className="space-y-2">
                                {(isClosed ? (activeTab?.items?.drinks || []) : (sel?.drinks_tab || []))?.map((line: any, lidx: number) => (
                                  <div key={lidx} className="flex justify-between text-xs font-bold text-[#EDE6D6]">
                                    <span>{String(line?.drink_name)} x{String(line?.quantity)}</span>
                                    <span>${String(line?.price * line?.quantity)}</span>
                                  </div>
                                ))}
                                {(isClosed ? (activeTab?.items?.extras || []) : (sel?.extra_services || []))?.map((line: any, lidx: number) => (
                                  <div key={lidx} className="flex justify-between text-xs font-bold text-[#EDE6D6]">
                                    <span>{String(line?.name)}</span>
                                    <span>${String(line?.price)}</span>
                                  </div>
                                ))}
                             </div>

                           {/* Tab Footer (Pay & Close) */}
                           <div className="pt-6 border-t border-[#5C4A2E]/30 flex justify-between items-end">
                             <div>
                               <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest mb-1">Tab Total</p>
                               <p className="text-2xl font-black text-[#EDE6D6]">${String(isClosed ? activeTab.total : (sel.total_price || 0))}</p>
                             </div>
                             {!isClosed && (
                               <button 
                                 onClick={handleCheckOut} // Placeholder for Pay & Close
                                 className="px-6 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-2xl font-black uppercase text-xs shadow-lg shadow-[#0B6E4F]/20 hover:scale-105 hover:bg-[#0B6E4F]/80 transition-all active:scale-95 border border-[#C9A227]/20"
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
                    <button onClick={() => setIsEditing(false)} className="flex-1 min-h-[48px] py-3 text-sm bg-[#2A1518]/50 text-[#9C9384] border border-[#5C4A2E]/30 rounded-xl font-bold hover:bg-[#2A1518] transition-all">Cancel</button>
                    <button onClick={handleUpdate} className="flex-1 min-h-[48px] py-3 text-sm bg-[#0B6E4F] text-[#EDE6D6] hover:bg-[#0B6E4F]/80 rounded-xl font-bold transition-all">Save Changes</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {/* Signature Pad Step for Check-in */}
                    {showSignatureStep && sel.status === 'confirmed' && sel.check_in === today && (
                      <div className="p-4 sm:p-5 bg-[#1C232E]/50 rounded-2xl border-2 border-[#5C4A2E]/30 animate-in fade-in slide-in-from-bottom-2">
                        <label className="text-xs sm:text-sm font-black text-[#9C9384] uppercase tracking-widest block mb-3">
                          Guest Signature (Required)
                        </label>
                        <SignaturePad
                          onChange={(data) => setSignatureData(data)}
                          width={600}
                          height={140}
                          className="max-w-full"
                        />
                        <div className="flex gap-3 mt-4">
                          <button
                            onClick={() => { setShowSignatureStep(false); setSignatureData(null); }}
                            className="flex-1 min-h-[48px] py-3 text-sm bg-[#2A1518]/50 text-[#9C9384] border border-[#5C4A2E]/30 rounded-xl font-bold hover:bg-[#2A1518] transition-all"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleCheckIn}
                            disabled={!signatureData || !!loadingAction}
                            className={`flex-1 min-h-[48px] py-3 text-sm rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                              signatureData 
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                                : 'bg-[#1C232E]/50 text-[#9C9384]/40 border border-[#5C4A2E]/10 cursor-not-allowed'
                            }`}
                          >
                            {loadingAction === 'checkin' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Confirm Check In'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      {onCheckIn && sel.status === 'confirmed' && sel.check_in === today && !showSignatureStep && (
                        <button
                          onClick={handleCheckIn}
                          disabled={!!loadingAction}
                          className="flex-1 min-h-[48px] py-3 text-sm bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                        >
                          {loadingAction === 'checkin' ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('btn.check_in')}
                        </button>
                      )}
                      {onCheckIn && sel.status === 'confirmed' && sel.check_in !== today && (
                        <div className="flex-1 min-h-[48px] py-3 text-sm bg-[#B8860B]/10 text-[#B8860B] border border-[#B8860B]/30 rounded-xl font-bold text-center flex items-center justify-center">
                          Upcoming Guest
                        </div>
                      )}
                      {onCheckOut && sel?.status === 'checked_in' && (
                        today === sel?.check_out ? (
                          <button onClick={handleCheckOut} className="flex-1 min-h-[48px] py-3 text-sm bg-[#722F37] text-[#EDE6D6] hover:bg-[#722F37]/80 rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                            Check Out Now
                          </button>
                        ) : (
                          <div className="flex-1 min-h-[48px] py-3 text-sm bg-[#0B6E4F]/10 text-[#0B6E4F] rounded-xl font-bold text-center flex items-center justify-center gap-2 border border-[#0B6E4F]/30">
                             <div className="w-2 h-2 bg-[#0B6E4F] rounded-full animate-pulse" />
                             Active Stay
                          </div>
                        )
                      )}
                      {sel.status === 'completed' && (
                        <div className="flex-1 min-h-[48px] py-3 text-sm bg-[#5C4A2E] text-[#EDE6D6] border border-[#5C4A2E]/50 rounded-xl font-bold text-center flex items-center justify-center cursor-not-allowed">
                          Successful Check Out
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      {sel.status === 'checked_in' && (
                        <div className="flex-1 group relative">
                          <button
                            onClick={() => setIsEditing(true)}
                            className="w-full min-h-[48px] py-3 text-sm bg-[#0B6E4F]/10 text-[#0B6E4F] rounded-xl font-bold hover:bg-[#0B6E4F]/20 border border-[#0B6E4F]/30 transition-all"
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
                          className="px-4 min-h-[48px] py-3 text-xs sm:text-sm bg-[#B8860B]/10 text-[#B8860B] rounded-xl font-bold hover:bg-[#B8860B]/20 border border-[#B8860B]/30 transition-all"
                        >
                          Request Change
                        </button>
                      )}

                      {/* Restore button for cancelled/no-arrival bookings (creator or CEO only) */}
                      {(sel.status === 'cancelled' || sel.status === 'no_arrival') && onUpdateBooking && (userRole === 'CEO' || currentUserId === sel.created_by) && (
                        <button
                          onClick={async () => {
                            setLoadingAction('restore');
                            await onUpdateBooking(sel.id, { status: 'confirmed' });
                            setLoadingAction(null);
                            setSel(null);
                          }}
                          disabled={!!loadingAction}
                          className="flex-1 min-h-[48px] py-3 text-sm bg-[#0B6E4F]/10 text-[#0B6E4F] rounded-xl font-bold hover:bg-[#0B6E4F]/20 border border-[#0B6E4F]/30 transition-all"
                        >
                          {loadingAction === 'restore' ? <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" /> : 'Restore Booking'}
                        </button>
                      )}

                      {onCancelBooking && sel.status !== 'completed' && sel.status !== 'cancelled' && sel.status !== 'no_arrival' && sel.status !== 'checked_in' && (
                        <div className="flex-1 group relative">
                          <button
                            onClick={handleCancel}
                            disabled={!!loadingAction || !canCancel(sel)}
                            className={`w-full min-h-[48px] py-3 text-sm rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${canCancel(sel) ? 'bg-[#722F37]/20 text-[#722F37] hover:bg-[#722F37]/30' : 'bg-[#1C232E]/50 text-[#9C9384] cursor-not-allowed'}`}
                          >
                            {loadingAction === 'cancel' ? <div className="w-5 h-5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" /> : 'Cancel Trip'}
                          </button>
                          {!canCancel(sel) && userRole !== 'CEO' && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
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
                            className="w-full min-h-[44px] py-2 text-sm bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-all"
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
          <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 w-full max-w-2xl p-8 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-[#EDE6D6]">Request Booking Edit</h2>
              <button onClick={() => setShowEditRequestModal(false)} className="p-2 hover:bg-[#2A1518] rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#B8860B]/10 border border-[#B8860B]/30 rounded-xl p-4 mb-4">
                <p className="text-sm text-[#B8860B] font-semibold">
                  This request will be sent to the CEO and the booking person for approval.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#9C9384] mb-2">Guest Name</label>
                <input
                  type="text"
                  value={editRequestData.guest_name || ''}
                  onChange={e => setEditRequestData({ ...editRequestData, guest_name: e.target.value })}
                  className="w-full px-4 py-3 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-xl text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#9C9384] mb-2">Check-in Date</label>
                  <input
                    type="date"
                    value={editRequestData.check_in || ''}
                    onChange={e => setEditRequestData({ ...editRequestData, check_in: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-xl text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#9C9384] mb-2">Check-out Date</label>
                  <input
                    type="date"
                    value={editRequestData.check_out || ''}
                    onChange={e => setEditRequestData({ ...editRequestData, check_out: e.target.value })}
                    className="w-full px-4 py-3 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-xl text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#9C9384] mb-2">Number of Adults</label>
                <input
                  type="number"
                  value={editRequestData.number_of_adults || ''}
                  onChange={e => setEditRequestData({ ...editRequestData, number_of_adults: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-xl text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#9C9384] mb-2">Notes</label>
                <textarea
                  value={editRequestData.notes || ''}
                  onChange={e => setEditRequestData({ ...editRequestData, notes: e.target.value })}
                  className="w-full px-4 py-3 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-xl text-base font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                  rows={3}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => setShowEditRequestModal(false)}
                  className="flex-1 min-h-[48px] px-6 py-3 text-sm bg-[#2A1518]/50 text-[#9C9384] border border-[#5C4A2E]/30 rounded-xl font-bold hover:bg-[#2A1518] transition-all"
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
                  className="flex-1 px-6 py-3 bg-[#0B6E4F] text-[#EDE6D6] rounded-xl font-bold hover:bg-[#0B6E4F]/80 transition-all"
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
          <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 w-full max-w-md p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-[#EDE6D6]">Add Drinks</h3>
              <button onClick={() => setShowDrinksPopup(false)} className="p-2 hover:bg-[#2A1518] rounded-xl transition-all">
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
                <div key={drink.id} className="flex items-center justify-between p-3 bg-[#1C232E]/50 rounded-lg">
                  <div>
                    <p className="font-bold text-[#EDE6D6]">{drink.name}</p>
                    <p className="text-xs text-[#9C9384]">${drink.sold_price} {drink.currency}</p>
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
          <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 w-full max-w-md p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-[#EDE6D6]">Add Extra Service</h3>
              <button onClick={() => setShowExtraServicesPopup(false)} className="p-2 hover:bg-[#2A1518] rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-1">Service Name</label>
                <input
                  type="text"
                  value={newExtraService.name}
                  onChange={e => setNewExtraService({ ...newExtraService, name: e.target.value })}
                  placeholder="Service name"
                  className="w-full px-4 py-2 bg-[#1C232E]/50 border-2 border-[#5C4A2E]/30 rounded-lg text-sm font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-1">Price</label>
                <input
                  type="number"
                  value={newExtraService.price}
                  onChange={e => setNewExtraService({ ...newExtraService, price: e.target.value })}
                  placeholder="Price"
                  className="w-full px-4 py-2 bg-[#1C232E]/50 border-2 border-[#5C4A2E]/30 rounded-lg text-sm font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest block mb-1">Currency</label>
                <select
                  value={newExtraService.currency}
                  onChange={e => setNewExtraService({ ...newExtraService, currency: e.target.value as 'UZS' | 'USD' | 'EUR' })}
                  className="w-full px-4 py-2 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-lg text-sm font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
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
                className="flex-1 py-3 bg-[#2A1518]/50 text-[#9C9384] border border-[#5C4A2E]/30 rounded-xl font-bold hover:bg-[#2A1518] transition-all"
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
                className="flex-1 py-3 bg-[#B8860B] text-[#EDE6D6] rounded-xl font-bold hover:bg-[#B8860B]/80 transition-all"
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
          <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-[#EDE6D6]">{new Date(selectedDay).toLocaleDateString()}</h2>
              <button onClick={() => setSelectedDay(null)} className="p-2 hover:bg-[#2A1518] rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            {(() => {
              const dayBookings = getBookingsForDay(selectedDay);
              if (dayBookings.length === 0) {
                return (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <p className="text-lg font-bold text-[#9C9384]">Empty</p>
                    <p className="text-sm text-[#9C9384]/70">No bookings for this day</p>
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
                          <p className="font-bold text-[#EDE6D6]">{booking.guest_name}</p>
                          <p className="text-sm text-[#9C9384]">{booking.check_in} → {booking.check_out}</p>
                        </div>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color(booking, today, userRole).bg }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {userRole === 'Manager' && selectedDay >= today && onAddNewBooking && (
              <div className="mt-6 pt-6 border-t border-[#5C4A2E]/30">
                <button
                  onClick={() => {
                    setSelectedDay(null);
                    onAddNewBooking(selectedDay);
                  }}
                  className="w-full py-3 bg-[#0B6E4F] text-[#EDE6D6] rounded-xl font-bold hover:bg-[#0B6E4F]/80 transition-all flex items-center justify-center gap-2"
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
          <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-[#EDE6D6]">Settlement - Check-In</h2>
              <button onClick={() => setShowSettlementModal(false)} className="p-2 hover:bg-[#2A1518] rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm font-bold text-[#9C9384]">Guest: <span className="text-[#EDE6D6]">{sel.guest_name}</span></p>
              <p className="text-sm font-bold text-[#9C9384]">Category: <span className="text-[#EDE6D6] capitalize">{(() => {
                const meta = (() => {
                  try {
                    return sel.meta || {};
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
                    return sel.meta || {};
                  } catch {
                    return {};
                  }
                })();
                const category = meta.guest_category || 'international';

                if (category === 'pool') {
                  return (
                    <div className="bg-[#1C232E]/50 border-2 border-[#5C4A2E]/30 rounded-xl p-4 space-y-3">
                      <label className="block text-sm font-black text-[#9C9384] uppercase tracking-widest text-[10px]">Pool Entry Fee</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={categoryData.pool.amount || ''}
                          onChange={(e) => setCategoryData({ ...categoryData, pool: { ...categoryData.pool, amount: parseFloat(e.target.value) || 0 } })}
                          placeholder="Enter amount"
                          className="flex-1 px-3 py-2 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-lg text-sm font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                        />
                        <div className="px-3 py-2 bg-[#1C232E]/30 text-[#9C9384] border border-[#5C4A2E]/30 rounded-lg text-sm font-black">UZS</div>
                      </div>
                      <p className="text-[10px] font-bold text-[#B8860B]">Isolated Service Bucket: Room data will be purged on save.</p>
                    </div>
                  );
                } else if (category === 'local') {
                  return (
                    <div className="bg-[#0B6E4F]/10 border-2 border-[#0B6E4F]/30 rounded-xl p-4 space-y-3">
                      <label className="block text-sm font-black text-[#0B6E4F] uppercase tracking-widest text-[10px]">Local Guest Fee</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={categoryData.local.amount || ''}
                          onChange={(e) => setCategoryData({ ...categoryData, local: { ...categoryData.local, amount: parseFloat(e.target.value) || 0 } })}
                          placeholder="Enter amount"
                          className="flex-1 px-3 py-2 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-lg text-sm font-bold text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all"
                        />
                        <div className="px-3 py-2 bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/30 rounded-lg text-sm font-black">UZS</div>
                      </div>
                    </div>
                  );
                } else {
                  // International / Camper (Room-Based)
                  const isCamper = category === 'camper';
                  return (
                    <div className={`${isCamper ? 'bg-[#B8860B]/10 border-[#B8860B]/30' : 'bg-[#1C232E]/50 border-[#5C4A2E]/30'} border-2 rounded-xl p-4 space-y-3`}>
                      <label className={`block text-sm font-black ${isCamper ? 'text-[#B8860B]' : 'text-[#EDE6D6]'} uppercase tracking-widest text-[10px]`}>Stay Price</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={categoryData.international.stay_price || ''}
                          onChange={(e) => setCategoryData({ ...categoryData, international: { ...categoryData.international, stay_price: parseFloat(e.target.value) || 0 } })}
                          placeholder="Enter amount"
                          className={`flex-1 px-3 py-2 bg-[#1C232E] border-2 ${isCamper ? 'border-[#B8860B]/30 focus:border-[#B8860B]' : 'border-[#5C4A2E]/30 focus:border-[#0B6E4F]'} rounded-lg text-sm font-bold text-[#EDE6D6] outline-none transition-all`}
                        />
                        <select
                          value={settlementCurrency}
                          onChange={(e) => setSettlementCurrency(e.target.value as 'UZS' | 'USD' | 'EUR')}
                          className={`px-3 py-2 bg-[#1C232E] border-2 ${isCamper ? 'border-[#B8860B]/30 focus:border-[#B8860B]' : 'border-[#5C4A2E]/30 focus:border-[#0B6E4F]'} rounded-lg text-sm font-bold text-[#EDE6D6] outline-none transition-all`}
                        >
                          <option value="UZS">UZS</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>

                    </div>
                  );
                }
              })()}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSettlementModal(false)}
                className="flex-1 py-3 bg-[#2A1518]/50 text-[#9C9384] border border-[#5C4A2E]/30 rounded-xl font-bold hover:bg-[#2A1518] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!sel || !onCheckIn) return;
                  
                  // Get guest category
                  const meta = sel.meta || {};
                  const category = meta.guest_category || 'international';

                  let amountValue = 0;

                  if (category === 'pool') {
                    amountValue = categoryData.pool.amount;
                  } else if (category === 'local') {
                    amountValue = categoryData.local.amount;
                  } else {
                    amountValue = categoryData.international.stay_price;
                  }

                  if (amountValue <= 0 && category !== 'international') {
                    alert('Please enter a valid amount');
                    return;
                  }

                  // Cleaning Logic
                  const rawPayload = {
                    total_price: amountValue,
                    currency: (category === 'pool' || category === 'local') ? 'UZS' : settlementCurrency,
                    status: 'checked_in'
                  };
                  
                  const cleanedPayload = cleanPayloadByCategory(category, rawPayload);
                  
                  if (onUpdateBooking) {
                    await onUpdateBooking(sel.id, cleanedPayload);
                  } else {
                    await onCheckIn(sel.id);
                  }

                  setShowSettlementModal(false);
                  setSel({ ...sel, ...cleanedPayload });
                  

                }}
                className="flex-1 py-3 bg-[#0B6E4F] text-[#C9A227] hover:bg-[#0B6E4F]/80 rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#0B6E4F]/20"
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
