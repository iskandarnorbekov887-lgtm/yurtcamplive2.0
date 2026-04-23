'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function FinancialsPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO', 'Manager']}>
      <FinancialsDashboard />
    </ProtectedRoute>
  );
}

function FinancialsDashboard() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [currency, setCurrency] = useState<'UZS' | 'USD' | 'EUR'>('UZS');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [loadingRate, setLoadingRate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  
  // Income fields
  const [guestName, setGuestName] = useState('');
  const [description, setDescription] = useState('');
  
  // Expense fields
  const [itemsBought, setItemsBought] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  
  // Common fields
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Calculate total in UZS
  const totalUZS = amount && parseFloat(amount) * exchangeRate;

  // Fetch exchange rate from Central Bank of Uzbekistan
  const fetchExchangeRate = async () => {
    if (currency === 'UZS') return;
    
    setLoadingRate(true);
    try {
      const response = await fetch('https://cbu.uz/en/arkhiv-kursov-valyut/json/');
      const data = await response.json();
      
      const currencyCode = currency === 'USD' ? 'USD' : 'EUR';
      const rateData = data.find((item: any) => item.Ccy === currencyCode);
      
      if (rateData) {
        const rate = parseFloat(rateData.Rate);
        setExchangeRate(rate);
        setMessage(`Exchange rate fetched: ${rate} ${currencyCode}/UZS`);
      } else {
        setMessage('Could not find exchange rate for selected currency');
      }
    } catch (error) {
      setMessage('Error fetching exchange rate');
      console.error(error);
    } finally {
      setLoadingRate(false);
    }
  };

  // Auto-fetch rate when currency changes
  useEffect(() => {
    if (currency === 'UZS') {
      setExchangeRate(1);
    } else {
      fetchExchangeRate();
    }
  }, [currency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setMessage('');

    try {
      let receiptUrl: string | null = null;

      // Upload receipt if expense and file provided
      if (type === 'expense' && receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, receiptFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);

        receiptUrl = publicUrl;
      }

      // Insert finance record
      const { error } = await supabase.from('camp_finances').insert({
        date,
        type,
        category,
        currency,
        original_amount: parseFloat(amount),
        exchange_rate: exchangeRate,
        amount_uzs: totalUZS,
        description: type === 'income' ? description : itemsBought,
        guest_name: type === 'income' ? guestName : null,
        receipt_url: receiptUrl,
        created_by: user.id,
      });

      if (error) throw error;

      setMessage('Record saved successfully!');
      
      // Reset form
      setAmount('');
      setGuestName('');
      setDescription('');
      setItemsBought('');
      setReceiptFile(null);
      setCategory('');
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Financial Tracker</h1>
              <p className="text-xs text-emerald-300 font-bold tracking-widest uppercase opacity-80">Camp Finances</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
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
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-black text-slate-800 mb-6">Record Transaction</h2>
          
          {message && (
            <div className={`mb-4 p-4 rounded-xl ${
              message.includes('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
            }`}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type Toggle */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setType('income')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                  type === 'income' 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Income
              </button>
              <button
                type="button"
                onClick={() => setType('expense')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                  type === 'expense' 
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-200' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Expense
              </button>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={type === 'income' ? 'e.g., Accommodation, Guide Fee' : 'e.g., Grocery, Maintenance'}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                required
              />
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'UZS' | 'USD' | 'EUR')}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
              >
                <option value="UZS">UZS (Uzbek Som)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
              </select>
            </div>

            {/* Exchange Rate */}
            {currency !== 'UZS' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Exchange Rate ({currency}/UZS)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(parseFloat(e.target.value))}
                    className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={fetchExchangeRate}
                    disabled={loadingRate}
                    className="px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
                  >
                    {loadingRate ? 'Fetching...' : 'Fetch Rate'}
                  </button>
                </div>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Amount ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                required
              />
            </div>

            {/* Total in UZS */}
            <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-200">
              <p className="text-sm text-slate-600 mb-1">Total in UZS</p>
              <p className="text-2xl font-black text-emerald-600">
                {totalUZS ? totalUZS.toLocaleString('uz-UZ', { minimumFractionDigits: 2 }) : '0.00'} UZS
              </p>
            </div>

            {/* Income-specific fields */}
            {type === 'income' && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Guest Name</label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., 2 nights, laundry, guide fee"
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all resize-none"
                  />
                </div>
              </>
            )}

            {/* Expense-specific fields */}
            {type === 'expense' && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Items Bought</label>
                  <textarea
                    value={itemsBought}
                    onChange={(e) => setItemsBought(e.target.value)}
                    placeholder="List items purchased..."
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Receipt Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
                  />
                  {receiptFile && (
                    <p className="text-sm text-green-600 mt-2">✓ Selected: {receiptFile.name}</p>
                  )}
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-200"
            >
              {submitting ? 'Saving...' : 'Save Record'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
