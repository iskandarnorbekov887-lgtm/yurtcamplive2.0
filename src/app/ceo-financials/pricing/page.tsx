'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, isUsingLocalStorage } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function CEOPricingPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO']}>
      <CEOPricing />
    </ProtectedRoute>
  );
}

function CEOPricing() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  
  const [guidePrice, setGuidePrice] = useState('');
  const [lunchPrice, setLunchPrice] = useState('');
  const [dinnerPrice, setDinnerPrice] = useState('');
  const [nightStayPrice, setNightStayPrice] = useState('');
  const [laundryPrice, setLaundryPrice] = useState('');
  const [usdToUzs, setUsdToUzs] = useState('12500');
  const [usdToEur, setUsdToEur] = useState('0.92');
  const [pricingEnabled, setPricingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      if (isUsingLocalStorage) {
        // Use localStorage
        const items = JSON.parse(localStorage.getItem('camp_service_pricing') || '[]');
        const pricing = items.find((item: any) => item.id === 1);

        if (pricing) {
          setGuidePrice(pricing.guide_price?.toString() || '');
          setLunchPrice(pricing.lunch_price?.toString() || '');
          setDinnerPrice(pricing.dinner_price?.toString() || '');
          setNightStayPrice(pricing.night_stay_price?.toString() || '');
          setLaundryPrice(pricing.laundry_price?.toString() || '');
          setUsdToUzs(pricing.usd_to_uzs?.toString() || '12500');
          setUsdToEur(pricing.usd_to_eur?.toString() || '0.92');
          setPricingEnabled(pricing.pricing_enabled || false);
        }
      } else {
        // Use real Supabase
        const { data } = await supabase
          .from('service_pricing')
          .select('*')
          .eq('id', 1);

        if (data && data.length > 0) {
          setGuidePrice(data[0].guide_price?.toString() || '');
          setLunchPrice(data[0].lunch_price?.toString() || '');
          setDinnerPrice(data[0].dinner_price?.toString() || '');
          setNightStayPrice(data[0].night_stay_price?.toString() || '');
          setLaundryPrice(data[0].laundry_price?.toString() || '');
          setUsdToUzs(data[0].usd_to_uzs?.toString() || '12500');
          setUsdToEur(data[0].usd_to_eur?.toString() || '0.92');
          setPricingEnabled(data[0].pricing_enabled || false);
        }
      }
    } catch (error) {
      console.error('Error fetching pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      if (isUsingLocalStorage) {
        // Use localStorage
        const items = JSON.parse(localStorage.getItem('camp_service_pricing') || '[]');
        const existingIndex = items.findIndex((item: any) => item.id === 1);

        if (existingIndex >= 0) {
          // Update existing record
          items[existingIndex] = {
            ...items[existingIndex],
            guide_price: parseFloat(guidePrice) || 0,
            lunch_price: parseFloat(lunchPrice) || 0,
            dinner_price: parseFloat(dinnerPrice) || 0,
            night_stay_price: parseFloat(nightStayPrice) || 0,
            laundry_price: parseFloat(laundryPrice) || 0,
            usd_to_uzs: parseFloat(usdToUzs) || 0,
            usd_to_eur: parseFloat(usdToEur) || 0,
            pricing_enabled: pricingEnabled,
          };
        } else {
          // Insert new record
          items.push({
            id: 1,
            guide_price: parseFloat(guidePrice) || 0,
            lunch_price: parseFloat(lunchPrice) || 0,
            dinner_price: parseFloat(dinnerPrice) || 0,
            night_stay_price: parseFloat(nightStayPrice) || 0,
            laundry_price: parseFloat(laundryPrice) || 0,
            usd_to_uzs: parseFloat(usdToUzs) || 0,
            usd_to_eur: parseFloat(usdToEur) || 0,
            pricing_enabled: pricingEnabled,
          });
        }

        localStorage.setItem('camp_service_pricing', JSON.stringify(items));
      } else {
        // Use real Supabase
        const { data: existing } = await supabase
          .from('service_pricing')
          .select('*')
          .eq('id', 1);

        if (existing && existing.length > 0) {
          // Update existing record
          const { error } = await supabase
            .from('service_pricing')
            .update({
              guide_price: parseFloat(guidePrice) || 0,
              lunch_price: parseFloat(lunchPrice) || 0,
              dinner_price: parseFloat(dinnerPrice) || 0,
              night_stay_price: parseFloat(nightStayPrice) || 0,
              laundry_price: parseFloat(laundryPrice) || 0,
              usd_to_uzs: parseFloat(usdToUzs) || 0,
              usd_to_eur: parseFloat(usdToEur) || 0,
              pricing_enabled: pricingEnabled,
            })
            .eq('id', 1);
          if (error) throw error;
        } else {
          // Insert new record
          const { error } = await supabase
            .from('service_pricing')
            .insert({
              id: 1,
              guide_price: parseFloat(guidePrice) || 0,
              lunch_price: parseFloat(lunchPrice) || 0,
              dinner_price: parseFloat(dinnerPrice) || 0,
              night_stay_price: parseFloat(nightStayPrice) || 0,
              laundry_price: parseFloat(laundryPrice) || 0,
              usd_to_uzs: parseFloat(usdToUzs) || 0,
              usd_to_eur: parseFloat(usdToEur) || 0,
              pricing_enabled: pricingEnabled,
            });
          if (error) throw error;
        }
      }

      setMessage('Pricing saved successfully!');
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-indigo-800 to-purple-900 text-white shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg"
            >
              <svg className="w-8 h-8 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Service Pricing</h1>
              <p className="text-xs text-indigo-300 font-bold tracking-widest uppercase opacity-80">CEO Configuration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
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

      <main className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 animate-in fade-in duration-500">
          <h2 className="text-xl font-black text-slate-800 mb-6">Configure Service Prices</h2>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-indigo-50 rounded-xl border-2 border-indigo-200">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-black text-slate-900">Enable Pricing Calculations</label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pricingEnabled}
                      onChange={(e) => setPricingEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">Enable</span>
                  </label>
                </div>
                <p className="text-xs text-slate-600 mt-2">When enabled, pricing will be used to calculate expected amounts for comparison with actual income.</p>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-900 mb-2">Guide Price (per guide) - USD</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={guidePrice}
                  onChange={(e) => setGuidePrice(e.target.value)}
                  placeholder="Enter guide price in USD"
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-900 mb-2">Lunch Price (per meal) - USD</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lunchPrice}
                  onChange={(e) => setLunchPrice(e.target.value)}
                  placeholder="Enter lunch price in USD"
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-900 mb-2">Dinner Price (per meal) - USD</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={dinnerPrice}
                  onChange={(e) => setDinnerPrice(e.target.value)}
                  placeholder="Enter dinner price in USD"
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-900 mb-2">Night Stay Price (per night) - USD</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nightStayPrice}
                  onChange={(e) => setNightStayPrice(e.target.value)}
                  placeholder="Enter night stay price in USD"
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-900 mb-2">Laundry Price (per load) - USD</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={laundryPrice}
                  onChange={(e) => setLaundryPrice(e.target.value)}
                  placeholder="Enter laundry price in USD"
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-slate-900 font-semibold"
                />
              </div>



              {message && (
                <div className={`p-4 rounded-xl ${message.includes('Error') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'} font-semibold`}>
                  {message}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200"
              >
                {saving ? 'Saving...' : 'Save Pricing'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
