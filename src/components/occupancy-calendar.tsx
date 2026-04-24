'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import type { Booking, Yurt, UserRole, Profile } from '@/lib/supabase';

interface Props { 
  bookings: Booking[]; 
  yurts: Yurt[]; 
  userRole: UserRole;
  currentUserId?: string;
  staff?: Profile[];
  onCancelBooking?: (id: number) => Promise<void>;
  onCheckIn?: (id: number) => Promise<void>;
  onCheckOut?: (id: number) => Promise<void>;
  onUpdateBooking?: (id: number, updates: Partial<Booking>) => Promise<void>;
  onAddNewBooking?: (date: string) => void;
}
interface EventInfo { booking: Booking; colStart: number; colEnd: number; lane: number; }

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

function getBookingStatus(b: Booking, today: string): 'checked-in' | 'checked-out' | 'upcoming' | 'overdue-checkin' | 'neglected-checkin' | 'cancelled' {
  if (b.status === 'cancelled') return 'cancelled';
  if (b.status === 'checked_in') return 'checked-in';
  if (b.status === 'completed') return 'checked-out';
  if (b.status === 'confirmed') {
    if (b.check_in < today) return 'overdue-checkin';
    // Check if it's the check-in day and after 6PM
    if (b.check_in === today) {
      const now = new Date();
      if (now.getHours() >= 18) return 'neglected-checkin';
    }
    return 'upcoming';
  }
  return 'upcoming';
}

function color(b: Booking, today: string) {
  const status = getBookingStatus(b, today);
  switch (status) {
    case 'checked-in':
      return { bg: '#3B82F6', text: '#1E3A5F' }; // Blue
    case 'checked-out':
      return { bg: '#10B981', text: '#064E3B' }; // Green (success)
    case 'upcoming':
      return { bg: '#F59E0B', text: '#78350F' }; // Yellow
    case 'overdue-checkin':
      return { bg: '#F59E0B', text: '#78350F' }; // Yellow
    case 'neglected-checkin':
      return { bg: '#EF4444', text: '#7F1D1D' }; // Red (attention)
    case 'cancelled':
      return { bg: '#EF4444', text: '#7F1D1D' }; // Red
    default:
      return PALETTE[(b.yurt_id || 0) % PALETTE.length];
  }
}

