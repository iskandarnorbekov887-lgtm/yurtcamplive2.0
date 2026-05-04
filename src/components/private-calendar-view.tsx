'use client';

import { useState, useEffect } from 'react';
import type { Booking } from '@/lib/supabase';

interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  colorId?: string | null;
  status?: string | null;
  description?: string | null;
  location?: string | null;
}

interface EventBar {
  startCol: number;
  endCol: number;
  label: string;
  type: 'bk' | 'gc';
  id: string | number;
  status?: string;
  startsThisWeek: boolean;
  endsThisWeek: boolean;
  raw: Booking | CalEvent;
  gcCancelled?: boolean;
  category?: 'international' | 'local' | 'pool' | 'camper' | '';
}

const isGcCancelled = (ev: CalEvent | null | undefined) =>
  !!ev && (ev.status === 'cancelled' || ev.colorId === '11' || ev.colorId === '4' ||
  (ev.summary?.toLowerCase() ?? '').includes('cancel'));

interface Props {
  bookings: Booking[];
  gcEvents?: CalEvent[];
  onSelectBooking?: (b: Booking) => void;
  onSelectCalendarEvent?: (ev: CalEvent) => void;
  onDayChange?: (day: string) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function todayString() {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function PrivateCalendarView({ bookings, gcEvents: gcEventsProp, onSelectBooking, onSelectCalendarEvent, onDayChange }: Props) {
  const [fetchedEvents, setFetchedEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(gcEventsProp === undefined);
  const [apiError, setApiError] = useState('');
  const gcEvents = gcEventsProp ?? fetchedEvents;
  const [currentDate, setCurrentDate] = useState(new Date());
  const todayStr = todayString();
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [moreDay, setMoreDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => { onDayChange?.(selectedDay); }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gcEventsProp !== undefined) return;
    fetch('/api/calendar/events', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: CalEvent[] | { error: string }) => {
        if ('error' in data) setApiError(data.error);
        else setFetchedEvents(data);
      })
      .catch(e => setApiError(String(e)))
      .finally(() => setLoading(false));
  }, [gcEventsProp]);

