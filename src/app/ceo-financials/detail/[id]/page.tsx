'use client';

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
  const { t } = useLanguage();
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

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Description</p>
                <p className="text-lg text-slate-700">{finance.description || 'No description'}</p>
              </div>

              {finance.currency !== 'UZS' && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Exchange Rate</p>
                  <p className="text-lg font-semibold text-slate-800">{finance.exchange_rate} {finance.currency}/UZS</p>
                </div>
              )}

              {finance.receipt_url && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Receipt</p>
                  <button
                    onClick={() => {
                      setReceiptUrl(finance.receipt_url!);
                      setZoomLevel(1);
                      setReceiptViewerOpen(true);
                    }}
                    className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                  >
                    View Receipt
                  </button>
                </div>
              )}

              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Created At</p>
                <p className="text-sm text-slate-600">{new Date(finance.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <p className="text-center text-slate-500">Financial record not found</p>
          </div>
        )}

        {/* Receipt Viewer Modal */}
        {receiptViewerOpen && receiptUrl && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4" onClick={() => setReceiptViewerOpen(false)}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
                <h3 className="font-black">Receipt Viewer</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition-all"
                  >
                    Zoom Out
                  </button>
                  <span className="px-3 py-1 bg-slate-800 rounded-lg font-mono">{Math.round(zoomLevel * 100)}%</span>
                  <button
                    onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition-all"
                  >
                    Zoom In
                  </button>
                  <button
                    onClick={() => setReceiptViewerOpen(false)}
                    className="ml-4 px-3 py-1 bg-rose-600 hover:bg-rose-700 rounded-lg font-bold transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="p-4 bg-slate-100 overflow-auto max-h-[calc(90vh-60px)]">
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
