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
  onAddBooking?: () => void;
  onUpdateBooking?: (id: number, updates: Partial<Booking>) => Promise<void>;
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

function getBookingStatus(b: Booking, today: string): 'checked-in' | 'checked-out' | 'upcoming' | 'overdue-checkin' | 'cancelled' {
  if (b.status === 'cancelled') return 'cancelled';
  if (b.status === 'checked_in') return 'checked-in';
  if (b.status === 'completed') return 'checked-out';
  if (b.status === 'confirmed') {
    if (b.check_in < today) return 'overdue-checkin';
    return 'upcoming';
  }
  return 'upcoming';
}

function color(b: Booking, today: string) {
  const status = getBookingStatus(b, today);
  switch (status) {
    case 'checked-in':
      return { bg: '#10B981', text: '#064E3B' }; // Green
    case 'checked-out':
      return { bg: '#6B7280', text: '#1F2937' }; // Gray
    case 'upcoming':
      return { bg: '#3B82F6', text: '#1E3A5F' }; // Blue
    case 'overdue-checkin':
      return { bg: '#EF4444', text: '#7F1D1D' }; // Red
    case 'cancelled':
      return { bg: '#F87171', text: '#7F1D1D' }; // Light Red/Pink
    default:
      return PALETTE[b.yurt_id % PALETTE.length];
  }
}

export function OccupancyCalendar({ bookings, yurts, userRole, currentUserId, staff, onCancelBooking, onCheckIn, onCheckOut, onAddBooking, onUpdateBooking }: Props) {
  const { t } = useLanguage();
  const [cur, setCur]   = useState(new Date());
  const [sel, setSel]   = useState<Booking | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Booking>>({});

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
    setLoadingAction('checkin');
    try {
      await onCheckIn(sel.id);
      setSel(null);
    } catch (err) {
      alert('Failed to check in');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCheckOut = async () => {
    if (!sel || !onCheckOut) return;
    setLoadingAction('checkout');
    try {
      await onCheckOut(sel.id);
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
      syncToGoogleCalendar({ ...sel, ...editData } as Booking);
      setSel(null);
      setIsEditing(false);
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
          {onAddBooking && (
            <button
              onClick={onAddBooking}
              className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {t('btn.new_booking')}
            </button>
          )}
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
                    onClick={() => setSelectedDay(ds)}
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
                  return (
                    <button
                      key={ei}
                      onClick={() => {
                      setSel(ev.booking);
                      setEditData(ev.booking);
                      setIsEditing(false);
                    }}
                      title={ev.booking.guest_name}
                      style={{
                        gridColumn: `${ev.colStart + 1} / ${ev.colEnd + 2}`,
                        gridRow: `${ev.lane + 1}`,
                        backgroundColor: isCancelled ? '#fecaca' : c.bg,
                        color: isCancelled ? '#991b1b' : c.text,
                        borderRadius: isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '0',
                        marginLeft: isStart ? '2px' : '0',
                        marginRight: isEnd  ? '2px' : '0',
                      }}
                      className="text-[11px] font-semibold px-2 truncate text-left flex items-center h-[20px] hover:brightness-90 transition-all"
                    >
                      {isStart ? (isCancelled ? `${ev.booking.guest_name} (CANCELLED)` : ev.booking.guest_name) : ''}
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
                  <p className="font-bold text-indigo-900">{sel.num_people || sel.number_of_people}</p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">{t('form.meal_preference')}</label>
                  {isEditing && canEdit(sel) ? (
                    <textarea value={editData.meal_preference || ''} onChange={e => setEditData({...editData, meal_preference: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs" />
                  ) : <p className="text-sm font-medium text-indigo-800 italic">{sel.meal_preference || 'No preference'}</p>}
                </div>
              </div>

              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-3">
                <div>
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">{t('form.transportation')}</label>
                  {isEditing && canEdit(sel) ? (
                    <input type="text" value={editData.transportation || ''} onChange={e => setEditData({...editData, transportation: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs" />
                  ) : <p className="text-sm font-bold text-blue-900">{sel.transportation || 'Self transport'}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{t('form.guide_required')}</label>
                  <div className={`w-10 h-5 rounded-full p-1 transition-all ${sel.guide_required ? 'bg-blue-600' : 'bg-slate-300'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full transition-all ${sel.guide_required ? 'translate-x-5' : ''}`} />
                  </div>
                </div>
              </div>

              {/* Special Requests */}
              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">{t('form.special_requests')}</label>
                {isEditing && canEdit(sel) ? (
                  <textarea value={editData.special_requests || ''} onChange={e => setEditData({...editData, special_requests: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm" rows={3} />
                ) : <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm text-slate-600 italic">"{sel.special_requests || 'No special requests'}"</div>}
              </div>
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
                      {onCheckIn && sel.status !== 'checked_in' && (
                        <button onClick={handleCheckIn} disabled={!!loadingAction} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                          {loadingAction === 'checkin' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('btn.check_in')}
                        </button>
                      )}
                      {onCheckOut && sel.status === 'checked_in' && (
                        <button onClick={handleCheckOut} disabled={!!loadingAction} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                          {loadingAction === 'checkout' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t('btn.check_out')}
                        </button>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      <div className="flex-1 group relative">
                        <button 
                          onClick={() => setIsEditing(true)} 
                          disabled={!canEdit(sel)} 
                          className={`w-full py-3 rounded-xl font-bold transition-all ${canEdit(sel) ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                        >
                          Edit Details
                        </button>
                        {!canEdit(sel) && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                            You do not have permission to modify this booking
                          </div>
                        )}
                      </div>
                      
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
                  </div>
                )}
              </div>
            )}
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
          </div>
        </div>
      )}
    </div>
  );
}
