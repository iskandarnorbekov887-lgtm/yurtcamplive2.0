'use client';

import { useState } from 'react';
import { supabase, type Booking, type Notification } from '@/lib/supabase';

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
    <div className="absolute right-0 top-12 w-96 bg-[#1C232E] rounded-2xl shadow-2xl border border-[#5C4A2E]/30 z-50 max-h-[28rem] overflow-y-auto">
      <div className="p-4 border-b border-[#5C4A2E]/30 flex items-center justify-between">
        <h3 className="font-black text-[#EDE6D6] font-heading">Notifications</h3>
        <button onClick={onClose} className="text-[#9C9384] hover:text-[#EDE6D6] text-lg font-bold">×</button>
      </div>
      {notifications.length === 0 ? (
        <p className="p-6 text-[#9C9384] text-sm text-center">No notifications</p>
      ) : (
        <div className="divide-y divide-[#5C4A2E]/20">
          {(showAll ? notifications : notifications.slice(0, 5)).map((notification) => (
            <div
              key={notification.id}
              className={`p-4 transition-colors ${!notification.read ? 'bg-[#0B6E4F]/20' : 'hover:bg-[#2A1518]'}`}
              onClick={async () => {
                if (!notification.read) {
                  await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
                  setNotifications((prev) =>
                    prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
                  );
                }
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-bold text-[#EDE6D6] text-sm">{notification.title}</p>
                  <p className="text-[#9C9384] text-xs mt-1">{notification.message}</p>
                  {notification.status && (
                    <div
                      className={`inline-block mt-2 px-2 py-1 rounded text-xs font-bold ${
                        notification.status === 'approved'
                          ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]'
                          : notification.status === 'rejected'
                          ? 'bg-[#722F37]/20 text-[#722F37]'
                          : 'bg-[#1C232E]/20 text-[#9C9384]'
                      }`}
                    >
                      {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
                    </div>
                  )}
                  <p className="text-[#9C9384] text-[10px] mt-2">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
                {notification.status === 'approved' && (
                  <svg className="w-5 h-5 text-[#0B6E4F] ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {notification.status === 'rejected' && (
                  <svg className="w-5 h-5 text-[#722F37] ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
            </div>
          ))}
          {notifications.length > 5 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-sm font-bold text-[#0B6E4F] hover:bg-[#0B6E4F]/10 transition-all"
            >
              Show More ({notifications.length - 5} more)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
