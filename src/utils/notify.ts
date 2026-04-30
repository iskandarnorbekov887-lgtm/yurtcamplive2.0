/**
 * Notification helpers for Isky Camp Flow
 * Sends role-targeted notifications via the Supabase `notifications` table.
 */

import { supabase } from '@/lib/supabase';

/**
 * Send a date-change notification to all Manager users.
 * Called automatically when the sync worker detects calendar dates ≠ DB dates.
 */
export async function sendDateChangeNotification(
  bookingId: number,
  guestName: string,
  oldDates: { checkIn: string; checkOut: string },
  newDates: { checkIn: string; checkOut: string }
) {
  try {
    // Get all Manager profiles
    const { data: managers } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'Manager');

    if (!managers || managers.length === 0) return;

    for (const mgr of managers) {
      // Check if we already sent a notification for this booking to this manager
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', mgr.id)
        .eq('type', 'date_change_request')
        .eq('related_id', bookingId)
        .is('status', null)
        .limit(1);

      if (existing && existing.length > 0) continue; // Already notified, skip

      await supabase.from('notifications').insert({
        user_id: mgr.id,
        type: 'date_change_request',
        title: '📅 Date Change Request',
        message: `${guestName}: ${oldDates.checkIn} → ${oldDates.checkOut} ➜ ${newDates.checkIn} → ${newDates.checkOut}`,
        related_id: bookingId,
        read: false,
      });
    }
  } catch (err) {
    console.error('Failed to send date change notification:', err);
  }
}

/**
 * Send a date-change result notification to all CEO users.
 * Called after a Manager approves or rejects a date change.
 */
export async function sendDateChangeResult(
  bookingId: number,
  guestName: string,
  status: 'approved' | 'rejected',
  newDates: { checkIn: string; checkOut: string }
) {
  try {
    // Get all CEO profiles
    const { data: ceos } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'CEO');

    if (!ceos || ceos.length === 0) return;

    const emoji = status === 'approved' ? '✓' : '✕';
    const label = status === 'approved' ? 'Approved' : 'Rejected';

    for (const ceo of ceos) {
      await supabase.from('notifications').insert({
        user_id: ceo.id,
        type: 'date_change_result',
        title: `${emoji} Date Change ${label}`,
        message: `Manager ${label.toLowerCase()} date change for ${guestName}: ${newDates.checkIn} → ${newDates.checkOut}`,
        related_id: bookingId,
        status,
        read: false,
      });
    }

    // Also mark the original request notification as resolved
    const { data: managers } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'Manager');

    if (managers) {
      for (const mgr of managers) {
        await supabase
          .from('notifications')
          .update({ status, read: true })
          .eq('user_id', mgr.id)
          .eq('type', 'date_change_request')
          .eq('related_id', bookingId)
          .is('status', null);
      }
    }
  } catch (err) {
    console.error('Failed to send date change result notification:', err);
  }
}
