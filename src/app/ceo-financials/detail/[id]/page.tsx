'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { useRouter, useParams } from 'next/navigation';

export default function CEOFinancialDetailPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEOFinancialDetail />
    </ProtectedRoute>
  );
}

function CEOFinancialDetail() {
  const { user, signOut } = useAuth();
  const { t, getLocale } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const financeId = params.id as string;
  
  const [finance, setFinance] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pricing, setPricing] = useState<{ guide_price: number; lunch_price: number; dinner_price: number; night_stay_price: number; laundry_price: number; pricing_enabled: boolean } | null>(null);

  useEffect(() => {
    fetchFinanceDetails();
    fetchPricing();
  }, [financeId]);

  const fetchFinanceDetails = async () => {
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('id', parseInt(financeId));

      if (data && data.length > 0) {
        setFinance(data[0]);
      }
    } catch (error) {
      console.error('Error fetching finance details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    try {
      const { data, error } = await supabase
        .from('service_pricing')
        .select('*')
        .eq('id', 1)
        .single();

      if (data && !error) {
        setPricing(data);
      }
    } catch (error) {
      console.error('Error fetching pricing:', error);
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
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6]">Financial Details</h1>
              <p className="text-xs text-[#C9A227]/80 font-bold tracking-widest uppercase opacity-80">CEO View</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-[#722F37]/90 hover:bg-[#722F37] rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2"
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
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : finance ? (
          <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8 animate-in fade-in duration-500 border border-[#5C4A2E]/30">
            <div className={`p-6 rounded-xl mb-6 ${
              finance.type === 'income' ? 'bg-[#0B6E4F]/10 border-2 border-[#0B6E4F]/30' : 'bg-[#722F37]/10 border-2 border-[#722F37]/30'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${
                    finance.type === 'income' ? 'text-[#0B6E4F]' : 'text-[#722F37]'
                  }`}>
                    {finance.type}
                  </p>
                  <p className="text-3xl font-black text-[#EDE6D6]">
                    {finance.original_amount.toLocaleString()} {finance.currency}
                  </p>
                  <p className="text-sm text-[#9C9384] mt-1">
                    {finance.amount_uzs.toLocaleString('uz-UZ', { minimumFractionDigits: 2 })} UZS
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${
                  finance.type === 'income' ? 'bg-[#0B6E4F]/20' : 'bg-[#722F37]/20'
                }`}>
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {finance.type === 'income' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    )}
                  </svg>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Date</p>
                <p className="text-lg font-semibold text-[#EDE6D6]">{new Date(finance.date).toLocaleDateString(getLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Category</p>
                <p className="text-lg font-semibold text-[#EDE6D6]">{finance.category}</p>
              </div>

              {finance.type === 'income' && finance.guest_name && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Guest Names</p>
                  <p className="text-lg font-semibold text-[#EDE6D6]">{finance.guest_name}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Description</p>
                <p className="text-lg text-[#9C9384]">{finance.description || 'No description'}</p>
              </div>

              {finance.currency !== 'UZS' && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Exchange Rate</p>
                  <p className="text-lg font-semibold text-[#EDE6D6]">{finance.exchange_rate} {finance.currency}/UZS</p>
                </div>
              )}

              {finance.receipt_url && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Receipt</p>
                  <button
                    onClick={() => {
                      setReceiptUrl(finance.receipt_url!);
                      setZoomLevel(1);
                      setReceiptViewerOpen(true);
                    }}
                    className="inline-block px-4 py-2 bg-[#0B6E4F] text-[#C9A227] rounded-xl font-bold hover:bg-[#0B6E4F]/80 transition-all"
                  >
                    View Receipt
                  </button>
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#9C9384] mb-2">Created At</p>
                <p className="text-sm text-[#9C9384]">{new Date(finance.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#1C232E] rounded-2xl shadow-xl p-8">
            <p className="text-center text-[#9C9384]">Financial record not found</p>
          </div>
        )}

        {/* Receipt Viewer Modal */}
        {receiptViewerOpen && receiptUrl && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={() => setReceiptViewerOpen(false)}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 bg-[#1C232E] text-[#C9A227] flex justify-between items-center">
                <h3 className="font-black">Receipt Viewer</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                    className="px-3 py-1 bg-[#2A1518] hover:bg-[#2A1518] rounded-lg font-bold transition-all"
                  >
                    Zoom Out
                  </button>
                  <span className="px-3 py-1 bg-[#0F1419] rounded-lg font-mono">{Math.round(zoomLevel * 100)}%</span>
                  <button
                    onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
                    className="px-3 py-1 bg-[#2A1518] hover:bg-[#2A1518] rounded-lg font-bold transition-all"
                  >
                    Zoom In
                  </button>
                  <button
                    onClick={() => setReceiptViewerOpen(false)}
                    className="ml-4 px-3 py-1 bg-[#722F37] hover:bg-[#722F37]/80 rounded-lg font-bold transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="p-4 bg-[#0F1419] overflow-auto max-h-[calc(90vh-60px)]">
                <div
                  className="inline-block transition-transform duration-200 origin-top-left"
                  style={{ transform: `scale(${zoomLevel})` }}
                >
                  <img src={receiptUrl} alt="Receipt" className="max-w-full shadow-lg" />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
