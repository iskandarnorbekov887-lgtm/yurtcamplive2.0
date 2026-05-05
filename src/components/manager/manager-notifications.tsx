'use client';

import { useState } from 'react';
import { supabase, type Booking, type Notification } from '@/lib/supabase';
import { sendDateChangeResult } from '@/utils/notify';

interface ManagerNotificationsProps {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  bookings: Booking[];
  onUpdateBooking: (id: number, data: Partial<Booking>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

export function ManagerNotifications({
  notifications,
  setNotifications,
  bookings,
  onUpdateBooking,
  onRefresh,
  onClose,
}: ManagerNotificationsProps) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="absolute right-0 top-12 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 max-h-[28rem] overflow-y-auto">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-black text-slate-900">Notifications</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg font-bold">×</button>
      </div>
      {notifications.length === 0 ? (
        <p className="p-6 text-slate-500 text-sm text-center">No notifications</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {(showAll ? notifications : notifications.slice(0, 5)).map((notification) => (
            <div
              key={notification.id}
              className={`p-4 transition-colors ${!notification.read ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
              onClick={async () => {
                if (!notification.read && notification.type !== 'date_change_request') {
                  await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
                  );
                }
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-bold text-slate-900 text-sm">{notification.title}</p>
                  <p className="text-slate-600 text-xs mt-1">{notification.message}</p>
                  {notification.status && (
                    <div
                      className={`inline-block mt-2 px-2 py-1 rounded text-xs font-bold ${
                        notification.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : notification.status === 'rejected'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
                    </div>
                  )}
                  <p className="text-slate-400 text-[10px] mt-2">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
                {notification.status === 'approved' && (
                  <svg className="w-5 h-5 text-emerald-600 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {notification.status === 'rejected' && (
                  <svg className="w-5 h-5 text-rose-600 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>

              {/* Date Change Request: Approve / Reject buttons */}
              {notification.type === 'date_change_request' && !notification.status && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!notification.related_id) return;
                      const bookingId = notification.related_id;
                      const booking = bookings.find((b) => b.id === bookingId);
                      if (!booking) {
                        alert('Booking not found.');
                        return;
                      }

                      try {
                        const res = await fetch('/api/calendar/events', { cache: 'no-store' });
                        const eventsData = await res.json();
                        if ('error' in eventsData) {
                          alert('Failed to fetch calendar.');
                          return;
                        }
                        const gcEvents = eventsData as any[];
                        const linkedEv = gcEvents.find((ev: any) => ev.id === booking.google_event_id);
                        if (!linkedEv) {
                          alert('Calendar event not found.');
                          return;
                        }

                        await onUpdateBooking(bookingId, {
                          check_in: linkedEv.start,
                          check_out: linkedEv.end,
                        });

                        await supabase
                          .from('notifications')
                          .update({ status: 'approved', read: true })
                          .eq('id', notification.id);

                        await sendDateChangeResult(bookingId, booking.guest_name, 'approved', {
                          checkIn: linkedEv.start,
                          checkOut: linkedEv.end,
                        });

                        setNotifications((prev) =>
                          prev.map((n) =>
                            n.id === notification.id ? { ...n, status: 'approved', read: true } : n
                          )
                        );
                        onRefresh();
                      } catch (err) {
                        console.error('Approve date change failed:', err);
                        alert('Failed to approve date change.');
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    Approve
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!notification.related_id) return;
                      const bookingId = notification.related_id;
                      const booking = bookings.find((b) => b.id === bookingId);

                      await supabase
                        .from('notifications')
                        .update({ status: 'rejected', read: true })
                        .eq('id', notification.id);

                      if (booking) {
                        await sendDateChangeResult(bookingId, booking.guest_name, 'rejected', {
                          checkIn: booking.check_in,
                          checkOut: booking.check_out,
                        });
                      }

                      setNotifications((prev) =>
                        prev.map((n) =>
                          n.id === notification.id ? { ...n, status: 'rejected', read: true } : n
                        )
                      );
                    }}
                    className="flex-1 px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-all flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {notifications.length > 5 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 transition-all"
            >
              Show More ({notifications.length - 5} more)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
