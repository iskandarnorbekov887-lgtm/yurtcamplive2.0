'use client';

import { useState, useEffect } from 'react';
import { supabase, type Booking, type Yurt, type UserRole, type Drink } from '@/lib/supabase';
import { PrivateCalendarView } from '@/components/private-calendar-view';

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
  yurts: Yurt[];
  userRole?: UserRole;
  currentUserId?: string;
  onCheckIn?: (id: number) => Promise<void> | void;
  onCheckOut?: (id: number) => Promise<void> | void;
  onUpdateBooking?: (id: number, updates: Partial<Booking>) => Promise<void> | void;
  onCancelBooking?: (id: number) => Promise<void> | void;
  onAddNewBooking?: (date: string) => void;
  onRefresh?: () => void;
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function GoogleGuestAgenda({
  bookings, yurts, userRole, currentUserId, onCheckIn, onCheckOut, onUpdateBooking, onCancelBooking, onAddNewBooking, onRefresh,
}: Props) {
  const [gcEvents, setGcEvents] = useState<CalEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);

  const [loadingAction, setLoadingAction] = useState('');
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [selectedDrinks, setSelectedDrinks] = useState<Record<number, number>>({});
  const [showDrinks, setShowDrinks] = useState(false);
  const [collectedAmount, setCollectedAmount] = useState('');
  const [collectedCurrency, setCollectedCurrency] = useState<'UZS' | 'USD' | 'EUR'>('USD');
  const [extraServices, setExtraServices] = useState<Array<{ name: string; price: string; currency: string }>>([]);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraPrice, setNewExtraPrice] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [syncWarnings, setSyncWarnings] = useState<Record<number, 'deleted' | 'dates_changed'>>({});
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(localDateStr(new Date()));
  const [editingDates, setEditingDates] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');

  const today = localDateStr(new Date());

  useEffect(() => {
    fetch('/api/calendar/events')
      .then(r => r.json())
      .then((data: CalEvent[] | { error: string }) => {
        if ('error' in data) { setEventsError(data.error); setGcEvents([]); }
        else {
          const events = data as CalEvent[];
          setGcEvents(events);
          const cutoff = localDateStr(new Date(Date.now() - 7 * 86400000));
          const warnings: Record<number, 'deleted' | 'dates_changed'> = {};
          const toSilentlyDelete: number[] = [];
          bookings.filter(b => b.google_event_id && b.check_in >= cutoff).forEach(b => {
            const ev = events.find(e => e.id === b.google_event_id);
            if (!ev) {
              // GC event deleted: if booking never reached check-in, drop it silently
              if (b.status === 'confirmed') toSilentlyDelete.push(b.id);
              else warnings[b.id] = 'deleted';
            } else if (ev.start !== b.check_in || ev.end !== b.check_out) {
              warnings[b.id] = 'dates_changed';
            }
          });
          setSyncWarnings(warnings);
          if (toSilentlyDelete.length > 0) {
            (async () => {
              for (const id of toSilentlyDelete) {
                try { await supabase.from('bookings').delete().eq('id', id); }
                catch (err) { console.error('Silent delete failed for booking', id, err); }
              }
              onRefresh?.();
            })();
          }
        }
      })
      .catch(e => setEventsError(String(e)))
      .finally(() => setLoadingEvents(false));

    supabase.from('drinks').select('*').eq('available', true)
      .then(({ data }: { data: Drink[] | null }) => setDrinks(data || []));
  }, []);

  // Auto-sync notes: when a linked Google Calendar event's description changes,
  // update the booking's notes field to match.
  const [didSyncNotes, setDidSyncNotes] = useState(false);
  useEffect(() => {
    if (didSyncNotes || gcEvents.length === 0 || bookings.length === 0) return;
    const cleanDesc = (d: string | null | undefined) =>
      d && !d.includes('tasks.google.com') ? d.trim() : null;
    const toSync = bookings.filter(b => {
      if (!b.google_event_id) return false;
      const ev = gcEvents.find(e => e.id === b.google_event_id);
      if (!ev) return false;
      const live = cleanDesc(ev.description);
      const saved = (b.notes || '').trim() || null;
      return live !== saved;
    });
    if (toSync.length === 0) { setDidSyncNotes(true); return; }
    (async () => {
      for (const b of toSync) {
        const ev = gcEvents.find(e => e.id === b.google_event_id)!;
        const live = cleanDesc(ev.description);
        try { await supabase.from('bookings').update({ notes: live }).eq('id', b.id); }
        catch (err) { console.error('Notes sync failed for booking', b.id, err); }
      }
      setDidSyncNotes(true);
      onRefresh?.();
    })();
  }, [gcEvents, bookings, didSyncNotes, onRefresh]);

  useEffect(() => {
    if (selectedItem?.booking) {
      const updated = bookings.find(b => b.id === selectedItem.booking!.id);
      if (updated) setSelectedItem(prev => prev ? { ...prev, booking: updated } : prev);
    }
  }, [bookings]);

  const getYurtName = (b: Booking) =>
    yurts.find(y => y.id === b.yurt_id)?.name || (b.yurt_id ? `Yurt #${b.yurt_id}` : '—');

  const isGcCancelled = (ev: CalEvent) =>
    ev.status === 'cancelled' || ev.colorId === '11' || ev.colorId === '4' ||
    (ev.summary?.toLowerCase() ?? '').includes('cancel');

  const calendarOnlyItems: ListItem[] = gcEvents
    .filter(ev => !bookings.some(b => b.google_event_id === ev.id))
    .map(ev => ({ key: `ev-${ev.id}`, name: ev.summary, start: ev.start, end: ev.end, source: 'calendar' as const, booking: null, event: ev }));

  // If a linked Google Calendar event is marked cancelled (red / colorId 11 / colorId 4 / 'cancel' in title),
  // surface the booking as cancelled in the UI. We do NOT write to the DB — so if the office reverts the
  // red color in Calendar, the original status (confirmed) returns automatically and Check In re-appears.
  // Only override 'confirmed' (not yet checked in) — never override checked_in / completed / no_arrival.
  const bookingItems: ListItem[] = bookings.map(b => {
    const linkedEv = gcEvents.find(e => e.id === b.google_event_id) || null;
    const effB: Booking = b.status === 'confirmed' && linkedEv && isGcCancelled(linkedEv)
      ? { ...b, status: 'cancelled' }
      : b;
    return {
      key: `db-${b.id}`, name: effB.guest_name, start: effB.check_in, end: effB.check_out,
      source: 'db' as const, booking: effB, event: linkedEv,
    };
  });

  const D = selectedCalendarDay;

  // Left panel filtered by selected calendar day
  const arrivingItems = [
    ...bookingItems.filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in === D),
    ...calendarOnlyItems.filter(i => i.event!.start === D && !isGcCancelled(i.event!)),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const stayingItems = bookingItems
    .filter(i => i.booking!.status === 'confirmed' && i.booking!.check_in < D && i.booking!.check_out > D)
    .sort((a, b) => a.start.localeCompare(b.start));

  const checkedInItems = bookingItems
    .filter(i => i.booking!.status === 'checked_in' && i.booking!.check_in <= D && i.booking!.check_out > D)
    .sort((a, b) => a.start.localeCompare(b.start));

  const checkingOutItems = bookingItems
    .filter(i => i.booking!.status === 'checked_in' && i.booking!.check_out === D)
    .sort((a, b) => a.start.localeCompare(b.start));

  const checkedOutItems = bookingItems
    .filter(i => i.booking!.status === 'completed' && i.booking!.check_out === D)
    .sort((a, b) => b.start.localeCompare(a.start));

  const cancelledItems = [
    ...bookingItems.filter(i => i.booking!.status === 'cancelled' && i.booking!.check_in <= D && i.booking!.check_out > D),
    ...calendarOnlyItems.filter(i => isGcCancelled(i.event!) && i.event!.start <= D && i.event!.end > D),
  ].sort((a, b) => b.start.localeCompare(a.start));

  const gcEventsOnDay = calendarOnlyItems.filter(i => i.event!.start <= D && i.event!.end > D && !isGcCancelled(i.event!) && i.event!.start !== D);

  const renderCard = (item: ListItem, isCancelled: boolean) => {
    const isSelected = selectedItem?.key === item.key;
    const booking = item.booking;
    const showApprove = !!booking && booking.status === 'checked_in' && syncWarnings[booking.id] === 'dates_changed' && (userRole === 'Manager' || userRole === 'CEO');
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
                {item.name}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{item.start} → {item.end}</p>
              {booking ? <p className="text-xs text-slate-500">{getYurtName(booking)}</p> : <p className="text-xs text-slate-400">calendar only</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {isCancelled
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">cancelled</span>
                : booking && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusColor(booking.status)}`}>{booking.status.replace('_', ' ')}</span>
              }
              {booking && syncWarnings[booking.id] === 'deleted' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">⚠ removed</span>
              )}
              {booking && syncWarnings[booking.id] === 'dates_changed' && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚠ dates ≠</span>
              )}
            </div>
          </div>
        </button>

        {showApprove && booking && (
          <button
            onClick={e => { e.stopPropagation(); void handleApproveDates(booking); }}
            disabled={loadingAction === `syncdates-${booking.id}`}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          >
            {loadingAction === `syncdates-${booking.id}` ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '↻'}
            Approve dates
          </button>
        )}
      </div>
    );
  };

  const statusColor = (s?: string) => ({
    checked_in: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    confirmed: 'bg-amber-100 text-amber-700 border border-amber-200',
    completed: 'bg-blue-100 text-blue-700 border border-blue-200',
    cancelled: 'bg-red-100 text-red-700 border border-red-200',
    pending: 'bg-slate-100 text-slate-600 border border-slate-200',
    no_arrival: 'bg-gray-200 text-gray-600 border border-gray-300',
  }[s ?? ''] ?? 'bg-slate-100 text-slate-500');

  const statusIcon = (s: string | undefined) => {
    if (s === 'checked_in') return '✓';
    if (s === 'completed') return '✈';
    if (s === 'cancelled') return '✕';
    if (s === 'no_arrival') return '⊘';
    return '';
  };
  const statusIconColor = (s: string | undefined) => {
    if (s === 'completed') return 'text-amber-500';
    return '';
  };

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 4000); };

  const handleApproveDates = async (booking: Booking) => {
    if (!onUpdateBooking) return;
    const linkedEv = gcEvents.find(e => e.id === booking.google_event_id);
    if (!linkedEv) { flash('⚠ Linked calendar event not found.'); return; }
    setLoadingAction(`syncdates-${booking.id}`);
    try {
      await onUpdateBooking(booking.id, { check_in: linkedEv.start, check_out: linkedEv.end } as Partial<Booking>);
      setSyncWarnings(w => {
        const next = { ...w };
        delete next[booking.id];
        return next;
      });
      flash('✓ Dates approved from calendar.');
      onRefresh?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      flash(`⚠ ${msg.slice(0, 100)}`);
    } finally {
      setLoadingAction('');
    }
  };

  const handleCreateFromEvent = async (doCheckIn = false) => {
    if (!selectedItem?.event) { flash('⚠ No event selected.'); return; }
    if (!currentUserId) { flash('⚠ Not logged in — please refresh and try again.'); return; }
    const ev = selectedItem.event;
    setLoadingAction('creating');
    try {
      // Guard: check if a booking for this event already exists
      const existing = bookings.find(b => b.google_event_id === ev.id) ?? null;
      if (existing) {
        flash('⚠ Booking for this event already exists — opening it.');
        handleSelect({ key: `db-${existing.id}`, name: existing.guest_name, start: existing.check_in, end: existing.check_out, source: 'db', booking: existing as Booking, event: ev });
        return;
      }

      const payload = {
        guest_name: ev.summary,
        check_in: ev.start,
        check_out: ev.end || ev.start,
        status: doCheckIn ? 'checked_in' : 'confirmed',
        source: 'Manual',
        google_event_id: ev.id,
        total_price: 0,
        number_of_people: 1,
        payment_status: 'Unpaid',
        approved_by_manager: true,
        created_by_id: currentUserId,
        notes: (ev.description && !ev.description.includes('tasks.google.com')) ? ev.description : null,
      };
      const insertResp: { data: unknown; error: unknown } = await supabase.from('bookings').insert(payload);
      if (insertResp?.error) throw insertResp.error;
      // Resolve inserted id — local fallback returns it; real Supabase needs a follow-up query
      let insertedId: number | undefined;
      const d = insertResp?.data as Array<{ id?: number }> | { id?: number } | null;
      insertedId = Array.isArray(d) ? d[0]?.id : d?.id;
      if (!insertedId) {
        const findResp: { data: Array<{ id: number }> | null } = await supabase.from('bookings').select('id').eq('google_event_id', ev.id);
        insertedId = findResp?.data?.[0]?.id;
      }
      if (doCheckIn && insertedId && onCheckIn) await onCheckIn(insertedId);
      flash(doCheckIn ? '✓ Guest checked in from calendar event.' : '✓ Booking created from calendar event.');
      setSelectedItem(null);
      onRefresh?.();
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); console.error('Create from event:', msg); flash(`⚠ ${msg.slice(0, 100)}`); }
    finally { setLoadingAction(''); }
  };

  const handleSelect = (item: ListItem) => {
    setSelectedItem(item);
    setCollectedAmount(''); setSelectedDrinks({}); setExtraServices([]);
    setNewExtraName(''); setNewExtraPrice(''); setShowDrinks(false); setActionMsg('');
  };

  const sel = selectedItem?.booking ?? null;
  const daysUntilCheckIn = sel
    ? Math.ceil((new Date(sel.check_in + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    : 999;
  const canCheckIn = sel?.status === 'confirmed' && daysUntilCheckIn <= 2 && !!onCheckIn;
  const isComingSoon = sel?.status === 'confirmed' && daysUntilCheckIn > 2;
  const canCheckOut = sel?.status === 'checked_in' && !!onCheckOut && today >= (sel?.check_out ?? '9999');
  const canCancel = sel && ['confirmed', 'pending'].includes(sel.status) && !!onCancelBooking;

  // Color rules are SYSTEM-ONLY — we never push status colors back to Google Calendar.
  // Google Calendar's red color (colorId '11') is still READ as a cancellation signal via isGcCancelled.

  const handleCheckIn = async () => {
    if (!sel || !onCheckIn) return;
    setLoadingAction('checkin');
    try { await onCheckIn(sel.id); flash('✓ Guest checked in.'); }
    catch { flash('⚠ Check-in failed.'); }
    finally { setLoadingAction(''); }
  };

  const handleCheckOut = async () => {
    if (!sel || !onCheckOut) return;
    setLoadingAction('checkout');
    try {
      const drinkTab = Object.entries(selectedDrinks).filter(([, q]) => q > 0).map(([id, qty]) => {
        const d = drinks.find(d => d.id === parseInt(id));
        return { drink_id: parseInt(id), drink_name: d?.name || '', quantity: qty, price: d?.sold_price || 0, currency: d?.currency || 'USD' };
      });
      const updates: Partial<Booking> = {};
      if (collectedAmount) { updates.amount = parseFloat(collectedAmount); updates.currency = collectedCurrency; }
      if (drinkTab.length) updates.drinks_tab = drinkTab;
      if (extraServices.length) updates.extra_services = extraServices.map(e => ({ name: e.name, price: parseFloat(e.price) || 0, currency: e.currency as 'UZS' | 'USD' | 'EUR' }));
      if (Object.keys(updates).length && onUpdateBooking) await onUpdateBooking(sel.id, updates);
      await onCheckOut(sel.id);
      flash('✓ Checked out. Finance record created.');
    } catch { flash('⚠ Checkout failed.'); }
    finally { setLoadingAction(''); }
  };

  const handleCancel = async () => {
    if (!sel || !onCancelBooking) return;
    if (!confirm(`Cancel booking for ${sel.guest_name}?`)) return;
    setLoadingAction('cancel');
    try { await onCancelBooking(sel.id); flash('Booking cancelled.'); }
    catch { flash('⚠ Cancel failed.'); }
    finally { setLoadingAction(''); }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900">Guest Agenda</h2>
          <p className="text-xs text-slate-500">Today’s guests · synced from Google Calendar</p>
        </div>
        <div className="flex items-center gap-2">
          {loadingEvents && <span className="text-xs text-slate-400 flex items-center gap-1"><span className="w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin inline-block" />Syncing...</span>}
          {eventsError && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-200">⚠ Calendar: {eventsError.slice(0, 60)}</span>}
          {!loadingEvents && !eventsError && <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">● {gcEvents.length} calendar events</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Left — Today's Guest List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[680px]">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{D === today ? 'Today' : 'Selected Day'}</p>
            <h3 className="text-sm font-black text-slate-900">
              {new Date(D + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto">
            {arrivingItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border-b border-amber-100">◐ Arriving · {arrivingItems.length}</p>
                {arrivingItems.map(item => renderCard(item, false))}
              </div>
            )}
            {stayingItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border-b border-indigo-100">→ In Stay · {stayingItems.length}</p>
                {stayingItems.map(item => renderCard(item, false))}
              </div>
            )}
            {checkedInItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border-b border-emerald-100">● Checked In · {checkedInItems.length}</p>
                {checkedInItems.map(item => renderCard(item, false))}
              </div>
            )}
            {checkingOutItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 border-b border-blue-100">↓ Checking Out · {checkingOutItems.length}</p>
                {checkingOutItems.map(item => renderCard(item, false))}
              </div>
            )}
            {checkedOutItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-50 border-b border-slate-100">✓ Checked Out · {checkedOutItems.length}</p>
                {checkedOutItems.map(item => renderCard(item, false))}
              </div>
            )}
            {gcEventsOnDay.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 border-b border-violet-100">◊ Google Events · {gcEventsOnDay.length}</p>
                {gcEventsOnDay.map(item => renderCard(item, false))}
              </div>
            )}
            {cancelledItems.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-700 bg-red-50 border-b border-red-100">✕ Cancelled · {cancelledItems.length}</p>
                {cancelledItems.map(item => renderCard(item, true))}
              </div>
            )}
            {arrivingItems.length === 0 && stayingItems.length === 0 && checkedInItems.length === 0 && checkingOutItems.length === 0 && checkedOutItems.length === 0 && gcEventsOnDay.length === 0 && cancelledItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <p className="text-sm font-medium">No guests today</p>
              </div>
            )}
          </div>
        </div>

        <PrivateCalendarView
          bookings={bookings}
          gcEvents={gcEvents}
          onDayChange={day => setSelectedCalendarDay(day)}
          onSelectBooking={b => handleSelect({ key: `db-${b.id}`, name: b.guest_name, start: b.check_in, end: b.check_out, source: 'db', booking: b, event: null })}
          onSelectCalendarEvent={ev => {
            const linked = bookings.find(b => b.google_event_id === ev.id) || null;
            handleSelect({ key: linked ? `db-${linked.id}` : `ev-${ev.id}`, name: linked ? linked.guest_name : ev.summary, start: linked ? linked.check_in : ev.start, end: linked ? linked.check_out : ev.end, source: linked ? 'both' : 'calendar', booking: linked, event: ev });
          }}
        />
      </div>

      {/* Event / Booking popup modal */}
    {selectedItem && (
      <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-16" onClick={() => setSelectedItem(null)}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
              {sel ? 'Booking Details' : 'Google Calendar Event'}
            </p>
            <button onClick={() => setSelectedItem(null)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-all text-slate-500 font-bold text-xl">×</button>
          </div>

          {!sel ? (
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selectedItem.event?.summary}</h2>
                  <p className="text-sm text-slate-500">{selectedItem.start} → {selectedItem.end}</p>
                </div>
                {selectedItem.event && isGcCancelled(selectedItem.event) && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                    ✕ cancelled
                  </span>
                )}
              </div>
              {selectedItem.event?.description && !selectedItem.event.description.includes('tasks.google.com') && <p className="text-sm text-black bg-slate-50 rounded-xl p-3">{selectedItem.event.description}</p>}
              {selectedItem.event?.location && <p className="text-sm text-slate-500">📍 {selectedItem.event.location}</p>}
              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{actionMsg}</div>
              )}
              {(() => {
                const days = Math.ceil((new Date(selectedItem.start + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
                if (selectedItem.event && isGcCancelled(selectedItem.event)) {
                  return (
                    <div className="w-full py-3 px-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700 text-center flex items-center justify-center gap-2">
                      <span>✕</span> Cancelled
                    </div>
                  );
                }
                return days <= 2 ? (
                  <button onClick={() => handleCreateFromEvent(true)} disabled={loadingAction === 'creating'}
                    className="w-full py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {loadingAction === 'creating' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                    Check In
                  </button>
                ) : (
                  <div className="w-full py-2.5 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700 text-center">
                    ⏰ Coming in {days} day{days !== 1 ? 's' : ''}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{sel.guest_name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{getYurtName(sel)} · {sel.check_in} → {sel.check_out}{sel.nights ? ` · ${sel.nights}n` : ''}{(sel.guest_count || sel.number_of_people) ? ` · ${sel.guest_count || sel.number_of_people} pax` : ''}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${statusColor(sel.status)} flex items-center gap-1`}>
                  {statusIcon(sel.status) && <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>}
                  {sel.status.replace('_', ' ')}
                </span>
              </div>

              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{actionMsg}</div>
              )}

              {syncWarnings[sel.id] === 'deleted' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <p className="font-bold mb-0.5">⚠ Calendar event deleted</p>
                  <p className="text-xs">The linked Google Calendar event was removed. The booking remains here.</p>
                </div>
              )}

              {syncWarnings[sel.id] === 'dates_changed' && (() => {
                const linkedEv = gcEvents.find(e => e.id === sel.google_event_id);
                if (!linkedEv) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-bold text-amber-800">⚠ Dates changed in Google Calendar</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white rounded-lg p-2 border border-amber-100">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saved</p>
                        <p className="text-black font-bold">{sel.check_in} → {sel.check_out}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-emerald-200">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Calendar</p>
                        <p className="text-black font-bold">{linkedEv.start} → {linkedEv.end}</p>
                      </div>
                    </div>
                    {(userRole === 'Manager' || userRole === 'CEO') && onUpdateBooking && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Approve new booking dates from Calendar: ${linkedEv.start} → ${linkedEv.end}?`)) return;
                          await handleApproveDates(sel);
                        }}
                        disabled={loadingAction === `syncdates-${sel.id}`}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                        {loadingAction === `syncdates-${sel.id}` ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '↻'}
                        Approve dates
                      </button>
                    )}
                  </div>
                );
              })()}

              {(sel.status === 'no_arrival' || sel.status === 'cancelled') && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-not-allowed ${statusColor(sel.status)}`}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{sel.status.replace('_', ' ')}</span>
                  {sel.status === 'no_arrival' && <span className="text-[10px] font-medium opacity-70">· permanent</span>}
                </div>
              )}

              {sel.status === 'completed' && (
                <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none ${(userRole === 'Manager' || userRole === 'CEO') ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'} ${statusColor(sel.status)}`}
                  onClick={() => {
                    if (userRole !== 'Manager' && userRole !== 'CEO') return;
                    setEditingDates(true);
                    setEditCheckIn(sel.check_in);
                    setEditCheckOut(sel.check_out);
                  }}
                  title={(userRole === 'Manager' || userRole === 'CEO') ? 'Click to edit dates' : ''}>
                  <span className={statusIconColor(sel.status)}>{statusIcon(sel.status)}</span>
                  <span className="capitalize">{sel.status.replace('_', ' ')}</span>
                </div>
              )}

              {(userRole === 'Manager' || userRole === 'CEO') && sel.status !== 'no_arrival' && sel.status !== 'cancelled' && (
                <div className="flex flex-wrap gap-2">
                  {sel.status === 'checked_in' && !editingDates && (
                    <button
                      onClick={() => { setEditingDates(true); setEditCheckIn(sel.check_in); setEditCheckOut(sel.check_out); }}
                      className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-200 transition-all flex items-center gap-2">
                      ✓ Checked In · Edit Dates
                    </button>
                  )}
                  {editingDates && (
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Edit Stay Dates</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check In</label>
                          <input
                            type="date"
                            value={editCheckIn}
                            onChange={e => setEditCheckIn(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Check Out</label>
                          <input
                            type="date"
                            value={editCheckOut}
                            onChange={e => setEditCheckOut(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`Update dates to ${editCheckIn} → ${editCheckOut}?`)) return;
                            setLoadingAction('editdates');
                            try {
                              await onUpdateBooking?.(sel.id, { check_in: editCheckIn, check_out: editCheckOut });
                              flash('✓ Dates updated.');
                              setEditingDates(false);
                              onRefresh?.();
                            } catch (e: unknown) {
                              const msg = e instanceof Error ? e.message : String(e);
                              flash(`⚠ ${msg.slice(0, 100)}`);
                            } finally {
                              setLoadingAction('');
                            }
                          }}
                          disabled={loadingAction === 'editdates' || !editCheckIn || !editCheckOut || editCheckIn > editCheckOut}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                          {loadingAction === 'editdates' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDates(false)}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded-lg transition-all">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {canCheckIn && (
                    <button onClick={handleCheckIn} disabled={loadingAction === 'checkin'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2">
                      {loadingAction === 'checkin' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                      Check In
                    </button>
                  )}
                  {isComingSoon && (
                    <div className="px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl text-sm font-bold text-sky-700">
                      ⏰ Coming in {daysUntilCheckIn} day{daysUntilCheckIn !== 1 ? 's' : ''}
                    </div>
                  )}
                  {canCheckOut && !editingDates && (
                    <button onClick={handleCheckOut} disabled={loadingAction === 'checkout'}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2">
                      {loadingAction === 'checkout' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
                      Check Out
                    </button>
                  )}
                  {canCancel && !editingDates && (
                    <button onClick={handleCancel} disabled={loadingAction === 'cancel'}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold rounded-xl border border-red-200 transition-all disabled:opacity-60">Cancel Booking</button>
                  )}
                  {sel.status === 'confirmed' && sel.check_in < today && onUpdateBooking && !editingDates && (
                    <button onClick={async () => { if (!confirm(`Mark ${sel.guest_name} as No Arrival? This is PERMANENT and cannot be undone.`)) return; setLoadingAction('na'); try { await onUpdateBooking(sel.id, { status: 'no_arrival' } as Partial<Booking>); flash('Marked as No Arrival.'); } catch { flash('⚠ Failed.'); } finally { setLoadingAction(''); } }} disabled={loadingAction === 'na'}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold rounded-xl border border-gray-300 transition-all disabled:opacity-60">⊘ No Arrival</button>
                  )}
                </div>
              )}

              {canCheckOut && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collect Payment</p>
                  <div className="flex gap-2">
                    <input type="number" value={collectedAmount} onChange={e => setCollectedAmount(e.target.value)} placeholder="Amount collected"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-black" />
                    <select value={collectedCurrency} onChange={e => setCollectedCurrency(e.target.value as 'UZS' | 'USD' | 'EUR')}
                      className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none text-black bg-white">
                      <option>USD</option><option>UZS</option><option>EUR</option>
                    </select>
                  </div>
                </div>
              )}

              {(canCheckOut || sel.status === 'checked_in') && (userRole === 'Manager' || userRole === 'CEO') && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Extra Services</p>
                  <button onClick={() => setShowDrinks(v => !v)} className="text-sm font-bold text-indigo-600 hover:text-indigo-700">{showDrinks ? '− Hide Drinks' : '+ Add Drinks'}</button>
                  {showDrinks && drinks.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {drinks.map(d => (
                        <div key={d.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                          <span className="text-xs text-black flex-1 truncate">{d.name}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedDrinks(p => ({ ...p, [d.id]: Math.max(0, (p[d.id] || 0) - 1) }))} className="w-5 h-5 rounded bg-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-300">−</button>
                            <span className="w-5 text-center text-xs font-bold text-black">{selectedDrinks[d.id] || 0}</span>
                            <button onClick={() => setSelectedDrinks(p => ({ ...p, [d.id]: (p[d.id] || 0) + 1 }))} className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 text-xs font-bold hover:bg-indigo-200">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="text" value={newExtraName} onChange={e => setNewExtraName(e.target.value)} placeholder="Service name"
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black" />
                    <input type="number" value={newExtraPrice} onChange={e => setNewExtraPrice(e.target.value)} placeholder="Price"
                      className="w-20 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none text-black" />
                    <button onClick={() => { if (!newExtraName.trim()) return; setExtraServices(p => [...p, { name: newExtraName.trim(), price: newExtraPrice, currency: collectedCurrency }]); setNewExtraName(''); setNewExtraPrice(''); }}
                      className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">Add</button>
                  </div>
                  {extraServices.length > 0 && (
                    <div className="space-y-1">
                      {extraServices.map((s, i) => (
                        <div key={i} className="flex justify-between items-center text-xs bg-indigo-50 px-3 py-1.5 rounded-lg">
                          <span className="text-black">{s.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-700">{s.price} {s.currency}</span>
                            <button onClick={() => setExtraServices(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 font-bold">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(sel.notes || sel.description) && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-black whitespace-pre-wrap">{sel.notes || sel.description}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
}
