'use client';

import { useState, useEffect } from 'react';
import { supabase, type Booking, type Yurt, type UserRole, type Drink } from '@/lib/supabase';

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  bookings: Booking[];
  yurts: Yurt[];
  userRole?: UserRole;
  currentUserId?: string;
  calendarId?: string;
  onCheckIn?: (id: number) => Promise<void> | void;
  onCheckOut?: (id: number) => Promise<void> | void;
  onUpdateBooking?: (id: number, updates: Partial<Booking>) => Promise<void> | void;
  onCancelBooking?: (id: number) => Promise<void> | void;
  onAddNewBooking?: (date: string) => void;
}

export function GoogleCalendarView({
  bookings, yurts, userRole, currentUserId,
  calendarId, onCheckIn, onCheckOut, onUpdateBooking, onCancelBooking, onAddNewBooking,
}: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
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

  const today = localDateStr(new Date());
  const calId = calendarId || process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ID || '';
  const embedSrc = calId
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calId)}&ctz=Asia%2FTashkent&mode=AGENDA&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0`
    : null;

  useEffect(() => {
    supabase.from('drinks').select('*').eq('available', true).then(({ data }: { data: Drink[] | null }) => setDrinks(data || []));
  }, []);

  useEffect(() => {
    if (selected) {
      const updated = bookings.find(b => b.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [bookings]);

  const todayBookings = bookings.filter(b =>
    b.check_in <= today && b.check_out >= today && !['cancelled', 'completed'].includes(b.status)
  );

  const listToShow = search.trim()
    ? bookings.filter(b => b.guest_name.toLowerCase().includes(search.toLowerCase()))
    : todayBookings;

  const getYurtName = (b: Booking) =>
    yurts.find(y => y.id === b.yurt_id)?.name || (b.yurt_id ? `Yurt #${b.yurt_id}` : '—');

  const statusBadge = (s: string) => ({
    checked_in: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    confirmed: 'bg-amber-100 text-amber-700 border border-amber-200',
    completed: 'bg-blue-100 text-blue-700 border border-blue-200',
    cancelled: 'bg-red-100 text-red-700 border border-red-200',
    pending: 'bg-slate-100 text-slate-600 border border-slate-200',
    no_arrival: 'bg-gray-100 text-gray-500 border border-gray-200',
  }[s] ?? 'bg-slate-100 text-slate-600');

  const canCheckIn = selected?.status === 'confirmed' && (onCheckIn !== undefined);
  const canCheckOut = selected?.status === 'checked_in' && (onCheckOut !== undefined);
  const canCancel = selected && ['confirmed', 'pending'].includes(selected.status) && (onCancelBooking !== undefined);

  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 4000); };

  const handleCheckIn = async () => {
    if (!selected || !onCheckIn) return;
    setLoadingAction('checkin');
    try {
      await onCheckIn(selected.id);
      setSelected(prev => prev ? { ...prev, status: 'checked_in' } : prev);
      flash('✓ Guest checked in successfully.');
    } catch { flash('⚠ Check-in failed. Try again.'); }
    finally { setLoadingAction(''); }
  };

  const handleCheckOut = async () => {
    if (!selected || !onCheckOut) return;
    setLoadingAction('checkout');
    try {
      const drinkTab = Object.entries(selectedDrinks)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => {
          const d = drinks.find(d => d.id === parseInt(id));
          return { drink_id: parseInt(id), drink_name: d?.name || '', quantity: qty, price: d?.sold_price || 0, currency: d?.currency || 'USD' };
        });
      const updates: Partial<Booking> = {};
      if (collectedAmount) { updates.amount = parseFloat(collectedAmount); updates.currency = collectedCurrency; }
      if (drinkTab.length > 0) updates.drinks_tab = drinkTab;
      if (extraServices.length > 0) {
        updates.extra_services = extraServices.map(e => ({ name: e.name, price: parseFloat(e.price) || 0, currency: e.currency as 'UZS' | 'USD' | 'EUR' }));
      }
      if (Object.keys(updates).length > 0 && onUpdateBooking) await onUpdateBooking(selected.id, updates);
      await onCheckOut(selected.id);
      setSelected(prev => prev ? { ...prev, status: 'completed' } : prev);
      flash('✓ Checked out. Finance record created.');
    } catch { flash('⚠ Checkout failed. Try again.'); }
    finally { setLoadingAction(''); }
  };

  const handleCancel = async () => {
    if (!selected || !onCancelBooking) return;
    if (!confirm(`Cancel booking for ${selected.guest_name}?`)) return;
    setLoadingAction('cancel');
    try {
      await onCancelBooking(selected.id);
      setSelected(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      flash('Booking cancelled.');
    } catch { flash('⚠ Cancel failed.'); }
    finally { setLoadingAction(''); }
  };

  const handleNoArrival = async () => {
    if (!selected || !onUpdateBooking) return;
    if (!confirm(`Mark ${selected.guest_name} as No Arrival?`)) return;
    setLoadingAction('noarrival');
    try {
      await onUpdateBooking(selected.id, { status: 'no_arrival' } as Partial<Booking>);
      setSelected(prev => prev ? { ...prev, status: 'no_arrival' } : prev);
      flash('Marked as No Arrival.');
    } catch { flash('⚠ Action failed.'); }
    finally { setLoadingAction(''); }
  };

  const handleSelectBooking = (b: Booking) => {
    setSelected(b);
    setCollectedAmount('');
    setSelectedDrinks({});
    setExtraServices([]);
    setNewExtraName('');
    setNewExtraPrice('');
    setShowDrinks(false);
    setActionMsg('');
  };

  return (
    <div className="space-y-4">
      {/* Google Calendar iframe */}
      <div className="w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
        {embedSrc ? (
          <iframe
            src={embedSrc}
            className="w-full"
            style={{ height: 600, border: 0 }}
            title="Google Calendar"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-[600px] bg-slate-50 text-slate-500 gap-3">
            <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="font-semibold text-slate-600">Google Calendar not configured</p>
            <p className="text-sm text-center max-w-xs">
              Set <code className="bg-slate-100 px-1 rounded text-slate-700">NEXT_PUBLIC_GOOGLE_CALENDAR_ID</code> in your environment, or pass the <code className="bg-slate-100 px-1 rounded text-slate-700">calendarId</code> prop.
            </p>
          </div>
        )}
      </div>

      {/* Search + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">

        {/* Left — Guest Search */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              {search.trim() ? 'Search Results' : "Today's Activity"}
            </p>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search guest name..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black bg-slate-50"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {listToShow.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                {search.trim() ? 'No matching guests found' : 'No active guests today'}
              </div>
            ) : (
              listToShow.map(b => (
                <button
                  key={b.id}
                  onClick={() => handleSelectBooking(b)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-all ${selected?.id === b.id ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{b.guest_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{getYurtName(b)} · {b.check_in} → {b.check_out}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusBadge(b.status)}`}>
                      {b.status.replace('_', ' ')}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {onAddNewBooking && (
            <div className="p-3 border-t border-slate-100">
              <button
                onClick={() => onAddNewBooking('')}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black tracking-wide transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Booking
              </button>
            </div>
          )}
        </div>

        {/* Right — Booking Detail & Actions */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-slate-400 gap-2">
              <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p className="text-sm font-medium">Select a guest to see actions</p>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selected.guest_name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {getYurtName(selected)} · {selected.check_in} → {selected.check_out}
                    {selected.nights ? ` · ${selected.nights}n` : ''}
                    {(selected.guest_count || selected.number_of_people) ? ` · ${selected.guest_count || selected.number_of_people} pax` : ''}
                  </p>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${statusBadge(selected.status)}`}>
                  {selected.status.replace('_', ' ')}
                </span>
              </div>

              {actionMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded-lg ${actionMsg.startsWith('⚠') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {actionMsg}
                </div>
              )}

              {/* Primary Actions */}
              {(userRole === 'Manager' || userRole === 'CEO') && (
                <div className="flex flex-wrap gap-2">
                  {canCheckIn && (
                    <button
                      onClick={handleCheckIn}
                      disabled={loadingAction === 'checkin'}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2"
                    >
                      {loadingAction === 'checkin' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '→'}
                      Check In
                    </button>
                  )}
                  {canCheckOut && (
                    <button
                      onClick={handleCheckOut}
                      disabled={loadingAction === 'checkout'}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60 flex items-center gap-2"
                    >
                      {loadingAction === 'checkout' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '✓'}
                      Check Out
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={handleCancel}
                      disabled={loadingAction === 'cancel'}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold rounded-xl border border-red-200 transition-all disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  )}
                  {selected.status === 'confirmed' && selected.check_in < today && onUpdateBooking && (
                    <button
                      onClick={handleNoArrival}
                      disabled={loadingAction === 'noarrival'}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold rounded-xl transition-all disabled:opacity-60"
                    >
                      No Arrival
                    </button>
                  )}
                </div>
              )}

              {/* Payment Collection (checkout prep) */}
              {canCheckOut && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collect Payment</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={collectedAmount}
                      onChange={e => setCollectedAmount(e.target.value)}
                      placeholder="Amount collected"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-black"
                    />
                    <select
                      value={collectedCurrency}
                      onChange={e => setCollectedCurrency(e.target.value as 'UZS' | 'USD' | 'EUR')}
                      className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 text-black bg-white"
                    >
                      <option>USD</option>
                      <option>UZS</option>
                      <option>EUR</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Extra Services */}
              {(canCheckOut || selected.status === 'checked_in') && (userRole === 'Manager' || userRole === 'CEO') && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Extra Services</p>

                  {/* Drinks Toggle */}
                  <button
                    onClick={() => setShowDrinks(v => !v)}
                    className="text-sm font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {showDrinks ? 'Hide Drinks' : 'Add Drinks'}
                  </button>

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

                  {/* Custom Extra Service */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newExtraName}
                      onChange={e => setNewExtraName(e.target.value)}
                      placeholder="Service name"
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                    />
                    <input
                      type="number"
                      value={newExtraPrice}
                      onChange={e => setNewExtraPrice(e.target.value)}
                      placeholder="Price"
                      className="w-20 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                    />
                    <button
                      onClick={() => {
                        if (!newExtraName.trim()) return;
                        setExtraServices(p => [...p, { name: newExtraName.trim(), price: newExtraPrice, currency: collectedCurrency }]);
                        setNewExtraName(''); setNewExtraPrice('');
                      }}
                      className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700"
                    >
                      Add
                    </button>
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

              {/* Booking Notes (read-only) */}
              {(selected.notes || selected.description) && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Notes</p>
                  <p className="text-sm text-black">{selected.description || selected.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
