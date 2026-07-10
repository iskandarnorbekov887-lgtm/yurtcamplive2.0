'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface EditApprovalQueueProps {
  currentUserId: string;
  onRefresh: () => void;
}

interface PendingRequest {
  id: string;
  booking_id: number;
  field_name: string;
  current_value: string;
  requested_value: string;
  reason: string | null;
  requested_by: string;
  created_at: string;
  bookings?: {
    guest_name: string;
  };
  requested_by_profile?: {
    full_name: string;
  };
}

export function EditApprovalQueue({ currentUserId, onRefresh }: EditApprovalQueueProps) {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('booking_edit_requests')
      .select(`
        *,
        bookings (guest_name),
        requested_by_profile:profiles!booking_edit_requests_requested_by_fkey (full_name)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending requests:', JSON.stringify(error, null, 2));
    } else {
      setRequests((data as PendingRequest[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (request: PendingRequest) => {
    if (!confirm(`Approve changing ${request.field_name} from "${request.current_value}" to "${request.requested_value}"?`)) {
      return;
    }

    setProcessing(request.id);
    try {
      // 1. Update the actual booking field
      const fieldUpdate: Record<string, any> = {};
      
      // Map field_name to actual booking column
      switch (request.field_name) {
        case 'check_out':
          fieldUpdate.check_out = request.requested_value;
          break;
        case 'number_of_adults':
          fieldUpdate.number_of_adults = parseInt(request.requested_value) || 0;
          break;
        case 'number_of_children':
          fieldUpdate.number_of_children = parseInt(request.requested_value) || 0;
          break;
        case 'total_price':
          fieldUpdate.total_price = parseFloat(request.requested_value) || 0;
          break;
        default:
          console.warn('Unknown field_name:', request.field_name);
      }

      if (Object.keys(fieldUpdate).length > 0) {
        const { error: bookingError } = await supabase
          .from('bookings')
          .update(fieldUpdate)
          .eq('id', request.booking_id);

        if (bookingError) throw bookingError;
      }

      // 2. Update the booking_edit_requests row
      const { error: requestError } = await supabase
        .from('booking_edit_requests')
        .update({
          status: 'approved',
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (requestError) throw requestError;

      // Refresh data
      await fetchRequests();
      onRefresh();
    } catch (err: any) {
      alert(`Failed to approve request: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (request: PendingRequest) => {
    if (!confirm(`Reject this edit request?`)) {
      return;
    }

    setProcessing(request.id);
    try {
      const { error } = await supabase
        .from('booking_edit_requests')
        .update({
          status: 'rejected',
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (error) throw error;

      await fetchRequests();
      onRefresh();
    } catch (err: any) {
      alert(`Failed to reject request: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl p-8 text-center">
        <svg className="w-12 h-12 text-[#9C9384] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-[#9C9384] text-sm font-medium">No pending edit requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[#722F37]/20 rounded-lg">
          <svg className="w-5 h-5 text-[#722F37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-black text-[#EDE6D6] uppercase tracking-widest">Pending Edit Requests</h2>
          <p className="text-[#9C9384] text-xs">Review and approve or reject booking field changes</p>
        </div>
      </div>

      {requests.map((request) => (
        <div
          key={request.id}
          className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl p-6 shadow-[2px_2px_0px_0px_rgba(92,74,46,0.2)] space-y-4"
        >
          {/* Header: Guest and Requester */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Guest</p>
              <p className="text-sm font-bold text-[#EDE6D6]">{request.bookings?.guest_name || 'Unknown'}</p>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9384]">Requested By</p>
              <p className="text-sm font-bold text-[#EDE6D6]">{request.requested_by_profile?.full_name || 'Unknown'}</p>
              <p className="text-[9px] text-[#9C9384]">{new Date(request.created_at).toLocaleString()}</p>
            </div>
          </div>

          {/* Field Change */}
          <div className="bg-[#0F1419] border border-[#5C4A2E]/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#C9A227]">Field:</p>
              <p className="text-sm font-bold text-[#EDE6D6]">{request.field_name}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#9C9384]">Current</p>
                <div className="px-3 py-2 bg-[#1C232E] border border-[#5C4A2E]/30 rounded font-mono text-sm text-[#9C9384]">
                  {request.current_value}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#0B6E4F]">Requested</p>
                <div className="px-3 py-2 bg-[#0B6E4F]/10 border border-[#0B6E4F]/30 rounded font-mono text-sm text-[#0B6E4F]">
                  {request.requested_value}
                </div>
              </div>
            </div>

            {request.reason && (
              <div className="pt-2 border-t border-[#5C4A2E]/20">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#9C9384] mb-1">Reason</p>
                <p className="text-xs text-[#EDE6D6] italic">{request.reason}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleApprove(request)}
              disabled={processing === request.id}
              className="flex-1 py-2.5 bg-[#0B6E4F] text-[#C9A227] text-[10px] font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-50 hover:bg-[#0B6E4F]/80 active:scale-95 flex items-center justify-center gap-2"
            >
              {processing === request.id ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                </>
              )}
            </button>
            <button
              onClick={() => handleReject(request)}
              disabled={processing === request.id}
              className="flex-1 py-2.5 bg-[#722F37] text-[#EDE6D6] text-[10px] font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-50 hover:bg-[#722F37]/80 active:scale-95 flex items-center justify-center gap-2"
            >
              {processing === request.id ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#EDE6D6] border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
