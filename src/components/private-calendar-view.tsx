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
}

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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => { onDayChange?.(selectedDay); }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gcEventsProp !== undefined) return;
    fetch('/api/calendar/events')
      .then(r => r.json())
      .then((data: CalEvent[] | { error: string }) => {
        if ('error' in data) setApiError(data.error);
        else setFetchedEvents(data);
      })
      .catch(e => setApiError(String(e)))
      .finally(() => setLoading(false));
  }, [gcEventsProp]);

  const dayStr = (day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const getWeekLanes = (week: (number | null)[]): EventBar[][] => {
    const days = week.map(d => d ? dayStr(d) : null);
    const validDays = days.filter(Boolean) as string[];
    if (!validDays.length) return [];
    const weekStart = validDays[0];
    const weekEnd = validDays[validDays.length - 1];

    const bars: EventBar[] = [];

    bookings
      .filter(b => b.status !== 'cancelled' && b.check_in <= weekEnd && (b.check_out > weekStart || b.check_in >= weekStart))
      .forEach(b => {
        let startCol = 0, endCol = 6;
        for (let i = 0; i <= 6; i++) { if (days[i] !== null && days[i]! >= b.check_in) { startCol = i; break; } }
        for (let i = 6; i >= 0; i--) { if (days[i] !== null && days[i]! < b.check_out) { endCol = i; break; } }
        if (endCol < startCol) endCol = startCol;
        bars.push({
          startCol, endCol, label: b.guest_name, type: 'bk', id: b.id,
          status: b.status, raw: b,
          startsThisWeek: b.check_in >= weekStart,
          endsThisWeek: endCol < 6 || b.check_out <= (days[6] ? days[6]! + '0' : weekEnd + '0'),
        });
      });

    gcEvents
      .filter(e => !bookings.some(b => b.google_event_id === e.id) && e.start <= weekEnd && e.end > weekStart)
      .forEach(e => {
        let startCol = 0, endCol = 6;
        for (let i = 0; i <= 6; i++) { if (days[i] !== null && days[i]! >= e.start) { startCol = i; break; } }
        for (let i = 6; i >= 0; i--) { if (days[i] !== null && days[i]! < e.end) { endCol = i; break; } }
        if (endCol < startCol) endCol = startCol;
        bars.push({
          startCol, endCol, label: e.summary, type: 'gc', id: e.id, raw: e,
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

  const barColor = (bar: EventBar) => {
    if (bar.status === 'checked_in') return 'bg-emerald-500 text-white';
    if (bar.status === 'confirmed') return 'bg-amber-400 text-white';
    if (bar.status === 'completed') return 'bg-blue-400 text-white';
    if (bar.type === 'gc') return 'bg-indigo-400 text-white';
    return 'bg-slate-300 text-slate-700';
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

        {/* Week rows */}
        <div className="space-y-1">
          {weeks.map((week, wi) => {
            const lanes = getWeekLanes(week);
            return (
              <div key={wi} className="mb-1">
                {/* Day number buttons */}
                <div className="grid grid-cols-7">
                  {week.map((day, col) => {
                    if (!day) return <div key={col} className="h-8" />;
                    const d = dayStr(day);
                    const isToday = d === todayStr;
                    const isSelected = d === selectedDay;
                    return (
                      <button key={col} onClick={() => handleDayClick(d)}
                        className="h-8 flex items-center justify-center transition-all">
                        <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-black transition-all ${
                          isSelected ? 'bg-indigo-600 text-white shadow-sm' :
                          isToday ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300' :
                          'text-slate-700 hover:bg-slate-100'
                        }`}>{day}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Event bar lanes */}
                {lanes.slice(0, 3).map((lane, li) => (
                  <div key={li} className="grid grid-cols-7 mt-px" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                    {lane.map((bar, bi) => (
                      <button
                        key={bi}
                        onClick={() => bar.type === 'bk' ? onSelectBooking?.(bar.raw as Booking) : onSelectCalendarEvent?.(bar.raw as CalEvent)}
                        style={{ gridColumnStart: bar.startCol + 1, gridColumnEnd: bar.endCol + 2 }}
                        className={`text-left text-[10px] font-bold px-2 py-[3px] truncate leading-tight transition-all hover:opacity-80 ${barColor(bar)} ${
                          bar.startsThisWeek ? 'rounded-l-full pl-2' : 'rounded-l-none pl-1'
                        } ${
                          bar.endsThisWeek ? 'rounded-r-full pr-2' : 'rounded-r-none'
                        }`}
                      >
                        {bar.startsThisWeek ? bar.label : ''}
                      </button>
                    ))}
                  </div>
                ))}
                {lanes.length > 3 && (
                  <p className="text-[9px] text-slate-400 font-bold px-1 mt-px">+{lanes.length - 3} more</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex gap-4 flex-wrap pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Checked In</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />Confirmed</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Checked Out</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-indigo-400 inline-block" />Google Calendar</span>
        </div>
      </div>
    </div>
  );
}
