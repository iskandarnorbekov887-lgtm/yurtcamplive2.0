'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { useRouter, useParams } from 'next/navigation';

export default function WorkerDetailPage() {
  return (
    <ProtectedRoute allowedRoles={['Manager', 'CEO']}>
      <WorkerDetail />
    </ProtectedRoute>
  );
}

function WorkerDetail() {
  const { user, signOut } = useAuth();
  const { t, getLocale } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const workerName = decodeURIComponent(params.name as string);
  
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkerPayments();
  }, [workerName]);

  const fetchWorkerPayments = async () => {
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('category', 'workers income')
        .eq('worker_name', workerName)
        .eq('team_id', user?.team_id)
        .order('period_start', { ascending: false, nullsFirst: false });

      if (data) {
        setPayments(data);
      }
    } catch (error) {
      console.error('Error fetching worker payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount_uzs || 0), 0);

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
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6]">{workerName}</h1>
              <p className="text-xs text-[#C9A227]/80 font-bold tracking-widest uppercase opacity-80">{user?.role === 'CEO' ? 'CEO View' : 'Manager View'}</p>
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

      <main className="max-w-4xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {/* Total Paid Card */}
            <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 border border-[#5C4A2E]/30 mb-6 animate-in fade-in duration-300">
              <h2 className="text-lg font-black text-[#9C9384] uppercase tracking-widest mb-4">{t('txn.total_paid')}</h2>
              <p className="text-4xl font-black text-[#0B6E4F]">{totalPaid.toLocaleString('uz-UZ', { minimumFractionDigits: 2 })} UZS</p>
              <p className="text-sm text-[#9C9384] mt-2">{payments.length} {t('txn.payment_count')}</p>
            </div>

            {/* Payment History */}
            <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-8 animate-in fade-in duration-300">
              <h2 className="text-2xl font-black text-[#EDE6D6] mb-6">{t('txn.payment_history')}</h2>
              
              {payments.length === 0 ? (
                <p className="text-center text-[#9C9384]">{t('txn.no_payments_found')}</p>
              ) : (
                <div className="space-y-4">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      onClick={() => router.push(`/financials/detail/${payment.id}`)}
                      className="bg-[#0F1419] rounded-xl p-6 border border-[#5C4A2E]/30 cursor-pointer hover:border-[#0B6E4F] hover:shadow-md transition-all"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm text-[#9C9384] mb-1">
                            {payment.period_start && payment.period_end
                              ? `${payment.period_start} – ${payment.period_end}`
                              : payment.transaction_date || payment.date
                            }
                          </p>
                          <p className="text-lg font-black text-[#EDE6D6]">
                            {payment.original_amount.toLocaleString()} {payment.currency || 'UZS'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-[#0B6E4F]">
                            {payment.amount_uzs.toLocaleString('uz-UZ', { minimumFractionDigits: 2 })} UZS
                          </p>
                        </div>
                      </div>
                      {payment.description && (
                        <p className="text-sm text-[#9C9384]">{payment.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
