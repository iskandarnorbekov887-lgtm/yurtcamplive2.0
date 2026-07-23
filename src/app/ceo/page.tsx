'use client';

import { useEffect, useState, useRef } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Booking, type Profile, type Finance, type Notification, type BookingEditRequest } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useImpersonation } from '@/lib/impersonation-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { GoogleGuestAgenda } from '@/components/google-guest-agenda';
import { ManagerIncomeForm } from '@/components/manager-income-form';
import { ManagerMealRequests } from '@/components/manager/manager-meal-requests';
import { EditApprovalQueue } from '@/components/EditApprovalQueue';
import type { UserRole } from '@/lib/supabase';

// Force dynamic rendering to avoid SSR issues with auth
export const dynamic = 'force-dynamic';

export default function CEOPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEODashboard />
    </ProtectedRoute>
  );
}

function CEODashboard() {
  const { user, session, signOut } = useAuth();
  const { startImpersonating } = useImpersonation();
  console.log('Current User Role:', user?.role);
  const currentUserId = user?.id;
  const teamId = user?.team_id;
  const userRole = user?.role as UserRole;
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<'checkin' | 'team' | 'financials' | 'pricing' | 'meals' | 'approvals'>('checkin');
  const [loading, setLoading] = useState(true);
  const [pendingEditCount, setPendingEditCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', fullName: '', role: 'Manager' as UserRole });
  const [loadingUser, setLoadingUser] = useState(false);
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [selectedBookingDate, setSelectedBookingDate] = useState('');
  const [selectedMealBooking, setSelectedMealBooking] = useState<Booking | null>(null);
  const [managerAccessEnabled, setManagerAccessEnabled] = useState(false);
  const [managerAccessDuration, setManagerAccessDuration] = useState<number | null>(null);


  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isStopping = useRef(false);

  useEffect(() => {
    fetchData();
    // Poll for updates every 15 seconds for real-time sync (safety increase from 5s)
    console.log('⏰ CEO Starting 15-second polling');
    pollInterval.current = setInterval(() => {
      console.log('⏰ CEO Polling...');
      fetchData();
    }, 15000);
    
    // Alert for guests not checked in within 24 hours of check-in date
    checkIntervalRef.current = setInterval(async () => {
      if (isStopping.current) return;
      const now = new Date();
      const { data: confirmedBookings, error } = await supabase.from('bookings').select('*').eq('status', 'confirmed');
      
      if (error?.code === '42501') {
         isStopping.current = true;
         if (pollInterval.current) clearInterval(pollInterval.current);
         if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
         signOut();
         return;
      }

      if (confirmedBookings) {
        for (const booking of confirmedBookings) {
          const checkInDate = new Date(booking.check_in);
          const daysDiff = Math.floor((now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // If check-in date was yesterday (1 day passed) and still not checked in
          if (daysDiff >= 1 && daysDiff <= 2) {
            console.warn('⚠️ Guest not checked in within 24 hours:', booking.guest_name, 'Check-in was:', booking.check_in);
          }
        }
      }
    }, 300000); // Check every 5 minutes (safety increase from 1m)

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, []);

  // Fetch initial team_settings state for manager access toggle
  useEffect(() => {
    const fetchTeamSettings = async () => {
      if (!teamId) return;
      const { data } = await supabase.from('team_settings').select('manager_access').eq('team_id', teamId).maybeSingle();
      if (data?.manager_access) {
        const access = data.manager_access as { enabled: boolean; expires_at: string | null };
        setManagerAccessEnabled(access.enabled);
        if (access.enabled && access.expires_at) {
          const hours = Math.round((new Date(access.expires_at).getTime() - Date.now()) / 3600000);
          setManagerAccessDuration(hours > 0 ? hours : null);
        }
      }
    };
    fetchTeamSettings();
  }, [teamId]);

  const fetchData = async () => {
    if (isStopping.current) return;
    // Safety timeout to prevent dashboard hang
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    try {
      console.log('🔄 Dashboard: Fetching data...');
      const [bookingsData, staffData, notificationsData, pendingEditsData] = await Promise.all([
        supabase.from('bookings').select('*, meal_requests(*)').order('check_in', { ascending: false }),
        supabase.from('profiles').select('*'),
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', currentUserId || '00000000-0000-0000-0000-000000000000')
          .order('created_at', { ascending: false }),
        supabase
          .from('booking_edit_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      // Check for 403 Forbidden errors
      const err403 = [bookingsData, staffData, notificationsData].find(res => res.error?.code === '42501');
      if (err403) {
        console.error('🚫 Dashboard 403 Forbidden detected. Stopping polling and redirecting to login.');
        isStopping.current = true;
        if (pollInterval.current) clearInterval(pollInterval.current);
        if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
        window.location.href = '/login';
        return;
      }

      console.log('✅ Dashboard: Data received!');
      
      const deDuplicate = (arr: any[]) => {
        if (!arr) return [];
        const map = new Map();
        arr.forEach(item => {
          if (item && item.id && !map.has(item.id)) {
            map.set(item.id, item);
          }
        });
        return Array.from(map.values());
      };

      setBookings(deDuplicate(bookingsData.data || []));
      setStaff(staffData.data || []);
      setNotifications((notificationsData.data || []).slice(0, 10) || []);
      setPendingEditCount((pendingEditsData as any)?.count ?? 0);
    } catch (error: any) {
      console.error('Dashboard Fetch error:', error);
      if (error?.code === '42501') {
        if (pollInterval.current) clearInterval(pollInterval.current);
        if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
      clearTimeout(timer);
    }
  };


  const handleUpdateBooking = async (id: number, updates: Partial<Booking>) => {
    const payloadToSave = { ...updates, last_edited_by_role: userRole, last_edited_at: new Date().toISOString() } as any;
    delete payloadToSave.meta;






    delete payloadToSave.last_edited_by_id;
    delete payloadToSave.days;
    console.log('?? [CEO handleUpdateBooking] payload:', payloadToSave);
    
    const { error } = await supabase.from('bookings').update(payloadToSave).eq('id', id);
    if (error) {
      console.error('? [CEO handleUpdateBooking] Bookings update failed:', 
        error.message, 
        error.details, 
        error.hint, 
        error.code
      );
    }
    fetchData();
  };

  const handleCancelBooking = async (id: number) => {
    const payloadToSave = { status: 'cancelled' } as any;
    delete payloadToSave.meta;






    delete payloadToSave.last_edited_by_id;
    delete payloadToSave.days;
    console.log('?? [CEO handleUpdateBooking] payload:', payloadToSave);
    
    const { error } = await supabase.from('bookings').update(payloadToSave).eq('id', id);
    if (error) {
      console.error('? [CEO handleUpdateBooking] Bookings update failed:', 
        error.message, 
        error.details, 
        error.hint, 
        error.code
      );
    }
    fetchData();
  };

  const handleCheckIn = async (id: number) => {
    const payloadToSave = { status: 'checked_in' } as any;
    delete payloadToSave.meta;






    delete payloadToSave.last_edited_by_id;
    delete payloadToSave.days;
    console.log('?? [CEO handleUpdateBooking] payload:', payloadToSave);
    
    const { error } = await supabase.from('bookings').update(payloadToSave).eq('id', id);
    if (error) {
      console.error('? [CEO handleUpdateBooking] Bookings update failed:', 
        error.message, 
        error.details, 
        error.hint, 
        error.code
      );
    }
    fetchData();
  };

  const handleCheckOut = async (id: number) => {
    // First get the booking data
    const { data: booking } = await supabase.from('bookings').select('*').eq('id', id).single();
    if (!booking) return;

    // Create camp_finances record from booking data
    const amountValue = booking.total_price || 0;
    const rateValue = booking.exchange_rate || 1;
    const amountUZS = booking.currency === 'UZS' ? amountValue : amountValue * rateValue;

    await supabase.from('camp_finances').insert([{
      date: booking.check_out,
      type: 'income',
      category: 'Booking',
      currency: booking.currency || 'UZS',
      original_amount: amountValue,
      exchange_rate: rateValue,
      amount_uzs: amountUZS,
      guest_name: booking.guest_name,
      guest_count: (booking.number_of_adults || 0) + (booking.number_of_children || 0) || booking.guest_count,
      children_under_12: 0,
      nights: booking.nights,
      has_guide: booking.has_guide,
      has_transportation: booking.has_transportation,
      transportation_details: booking.transportation_details,
      payment_method: booking.payment_method,
      created_by: booking.created_by_role || 'System',
      team_id: user?.team_id,
    }]);

    // Then mark booking as completed
    const payloadToSave = { status: 'completed' } as any;
    delete payloadToSave.meta;






    delete payloadToSave.last_edited_by_id;
    delete payloadToSave.days;
    console.log('?? [CEO handleUpdateBooking] payload:', payloadToSave);
    
    const { error } = await supabase.from('bookings').update(payloadToSave).eq('id', id);
    if (error) {
      console.error('? [CEO handleUpdateBooking] Bookings update failed:', 
        error.message, 
        error.details, 
        error.hint, 
        error.code
      );
    }
    fetchData();
  };

  const handleAddUser = async () => {
    setLoadingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(newUser)
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        setShowAddUserModal(false);
        setNewUser({ email: '', password: '', fullName: '', role: 'Manager' });
        fetchData();
      }
    } catch (error) {
      alert('Failed to create user');
    } finally {
      setLoadingUser(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setLoadingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          id: editingUser.id,
          fullName: editingUser.full_name,
          role: editingUser.role
        })
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        setShowEditUserModal(false);
        setEditingUser(null);
        fetchData();
      }
    } catch (error) {
      alert('Failed to update user');
    } finally {
      setLoadingUser(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/users?id=${id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        fetchData();
      }
    } catch (error) {
      alert('Failed to delete user');
    }
  };

  const handleToggleBan = async (member: Profile) => {
    const isBanning = member.account_status !== 'banned';
    const action = isBanning ? 'ban' : 'unban';
    
    // Check if this is the last CEO
    if (isBanning && member.role === 'CEO') {
      const ceoCount = staff.filter(s => s.role === 'CEO' && s.account_status !== 'banned').length;
      if (ceoCount <= 1) {
        alert('Cannot ban the last CEO on the team. This would lock everyone out of CEO functions.');
        return;
      }
    }

    if (!confirm(`Are you sure you want to ${action} ${member.full_name || member.email}?${isBanning ? ' They will lose access immediately.' : ''}`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: isBanning ? 'banned' : 'active' })
        .eq('id', member.id);

      if (error) throw error;
      fetchData();
    } catch (error: any) {
      alert(`Failed to ${action} user: ${error.message}`);
    }
  };


  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F1419]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[#EDE6D6] font-medium animate-pulse">Initializing Command Center...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0F1419] text-[#EDE6D6] font-sans">
      <header className="bg-gradient-to-r from-[#0B6E4F] via-[#0B6E4F] to-[#0B6E4F] text-[#C9A227] shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1C232E]/30 rounded-xl backdrop-blur-sm border border-[#5C4A2E]/30">
              <svg className="w-8 h-8 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6] uppercase font-heading">
                {t('portal.ceo')}
              </h1>
              <p className="text-xs text-[#9C9384] font-medium tracking-widest uppercase opacity-80">Isky Camp Executive Flow</p>
            </div>
          </div>
          <div className="flex gap-3">
            <LanguageSwitcher />
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 bg-[#1C232E]/30 rounded-xl backdrop-blur-sm border border-[#5C4A2E]/30 hover:bg-[#1C232E]/50 transition-all relative"
              >
                <svg className="w-6 h-6 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#722F37] text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 bg-[#1C232E] rounded-xl shadow-2xl border border-[#5C4A2E]/30 z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-[#5C4A2E]/30">
                    <h3 className="font-black text-[#EDE6D6]">Notifications</h3>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-4 text-[#9C9384] text-sm">No notifications</p>
                  ) : (
                    <div className="divide-y divide-[#5C4A2E]/20">
                      {(showAllNotifications ? notifications : notifications.slice(0, 5)).map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 ${!notification.read ? 'bg-[#0B6E4F]/10' : ''}`}
                          onClick={async () => {
                            if (!notification.read && notification.type !== 'delete_request') {
                              await supabase.from('notifications').update({ read: true }).eq('id', notification.id);
                              setNotifications(notifications.map(n => n.id === notification.id ? { ...n, read: true } : n));
                            }
                          }}
                        >
                            <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-bold text-[#EDE6D6] text-sm">{notification.title}</p>
                              <p className="text-[#9C9384] text-xs mt-1">{notification.message}</p>
                              {notification.status && (
                                <div className={`inline-block mt-2 px-2 py-1 rounded text-xs font-bold ${
                                  notification.status === 'approved' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' :
                                  (notification.status === 'denied' || notification.status === 'rejected') ? 'bg-[#722F37]/20 text-[#722F37]' :
                                  'bg-[#1C232E]/20 text-[#9C9384]'
                                }`}>
                                  {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
                                </div>
                              )}
                              <p className="text-[#9C9384] text-xs mt-2">{new Date(notification.created_at).toLocaleString()}</p>
                            </div>
                            {notification.status === 'approved' && (
                              <svg className="w-5 h-5 text-[#0B6E4F] ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            {(notification.status === 'denied' || notification.status === 'rejected') && (
                              <svg className="w-5 h-5 text-[#722F37] ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </div>
                          {notification.type === 'delete_request' && notification.status !== 'approved' && notification.status !== 'denied' && (
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!notification.related_id) return;
                                  
                                  try {
                                    // Get the record from camp_finances
                                    const { data: record } = await supabase
                                      .from('camp_finances')
                                      .select('*')
                                      .eq('id', notification.related_id)
                                      .single();
                                    
                                    // Get Manager who requested the delete
                                    const { data: managerData } = await supabase
                                      .from('profiles')
                                      .select('id')
                                      .eq('role', 'Manager')
                                      .eq('team_id', user?.team_id)
                                      .single();
                                    
                                    if (record) {
                                      // Extract reason from notification message
                                      const reasonMatch = notification.message.match(/Reason: (.+)$/);
                                      const deleteReason = reasonMatch ? reasonMatch[1] : '';
                                      
                                      // Insert into deleted_records
                                      await supabase.from('deleted_records').insert({
                                        id: record.id,
                                        original_id: record.id,
                                        type: record.type,
                                        date: record.date,
                                        category: record.category,
                                        description: record.description,
                                        original_amount: record.original_amount,
                                        amount_uzs: record.amount_uzs,
                                        currency: record.currency,
                                        exchange_rate: record.exchange_rate,
                                        guest_name: record.guest_name,
                                        guest_count: record.guest_count,
                                        children_under_12: record.children_under_12,
                                        nights: record.nights,
                                        payment_method: record.payment_method,
                                        guide_service: record.guide_service,
                                        guide_names: record.guide_names,
                                        transportation: record.transportation,
                                        transportation_details: record.transportation_details,
                                        receipt_url: record.receipt_url,
                                        delete_reason: deleteReason,
                                        deleted_by: 'Manager',
                                      });
                                      
                                      // Delete from camp_finances
                                      await supabase.from('camp_finances').delete().eq('id', notification.related_id);
                                    }
                                    
                                    // Update notification status to approved
                                    await supabase.from('notifications').update({ status: 'approved', read: true }).eq('id', notification.id);
                                    
                                    // Send notification to Manager
                                    if (managerData) {
                                      await supabase.from('notifications').insert({
                                        user_id: managerData.id,
                                        team_id: user?.team_id,
                                        type: 'delete_approved',
                                        title: 'Delete Request Approved',
                                        message: `Your delete request has been approved by the CEO.`,
                                        related_id: notification.related_id,
                                      });
                                    }
                                    
                                    setNotifications(notifications.map(n => n.id === notification.id ? { ...n, status: 'approved', read: true } : n));
                                  } catch (err) {
                                    console.error('Error approving delete:', err);
                                  }
                                }}
                                className="px-3 py-1 bg-[#0B6E4F] text-[#C9A227] rounded-lg text-xs font-bold hover:bg-[#0B6E4F] transition-all"
                              >
                                Approve
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  
                                  // Get Manager who requested the delete
                                  const { data: managerData } = await supabase
                                    .from('profiles')
                                    .select('id')
                                    .eq('role', 'Manager')
                                    .eq('team_id', user?.team_id)
                                    .single();
                                  
                                  // Update notification status to denied
                                  await supabase.from('notifications').update({ status: 'denied', read: true }).eq('id', notification.id);
                                  
                                  // Send notification to Manager
                                  if (managerData) {
                                    await supabase.from('notifications').insert({
                                      user_id: managerData.id,
                                      team_id: user?.team_id,
                                      type: 'delete_denied',
                                      title: 'Delete Request Denied',
                                      message: `Your delete request has been denied by the CEO.`,
                                      related_id: notification.related_id,
                                    });
                                  }
                                  
                                  setNotifications(notifications.map(n => n.id === notification.id ? { ...n, status: 'denied', read: true } : n));
                                }}
                                className="px-3 py-1 bg-[#722F37] text-[#C9A227] rounded-lg text-xs font-bold hover:bg-[#722F37] transition-all"
                              >
                                Deny
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {notifications.length > 5 && !showAllNotifications && (
                        <button
                          onClick={() => setShowAllNotifications(true)}
                          className="w-full py-3 text-sm font-medium text-[#0B6E4F] hover:bg-[#0B6E4F]/10 transition-all"
                        >
                          Show More ({notifications.length - 5} more)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={signOut} className="px-5 py-2.5 bg-[#722F37]/90 hover:bg-[#722F37] rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-[#722F37]/20 active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        <div className="flex bg-[#1C232E] p-1 rounded-lg mb-8 border border-[#5C4A2E]/30 shadow-lg w-fit">
          {(['checkin', 'team', 'financials', 'meals'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-lg font-bold capitalize transition-all text-xs flex items-center gap-2 ${
                activeTab === tab ? 'bg-[#0B6E4F] text-[#C9A227] shadow-lg' : 'text-[#9C9384] hover:text-[#EDE6D6] hover:bg-[#2A1518]'
              }`}
            >
              {tab === 'meals' ? '🍽️ Meals' : t(`tab.${tab}`)}
            </button>
          ))}
          <button
            key="pricing"
            onClick={() => setActiveTab('pricing')}
            className={`px-6 py-2.5 rounded-lg font-bold capitalize transition-all text-xs flex items-center gap-2 ${
              activeTab === 'pricing' ? 'bg-[#0B6E4F] text-[#C9A227] shadow-lg' : 'text-[#9C9384] hover:text-[#EDE6D6] hover:bg-[#2A1518]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Pricing Settings
          </button>
          {/* Edit Approvals tab — shows pending count badge */}
          <button
            key="approvals"
            onClick={() => setActiveTab('approvals')}
            className={`px-6 py-2.5 rounded-lg font-bold capitalize transition-all text-xs flex items-center gap-2 ${
              activeTab === 'approvals' ? 'bg-[#722F37] text-[#EDE6D6] shadow-lg' : 'text-[#9C9384] hover:text-[#EDE6D6] hover:bg-[#2A1518]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Edit Approvals
            {pendingEditCount > 0 && (
              <span className="ml-1 w-5 h-5 bg-[#722F37] text-white text-[9px] font-black rounded-full flex items-center justify-center border border-[#EDE6D6]/20">
                {pendingEditCount}
              </span>
            )}
          </button>
          {/* Team Settings — navigates to its own CEO-only page */}
          <a
            href="/ceo/team-settings"
            className="px-6 py-2.5 rounded-lg font-bold capitalize transition-all text-xs flex items-center gap-2 text-[#9C9384] hover:text-[#EDE6D6] hover:bg-[#2A1518]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Team Settings
          </a>
        </div>

        {activeTab === 'checkin' && (
          <div className="animate-in fade-in duration-500">
            <GoogleGuestAgenda
              bookings={bookings}
              userRole={userRole}
              currentUserId={currentUserId}
              teamId={teamId}
              onCancelBooking={handleCancelBooking}
              onCheckIn={handleCheckIn}
              onCheckOut={handleCheckOut}
              onUpdateBooking={handleUpdateBooking}
              onAddNewBooking={(data: Partial<Booking>) => {
                setSelectedBookingDate((data as any).check_in || '');
                setShowAddBookingModal(true);
              }}
              onRefresh={fetchData}
            />
          </div>
        )}
        {activeTab === 'approvals' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <EditApprovalQueue
              currentUserId={currentUserId || ''}
              onRefresh={() => { fetchData(); }}
            />
          </div>
        )}
        {activeTab === 'financials' && (
          <div className="bg-[#1C232E] rounded-[2.5rem] shadow-xl border border-[#5C4A2E]/30 p-8 animate-in fade-in duration-500">
            <h2 className="text-2xl font-black text-[#EDE6D6] mb-4 font-heading">Financial Calendar</h2>
            <p className="text-[#9C9384] mb-6">View income and expenses by date. Click on any day to see details.</p>
            <a
              href="/ceo-financials"
              className="inline-block px-6 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-[#0B6E4F] transition-all shadow-lg"
            >
              Go to Financial Calendar
            </a>
          </div>
        )}
        {activeTab === 'team' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-[#1C232E] rounded-xl shadow-lg border border-[#5C4A2E]/30 p-6">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-[#0B6E4F]">
                  Manager Access to Closed Tabs (CEO Only)
                </label>
                <button
                  onClick={async () => {
                    const newValue = !managerAccessEnabled;
                    setManagerAccessEnabled(newValue);
                    if (!newValue) {
                      // Turning OFF: read current row, preserve expires_at, only flip enabled to false
                      const { data } = await supabase.from('team_settings').select('manager_access').eq('team_id', teamId).maybeSingle();
                      if (data?.manager_access) {
                        const current = data.manager_access as { enabled: boolean; expires_at: string | null };
                        await supabase.from('team_settings').upsert({
                          team_id: teamId,
                          manager_access: { enabled: false, expires_at: current.expires_at }
                        });
                      }
                    }
                    // Turning ON: do nothing, just reveal duration buttons
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    managerAccessEnabled ? 'bg-[#0B6E4F]' : 'bg-[#5C4A2E]'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      managerAccessEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {managerAccessEnabled && (
                <div className="flex gap-2">
                  {[2, 12].map(hrs => (
                    <button
                      key={hrs}
                      onClick={async () => {
                        setManagerAccessDuration(hrs);
                        const expiresAt = new Date(Date.now() + hrs * 3600000).toISOString();
                        await supabase.from('team_settings').upsert({
                          team_id: teamId,
                          manager_access: { enabled: true, expires_at: expiresAt }
                        });
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-black transition-all ${
                        managerAccessDuration === hrs
                          ? 'bg-[#0B6E4F] text-[#C9A227] border-2 border-[#0B6E4F]'
                          : 'bg-[#1C232E] text-[#EDE6D6] border-2 border-[#5C4A2E]/30 hover:border-[#0B6E4F]'
                      }`}
                    >
                      {hrs}h
                    </button>
                  ))}
                </div>
              )}
            </div>
             <div className="bg-[#1C232E] rounded-xl shadow-lg border border-[#5C4A2E]/30 overflow-hidden">
              <div className="p-8 border-b border-[#5C4A2E]/30 bg-gradient-to-r from-[#1C232E]/50 to-[#1C232E] flex justify-between items-center">
                <h3 className="text-xl font-black text-[#EDE6D6] flex items-center gap-3 font-heading">
                  <span className="p-2 bg-[#0B6E4F]/20 text-[#0B6E4F] rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  </span>
                  Operational Taskforce
                </h3>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="px-4 py-2.5 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold text-xs hover:bg-[#0B6E4F] transition-all shadow-lg flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add Staff Member
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#1C232E]/50 border-b border-[#5C4A2E]/30">
                    <tr>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-[#9C9384] uppercase tracking-widest">{t('table.name')}</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-[#9C9384] uppercase tracking-widest">{t('table.email')}</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-[#9C9384] uppercase tracking-widest">{t('table.role')}</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#5C4A2E]/20">
                    {staff.map((member) => (
                      <tr 
                        key={member.id} 
                        className={`hover:bg-[#2A1518] transition-colors group ${
                          member.account_status === 'banned' ? 'opacity-50 bg-[#1C232E]/30' : ''
                        }`}
                      >
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold border ${
                              member.account_status === 'banned' 
                                ? 'bg-[#5C4A2E]/20 text-[#5C4A2E] border-[#5C4A2E]/30' 
                                : 'bg-[#0B6E4F]/20 text-[#0B6E4F] border-[#0B6E4F]/40'
                            }`}>
                              {member.full_name?.charAt(0) || 'N'}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#EDE6D6]">{member.full_name || 'N/A'}</span>
                              {member.account_status === 'banned' && (
                                <span className="px-2 py-0.5 bg-[#722F37] text-white text-[8px] font-black uppercase tracking-widest rounded">
                                  BANNED
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 font-medium text-[#9C9384]">{member.email}</td>
                        <td className="px-8 py-5">
                          <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase shadow-lg ${
                            member.role === 'CEO' ? 'bg-[#0B6E4F] text-[#C9A227]' :
                            member.role === 'Manager' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' :
                            member.role === 'Cook' ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingUser(member);
                                setShowEditUserModal(true);
                              }}
                              className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            {member.id !== currentUserId && member.account_status !== 'banned' && (
                              <button
                                onClick={() => startImpersonating({
                                  id: member.id,
                                  role: member.role,
                                  full_name: member.full_name || member.email
                                })}
                                className="p-2 bg-[#C9A227]/20 text-[#C9A227] rounded-lg hover:bg-[#C9A227]/30 transition-all"
                                title="Assume Position"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              </button>
                            )}
                            {member.id !== currentUserId && (
                              <button
                                onClick={() => handleToggleBan(member)}
                                className={`p-2 rounded-lg transition-all ${
                                  member.account_status === 'banned'
                                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                    : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                                }`}
                                title={member.account_status === 'banned' ? 'Unban' : 'Ban'}
                              >
                                {member.account_status === 'banned' ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                )}
                              </button>
                            )}
                            {member.id !== currentUserId && (
                              <button
                                onClick={() => handleDeleteUser(member.id)}
                                className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'pricing' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PricingSettings />
          </div>
        )}
      </main>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-[#0F1419]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1C232E] rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in duration-200 border border-[#5C4A2E]/30">
            <h3 className="text-xl font-black text-[#EDE6D6] mb-6">Add Team Member</h3>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Full Name" 
                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl focus:ring-2 focus:ring-[#0B6E4F] outline-none text-[#EDE6D6] placeholder:text-[#9C9384]"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
              />
              <input 
                type="email" 
                placeholder="Email Address" 
                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl focus:ring-2 focus:ring-[#0B6E4F] outline-none text-[#EDE6D6] placeholder:text-[#9C9384]"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input 
                type="password" 
                placeholder="Password" 
                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl focus:ring-2 focus:ring-[#0B6E4F] outline-none text-[#EDE6D6] placeholder:text-[#9C9384]"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <select 
                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl focus:ring-2 focus:ring-[#0B6E4F] outline-none text-[#EDE6D6]"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
              >
                <option value="Manager">Manager</option>
                <option value="Cook">Cook</option>
                <option value="CEO">CEO</option>
              </select>
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowAddUserModal(false)}
                className="flex-1 py-3 border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6] hover:bg-[#2A1518] transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddUser}
                disabled={loadingUser}
                className="flex-1 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold hover:bg-[#0B6E4F]/80 shadow-sm transition-all disabled:opacity-50 border border-[#0B6E4F]/40"
              >
                {loadingUser ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && editingUser && (
        <div className="fixed inset-0 bg-[#0F1419]/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1C232E] rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in duration-200 border border-[#5C4A2E]/30">
            <h3 className="text-xl font-black text-[#EDE6D6] mb-6">Edit Team Member</h3>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Full Name" 
                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl focus:ring-2 focus:ring-[#0B6E4F] outline-none text-[#EDE6D6] placeholder:text-[#9C9384]"
                value={editingUser.full_name || ''}
                onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
              />
              <select 
                className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl focus:ring-2 focus:ring-[#0B6E4F] outline-none text-[#EDE6D6]"
                value={editingUser.role}
                onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
              >
                <option value="Manager">Manager</option>
                <option value="Cook">Cook</option>
                <option value="CEO">CEO</option>
              </select>
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowEditUserModal(false)}
                className="flex-1 py-3 border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6] hover:bg-[#2A1518] transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateUser}
                disabled={loadingUser}
                className="flex-1 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold hover:bg-[#0B6E4F]/80 shadow-sm transition-all disabled:opacity-50 border border-[#0B6E4F]/40"
              >
                {loadingUser ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

        {activeTab === 'meals' && (
          <div className="animate-in fade-in duration-500 space-y-6">
            <div className="bg-[#1C232E] rounded-[2.5rem] shadow-xl shadow-[#5C4A2E]/30 border border-[#5C4A2E]/30 p-8">
              <h2 className="text-2xl font-black text-[#EDE6D6] mb-6 flex items-center gap-3">
                <span className="p-2 bg-[#C9A227]/20 text-[#C9A227] rounded-xl">🍽️</span>
                Active Stays — Meal Requests
              </h2>
              {(() => {
                const activeBookings = bookings.filter(b => b.status === 'checked_in' || b.status === 'confirmed');
                if (activeBookings.length === 0) {
                  return <p className="text-[#9C9384]">No active stays</p>;
                }
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {activeBookings.map((booking) => {
                      const meals = booking.meal_requests || [];
                      const pendingMeals = meals.filter(m => m.status === 'Pending').length;
                      const acceptedMeals = meals.filter(m => m.status === 'Accepted').length;
                      const servedMeals = meals.filter(m => m.status === 'Served').length;
                      return (
                        <div key={booking.id} className="border-2 border-[#5C4A2E]/30 rounded-2xl p-5 bg-[#1C232E] hover:border-[#C9A227]/50 transition-all">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-[#EDE6D6]">{booking.guest_name}</p>
                              <p className="text-sm text-[#9C9384]">{booking.check_in} → {booking.check_out}</p>
                              <p className="text-sm text-[#9C9384]">{(booking.number_of_adults || 0) + (booking.number_of_children || 0) || booking.guest_count || 1} guests</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              booking.status === 'checked_in' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' : 'bg-[#C9A227]/20 text-[#C9A227]'
                            }`}>
                              {booking.status === 'checked_in' ? 'Checked In' : 'Upcoming'}
                            </span>
                          </div>
                          {meals.length > 0 && (
                            <div className="flex gap-4 mt-4 text-xs font-black uppercase tracking-wider">
                              <span className="text-[#722F37] bg-[#722F37]/10 px-2 py-1 rounded-lg">{pendingMeals} Pending</span>
                              <span className="text-[#0B6E4F] bg-[#0B6E4F]/10 px-2 py-1 rounded-lg">{acceptedMeals} Accepted</span>
                              <span className="text-[#9C9384] bg-[#1C232E]/50 px-2 py-1 rounded-lg">{servedMeals} Served</span>
                            </div>
                          )}
                          <button
                            onClick={() => setSelectedMealBooking(booking)}
                            className="w-full mt-4 bg-[#C9A227] text-[#1C232E] py-2.5 rounded-xl hover:bg-[#C9A227]/80 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-[#C9A227]/20 active:scale-95"
                          >
                            {meals.length > 0 ? 'Edit Meal Requests' : 'Request Food'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      <ManagerMealRequests
        booking={selectedMealBooking}
        onClose={() => setSelectedMealBooking(null)}
        onSent={fetchData}
        teamId={teamId}
        userRole={user?.role}
      />

      <ManagerIncomeForm
        isOpen={showAddBookingModal}
        onClose={() => setShowAddBookingModal(false)}
        selectedDate={selectedBookingDate}
        onSuccess={() => {
          setShowAddBookingModal(false);
          fetchData();
        }}
      />
    </div>
  );
}
function PricingSettings() {
  const [pricing, setPricing] = useState({
    lunch_price: 10,
    lunch_child_price: 5,
    dinner_price: 10,
    dinner_child_price: 5,
    guide_price: 40,
    usd_to_uzs: 12500,
    usd_to_eur: 0.92
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchPricing = async () => {
      const { data } = await supabase.from('service_pricing').select('*').eq('id', 1);
      if (data && data.length > 0) setPricing({ ...pricing, ...data[0] });
    };
    fetchPricing();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('service_pricing').upsert({ id: 1, ...pricing });
    setSaving(false);
    if (!error) {
      setMessage('Pricing updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  return (
    <div className="bg-[#1C232E] rounded-[2.5rem] shadow-xl shadow-[#5C4A2E]/30 border border-[#5C4A2E]/30 overflow-hidden max-w-2xl mx-auto">
      <div className="p-8 border-b border-[#5C4A2E]/30 bg-gradient-to-r from-[#0B6E4F] to-[#0B6E4F]/80 text-[#C9A227]">
        <h3 className="text-xl font-black flex items-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m10 4a2 2 0 100-4m0 4a2 2 0 110-4M6 20v-2m0 0V12m0 0V8m12 12v-2m0 0V12m0 0V8m-6 8v-2" /></svg>
          Global Pricing Configuration
        </h3>
        <p className="text-[#C9A227]/80 text-xs mt-1 font-bold uppercase tracking-widest">Set official rates for all accounts</p>
      </div>
      
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Lunch Price - Adults (USD)</label>
            <input type="number" value={pricing.lunch_price} onChange={e => setPricing({...pricing, lunch_price: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Lunch Price - Children (USD)</label>
            <input type="number" value={pricing.lunch_child_price} onChange={e => setPricing({...pricing, lunch_child_price: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Dinner Price - Adults (USD)</label>
            <input type="number" value={pricing.dinner_price} onChange={e => setPricing({...pricing, dinner_price: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Dinner Price - Children (USD)</label>
            <input type="number" value={pricing.dinner_child_price} onChange={e => setPricing({...pricing, dinner_child_price: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Guide Service (USD / Guide)</label>
          <input type="number" value={pricing.guide_price} onChange={e => setPricing({...pricing, guide_price: parseFloat(e.target.value) || 0})}
            className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
        </div>

        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-[#5C4A2E]/30">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Exchange: 1 USD to UZS</label>
            <input type="number" value={pricing.usd_to_uzs} onChange={e => setPricing({...pricing, usd_to_uzs: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Exchange: 1 USD to EUR</label>
            <input type="number" value={pricing.usd_to_eur} onChange={e => setPricing({...pricing, usd_to_eur: parseFloat(e.target.value) || 0})}
              className="w-full px-4 py-3 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl font-black text-[#EDE6D6] focus:border-[#0B6E4F] outline-none transition-all" />
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold uppercase tracking-widest text-xs hover:bg-[#0B6E4F]/80 transition-all shadow-sm disabled:opacity-50 active:scale-95 mt-4 border border-[#0B6E4F]/40"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        
        {message && (
          <p className="text-center text-[#0B6E4F] font-bold text-sm animate-bounce mt-4">{message}</p>
        )}
      </div>
    </div>
  );
}
