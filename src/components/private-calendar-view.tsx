'use client';

import { useState, useEffect } from 'react';
import type { Booking } from '@/lib/supabase';

interface CalendarEventItem {
  id: string;
  summary: string;
  start: string;
  end: string;
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
  raw?: Booking;
  rawEvent?: CalendarEventItem;
  category?: 'international' | 'local' | 'pool' | 'camper' | '';
}

interface Props {
  bookings: Booking[];
  calendarEvents?: CalendarEventItem[];
  onSelectBooking?: (b: Booking) => void;
  onSelectCalendarEvent?: (e: CalendarEventItem) => void;
  onDayChange?: (day: string) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function todayString() {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function PrivateCalendarView({ bookings, calendarEvents, onSelectBooking, onSelectCalendarEvent, onDayChange }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const todayStr = todayString();
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [moreDay, setMoreDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Removed useEffect onDayChange to prevent automatic popup on mount

  const getFullDateStr = (y: number, m: number, d: number) => {
    const dt = new Date(y, m, d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  
  const cells: { day: number; dateStr: string; currentMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({ day: d, dateStr: getFullDateStr(year, month - 1, d), currentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, dateStr: getFullDateStr(year, month, i), currentMonth: true });
  }
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
        bars.push({
          startCol, endCol, label: b.guest_name, type: 'bk', id: b.id,
          status: b.status, raw: b, category,
          startsThisWeek: b.check_in >= weekStart,
          endsThisWeek: b.check_out <= weekEnd,
        });
      });

    // Google Calendar events (unlinked)
    (calendarEvents || [])
      .filter(ev => ev.start <= weekEnd && ev.end >= weekStart)
      .forEach(ev => {
        let startCol = 0, endCol = -1;
        for (let i = 0; i <= 6; i++) { if (days[i] !== null && days[i]! >= ev.start) { startCol = i; break; } }
        for (let i = 6; i >= 0; i--) { if (days[i] !== null && days[i]! <= ev.end) { endCol = i; break; } }
        if (endCol < startCol) endCol = startCol;
        bars.push({
          startCol, endCol, label: ev.summary || '(No title)', type: 'gc', id: ev.id,
          status: 'gc_event', rawEvent: ev, category: '',
          startsThisWeek: ev.start >= weekStart,
          endsThisWeek: ev.end <= weekEnd,
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

  const barColor = (bar: EventBar) => {
    if (bar.type === 'gc') return 'bg-amber-400 text-white';
    if (bar.category === 'pool') return 'bg-teal-500 text-white';
    if (bar.category === 'local') return 'bg-violet-500 text-white';
    if (bar.status === 'cancelled') return 'bg-red-500 text-white';
    if (bar.status === 'checked_in') return 'bg-emerald-500 text-white';
    if (bar.status === 'completed') return 'bg-blue-500 text-white';
    return 'bg-amber-400 text-white';
  };

  const barIcon = (bar: EventBar) => {
    if (bar.type === 'gc') return '📅 ';
    if (bar.category === 'local') return '🏠 ';
    if (bar.category === 'pool') return '🏊 ';
    let prefix = '';
    if (bar.status === 'checked_in') prefix += '✓ ';
    if (bar.status === 'completed') prefix += '✈ ';
    if (bar.status === 'cancelled') prefix += '✕ ';
    return prefix;
  };

  return (
    <div className="mt-6 bg-[#1C232E] rounded-2xl border border-[#5C4A2E]/30 shadow-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[#5C4A2E]/30 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-[#EDE6D6] font-heading">Calendar View</h2>
          <p className="text-xs text-[#9C9384]">Private Booking Calendar</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2A1518] text-[#9C9384] font-bold text-lg transition-all">‹</button>
          <span className="text-sm font-black text-[#EDE6D6] min-w-[130px] text-center">{MONTHS[month]} {year}</span>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2A1518] text-[#9C9384] font-bold text-lg transition-all">›</button>
          <button onClick={() => { setCurrentDate(new Date()); setSelectedDay(todayStr); onDayChange?.(todayStr); }}
            className="px-3 py-1 text-xs font-bold bg-[#0B6E4F]/20 text-[#0B6E4F] rounded-lg hover:bg-[#0B6E4F]/30 transition-all">Today</button>
        </div>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest text-[#9C9384] py-1">{d}</div>
          ))}
        </div>

        <div className="border-l border-t border-[#5C4A2E]/30">
          {weeks.map((week, wi) => {
            const lanes = getWeekLanes(week);
            const VISIBLE = 5;
            const LANE_HEIGHT = 18;
            const LANE_GAP = 2;
            const DAY_NUM_HEIGHT = 26;
            const cellHeight = DAY_NUM_HEIGHT + Math.min(lanes.length, VISIBLE) * (LANE_HEIGHT + LANE_GAP) + (lanes.length > VISIBLE ? 18 : 4);
            return (
              <div key={wi} className="relative grid grid-cols-7" style={{ minHeight: `${Math.max(cellHeight, 110)}px` }}>
                {week.map((cell, col) => {
                  const d = cell.dateStr;
                  const isToday = d === todayStr;
                  const isSelected = d === selectedDay;
                  const totalInCol = lanes.filter(lane => lane.some(b => b.startCol <= col && b.endCol >= col)).length;
                  const hidden = Math.max(0, totalInCol - VISIBLE);
                  return (
                    <div key={col} onClick={() => { setSelectedDay(d); onDayChange?.(d); }}
                      className={`border-r border-b border-[#5C4A2E]/30 px-1 pt-1 cursor-pointer transition-colors relative ${
                        isSelected ? 'bg-[#0B6E4F]/20' : 'hover:bg-[#2A1518]'
                      } ${!cell.currentMonth ? 'bg-[#1C232E]/40 opacity-50' : ''}`}>
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black transition-all ${
                        isToday ? 'bg-[#0B6E4F] text-[#C9A227]' : isSelected ? 'text-[#0B6E4F]' : 'text-[#EDE6D6]'
                      }`}>{cell.day}</span>
                      {hidden > 0 && (
                        <button onClick={e => { e.stopPropagation(); setMoreDay(d); }}
                          style={{ position: 'absolute', bottom: 2, left: 4, right: 4 }}
                          className="text-[10px] font-bold text-[#9C9384] hover:text-[#0B6E4F] hover:bg-[#0B6E4F]/10 rounded px-1 py-0.5 text-left transition-colors z-10">
                          +{hidden} more
                        </button>
                      )}
                    </div>
                  );
                })}

                {lanes.slice(0, VISIBLE).map((lane, li) => (
                  <div key={li}
                    className="absolute left-0 right-0 grid grid-cols-7 px-px pointer-events-none"
                    style={{ top: `${DAY_NUM_HEIGHT + li * (LANE_HEIGHT + LANE_GAP)}px`, height: `${LANE_HEIGHT}px` }}>
                    {lane.map((bar, bi) => (
                      <button
                        key={bi}
                        onClick={e => { e.stopPropagation(); if (bar.type === 'gc' && bar.rawEvent) { onSelectCalendarEvent?.(bar.rawEvent); } else if (bar.raw) { onSelectBooking?.(bar.raw); } }}
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

        {moreDay && (() => {
          const dayBookings = bookings.filter(b => b.status !== 'cancelled' && b.check_in <= moreDay && b.check_out >= moreDay);
          return (
            <div onClick={() => setMoreDay(null)} className="fixed inset-0 z-50 bg-[#0F1419]/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div onClick={e => e.stopPropagation()} className="bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 w-full max-w-md max-h-[80vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-[#5C4A2E]/30 sticky top-0 bg-[#1C232E] flex items-center justify-between rounded-t-2xl">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F]">All Bookings</p>
                    <h3 className="text-sm font-black text-[#EDE6D6]">
                      {new Date(moreDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                  </div>
                  <button onClick={() => setMoreDay(null)} className="w-8 h-8 hover:bg-[#2A1518] rounded-xl text-[#9C9384] font-bold text-xl">×</button>
                </div>
                <div className="p-3 space-y-1.5">
                  {dayBookings.length === 0 && (
                    <p className="text-sm text-[#9C9384] text-center py-6">No bookings</p>
                  )}
                  {dayBookings.map(b => (
                    <button key={b.id} onClick={() => { onSelectBooking?.(b); setMoreDay(null); }}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all hover:opacity-80 ${
                        b.status === 'checked_in' ? 'bg-[#0B6E4F]/20 border-[#0B6E4F]/40' :
                        b.status === 'completed' ? 'bg-[#5C4A2E]/20 border-[#5C4A2E]/40' :
                        'bg-[#B8860B]/20 border-[#B8860B]/40'
                      }`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        b.status === 'checked_in' ? 'bg-[#0B6E4F]' :
                        b.status === 'completed' ? 'bg-[#5C4A2E]' :
                        'bg-[#B8860B]'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#EDE6D6] truncate">{b.guest_name}</p>
                        <p className="text-xs text-[#9C9384] capitalize">{b.check_in} → {b.check_out} · {b.status.replace('_', ' ')}</p>
                      </div>
                      <span className="text-xs text-[#9C9384]">›</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        <div className="mt-3 flex gap-4 flex-wrap pt-2 border-t border-[#5C4A2E]/30">
          <span className="flex items-center gap-1.5 text-[10px] text-[#9C9384]"><span className="w-2 h-2 rounded-sm bg-[#B8860B] inline-block" />Confirmed</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#9C9384]"><span className="w-2 h-2 rounded-sm bg-[#0B6E4F] inline-block" />✓ Checked In</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#9C9384]"><span className="w-2 h-2 rounded-sm bg-[#5C4A2E] inline-block" />✈ Checked Out</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#9C9384]"><span className="w-2 h-2 rounded-sm bg-[#722F37] inline-block" />✕ Cancelled</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#9C9384]"><span className="w-2 h-2 rounded-sm bg-[#8B5CF6] inline-block" />🏠 Local</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#9C9384]"><span className="w-2 h-2 rounded-sm bg-[#14B8A6] inline-block" />Pool</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#9C9384]"><span className="w-2 h-2 rounded-sm bg-[#5C4A2E] inline-block" />📅 Calendar</span>
        </div>
      </div>
    </div>
  );
}