  const getFullDateStr = (y: number, m: number, d: number) => {
    const dt = new Date(y, m, d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  
  const cells: { day: number; dateStr: string; currentMonth: boolean }[] = [];
  
  // Prev month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({ day: d, dateStr: getFullDateStr(year, month - 1, d), currentMonth: false });
  }
  
  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, dateStr: getFullDateStr(year, month, i), currentMonth: true });
  }
  
  // Next month padding
  let nextD = 1;
  while (cells.length < 42) {
    cells.push({ day: nextD, dateStr: getFullDateStr(year, month + 1, nextD), currentMonth: false });
    nextD++;
  }

  const weeks: { day: number; dateStr: string; currentMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const getWeekLanes = (week: { day: number; dateStr: string; currentMonth: boolean }[]): EventBar[][] => {
    const days = week.map(c => c.dateStr);
    const validDays = days.filter(Boolean) as string[];
    if (!validDays.length) return [];
    const weekStart = validDays[0];
    const weekEnd = validDays[validDays.length - 1];

    const bars: EventBar[] = [];

    bookings
      .filter(b => b.status !== 'no_arrival' && b.check_in <= weekEnd && b.check_out >= weekStart)
      .forEach(b => {
        let startCol = 0, endCol = -1;
        for (let i = 0; i <= 6; i++) { if (days[i] !== null && days[i]! >= b.check_in) { startCol = i; break; } }
        for (let i = 6; i >= 0; i--) { if (days[i] !== null && days[i]! <= b.check_out) { endCol = i; break; } }
        if (endCol < startCol) endCol = startCol;
        let category: 'international' | 'local' | 'pool' | 'camper' | '' = '';
        try {
          const meta = typeof b.special_requests === 'string' ? JSON.parse(b.special_requests || '{}') : (b.special_requests || {});
          category = meta.guest_category || '';
        } catch {}
        if (!category && (b.source === 'System' || b.source === 'manual')) category = 'international';
        bars.push({
          startCol, endCol, label: b.guest_name, type: 'bk', id: b.id,
          status: b.status, raw: b, category,
          startsThisWeek: b.check_in >= weekStart,
          endsThisWeek: b.check_out <= weekEnd,
        });
      });

    gcEvents
      .filter(e => !bookings.some(b => b.google_event_id === e.id) && e.start <= weekEnd && e.end > weekStart)
      .forEach(e => {
        let startCol = 0, endCol = -1;
        for (let i = 0; i <= 6; i++) { if (days[i] !== null && days[i]! >= e.start) { startCol = i; break; } }
        for (let i = 6; i >= 0; i--) { if (days[i] !== null && days[i]! < e.end) { endCol = i; break; } }
        const cancelled = isGcCancelled(e);
        if (endCol < startCol) endCol = startCol;
        bars.push({
          startCol, endCol, label: e.summary, type: 'gc', id: e.id,
          raw: e, gcCancelled: cancelled, status: cancelled ? 'cancelled' : 'confirmed',
          startsThisWeek: e.start >= weekStart,
          endsThisWeek: endCol < 6,
        });
      });

    bars.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));

    const lanes: EventBar[][] = [];
    for (const bar of bars) {
      let placed = false;
      for (const lane of lanes) {
        if (!lane.some(e => e.startCol <= bar.endCol && e.endCol >= bar.startCol)) {
          lane.push(bar); placed = true; break;
        }
      }
      if (!placed) lanes.push([bar]);
    }
    return lanes;
  };

  const handleDayClick = (d: string) => setSelectedDay(d);

  // Hard color rule: POS local/pool have fixed colors (never change with status).
  // International/office bookings change color by status. GC events stay yellow.
  const barColor = (bar: EventBar) => {
    if (bar.type === 'gc') {
      if (bar.gcCancelled) return 'bg-red-400 text-white';
      return 'bg-amber-300 text-slate-900';
    }
    // POS categories: fixed color regardless of status
    if (bar.category === 'pool') return 'bg-teal-500 text-white';
    if (bar.category === 'local') return 'bg-violet-500 text-white';
    // International / office / default: status-based colors
    if (bar.status === 'cancelled') return 'bg-red-500 text-white';
    if (bar.status === 'no_arrival') return 'bg-gray-400 text-white';
    if (bar.status === 'checked_in') return 'bg-emerald-500 text-white';
    if (bar.status === 'completed') return 'bg-blue-500 text-white';
    if (bar.status === 'confirmed') return 'bg-amber-400 text-white';
    return 'bg-amber-400 text-white';
  };

  const barIcon = (bar: EventBar) => {
    // GC events: no icons at all
    if (bar.type === 'gc') return '';
    // POS local/pool: just emoji, no status icons
    if (bar.category === 'local') return '🏠 ';
    if (bar.category === 'pool') return '🏊 ';
    // Google Calendar synced bookings (empty category): show 🌐
    if (bar.category === '') return '🌐 ';
    // Manager-created international bookings: � + status
    let prefix = '� ';
    if (bar.status === 'checked_in') prefix += '✓ ';
    if (bar.status === 'completed') prefix += '✈ ';
    if (bar.status === 'cancelled') prefix += '✕ ';
    if (bar.status === 'no_arrival') prefix += '⊘ ';

    const b = bar.raw as Booking;
    try {
      const meta = typeof b.special_requests === 'string' ? JSON.parse(b.special_requests || '{}') : (b.special_requests || {});
      const orders = meta.kitchen_orders || [];
      if (orders.some((o: any) => o.type === 'lunch' && o.status === 'confirmed')) prefix += '🍱 ';
      if (orders.some((o: any) => o.type === 'dinner' && o.status === 'confirmed')) prefix += '🌙 ';
    } catch {}
    return prefix;
  };

  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Calendar View</h2>
          <p className="text-xs text-slate-500">Private · Google Calendar + Bookings</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && !gcEventsProp && <span className="text-xs text-slate-400 animate-pulse">Syncing…</span>}
          {!loading && !apiError && !gcEventsProp && <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">{gcEvents.length} Google events</span>}
          {apiError && !gcEventsProp && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-200 max-w-xs truncate" title={apiError}>⚠ {apiError}</span>}
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold text-lg transition-all">‹</button>
          <span className="text-sm font-black text-slate-800 min-w-[130px] text-center">{MONTHS[month]} {year}</span>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold text-lg transition-all">›</button>
          <button onClick={() => { setCurrentDate(new Date()); setSelectedDay(todayStr); }}
            className="px-3 py-1 text-xs font-bold bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all">Today</button>
        </div>
      </div>

      <div className="p-3">
        {/* Day name headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Week rows — Google Calendar style bordered cells */}
        <div className="border-l border-t border-slate-200">
          {weeks.map((week, wi) => {
            const lanes = getWeekLanes(week);
            const VISIBLE = 5;
            const LANE_HEIGHT = 18;
            const LANE_GAP = 2;
            const DAY_NUM_HEIGHT = 26;
            const cellHeight = DAY_NUM_HEIGHT + Math.min(lanes.length, VISIBLE) * (LANE_HEIGHT + LANE_GAP) + (lanes.length > VISIBLE ? 18 : 4);
            return (
              <div key={wi} className="relative grid grid-cols-7" style={{ minHeight: `${Math.max(cellHeight, 110)}px` }}>
                {/* Day cells (background grid with borders) */}
                {week.map((cell, col) => {
                  const d = cell.dateStr;
                  const isToday = d === todayStr;
                  const isSelected = d === selectedDay;
                  const totalInCol = lanes.filter(lane => lane.some(b => b.startCol <= col && b.endCol >= col)).length;
                  const hidden = Math.max(0, totalInCol - VISIBLE);
                  return (
                    <div key={col} onClick={() => handleDayClick(d)}
                      className={`border-r border-b border-slate-200 px-1 pt-1 cursor-pointer transition-colors relative ${
                        isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/60'
                      } ${!cell.currentMonth ? 'bg-slate-50/40 opacity-50' : ''}`}>
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black transition-all ${
                        isToday ? 'bg-indigo-600 text-white' : isSelected ? 'text-indigo-700' : 'text-slate-700'
                      }`}>{cell.day}</span>
                      {hidden > 0 && (
                        <button onClick={e => { e.stopPropagation(); setMoreDay(d); }}
                          style={{ position: 'absolute', bottom: 2, left: 4, right: 4 }}
                          className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-100 rounded px-1 py-0.5 text-left transition-colors z-10">
                          +{hidden} more
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Event bars overlaid on the cells */}
                {lanes.slice(0, VISIBLE).map((lane, li) => (
                  <div key={li}
                    className="absolute left-0 right-0 grid grid-cols-7 px-px pointer-events-none"
                    style={{ top: `${DAY_NUM_HEIGHT + li * (LANE_HEIGHT + LANE_GAP)}px`, height: `${LANE_HEIGHT}px` }}>
                    {lane.map((bar, bi) => (
                      <button
                        key={bi}
                        onClick={e => { e.stopPropagation(); bar.type === 'bk' ? onSelectBooking?.(bar.raw as Booking) : onSelectCalendarEvent?.(bar.raw as CalEvent); }}
                        style={{ gridColumnStart: bar.startCol + 1, gridColumnEnd: bar.endCol + 2 }}
                        className={`text-left text-[10px] font-bold px-2 truncate leading-[18px] transition-all hover:opacity-80 pointer-events-auto mx-px ${barColor(bar)} ${
                          bar.startsThisWeek ? 'rounded-l-md' : 'rounded-l-none'
                        } ${
                          bar.endsThisWeek ? 'rounded-r-md' : 'rounded-r-none'
                        }`}>
                        {bar.startsThisWeek ? `${barIcon(bar)}${bar.label}` : ''}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* "+N more" day modal */}
        {moreDay && (() => {
          const dayBookings = bookings.filter(b => b.status !== 'cancelled' && b.check_in <= moreDay && b.check_out >= moreDay);
          const dayEvents = gcEvents.filter(e => !bookings.some(b => b.google_event_id === e.id) && e.start <= moreDay && e.end > moreDay);
          return (
            <div onClick={() => setMoreDay(null)} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
              <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-slate-100 sticky top-0 bg-white flex items-center justify-between rounded-t-2xl">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">All Events</p>
                    <h3 className="text-sm font-black text-slate-900">
                      {new Date(moreDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                  </div>
                  <button onClick={() => setMoreDay(null)} className="w-8 h-8 hover:bg-slate-100 rounded-xl text-slate-500 font-bold text-xl">×</button>
                </div>
                <div className="p-3 space-y-1.5">
                  {dayBookings.length === 0 && dayEvents.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6">No events</p>
                  )}
                  {dayBookings.map(b => (
                    <button key={b.id} onClick={() => { onSelectBooking?.(b); setMoreDay(null); }}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all hover:opacity-80 ${
                        b.status === 'checked_in' ? 'bg-emerald-50 border-emerald-200' :
                        b.status === 'completed' ? 'bg-blue-50 border-blue-200' :
                        'bg-amber-50 border-amber-200'
                      }`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        b.status === 'checked_in' ? 'bg-emerald-500' :
                        b.status === 'completed' ? 'bg-blue-500' :
                        'bg-amber-500'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 truncate">{b.guest_name}</p>
                        <p className="text-xs text-slate-500 capitalize">{b.check_in} → {b.check_out} · {b.status.replace('_', ' ')}</p>
                      </div>
                      <span className="text-xs text-slate-400">›</span>
                    </button>
                  ))}
                  {dayEvents.map(e => {
                    const cancelled = isGcCancelled(e);
                    return (
                      <button key={e.id} onClick={() => { onSelectCalendarEvent?.(e); setMoreDay(null); }}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all hover:opacity-80 ${
                          cancelled ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-200'
                        }`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cancelled ? 'bg-red-500' : 'bg-amber-400'}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold text-slate-900 truncate ${cancelled ? 'line-through opacity-70' : ''}`}>{e.summary}</p>
                          <p className="text-xs text-slate-500">{e.start} → {e.end} · Google Calendar</p>
                        </div>
                        <span className="text-xs text-slate-400">›</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Legend */}
        <div className="mt-3 flex gap-4 flex-wrap pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-amber-300 inline-block" />🌐 Google</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />Confirmed</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />✓ Checked In</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />✈ Checked Out</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />✕ Cancelled</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-violet-500 inline-block" />🏠 Local</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-teal-500 inline-block" />🏊 Pool</span>
        </div>
      </div>
    </div>
  );
}
