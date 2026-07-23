'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useParams } from 'next/navigation';

export default function ManagerFinancialDetailPage() {
  return (
    <ProtectedRoute allowedRoles={['Manager']}>
      <ManagerFinancialDetail />
    </ProtectedRoute>
  );
}

function ManagerFinancialDetail() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const financeId = params.id as string;
  
  const [finance, setFinance] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Finance | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [requestingDelete, setRequestingDelete] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    fetchFinanceDetails();
  }, [financeId]);

  const fetchFinanceDetails = async () => {
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('id', parseInt(financeId));

      if (data && data.length > 0) {
        setFinance(data[0]);
        setEditData(data[0]);
      }
    } catch (error) {
      console.error('Error fetching finance details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editData || !user) return;
    
    setSaving(true);
    setMessage('');

    try {
      const { error } = await supabase
        .from('camp_finances')
        .update(editData)
        .eq('id', editData.id);

      if (error) throw error;

      // Send notification to CEO
      try {
        const { data: ceoData } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'CEO')
          .eq('team_id', user?.team_id)
          .single();

        if (ceoData) {
          const notificationType = editData.type === 'income' ? 'income_edit' : 'expense_edit';
          const title = editData.type === 'income' ? 'Income Edited' : 'Expense Edited';
          const message = editData.type === 'income' 
            ? `Manager edited an income: ${editData.guest_name || 'Guest'} - ${editData.original_amount.toLocaleString()} ${editData.currency || 'UZS'}`
            : `Manager edited an expense: ${editData.category} - ${editData.original_amount.toLocaleString()} UZS`;
          
          await supabase.from('notifications').insert({
            user_id: ceoData.id,
            team_id: user?.team_id,
            type: notificationType,
            title: title,
            message: message,
            related_id: editData.id,
          });
        }
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
      }

      setMessage('Record updated successfully! CEO has been notified.');
      setFinance(editData);
      setEditing(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestDelete = () => {
    if (!finance || !user) return;
    setDeleteModalOpen(true);
    setDeleteReason('');
  };

  const handleConfirmDelete = async () => {
    if (!finance || !user || !deleteReason.trim()) {
      setMessage('Please provide a reason for deletion.');
      return;
    }
    
    setRequestingDelete(true);
    setDeleteModalOpen(false);
    setMessage('');

    try {
      // Send notification to CEO to approve/deny deletion
      const { data: ceoData } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'CEO')
        .eq('team_id', user?.team_id)
        .single();

      if (ceoData) {
        const title = finance.type === 'income' ? 'Delete Income Request' : 'Delete Expense Request';
        const message = finance.type === 'income' 
          ? `Manager requested to delete income: ${finance.guest_name || 'Guest'} - ${finance.original_amount.toLocaleString()} ${finance.currency || 'UZS'}. Reason: ${deleteReason}`
          : `Manager requested to delete expense: ${finance.category} - ${finance.original_amount.toLocaleString()} UZS. Reason: ${deleteReason}`;
        
        await supabase.from('notifications').insert({
          user_id: ceoData.id,
          team_id: user?.team_id,
          type: 'delete_request',
          title: title,
          message: message,
          related_id: finance.id,
        });

        setMessage('Delete request sent to CEO for approval.');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setRequestingDelete(false);
      setDeleteReason('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1419] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!finance) {
    return (
      <div className="min-h-screen bg-[#0F1419] flex items-center justify-center">
        <p className="text-[#9C9384]">Record not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1419] font-sans">
      <header className="bg-gradient-to-r from-[#0B6E4F] to-[#0B6E4F]/80 text-[#C9A227] shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl hover:bg-[#0B6E4F]/80 transition-all shadow-lg border border-[#0B6E4F]/40"
            >
              <svg className="w-8 h-8 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6]">
                {finance.type === 'income' ? 'Income' : 'Expense'} Details
              </h1>
              <p className="text-xs text-[#C9A227]/80 font-bold tracking-widest uppercase opacity-80">Manager View</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setEditing(!editing)}
              className="px-5 py-2.5 bg-indigo-600/90 hover:bg-indigo-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={handleRequestDelete}
              disabled={requestingDelete}
              className="px-5 py-2.5 bg-amber-600/90 hover:bg-amber-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-amber-500/20 active:scale-95 disabled:opacity-50"
            >
              {requestingDelete ? 'Requesting...' : 'Request Delete'}
            </button>
            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {message && (
          <div className={`mb-4 p-4 rounded-xl ${
            message.includes('Error') ? 'bg-[#722F37]/10 text-[#722F37] border border-[#722F37]/30' : 'bg-[#0B6E4F]/10 text-[#0B6E4F] border border-[#0B6E4F]/30'
          }`}>
            {message}
          </div>
        )}

        <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 space-y-6 border border-[#5C4A2E]/30">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Date</p>
              <p className="text-lg font-semibold text-[#EDE6D6]">{finance.date}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Type</p>
              <p className={`text-lg font-bold ${finance.type === 'income' ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
                {finance.type === 'income' ? 'Income' : 'Expense'}
              </p>
            </div>
          </div>

          {finance.type === 'expense' ? (
            <>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Category</p>
                {editing ? (
                  <select
                    value={editData?.category || ''}
                    onChange={(e) => setEditData({ ...editData!, category: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                  >
                    <option value="workers income">Workers Income</option>
                    <option value="gas for car">Gas for Car</option>
                    <option value="other expenses">Other Expenses</option>
                  </select>
                ) : (
                  <p className="text-lg font-semibold text-slate-800">{finance.category}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Description</p>
                {editing ? (
                  <textarea
                    value={editData?.description || ''}
                    onChange={(e) => setEditData({ ...editData!, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900"
                  />
                ) : (
                  <p className="text-lg text-slate-700">{finance.description || 'No description'}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Amount (UZS)</p>
                {editing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editData?.original_amount || ''}
                    onChange={(e) => setEditData({ 
                      ...editData!, 
                      original_amount: parseFloat(e.target.value),
                      amount_uzs: parseFloat(e.target.value)
                    })}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                  />
                ) : (
                  <p className="text-lg font-bold text-slate-800">{finance.original_amount.toLocaleString()} UZS</p>
                )}
              </div>
              {finance.receipt_url && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Receipt</p>
                  <button
                    onClick={() => finance.receipt_url && window.open(finance.receipt_url, '_blank')}
                    className="text-blue-600 hover:underline font-bold"
                  >
                    View Receipt
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Income Details */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Guest Name</p>
                {editing ? (
                  <input
                    type="text"
                    value={editData?.guest_name || ''}
                    onChange={(e) => setEditData({ ...editData!, guest_name: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                  />
                ) : (
                  <p className="text-lg font-semibold text-slate-800">{finance.guest_name || 'No guest name'}</p>
                )}
              </div>


              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Description</p>
                {editing ? (
                  <textarea
                    value={editData?.description || ''}
                    onChange={(e) => setEditData({ ...editData!, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900"
                  />
                ) : (
                  <p className="text-lg text-slate-700">{finance.description || 'No description'}</p>
                )}
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Amount ({finance.currency || 'UZS'})</p>
                {editing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editData?.original_amount || ''}
                    onChange={(e) => setEditData({ ...editData!, original_amount: parseFloat(e.target.value) })}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                  />
                ) : (
                  <p className="text-lg font-bold text-slate-800">{finance.original_amount.toLocaleString()} {finance.currency || 'UZS'}</p>
                )}
              </div>

              {finance.currency !== 'UZS' && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Exchange Rate</p>
                  <p className="text-lg font-semibold text-slate-800">{finance.exchange_rate} {finance.currency}/UZS</p>
                </div>
              )}
            </>
          )}

          {editing && (
            <div className="flex gap-3 pt-6 border-t border-slate-200">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditData(finance);
                }}
                className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-all"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Delete Request Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setDeleteModalOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200 border border-[#5C4A2E]/30" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black text-[#EDE6D6] mb-4">Request Deletion</h2>
            <p className="text-sm text-[#9C9384] mb-4">
              Please provide a reason why you want to delete this {finance?.type === 'income' ? 'income' : 'expense'} record.
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Enter reason for deletion..."
              rows={4}
              className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl text-[#EDE6D6] mb-4 focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 bg-[#1C232E] placeholder:text-[#9C9384]"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 py-3 bg-[#1C232E]/50 text-[#9C9384] rounded-xl font-bold hover:bg-[#2A1518] transition-all border border-[#5C4A2E]/30"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!deleteReason.trim() || requestingDelete}
                className="flex-1 py-3 bg-[#722F37] text-[#EDE6D6] rounded-xl font-bold hover:bg-[#722F37]/80 transition-all disabled:opacity-50 border border-[#722F37]/40"
              >
                {requestingDelete ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