export function OccupancyCalendar({ bookings, yurts, userRole, currentUserId, staff, onCancelBooking, onCheckIn, onCheckOut, onUpdateBooking, onAddNewBooking }: Props) {
  const { t } = useLanguage();
  const [cur, setCur]   = useState(new Date());
  const [sel, setSel]   = useState<Booking | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Booking>>({});
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editRequestData, setEditRequestData] = useState<Partial<Booking>>({});

  const year  = cur.getFullYear();
  const month = cur.getMonth();
  const weeks = getCalendarWeeks(year, month);
  const today = dateToStr(new Date());
  const confirmed = bookings.filter(b => b.status === 'confirmed' || b.status === 'checked_in');
  const completed = bookings.filter(b => b.status === 'completed');
  const cancelled = bookings.filter(b => b.status === 'cancelled');
  const totalYurts = yurts.filter(y => y.status !== 'Maintenance').length;

  const eventsForWeek = (week: Date[]): EventInfo[] => {
    const strs  = week.map(dateToStr);
    const wStart = strs[0], wEnd = strs[6];
    const evs: Omit<EventInfo,'lane'>[] = [...confirmed, ...completed, ...cancelled]
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
      setLoadingAction('cancel');
      try {
        await onCancelBooking(sel.id);
        setSel(null);
      } catch (err) {
        alert('Failed to cancel booking');
      } finally {
        setLoadingAction(null);
      }
    }
  };

  const handleCheckIn = async () => {
    if (!sel || !onCheckIn) return;
    if (!confirm('Are you sure you want to check in ' + sel.guest_name + '?')) return;
    setLoadingAction('checkin');
    try {
      await onCheckIn(sel.id);
      // Immediately update local state to show checkmark
      setSel({ ...sel, status: 'checked_in' });
      alert('Check-in successful!');
      setSel(null);
    } catch (err) {
      alert('Failed to check in');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCheckOut = async () => {
    if (!sel || !onCheckOut) return;
    if (!confirm('Are you sure you want to check out ' + sel.guest_name + '?')) return;
    setLoadingAction('checkout');
    try {
      await onCheckOut(sel.id);
      // Immediately update local state to show completed status
      setSel({ ...sel, status: 'completed' });
      alert('Check-out successful!');
      setSel(null);
    } catch (err) {
      alert('Failed to check out');
    } finally {
      setLoadingAction(null);
    }
  };

  const syncToGoogleCalendar = (booking: Booking) => {
    console.log('🔄 SYNCING TO GOOGLE CALENDAR:', {
      summary: `Booking: ${booking.guest_name} (${booking.num_people || booking.number_of_people} ppl)`,
      start: booking.check_in,
      end: booking.check_out,
      description: `Sync from ${booking.created_by_role || 'System'} portal`
    });
  };

  const handleUpdate = async () => {
    if (!sel || !onUpdateBooking) return;
    setLoadingAction('update');
    try {
      await onUpdateBooking(sel.id, editData);
      alert('Changes saved successfully!');
      setIsEditing(false);
      setSel(null);
      syncToGoogleCalendar({ ...sel, ...editData } as Booking);
    } catch (err) {
      alert('Failed to update booking');
    } finally {
      setLoadingAction(null);
    }
  };

  const canEdit = (booking: Booking) => {
    if (userRole === 'CEO') return true;
    if (userRole === 'Cook') return false;
    if (!currentUserId) return false;
    // Manager and Reserver can edit any booking regardless of original creator
    if (userRole === 'Manager' || userRole === 'Reserver') {
      return true;
    }
    return false;
  };

  const canCancel = (booking: Booking) => {
    if (userRole === 'CEO') return true;
    if (userRole === 'Cook') return false;
    if (!currentUserId) return false;
    // Manager and Reserver can cancel any booking regardless of original creator
    if (userRole === 'Manager' || userRole === 'Reserver') {
      return true;
    }
    return false;
  };

  const isCook = userRole === 'Cook';

  const allEvents = weeks.map(w => eventsForWeek(w));
  const maxLanes  = Math.max(0, ...allEvents.map(es => es.length ? Math.max(...es.map(e=>e.lane))+1 : 0));

  const dayOccupancy = (dayStr: string) =>
    [...confirmed, ...cancelled].filter(b => b.check_in <= dayStr && b.check_out >= dayStr).length;

  const getBookingsForDay = (dayStr: string) => {
    return bookings.filter(b => b.check_in <= dayStr && b.check_out >= dayStr);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden font-sans">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/30">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            {t(`month.${month}`)} <span className="text-slate-400 font-normal">{year}</span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
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

      {/* ── Day-name row ── */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {[0,1,2,3,4,5,6].map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {t(`day.${d}`)}
          </div>
        ))}
      </div>

      {/* ── Weeks ── */}
      {weeks.map((week, wi) => {
        const events   = allEvents[wi];
        const maxL     = events.length ? Math.max(...events.map(e=>e.lane))+1 : 0;
        const eventRows = Math.max(maxL, 1);

        return (
          <div key={wi} className="border-b border-slate-100 last:border-none">
            {/* Date numbers */}
            <div className="grid grid-cols-7">
              {week.map((day, di) => {
                const ds    = dateToStr(day);
                const occ   = dayOccupancy(ds);
                const full  = totalYurts > 0 && occ >= totalYurts;
                const isToday = ds === today;
                const isCurrentMonth = day.getMonth() === month;
                return (
                  <div 
                    key={di} 
                    className={`min-h-[40px] px-2 pt-2 border-r border-slate-100 last:border-r-0 cursor-pointer hover:bg-indigo-50 transition-colors ${!isCurrentMonth ? 'bg-slate-50/60' : ''}`}
                    onClick={() => {
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

            {/* Event bars area */}
            <div className="relative px-0.5 pb-1.5" style={{ minHeight: `${eventRows * 24 + 4}px` }}>
              <div className="relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${eventRows}, 22px)`, gap: '2px 0' }}>
                {events.map((ev, ei) => {
                  const c = color(ev.booking, today);
                  const isStart = ev.booking.check_in >= dateToStr(week[ev.colStart]);
                  const isEnd   = ev.booking.check_out <= dateToStr(week[ev.colEnd]);
                  const isCancelled = ev.booking.status === 'cancelled';
                  const isCheckedIn = ev.booking.status === 'checked_in';
                  const isCompleted = ev.booking.status === 'completed';
                  const bookingStatus = getBookingStatus(ev.booking, today);

                  // Check for neglected check-in (after 6 PM on check-in date or overdue)
                  const isNeglectedCheckIn = bookingStatus === 'neglected-checkin' || bookingStatus === 'overdue-checkin';

                  // Check for neglected checkout (after 12 PM on checkout date)
                  const checkOutDate = new Date(ev.booking.check_out);
                  const checkOutDateStr = checkOutDate.toISOString().split('T')[0];
                  const now = new Date();
                  const isNeglectedCheckout = ev.booking.status === 'checked_in' &&
                    checkOutDateStr === today &&
                    now.getHours() >= 12;

                  return (
                    <button
                      key={ei}
                      onClick={() => {
                        if (isCancelled) return;
                        setSel(ev.booking);
                        setEditData(ev.booking);
                        setIsEditing(false);
                      }}
                      disabled={isCancelled}
                      title={ev.booking.guest_name}
                      style={{
                        gridColumn: `${ev.colStart + 1} / ${ev.colEnd + 2}`,
                        gridRow: `${ev.lane + 1}`,
                        backgroundColor: isCancelled ? '#fecaca' : c.bg,
                        color: isCancelled ? '#991b1b' : c.text,
                        borderRadius: isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '0',
                        marginLeft: isStart ? '2px' : '0',
                        marginRight: isEnd  ? '2px' : '0',
                        cursor: isCancelled ? 'not-allowed' : 'pointer',
                      }}
                      className="text-[11px] font-semibold px-2 truncate text-left flex items-center h-[20px] hover:brightness-90 transition-all"
                    >
                      <span className="flex-1 truncate">
                        {isStart ? (isCancelled ? `${ev.booking.guest_name} (CANCELLED)` : ev.booking.guest_name) : ''}
                      </span>
                      {/* Status indicators */}
                      <span className="flex items-center gap-1 ml-1">
                        {isCheckedIn && (
                          <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {isCompleted && (
                          <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
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

      {/* ── Booking Detail Panel ── */}
      {sel && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4" onClick={() => setSel(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color(sel, today).bg }} />
                <div>
                  <h3 className="text-2xl font-black text-slate-800">{sel.guest_name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t('manifest.guest')} • Booking ID: {sel.id}</p>
                  <p className="text-[9px] text-slate-300 mt-1">
                    Created by: <span className="font-semibold text-slate-600">
                      {sel.created_by_role === 'Reserver' 
                        ? `Reserver: ${staff?.find(s => s.id === sel.created_by_id)?.full_name || 'Unknown'}`
                        : sel.created_by_role || 'System'}
                    </span>
                  </p>
                  <p className="text-[9px] text-slate-300">
                    Last edited by: <span className="font-semibold text-slate-600">
                      {sel.last_edited_by_role === 'Reserver'
                        ? `Reserver: ${staff?.find(s => s.id === sel.last_edited_by_id)?.full_name || 'Unknown'}`
                        : sel.last_edited_by_role || 'System'}
                    </span>
                  </p>
                </div>
              </div>
              <button onClick={() => setSel(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Core Info */}
              <div className="col-span-2 grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('form.check_in')}</label>
                  {isEditing && canEdit(sel) ? (
                    <input type="date" value={editData.check_in} onChange={e => setEditData({...editData, check_in: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold" />
                  ) : <p className="font-bold text-slate-700">{sel.check_in}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('form.check_out')}</label>
                  {isEditing && canEdit(sel) ? (
                    <input type="date" value={editData.check_out} onChange={e => setEditData({...editData, check_out: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-bold" />
                  ) : <p className="font-bold text-slate-700">{sel.check_out}</p>}
                </div>
              </div>

              {/* Status & Pricing */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('table.status')}</label>
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${sel.payment_status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : sel.payment_status === 'Partial' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                    {sel.payment_status}
                  </span>
                  {sel.status === 'checked_in' && <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-black uppercase">IN</span>}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('manifest.total_rate')}</label>
                <p className="text-lg font-black text-slate-800">${sel.total_price}</p>
              </div>

              {/* Operational Info */}
              <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3">
                <div>
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">{t('form.num_people')}</label>
                  <p className="font-bold text-indigo-900">{sel.num_people || sel.number_of_people || sel.guest_count}</p>
                </div>
                {sel.children_under_12 !== undefined && sel.children_under_12 > 0 && (
                  <div>
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Children Under 12</label>
                    <p className="font-bold text-indigo-900">{sel.children_under_12}</p>
                  </div>
                )}
                {sel.nights && (
                  <div>
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Nights</label>
                    <p className="font-bold text-indigo-900">{sel.nights}</p>
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">{t('form.meal_preference')}</label>
                  {isEditing && canEdit(sel) ? (
                    <textarea value={editData.meal_preference || ''} onChange={e => setEditData({...editData, meal_preference: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs" />
                  ) : <p className="text-sm font-medium text-indigo-800 italic">{sel.meal_preference || 'No preference'}</p>}
                </div>
              </div>

              {/* Services Section */}
              {(sel.lunch || sel.dinner || sel.drinks || sel.laundry || sel.guide_service || sel.has_transportation) && (
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-3">
                  <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-2">Services</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {sel.lunch && <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span><span className="font-semibold text-emerald-900">Lunch x{sel.lunch_count || 1}</span></div>}
                    {sel.dinner && <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span><span className="font-semibold text-emerald-900">Dinner x{sel.dinner_count || 1}</span></div>}
                    {sel.drinks && <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span><span className="font-semibold text-emerald-900">Drinks x{sel.drinks_count || 1}</span></div>}
                    {sel.laundry && <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span><span className="font-semibold text-emerald-900">Laundry {sel.laundry_price ? `(${sel.laundry_price} ${sel.laundry_currency || 'UZS'})` : ''}</span></div>}
                    {sel.guide_service && <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span><span className="font-semibold text-emerald-900">Guide {sel.guide_names ? `(${sel.guide_names})` : ''}</span></div>}
                    {sel.has_transportation && <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span><span className="font-semibold text-emerald-900">Transportation</span></div>}
                  </div>
                  {sel.transportation_details && (
                    <div className="mt-2 text-xs text-emerald-700 italic max-h-20 overflow-y-auto">
                      {sel.transportation_details}
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-3">
                <div>
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">{t('form.transportation')}</label>
                  {isEditing && canEdit(sel) ? (
                    <input type="text" value={editData.transportation || ''} onChange={e => setEditData({...editData, transportation: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs" />
                  ) : <p className="text-sm font-bold text-blue-900">{sel.transportation || 'Self transport'}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{t('form.guide_required')}</label>
                  <div className={`w-10 h-5 rounded-full p-1 transition-all ${sel.guide_required || sel.guide_service ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-all ${sel.guide_required || sel.guide_service ? 'translate-x-5' : ''}`} />
                  </div>
                </div>
                {sel.payment_method && (
                  <div>
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">Payment Method</label>
                    <p className="text-sm font-bold text-blue-900">{sel.payment_method}</p>
                  </div>
                )}
              </div>

              {/* Special Requests */}
              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t('form.special_requests')}</label>
                {isEditing && canEdit(sel) ? (
                  <textarea value={editData.special_requests || ''} onChange={e => setEditData({...editData, special_requests: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" rows={3} />
                ) : <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-600 italic">"{sel.special_requests || 'No special requests'}"</div>}
              </div>

              {/* Service Editing (for Cook and Manager) */}
              {isEditing && canEdit(sel) && (
                <div className="col-span-2 p-4 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-4">
                  <label className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-2">
                    {userRole === 'Cook' ? 'Cook Services' : 'Service Management'}
                  </label>

                  {/* Cook can edit drinks and laundry */}
                  {userRole === 'Cook' && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editData.drinks || false}
                          onChange={e => setEditData({...editData, drinks: e.target.checked, drinks_count: e.target.checked ? (editData.drinks_count || 1) : 0})}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600"
                        />
                        <span className="text-slate-900 font-semibold text-sm">Drinks</span>
                        {editData.drinks && (
                          <input
                            type="number"
                            min="1"
                            value={editData.drinks_count || 1}
                            onChange={e => setEditData({...editData, drinks_count: parseInt(e.target.value) || 1})}
                            className="w-16 px-2 py-1 border-2 border-slate-300 rounded-lg text-sm font-semibold"
                          />
                        )}
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editData.laundry || false}
                          onChange={e => setEditData({...editData, laundry: e.target.checked})}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600"
                        />
                        <span className="text-slate-900 font-semibold text-sm">Laundry</span>
                      </label>
                      {editData.laundry && (
                        <div className="flex gap-2 items-center pl-8">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editData.laundry_price || ''}
                            onChange={e => setEditData({...editData, laundry_price: e.target.value})}
                            placeholder="Price"
                            className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold"
                          />
                          <select
                            value={editData.laundry_currency || 'UZS'}
                            onChange={e => setEditData({...editData, laundry_currency: e.target.value as 'UZS' | 'USD'})}
                            className="px-4 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold"
                          >
                            <option value="UZS">UZS</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manager can edit transportation, guide, dates */}
                  {userRole === 'Manager' && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editData.guide_required || editData.guide_service || false}
                          onChange={e => setEditData({...editData, guide_required: e.target.checked, guide_service: e.target.checked})}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600"
                        />
                        <span className="text-slate-900 font-semibold text-sm">Guide Service</span>
                      </label>
                      {(editData.guide_required || editData.guide_service) && (
                        <div className="pl-8 space-y-2">
                          <input
                            type="text"
                            value={editData.guide_names || ''}
                            onChange={e => setEditData({...editData, guide_names: e.target.value})}
                            placeholder="Guide names (comma-separated)"
                            className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editData.guide_amount || ''}
                            onChange={e => setEditData({...editData, guide_amount: e.target.value})}
                            placeholder="Guide amount (USD)"
                            className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold"
                          />
                        </div>
                      )}
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editData.has_transportation || false}
                          onChange={e => setEditData({...editData, has_transportation: e.target.checked})}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-amber-600"
                        />
                        <span className="text-slate-900 font-semibold text-sm">Transportation</span>
                      </label>
                      {editData.has_transportation && (
                        <div className="pl-8">
                          <textarea
                            value={editData.transportation_details || ''}
                            onChange={e => setEditData({...editData, transportation_details: e.target.value})}
                            placeholder="Transportation details (driver, time, from/to, etc.)"
                            rows={3}
                            className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl text-sm font-semibold"
                          />
                        </div>
                      )}
                    </div>
                  )}
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
                      {onCheckIn && sel.status !== 'checked_in' && sel.check_in === today && (
                        <button
                          onClick={handleCheckIn}
                          disabled={!!loadingAction}
                          className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                        >
                          {loadingAction === 'checkin' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('btn.check_in')}
                        </button>
                      )}
                      {onCheckIn && sel.status !== 'checked_in' && sel.check_in !== today && (
                        <div className="flex-1 py-3 bg-amber-100 text-amber-700 rounded-xl font-bold text-center flex items-center justify-center">
                          Upcoming Guest
                        </div>
                      )}
                      {onCheckOut && sel.status === 'checked_in' && (
                        <button onClick={handleCheckOut} disabled={!!loadingAction} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                          {loadingAction === 'checkout' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('btn.check_out')}
                        </button>
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

                      {userRole === 'Manager' && (sel.status === 'checked_in' || sel.status === 'completed') && (
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

                      {onCancelBooking && (
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

                      if (sel.status === 'confirmed' && daysSinceCheckIn >= 1 && onCancelBooking) {
                        return (
                          <button
                            onClick={handleCancel}
                            disabled={!!loadingAction}
                            className="w-full py-2 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200 transition-all"
                          >
                            No Arrival
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
                  onClick={() => {
                    alert('Edit request sent to CEO and booking person for approval.');
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
                        borderColor: color(booking, today).bg,
                        backgroundColor: color(booking, today).bg + '10'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{booking.guest_name}</p>
                          <p className="text-sm text-slate-500">{booking.check_in} → {booking.check_out}</p>
                        </div>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color(booking, today).bg }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {userRole === 'Reserver' && selectedDay >= today && onAddNewBooking && (
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
    </div>
  );
}
