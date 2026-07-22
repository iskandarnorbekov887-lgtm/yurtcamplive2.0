'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { BookingEditRequest, BookingExtension } from '@/lib/supabase';
import { useLanguage } from '@/lib/language-context';

interface LockedFieldProps {
  label: string;
  fieldName: string;
  currentValue: string;
  displayValue: string;
  bookingId: number;
  teamId: string;
  requestedBy: string;
  onRequestSent: () => void;
}

function LockedField({
  label, fieldName, currentValue, displayValue,
  bookingId, teamId, requestedBy, onRequestSent,
}: LockedFieldProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!requestedValue.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('booking_edit_requests').insert({
        booking_id: bookingId,
        team_id: teamId,
        requested_by: requestedBy,
        field_name: fieldName,
        current_value: currentValue,
        requested_value: requestedValue.trim(),
        reason: reason.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      setSent(true);
      setOpen(false);
      setRequestedValue('');
      setReason('');
      onRequestSent();
    } catch (err: any) {
      alert(`Failed to submit request: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {/* Read-only locked display */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-[#1C232E]/50 border border-[#5C4A2E]/30 rounded">
          <svg className="w-3.5 h-3.5 text-[#C9A227] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-mono text-[#9C9384] font-bold">{displayValue}</span>
        </div>
        {/* Request Edit button */}
        {sent ? (
          <span className="text-[10px] font-black text-[#0B6E4F] bg-[#0B6E4F]/10 px-2 py-1 rounded border border-[#0B6E4F]/30">
            ✓ Sent
          </span>
        ) : (
          <button
            onClick={() => setOpen(!open)}
            className="text-[10px] font-black text-[#C9A227] bg-[#C9A227]/10 px-2 py-1 rounded border border-[#C9A227]/30 hover:bg-[#C9A227]/20 transition-all whitespace-nowrap"
          >
            {open ? 'Cancel' : 'Request Edit'}
          </button>
        )}
      </div>

      {/* Inline request form */}
      {open && (
        <div className="mt-2 p-3 bg-[#0F1419] border border-[#C9A227]/30 rounded-lg space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#C9A227]">
            Request change to: {label}
          </p>
          <input
            type="text"
            placeholder="New value..."
            value={requestedValue}
            onChange={e => setRequestedValue(e.target.value)}
            className="w-full px-3 py-2 bg-[#1C232E] border border-[#5C4A2E]/30 rounded text-sm text-[#EDE6D6] font-mono focus:outline-none focus:ring-1 focus:ring-[#C9A227]/50"
          />
          <textarea
            placeholder="Reason for change (optional)..."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-[#1C232E] border border-[#5C4A2E]/30 rounded text-sm text-[#EDE6D6] focus:outline-none focus:ring-1 focus:ring-[#C9A227]/50 resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !requestedValue.trim()}
            className="w-full py-2 bg-[#C9A227] text-[#0F1419] text-[10px] font-black uppercase tracking-widest rounded transition-all disabled:opacity-50 hover:bg-[#C9A227]/80 active:scale-95"
          >
            {submitting ? 'Sending...' : 'Submit Request'}
          </button>
        </div>
      )}
    </div>
  );
}

interface ExtendStayFormProps {
  booking: any;
  currentUserId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function ExtendStayForm({ booking, currentUserId, onSuccess, onCancel }: ExtendStayFormProps) {
  const { t } = useLanguage();
  const [daysAdded, setDaysAdded] = useState('');
  const [amountAdded, setAmountAdded] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const calcNewCheckOut = () => {
    const days = parseInt(daysAdded) || 0;
    if (!days || !booking.check_out) return '';
    const d = new Date(booking.check_out + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const newCheckOut = calcNewCheckOut();

  const handleSubmit = async () => {
    const days = parseInt(daysAdded) || 0;
    const amount = parseFloat(amountAdded) || 0;
    if (days <= 0) { alert('Days must be at least 1.'); return; }
    if (!newCheckOut) return;

    setSubmitting(true);
    try {
      // 1. Insert booking_extensions row
      const { error: extErr } = await supabase.from('booking_extensions').insert({
        booking_id: booking.id,
        team_id: booking.team_id,
        added_by: currentUserId,
        days_added: days,
        amount_added: amount,
        new_check_out: newCheckOut,
      });
      if (extErr) throw extErr;

      // 2. Update bookings.check_out and bookings.total_price directly
      const { error: bookErr } = await supabase
        .from('bookings')
        .update({
          check_out: newCheckOut,
          total_price: (booking.total_price || 0) + amount,
          is_manually_updated: true,
        })
        .eq('id', booking.id);
      if (bookErr) throw bookErr;

      onSuccess();
    } catch (err: any) {
      alert(`Failed to extend stay: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 p-4 bg-[#0F1419] border border-[#0B6E4F]/40 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-[#0B6E4F]/20 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-[#0B6E4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F]">
          Extend Stay
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-[#9C9384]">Days to Add</label>
          <input
            type="number"
            min="1"
            placeholder="0"
            value={daysAdded}
            onChange={e => setDaysAdded(e.target.value)}
            className="w-full px-3 py-2 bg-[#1C232E] border border-[#5C4A2E]/30 rounded text-sm text-[#EDE6D6] font-mono font-black focus:outline-none focus:ring-1 focus:ring-[#0B6E4F]/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-[#9C9384]">Amount to Add ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amountAdded}
            onChange={e => setAmountAdded(e.target.value)}
            className="w-full px-3 py-2 bg-[#1C232E] border border-[#5C4A2E]/30 rounded text-sm text-[#EDE6D6] font-mono font-black focus:outline-none focus:ring-1 focus:ring-[#0B6E4F]/50"
          />
        </div>
      </div>

      {newCheckOut && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 rounded">
          <svg className="w-3.5 h-3.5 text-[#0B6E4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[10px] font-black text-[#0B6E4F]">
            New check-out: <span className="font-mono">{newCheckOut}</span>
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || !daysAdded || parseInt(daysAdded) <= 0}
          className="flex-1 py-2.5 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-widest rounded transition-all disabled:opacity-50 hover:bg-[#0B6E4F]/80 active:scale-95"
        >
          {submitting ? t('msg.saving') : t('msg.confirm_extension')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-[#1C232E] text-[#9C9384] text-[10px] font-black rounded border border-[#5C4A2E]/30 hover:bg-[#2A1518] transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface LockedBookingPanelProps {
  booking: any;
  currentUserId: string;
  onRefresh: () => void;
}

export function LockedBookingPanel({ booking, currentUserId, onRefresh }: LockedBookingPanelProps) {
  const { t } = useLanguage();
  const [extensions, setExtensions] = useState<BookingExtension[]>([]);
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [loadingExt, setLoadingExt] = useState(true);

  console.log('LockedBookingPanel received:', {
    id: booking.id,
    guest_name: booking.guest_name,
    number_of_adults: booking.number_of_adults,
    number_of_children: booking.number_of_children,
    full_booking: booking,
  });

  const fetchExtensions = async () => {
    setLoadingExt(true);
    const { data } = await supabase
      .from('booking_extensions')
      .select('*, profiles(full_name)')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true });
    setExtensions((data as BookingExtension[]) || []);
    setLoadingExt(false);
  };

  useEffect(() => {
    fetchExtensions();
  }, [booking.id]);

  const teamId = booking.team_id as string;

  // Helpers for display
  const adultsDisplay = String(booking.number_of_adults ?? booking.guest_count ?? 0);
  const childrenDisplay = String(booking.number_of_children ?? 0);
  const priceDisplay = `$${(booking.total_price || 0).toFixed(2)}`;
  const checkOutDisplay = String(booking.check_out);

  return (
    <div className="border border-[#C9A227]/30 p-4 bg-[#1C232E] shadow-[2px_2px_0px_0px_rgba(201,162,39,0.2)] space-y-4 rounded-lg">
      {/* Header badge */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-[#C9A227]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A227]">
          Stay Configuration — Locked (Paid)
        </p>
      </div>

      <p className="text-[9px] text-[#9C9384] font-medium -mt-2">
        This booking is paid. Fields are read-only. Request a change for CEO review.
      </p>

      {/* Locked fields */}
      <div className="grid grid-cols-2 gap-4">
        <LockedField
          label="Adults"
          fieldName="number_of_adults"
          currentValue={adultsDisplay}
          displayValue={adultsDisplay}
          bookingId={booking.id}
          teamId={teamId}
          requestedBy={currentUserId}
          onRequestSent={onRefresh}
        />
        <LockedField
          label="Children"
          fieldName="number_of_children"
          currentValue={childrenDisplay}
          displayValue={childrenDisplay}
          bookingId={booking.id}
          teamId={teamId}
          requestedBy={currentUserId}
          onRequestSent={onRefresh}
        />
      </div>

      <LockedField
        label="Total Price"
        fieldName="total_price"
        currentValue={priceDisplay}
        displayValue={priceDisplay}
        bookingId={booking.id}
        teamId={teamId}
        requestedBy={currentUserId}
        onRequestSent={onRefresh}
      />

      <LockedField
        label="Check-out Date"
        fieldName="check_out"
        currentValue={checkOutDisplay}
        displayValue={checkOutDisplay}
        bookingId={booking.id}
        teamId={teamId}
        requestedBy={currentUserId}
        onRequestSent={onRefresh}
      />

      {/* Extend Stay button */}
      <div className="pt-2 border-t border-[#5C4A2E]/30">
        {!showExtendForm ? (
          <button
            onClick={() => setShowExtendForm(true)}
            className="w-full py-2.5 bg-[#0B6E4F]/10 text-[#0B6E4F] text-[10px] font-black uppercase tracking-widest border border-[#0B6E4F]/30 rounded-lg hover:bg-[#0B6E4F]/20 transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Extend Stay
          </button>
        ) : (
          <ExtendStayForm
            booking={booking}
            currentUserId={currentUserId}
            onSuccess={() => {
              setShowExtendForm(false);
              fetchExtensions();
              onRefresh();
            }}
            onCancel={() => setShowExtendForm(false)}
          />
        )}
      </div>

      {/* Extensions history */}
      {!loadingExt && extensions.length > 0 && (
        <div className="pt-2 border-t border-[#5C4A2E]/30 space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#9C9384]">Stay Extensions</p>
          {extensions.map(ext => (
            <div key={ext.id} className="flex items-center gap-2 px-3 py-2 bg-[#0B6E4F]/5 border border-[#0B6E4F]/20 rounded text-xs text-[#9C9384]">
              <span className="text-[#0B6E4F] font-black">+{ext.days_added}d</span>
              <span className="font-mono text-[#EDE6D6]">(+${Number(ext.amount_added).toFixed(2)})</span>
              <span className="flex-1 truncate">
                → {ext.new_check_out}
              </span>
              <span className="text-[9px] opacity-70">
                {ext.profiles?.full_name || 'Staff'} · {new Date(ext.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
