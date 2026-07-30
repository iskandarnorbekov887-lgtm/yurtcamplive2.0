'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { useRouter } from 'next/navigation';

export default function WorkersPage() {
  return (
    <ProtectedRoute allowedRoles={['Manager', 'CEO']}>
      <WorkersList />
    </ProtectedRoute>
  );
}

function WorkersList() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  
  const [workers, setWorkers] = useState<{ name: string; totalAmount: number; paymentCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('worker_name, amount_uzs')
        .eq('category', 'workers income')
        .eq('team_id', user?.team_id)
        .not('worker_name', 'is', null);

      if (data) {
        const workerMap = new Map<string, { totalAmount: number; paymentCount: number }>();
        
        data.forEach(payment => {
          const name = payment.worker_name;
          if (name) {
            const current = workerMap.get(name) || { totalAmount: 0, paymentCount: 0 };
            workerMap.set(name, {
              totalAmount: current.totalAmount + (payment.amount_uzs || 0),
              paymentCount: current.paymentCount + 1
            });
          }
        });

        const workersArray = Array.from(workerMap.entries()).map(([name, stats]) => ({
          name,
          totalAmount: stats.totalAmount,
          paymentCount: stats.paymentCount
        })).sort((a, b) => a.name.localeCompare(b.name));

        setWorkers(workersArray);
      }
    } catch (error) {
      console.error('Error fetching workers:', error);
    } finally {
      setLoading(false);
    }
  };

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
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6]">{t('txn.all_workers')}</h1>
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

      <main className="max-w-7xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : workers.length === 0 ? (
          <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 border border-[#5C4A2E]/30">
            <p className="text-center text-[#9C9384]">{t('txn.no_workers_found')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workers.map((worker) => (
              <div
                key={worker.name}
                onClick={() => router.push(`/financials/workers/${encodeURIComponent(worker.name)}`)}
                className="bg-[#1C232E] rounded-2xl shadow-xl p-6 border border-[#5C4A2E]/30 cursor-pointer hover:border-[#0B6E4F] hover:shadow-lg hover:shadow-[#0B6E4F]/20 transition-all animate-in fade-in duration-300"
              >
                <h3 className="text-xl font-black text-[#EDE6D6] mb-4">{worker.name}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-[#9C9384]">{t('txn.total_paid')}</p>
                    <p className="text-lg font-bold text-[#0B6E4F]">{worker.totalAmount.toLocaleString('uz-UZ', { minimumFractionDigits: 2 })} UZS</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-[#9C9384]">{t('txn.payment_count')}</p>
                    <p className="text-lg font-bold text-[#EDE6D6]">{worker.paymentCount}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
