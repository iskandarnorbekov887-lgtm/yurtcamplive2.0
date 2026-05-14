/**
 * Calendar Logic Utils for Isky Camp
 * Focus: Stability and Speed
 */



export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const formatSpace = (num: number, decimals = 2): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num).replace(/,/g, ' ');
};

export const isGcCancelled = (ev: any) => {
  return ev.colorId === '11' || ev.status === 'cancelled';
};

export async function handleApproveDatesLogic({ 
  booking, gcEvents, onUpdateBooking, setLoadingAction, setSyncWarnings, flash, onRefresh 
}: any) {
  const ev = gcEvents.find((e: any) => e.id === booking.google_event_id);
  if (!ev) { flash('⚠ Associated Google event not found.'); return; }
  
  setLoadingAction(`syncdates-${booking.id}`);
  try {
    const updates = { check_in: ev.start, check_out: ev.end, is_manual_dates: false };
    if (onUpdateBooking) await onUpdateBooking(booking.id, updates);
    
    // Clear the warning
    setSyncWarnings((prev: any) => {
      const next = { ...prev };
      delete next[booking.id];
      return next;
    });
    
    flash('✓ Dates synchronized with Google Calendar.');
    if (onRefresh) await onRefresh();
  } catch (err) {
    console.error('Sync error:', err);
    flash('⚠ Sync failed.');
  } finally {
    setLoadingAction('');
  }
}

export const sanitizeNotes = (description: string | null | undefined): string => {
  return String(description || '');
};
