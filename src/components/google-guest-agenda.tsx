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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'arriving' | 'checked_in'>('all');
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
          bookings.filter(b => b.google_event_id && b.check_in >= cutoff).forEach(b => {
            const ev = events.find(e => e.id === b.google_event_id);
            if (!ev) warnings[b.id] = 'deleted';
            else if (ev.start !== b.check_in || ev.end !== b.check_out) warnings[b.id] = 'dates_changed';
          });
          setSyncWarnings(warnings);
        }
      })
      .catch(e => setEventsError(String(e)))
      .finally(() => setLoadingEvents(false));

    supabase.from('drinks').select('*').eq('available', true)
      .then(({ data }: { data: Drink[] | null }) => setDrinks(data || []));
  }, []);

  useEffect(() => {
    if (selectedItem?.booking) {
      const updated = bookings.find(b => b.id === selectedItem.booking!.id);
      if (updated) setSelectedItem(prev => prev ? { ...prev, booking: updated } : prev);
    }
  }, [bookings]);

  const getYurtName = (b: Booking) =>
    yurts.find(y => y.id === b.yurt_id)?.name || (b.yurt_id ? `Yurt #${b.yurt_id}` : '—');

  const mergedItems = (): ListItem[] => {
    const items: ListItem[] = [];
    const usedBookingIds = new Set<number>();

    gcEvents.forEach(ev => {
      const matched = bookings.find(b =>
        b.guest_name.toLowerCase().includes(ev.summary.toLowerCase()) ||
        ev.summary.toLowerCase().includes(b.guest_name.toLowerCase()) ||
        b.check_in === ev.start
      );
      if (matched) usedBookingIds.add(matched.id);
      items.push({
        key: `ev-${ev.id}`,
        name: matched ? matched.guest_name : ev.summary,
        start: ev.start,
        end: ev.end,
        source: matched ? 'both' : 'calendar',
        booking: matched || null,
        event: ev,
      });
    });

    bookings
      .filter(b => !usedBookingIds.has(b.id) && !['cancelled', 'completed'].includes(b.status) && b.check_out >= today)
      .forEach(b => items.push({ key: `db-${b.id}`, name: b.guest_name, start: b.check_in, end: b.check_out, source: 'db', booking: b, event: null }));

    items.sort((a, b) => a.start.localeCompare(b.start));
    return items;
  };

  const filteredItems = mergedItems().filter(item => {
    const nameMatch = !search.trim() || item.name.toLowerCase().includes(search.toLowerCase());
    const status = item.booking?.status;
    if (filter === 'today') return nameMatch && (item.start === today || (item.start <= today && item.end >= today));
    if (filter === 'arriving') return nameMatch && item.start >= today;
    if (filter === 'checked_in') return nameMatch && status === 'checked_in';
    return nameMatch;
  });

  const statusColor = (s?: string) => ({
    checked_in: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    confirmed: 'bg-amber-100 text-amber-700 border border-amber-200',
    completed: 'bg-blue-100 text-blue-700 border border-blue-200',
    cancelled: 'bg-red-100 text-red-700 border border-red-200',
    pending: 'bg-slate-100 text-slate-600 border border-slate-200',
  }[s ?? ''] ?? 'bg-slate-100 text-slate-500');

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 4000); };

  const handleCreateFromEvent = async () => {
    if (!selectedItem?.event || !currentUserId) return;
    const ev = selectedItem.event;
    setLoadingAction('creating');
    try {
      const { error } = await supabase.from('bookings').insert({
        guest_name: ev.summary,
        check_in: ev.start,
        check_out: ev.end || ev.start,
        status: 'confirmed',
        source: 'Manual',
        google_event_id: ev.id,
        total_price: 0,
        number_of_people: 1,
        payment_status: 'Unpaid',
        approved_by_manager: true,
        created_by_id: currentUserId,
        notes: ev.description || null,
      });
      if (error) throw error;
      flash('✓ Booking created from calendar event.');
      setSelectedItem(null);
      onRefresh?.();
    } catch { flash('⚠ Failed to create booking.'); }
    finally { setLoadingAction(''); }
  };

  const handleSelect = (item: ListItem) => {
    setSelectedItem(item);
    setCollectedAmount(''); setSelectedDrinks({}); setExtraServices([]);
    setNewExtraName(''); setNewExtraPrice(''); setShowDrinks(false); setActionMsg('');
  };

  const sel = selectedItem?.booking ?? null;
  const canCheckIn = sel?.status === 'confirmed' && !!onCheckIn;
  const canCheckOut = sel?.status === 'checked_in' && !!onCheckOut;
  const canCancel = sel && ['confirmed', 'pending'].includes(sel.status) && !!onCancelBooking;

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
          <p className="text-xs text-slate-500">Next 30 days · synced from Google Calendar</p>
        </div>
        <div className="flex items-center gap-2">
          {loadingEvents && <span className="text-xs text-slate-400 flex items-center gap-1"><span className="w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin inline-block" />Syncing...</span>}
          {eventsError && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-200">⚠ Calendar: {eventsError.slice(0, 60)}</span>}
          {!loadingEvents && !eventsError && <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">● {gcEvents.length} calendar events</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Left — List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search guest name..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black bg-slate-50"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['all', 'today', 'arriving', 'checked_in'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all capitalize ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {f.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto flex-1 max-h-[520px]">
            {filteredItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">No guests found</div>
            ) : (
              filteredItems.map(item => {
                const isSelected = selectedItem?.key === item.key;
                const statusKey = item.booking?.status;
                const rowBg = statusKey === 'checked_in' ? 'border-l-4 border-emerald-400' : statusKey === 'confirmed' ? 'border-l-4 border-amber-400' : '';
                return (
                  <button key={item.key} onClick={() => handleSelect(item)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-all ${isSelected ? 'bg-indigo-50' : ''} ${rowBg}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{item.start} → {item.end}</p>
                        {item.booking && <p className="text-xs text-slate-500">{getYurtName(item.booking)}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {statusKey ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusColor(statusKey)}`}>
                            {statusKey.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">calendar only</span>
                        )}
                        {item.booking && syncWarnings[item.booking.id] === 'deleted' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">⚠ removed from calendar</span>
                        )}
                        {item.booking && syncWarnings[item.booking.id] === 'dates_changed' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚠ dates changed</span>
                        )}
                        {item.source === 'both' && !syncWarnings[item.booking?.id ?? -1] && <span className="text-[9px] text-indigo-400">● synced</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {onAddNewBooking && (
            <div className="p-3 border-t border-slate-100">
              <button onClick={() => onAddNewBooking('')}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black tracking-wide transition-all flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Booking
              </button>
            </div>
          )}
        </div>

        <PrivateCalendarView bookings={bookings} gcEvents={gcEvents} />
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
              <h2 className="text-xl font-black text-slate-900">{selectedItem.event?.summary}</h2>
              <p className="text-sm text-slate-500">{selectedItem.start} → {selectedItem.end}</p>
              {selectedItem.event?.description && <p className="text-sm text-black bg-slate-50 rounded-xl p-3">{selectedItem.event.description}</p>}
              {selectedItem.event?.location && <p className="text-sm text-slate-500">📍 {selectedItem.event.location}</p>}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">No matching booking in Supabase — click below to create one.</div>
              <button onClick={handleCreateFromEvent} disabled={loadingAction === 'creating'}
                className="w-full py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {loadingAction === 'creating' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '+'}
                Create Booking from this Calendar Event
              </button>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{sel.guest_name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{getYurtName(sel)} · {sel.check_in} → {sel.check_out}{sel.nights ? ` · ${sel.nights}n` : ''}{(sel.guest_count || sel.number_of_people) ? ` · ${sel.guest_count || sel.number_of_people} pax` : ''}</p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${statusColor(sel.status)}`}>{sel.status.replace('_', ' ')}</span>
              </div>

              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{actionMsg}</div>
              )}

              {(userRole === 'Manager' || userRole === 'CEO') && (
                <div className="flex flex-wrap gap-2">
                  {canCheckIn && (
                    <button onClick={handleCheckIn} disabled={loadingAction === 'checkin'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2">
                      {loadingAction === 'checkin' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'} Check In
                    </button>
                  )}
                  {canCheckOut && (
                    <button onClick={handleCheckOut} disabled={loadingAction === 'checkout'}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2">
                      {loadingAction === 'checkout' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'} Check Out
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={handleCancel} disabled={loadingAction === 'cancel'}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold rounded-xl border border-red-200 transition-all disabled:opacity-60">Cancel Booking</button>
                  )}
                  {sel.status === 'confirmed' && sel.check_in < today && onUpdateBooking && (
                    <button onClick={async () => { if (!confirm(`Mark ${sel.guest_name} as No Arrival?`)) return; setLoadingAction('na'); try { await onUpdateBooking(sel.id, { status: 'no_arrival' } as Partial<Booking>); flash('Marked as No Arrival.'); } catch { flash('⚠ Failed.'); } finally { setLoadingAction(''); } }} disabled={loadingAction === 'na'}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold rounded-xl transition-all disabled:opacity-60">No Arrival</button>
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
                  <p className="text-sm text-black">{sel.description || sel.notes}</p>
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
