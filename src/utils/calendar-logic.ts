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

export const isGcCancelled = (ev: { status?: string | null; colorId?: string | null; summary?: string | null }): boolean => {
  return (
    ev.status === 'cancelled' ||
    ev.colorId === '11' ||
    ev.colorId === '4' ||
    (ev.summary?.toLowerCase() ?? '').includes('cancel')
  );
};

export const sanitizeNotes = (description: string | null | undefined): string => {
  return String(description || '');
};

// Logic helper for approving dates
export async function handleApproveDatesLogic({
  booking,
  gcEvents,
  onUpdateBooking,
  setLoadingAction,
  setSyncWarnings,
  flash,
  onRefresh,
}: {
  booking: any;
  gcEvents: any[];
  onUpdateBooking: (id: number, data: any) => Promise<void> | void;
  setLoadingAction: (val: string) => void;
  setSyncWarnings: (fn: (prev: any) => any) => void;
  flash: (msg: string) => void;
  onRefresh?: () => Promise<void> | void;
}) {
  if (!onUpdateBooking) return;
  const linkedEv = gcEvents.find((e: any) => e.id === booking.google_event_id);
  if (!linkedEv) {
    flash('⚠ Linked calendar event not found.');
    return;
  }
  
  setLoadingAction(`syncdates-${booking.id}`);
  try {
    await onUpdateBooking(booking.id, { 
      check_in: linkedEv.start, 
      check_out: linkedEv.end 
    });
    
    setSyncWarnings((w: any) => {
      const next = { ...w };
      delete next[booking.id];
      return next;
    });
    
    flash('✓ Dates approved from calendar.');
    if (onRefresh) await onRefresh();
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    flash(`⚠ ${msg.slice(0, 100)}`);
  } finally {
    setLoadingAction('');
  }
}
