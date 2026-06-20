'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function CEODeletedRecordsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEODeletedRecords />
    </ProtectedRoute>
  );
}

function CEODeletedRecords() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  
  const [deletedRecords, setDeletedRecords] = useState<Finance[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchDeletedRecords();
  }, []);

  const fetchDeletedRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('deleted_records')
        .select('*')
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setDeletedRecords(data || []);
    } catch (error) {
      console.error('Error fetching deleted records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('Are you sure you want to permanently delete this record? This action cannot be undone.')) return;

    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('deleted_records')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setMessage('Record permanently deleted');
      fetchDeletedRecords();
    } catch (error) {
      setMessage('Error deleting record');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1419] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
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
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6]">Deleted Records</h1>
              <p className="text-xs text-[#C9A227]/80 font-bold tracking-widest uppercase opacity-80">CEO View</p>
            </div>
          </div>
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
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {message && (
          <div className={`mb-4 p-4 rounded-xl ${message.includes('Error') ? 'bg-[#722F37]/10 text-[#722F37] border border-[#722F37]/30' : 'bg-[#0B6E4F]/10 text-[#0B6E4F] border border-[#0B6E4F]/30'}`}>
            {message}
          </div>
        )}

        {deletedRecords.length === 0 ? (
          <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 text-center border border-[#5C4A2E]/30">
            <p className="text-[#9C9384] font-semibold">No deleted records found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deletedRecords.map((record) => (
              <div key={record.id} className="bg-[#1C232E] rounded-2xl shadow-xl p-6 border border-[#5C4A2E]/30">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${record.type === 'income' ? 'bg-[#0B6E4F]/20 text-[#0B6E4F]' : 'bg-[#722F37]/20 text-[#722F37]'}`}>
                        {record.type === 'income' ? 'Income' : 'Expense'}
                      </span>
                      <span className="text-xs text-[#9C9384]">{record.date}</span>
                    </div>
                    <h3 className="text-lg font-black text-[#EDE6D6]">
                      {record.type === 'expense' ? record.category : (record.guest_name || 'Income')}
                    </h3>
                    <p className="text-sm text-[#9C9384] mt-1">{record.description || 'No description'}</p>
                    {(record as any).delete_reason && (
                      <div className="mt-2 p-2 bg-[#C9A227]/10 rounded-lg border border-[#C9A227]/30">
                        <p className="text-xs font-bold text-[#C9A227]">Reason for deletion:</p>
                        <p className="text-sm text-[#C9A227]/80">{(record as any).delete_reason}</p>
                      </div>
                    )}
                    <p className={`text-lg font-bold mt-2 ${record.type === 'expense' ? 'text-[#722F37]' : 'text-[#0B6E4F]'}`}>
                      {record.original_amount.toLocaleString()} {record.currency || 'UZS'}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePermanentDelete(record.id)}
                    disabled={deletingId === record.id}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition-all"
                  >
                    {deletingId === record.id ? 'Deleting...' : 'Delete Permanently'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
