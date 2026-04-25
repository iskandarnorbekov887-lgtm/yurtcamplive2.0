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

interface Props {
  bookings: Booking[];
  gcEvents?: CalEvent[];
  onSelectBooking?: (b: Booking) => void;
  onSelectCalendarEvent?: (ev: CalEvent) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export function PrivateCalendarView({ bookings, gcEvents: gcEventsProp, onSelectBooking, onSelectCalendarEvent }: Props) {
  const [fetchedEvents, setFetchedEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(gcEventsProp === undefined);
  const [apiError, setApiError] = useState('');
  const gcEvents = gcEventsProp ?? fetchedEvents;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

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

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayStr = (day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const eventsOnDay = (d: string) => ({
    gc: gcEvents.filter(e => e.start <= d && (e.end > d || e.start === d)),
    bk: bookings.filter(b => b.check_in <= d && b.check_out > d && b.status !== 'cancelled'),
  });

  const sel = selectedDay ? eventsOnDay(selectedDay) : null;

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
          <button onClick={() => { setCurrentDate(new Date()); setSelectedDay(null); }}
            className="px-3 py-1 text-xs font-bold bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all">Today</button>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="h-24 rounded-xl bg-slate-50/40" />;
            const d = dayStr(day);
            const { gc, bk } = eventsOnDay(d);
            const isToday = d === todayStr;
            const isSelected = d === selectedDay;
            const total = gc.length + bk.length;

            return (
              <button key={i} onClick={() => setSelectedDay(isSelected ? null : d)}
                className={`h-24 rounded-xl p-1.5 text-left transition-all border ${
                  isSelected ? 'border-indigo-400 bg-indigo-50 shadow-sm' :
                  isToday ? 'border-indigo-300 bg-indigo-50/60' :
                  total > 0 ? 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50' :
                  'border-transparent bg-slate-50/40 hover:bg-slate-100/60'
                }`}>
                <span className={`text-[11px] font-black mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'
                }`}>{day}</span>
                <div className="space-y-0.5 overflow-hidden">
                  {bk.slice(0, 2).map(b => (
                    <div key={b.id} className={`text-[9px] font-bold px-1 py-0.5 rounded truncate leading-tight ${
                      b.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>{b.guest_name}</div>
                  ))}
                  {gc.slice(0, bk.length >= 2 ? 0 : 1).map(e => (
                    <div key={e.id} className="text-[9px] font-bold px-1 py-0.5 rounded truncate leading-tight bg-indigo-100 text-indigo-700">{e.summary}</div>
                  ))}
                  {total > 3 && (
                    <div className="text-[9px] text-slate-400 font-bold px-1">+{total - 3} more</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {selectedDay && sel && (
          <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200 animate-in fade-in duration-200">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            {sel.bk.length === 0 && sel.gc.length === 0 ? (
              <p className="text-sm text-slate-400">No events or guests on this day</p>
            ) : (
              <div className="space-y-2">
                {sel.bk.map(b => (
                  <button key={b.id} onClick={() => onSelectBooking?.(b)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      b.status === 'checked_in'
                        ? 'bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-amber-50 border border-amber-200 hover:bg-amber-100'
                    } ${onSelectBooking ? 'cursor-pointer' : 'cursor-default'}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${b.status === 'checked_in' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{b.guest_name}</p>
                      <p className="text-xs text-slate-500 capitalize">{b.check_in} → {b.check_out} · {b.status.replace('_', ' ')}</p>
                    </div>
                    {onSelectBooking && <span className="text-xs text-slate-400">›</span>}
                  </button>
                ))}
                {sel.gc.map(e => (
                  <button key={e.id} onClick={() => onSelectCalendarEvent?.(e)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 transition-all ${
                      onSelectCalendarEvent ? 'hover:bg-indigo-100 cursor-pointer' : 'cursor-default'
                    }`}>
                    <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">{e.summary}</p>
                      <p className="text-xs text-slate-500">{e.start} → {e.end} · Google Calendar</p>
                    </div>
                    {onSelectCalendarEvent && <span className="text-xs text-slate-400">›</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Checked In</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />Confirmed</span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-indigo-400 inline-block" />Google Calendar</span>
        </div>
      </div>
    </div>
  );
}
