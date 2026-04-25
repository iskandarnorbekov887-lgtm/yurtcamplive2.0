'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useRouter } from 'next/navigation';

export default function FinancialsPage() {
  return (
    <ProtectedRoute allowedRoles={['Manager']}>
      <ManagerFinancials />
    </ProtectedRoute>
  );
}

function ManagerFinancials() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [type, setType] = useState<'expense' | 'income'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('financialsType');
      return saved === 'income' ? 'income' : 'expense';
    }
    return 'expense';
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  
  // Expense fields
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCurrencyAmounts, setExpenseCurrencyAmounts] = useState<{currency: 'USD' | 'EUR' | 'UZS', amount: string}[]>([{currency: 'UZS', amount: ''}]);
  const [expenseReceipt, setExpenseReceipt] = useState<File | null>(null);
  const [workerNames, setWorkerNames] = useState<string[]>(['Gulzifa', 'Shurik Obbos', 'Dilorom', 'Fozil']);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [workerDateFrom, setWorkerDateFrom] = useState('');
  const [workerDateTo, setWorkerDateTo] = useState('');
  
  // Income fields
  const [incomeGuestNames, setIncomeGuestNames] = useState<string[]>(['']);
  const [incomeGuestCount, setIncomeGuestCount] = useState(1);
  const [incomeChildrenUnder12, setIncomeChildrenUnder12] = useState(0);
  const [incomeDescription, setIncomeDescription] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeNights, setIncomeNights] = useState('');
  const [incomeGuideService, setIncomeGuideService] = useState(false);
  const [incomeGuideNames, setIncomeGuideNames] = useState<string[]>(['']);
  const [incomeGuideAmount, setIncomeGuideAmount] = useState('');
  const [incomeTransportation, setIncomeTransportation] = useState(false);
  const [incomeTransportationList, setIncomeTransportationList] = useState<string[]>(['']);
  const [incomeTransportationEntries, setIncomeTransportationEntries] = useState<{
    driver: string;
    organized: boolean;
    date: string;
    time: string;
    from: string;
    to: string;
    arrivalTime: string;
    price: string;
    description: string;
  }[]>([{
    driver: '',
    organized: false,
    date: new Date().toISOString().split('T')[0],
    time: '',
    from: '',
    to: '',
    arrivalTime: '',
    price: '',
    description: ''
  }]);
  const [incomeLunch, setIncomeLunch] = useState(false);
  const [incomeLunchCount, setIncomeLunchCount] = useState(0);
  const [incomeDinner, setIncomeDinner] = useState(false);
  const [incomeDinnerCount, setIncomeDinnerCount] = useState(0);
  const [incomeDrinks, setIncomeDrinks] = useState(false);
  const [incomeDrinksCount, setIncomeDrinksCount] = useState(0);
  const [incomeLaundry, setIncomeLaundry] = useState(false);
  const [incomeLaundryPrice, setIncomeLaundryPrice] = useState('');
  const [incomeLaundryCurrency, setIncomeLaundryCurrency] = useState<'UZS' | 'USD'>('UZS');
  const [incomeCurrency, setIncomeCurrency] = useState<'UZS' | 'USD' | 'EUR'>('UZS');
  const [incomeExchangeRate, setIncomeExchangeRate] = useState('1');
  const [incomePaymentMethod, setIncomePaymentMethod] = useState<'cash' | 'online' | 'already_paid' | 'partially_paid'>('cash');
  
  // Date - automatically set to current date
  const [date] = useState(new Date().toISOString().split('T')[0]);

  // Recent expenses
  const [recentExpenses, setRecentExpenses] = useState<Finance[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Finance | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [currentDayOffset, setCurrentDayOffset] = useState(0);

  // Fetch recent expenses on load
  useEffect(() => {
    fetchRecentExpenses();
  }, []);

  // Save type to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('financialsType', type);
  }, [type]);

  const fetchRecentExpenses = async () => {
    setLoadingRecent(true);
    try {
      const { data, error } = await supabase
        .from('camp_finances')
        .select('*');

      console.log('All finances data:', data);
      console.log('Recent finances error:', error);
      setRecentExpenses(data || []);
    } catch (error) {
      console.error('Error fetching recent finances:', error);
    } finally {
      setLoadingRecent(false);
    }
  };

  const expenseCategories = [
    'groceries',
    'workers income',
    'gas for car',
    'shezod akaga berildi',
    'other expenses'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setMessage('');

    try {
      let receiptUrl: string | null = null;

      // Upload receipt if provided (expenses only)
      if (type === 'expense' && expenseReceipt) {
        const fileExt = expenseReceipt.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, expenseReceipt);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);

        receiptUrl = publicUrl;
      }

      // Insert finance record
      // Handle multiple currency-amount pairs for expenses
      if (type === 'expense') {
        // Validate workers income requirements
        if (expenseCategory === 'workers income') {
          if (!selectedWorker) {
            setMessage('Please select a worker name');
            return;
          }
          if (!workerDateFrom && !workerDateTo && !expenseDescription.trim()) {
            setMessage('Please either enter worker date range or provide a description');
            return;
          }
        }

        const validPairs = expenseCurrencyAmounts.filter(pair => pair.amount.trim() !== '');
        for (const pair of validPairs) {
          // Build description with date range for workers income
          let finalDescription = expenseDescription;
          if (expenseCategory === 'workers income' && (workerDateFrom || workerDateTo)) {
            const dateRange = workerDateFrom && workerDateTo 
              ? `${workerDateFrom} to ${workerDateTo}` 
              : workerDateFrom || workerDateTo;
            finalDescription = expenseDescription 
              ? `${expenseDescription} (${dateRange})` 
              : dateRange;
          }

          const { error: insertError } = await supabase.from('camp_finances').insert({
            date: expenseCategory === 'workers income' && workerDateFrom ? workerDateFrom : date,
            type,
            category: expenseCategory,
            currency: pair.currency,
            original_amount: parseFloat(pair.amount),
            exchange_rate: 1,
            amount_uzs: parseFloat(pair.amount),
            description: finalDescription,
            guest_name: expenseCategory === 'workers income' ? selectedWorker : null,
            receipt_url: receiptUrl,
            created_by: user.id,
            // Income-specific fields (null for expenses)
            guest_count: null,
            children_under_12: null,
            nights: null,
            guide_service: null,
            guide_names: null,
            transportation: null,
            transportation_details: null,
            lunch: null,
            lunch_count: null,
            dinner: null,
            dinner_count: null,
            laundry: null,
            laundry_price: null,
            laundry_currency: null,
            payment_method: null,
          });
          if (insertError) throw insertError;
        }
      } else {
        const { error: insertError } = await supabase.from('camp_finances').insert({
          date,
          type,
          category: 'Income',
          currency: incomeCurrency,
          original_amount: parseFloat(incomeAmount),
          exchange_rate: parseFloat(incomeExchangeRate),
          amount_uzs: parseFloat(incomeAmount) * parseFloat(incomeExchangeRate),
          description: incomeDescription,
          guest_name: incomeGuestNames.filter((n) => n.trim()).join(', ') || null,
          receipt_url: receiptUrl,
          created_by: user.id,
          // Income-specific fields
          guest_count: incomeGuestCount,
          children_under_12: incomeChildrenUnder12,
          nights: incomeNights,
          guide_service: incomeGuideService,
          guide_names: incomeGuideService 
            ? `${incomeGuideNames.filter((n) => n.trim()).join(', ')}${incomeGuideAmount ? ` (Amount: ${incomeGuideAmount} USD)` : ''}` 
            : null,
          transportation: incomeTransportation,
          transportation_details: incomeTransportation 
            ? incomeTransportationEntries.map((entry, index) => 
                `Trip ${index + 1}: Driver: ${entry.driver || 'N/A'}${entry.organized ? ' (Need to organize driver)' : ''} | Date: ${entry.date ? new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'N/A'} | Time: ${entry.time || 'N/A'} | From: ${entry.from || 'N/A'} | To: ${entry.to || 'N/A'} | Arrival Time: ${entry.arrivalTime || 'N/A'}${entry.price ? ` | Price: ${entry.price} USD` : ''}${entry.description ? ` | Description: ${entry.description}` : ''}`
              ).join(' | ')
            : null,
          lunch: incomeLunch,
          lunch_count: incomeLunchCount,
          dinner: incomeDinner,
          dinner_count: incomeDinnerCount,
          drinks: incomeDrinks,
          drinks_count: incomeDrinksCount,
          laundry: incomeLaundry,
          laundry_price: incomeLaundryPrice,
          laundry_currency: incomeLaundryCurrency,
          payment_method: incomePaymentMethod,
        });
        if (insertError) throw insertError;
      }

      setMessage('Record saved successfully!');
      fetchRecentExpenses(); // Refresh recent expenses
      
      // Reset form
      if (type === 'expense') {
        setExpenseCategory('');
        setExpenseDescription('');
        setExpenseAmount('');
        setExpenseCurrencyAmounts([{currency: 'UZS', amount: ''}]);
        setExpenseReceipt(null);
        setSelectedWorker('');
        setWorkerDateFrom('');
        setWorkerDateTo('');
      } else {
        setIncomeGuestNames(['']);
        setIncomeGuestCount(1);
        setIncomeChildrenUnder12(0);
        setIncomeDescription('');
        setIncomeAmount('');
        setIncomeNights('');
        setIncomeGuideService(false);
        setIncomeGuideNames(['']);
        setIncomeGuideAmount('');
        setIncomeTransportation(false);
        setIncomeTransportationList(['']);
        setIncomeTransportationEntries([{
          driver: '',
          organized: false,
          date: new Date().toISOString().split('T')[0],
          time: '',
          from: '',
          to: '',
          arrivalTime: '',
          price: '',
          description: ''
        }]);
        setIncomeLunch(false);
        setIncomeLunchCount(0);
        setIncomeDinner(false);
        setIncomeDinnerCount(0);
        setIncomeDrinks(false);
        setIncomeDrinksCount(0);
        setIncomeLaundry(false);
        setIncomeLaundryPrice('');
        setIncomeLaundryCurrency('UZS');
        setIncomeCurrency('UZS');
        setIncomeExchangeRate('1');
        setIncomePaymentMethod('cash');
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (expense: Finance) => {
    setEditingExpense(expense);
    setEditModalOpen(true);
  };

  const addGuestName = () => {
    setIncomeGuestNames([...incomeGuestNames, '']);
  };

  const removeGuestName = (index: number) => {
    setIncomeGuestNames(incomeGuestNames.filter((_, i) => i !== index));
  };

  const updateGuestName = (index: number, value: string) => {
    const updated = [...incomeGuestNames];
    updated[index] = value;
    setIncomeGuestNames(updated);
  };

  const addGuideName = () => {
    setIncomeGuideNames([...incomeGuideNames, '']);
  };

  const addTransportationEntry = () => {
    setIncomeTransportationEntries([...incomeTransportationEntries, {
      driver: '',
      organized: false,
      date: new Date().toISOString().split('T')[0],
      time: '',
      from: '',
      to: '',
      arrivalTime: '',
      price: '',
      description: ''
    }]);
  };

  const removeTransportationEntry = (index: number) => {
    setIncomeTransportationEntries(incomeTransportationEntries.filter((_, i) => i !== index));
  };

  const updateTransportationEntry = (index: number, field: string, value: any) => {
    const updated = [...incomeTransportationEntries];
    updated[index] = { ...updated[index], [field]: value };
    setIncomeTransportationEntries(updated);
  };

  const removeGuideName = (index: number) => {
    setIncomeGuideNames(incomeGuideNames.filter((_, i) => i !== index));
  };

  const updateGuideName = (index: number, value: string) => {
    const updated = [...incomeGuideNames];
    updated[index] = value;
    setIncomeGuideNames(updated);
  };

  const addTransportationItem = () => {
    setIncomeTransportationList([...incomeTransportationList, '']);
  };

  const removeTransportationItem = (index: number) => {
    setIncomeTransportationList(incomeTransportationList.filter((_, i) => i !== index));
  };

  const updateTransportationItem = (index: number, value: string) => {
    const updated = [...incomeTransportationList];
    updated[index] = value;
    setIncomeTransportationList(updated);
  };

  const getTodayRate = async () => {
    try {
      // Fetch real-time rates from exchangerate-api.com
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/UZS');
      const data = await response.json();
      
      const rates: Record<string, number> = {
        USD: 1 / data.rates.USD,
        EUR: 1 / data.rates.EUR,
      };
      
      const rate = Math.round(rates[incomeCurrency]) || 1;
      setIncomeExchangeRate(rate.toString());
      setMessage(`Today's rate for ${incomeCurrency}: ${rate} UZS`);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      // Fallback to fixed rates if API fails
      const fallbackRates: Record<string, number> = {
        USD: 12041,
        EUR: 13100,
      };
      const rate = fallbackRates[incomeCurrency] || 1;
      setIncomeExchangeRate(rate.toString());
      setMessage(`Using fallback rate for ${incomeCurrency}: ${rate} UZS`);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('camp_finances')
        .update({
          category: editingExpense.category,
          description: editingExpense.description,
          original_amount: editingExpense.original_amount,
          amount_uzs: editingExpense.amount_uzs,
        })
        .eq('id', editingExpense.id);

      if (error) throw error;

      // Send notification to CEO
      try {
        // Get CEO user ID
        const { data: ceoData } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'CEO')
          .single();

        if (ceoData) {
          const notificationType = editingExpense.type === 'income' ? 'income_edit' : 'expense_edit';
          const title = editingExpense.type === 'income' ? 'Income Edited' : 'Expense Edited';
          const message = editingExpense.type === 'income' 
            ? `Manager edited an income: ${editingExpense.guest_name || 'Guest'} - ${editingExpense.original_amount.toLocaleString()} ${editingExpense.currency || 'UZS'}`
            : `Manager edited an expense: ${editingExpense.category} - ${editingExpense.original_amount.toLocaleString()} UZS`;
          
          await supabase.from('notifications').insert({
            user_id: ceoData.id,
            type: notificationType,
            title: title,
            message: message,
            related_id: editingExpense.id,
          });
        }
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
        // Continue anyway, the record was updated successfully
      }

      setMessage(`${editingExpense.type === 'income' ? 'Income' : 'Expense'} updated successfully! CEO has been notified.`);
      setEditModalOpen(false);
      setEditingExpense(null);
      fetchRecentExpenses();
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
            <a
              href="/manager"
              className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg"
            >
              <svg className="w-8 h-8 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
              <svg className="w-8 h-8 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Financial Tracker</h1>
              <p className="text-xs text-emerald-300 font-bold tracking-widest uppercase opacity-80">Manager Recording</p>
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
            {/* Type Toggle - Expense first */}
            <div className="flex gap-4">
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
            </div>

            {/* Date - automatically set */}
            <div>
              <label className="block text-sm font-black text-slate-900 mb-2">Date</label>
              <input
                type="date"
                value={date}
                disabled
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl bg-slate-100 text-slate-900 cursor-not-allowed font-semibold"
              />
              <p className="text-xs text-slate-700 mt-1 font-semibold">Automatically set to current date</p>
            </div>

            {/* Expense Form */}
            {type === 'expense' && (
              <>
                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Category</label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                    required
                  >
                    <option value="">Select category</option>
                    {expenseCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Amount</label>
                  {expenseCurrencyAmounts.map((pair, index) => (
                    <div key={index} className="flex gap-2 items-start mb-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={pair.amount}
                          onChange={(e) => {
                            const newPairs = [...expenseCurrencyAmounts];
                            newPairs[index].amount = e.target.value;
                            setExpenseCurrencyAmounts(newPairs);
                          }}
                          placeholder="Amount"
                          className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                        />
                      </div>
                      <div className="w-28">
                        <select
                          value={pair.currency}
                          onChange={(e) => {
                            const newPairs = [...expenseCurrencyAmounts];
                            newPairs[index].currency = e.target.value as 'USD' | 'EUR' | 'UZS';
                            setExpenseCurrencyAmounts(newPairs);
                          }}
                          className="w-full px-3 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="UZS">UZS</option>
                        </select>
                      </div>
                      {expenseCurrencyAmounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newPairs = expenseCurrencyAmounts.filter((_, i) => i !== index);
                            setExpenseCurrencyAmounts(newPairs);
                          }}
                          className="px-3 py-3 bg-rose-100 text-rose-600 rounded-xl hover:bg-rose-200 transition-all font-bold"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setExpenseCurrencyAmounts([...expenseCurrencyAmounts, { currency: 'UZS', amount: '' }]);
                    }}
                    className="w-full py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-all font-bold text-sm"
                  >
                    + Add Currency
                  </button>
                </div>

                {expenseCategory === 'workers income' && (
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Worker Name *</label>
                    <div className="flex gap-2">
                      <select
                        value={selectedWorker}
                        onChange={(e) => setSelectedWorker(e.target.value)}
                        className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                        required
                      >
                        <option value="">Select worker</option>
                        {workerNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const newWorker = prompt('Enter new worker name:');
                          if (newWorker && newWorker.trim() && !workerNames.includes(newWorker.trim())) {
                            setWorkerNames([...workerNames, newWorker.trim()]);
                          }
                        }}
                        className="px-4 py-3 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition-all font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {expenseCategory === 'workers income' && (
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Worker Date Range (Optional)</label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="date"
                          value={workerDateFrom}
                          onChange={(e) => setWorkerDateFrom(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                          placeholder="From"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="date"
                          value={workerDateTo}
                          onChange={(e) => setWorkerDateTo(e.target.value)}
                          className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                          placeholder="To"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Description {expenseCategory === 'workers income' && !workerDateFrom && !workerDateTo ? '*' : '(Optional)'}</label>
                  <textarea
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder="Describe the expense..."
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all resize-none text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Receipt Photo (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setExpenseReceipt(e.target.files?.[0] || null)}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900"
                  />
                  {expenseReceipt && (
                    <p className="text-sm text-emerald-700 mt-2 font-bold">✓ Selected: {expenseReceipt.name}</p>
                  )}
                </div>
              </>
            )}

            {/* Income Form */}
            {type === 'income' && (
              <>
                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Guest Names *</label>
                  <div className="space-y-2">
                    {incomeGuestNames.map((name, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => updateGuestName(index, e.target.value)}
                          placeholder={index === 0 ? "Enter guest name (required)" : `Guest ${index + 1} name`}
                          className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                          required={index === 0}
                        />
                        {incomeGuestNames.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeGuestName(index)}
                            className="px-3 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addGuestName}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Guest
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Total Number of Guests (Optional)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={incomeGuestCount}
                      onChange={(e) => setIncomeGuestCount(Math.max(1, parseInt(e.target.value) || 1))}
                      placeholder="Total number of guests under this booking"
                      className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setIncomeGuestCount(incomeGuestCount + 1)}
                      className="w-12 h-12 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-black text-xl"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Children Under 12 (Optional)</label>
                  <input
                    type="number"
                    min="0"
                    value={incomeChildrenUnder12}
                    onChange={(e) => setIncomeChildrenUnder12(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="Number of children under 12"
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Nights Stayed</label>
                  <input
                    type="number"
                    min="1"
                    value={incomeNights}
                    onChange={(e) => setIncomeNights(e.target.value)}
                    placeholder="Number of nights"
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Services and Food</label>
                  <div className="space-y-4">
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incomeGuideService}
                          onChange={(e) => setIncomeGuideService(e.target.checked)}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-900 font-semibold">Guide Service</span>
                      </label>
                      {incomeGuideService && (
                        <div className="mt-2 space-y-2">
                          {incomeGuideNames.map((name, index) => (
                            <div key={index} className="flex gap-2">
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => updateGuideName(index, e.target.value)}
                                placeholder={`Guide ${index + 1} name and destination`}
                                className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                              />
                              {incomeGuideNames.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeGuideName(index)}
                                  className="px-3 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all font-bold"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={incomeGuideAmount}
                              onChange={(e) => setIncomeGuideAmount(e.target.value)}
                              placeholder="Guide amount"
                              className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                            />
                            <span className="text-slate-900 font-semibold text-sm">USD</span>
                          </div>
                          <button
                            type="button"
                            onClick={addGuideName}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Guide
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incomeTransportation}
                          onChange={(e) => setIncomeTransportation(e.target.checked)}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-900 font-semibold">Transportation</span>
                      </label>
                      {incomeTransportation && (
                        <div className="mt-2 space-y-4">
                          {incomeTransportationEntries.map((entry, index) => (
                            <div key={index} className="p-4 border-2 border-slate-200 rounded-xl space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-700">Trip {index + 1}</span>
                                {incomeTransportationEntries.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeTransportationEntry(index)}
                                    className="px-3 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all font-bold text-xs"
                                  >
                                    ✕ Remove
                                  </button>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Driver Name</label>
                                <input
                                  type="text"
                                  value={entry.driver}
                                  onChange={(e) => updateTransportationEntry(index, 'driver', e.target.value)}
                                  placeholder="Enter driver name"
                                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                />
                              </div>
                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={entry.organized}
                                  onChange={(e) => updateTransportationEntry(index, 'organized', e.target.checked)}
                                  className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-slate-900 font-semibold text-sm">Need to organize driver</span>
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">Date</label>
                                  <input
                                    type="date"
                                    value={entry.date}
                                    onChange={(e) => updateTransportationEntry(index, 'date', e.target.value)}
                                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">Pickup Time</label>
                                  <div className="flex gap-2">
                                    <select
                                      value={entry.time.split(':')[0] || ''}
                                      onChange={(e) => updateTransportationEntry(index, 'time', `${e.target.value}:${entry.time.split(':')[1] || '00'}`)}
                                      className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                    >
                                      <option value="">Hour</option>
                                      {Array.from({ length: 24 }, (_, i) => (
                                        <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>
                                      ))}
                                    </select>
                                    <select
                                      value={entry.time.split(':')[1] || ''}
                                      onChange={(e) => updateTransportationEntry(index, 'time', `${entry.time.split(':')[0] || '00'}:${e.target.value}`)}
                                      className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                    >
                                      <option value="">Min</option>
                                      {Array.from({ length: 60 }, (_, i) => (
                                        <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">From</label>
                                  <input
                                    type="text"
                                    value={entry.from}
                                    onChange={(e) => updateTransportationEntry(index, 'from', e.target.value)}
                                    placeholder="Pickup location"
                                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">To</label>
                                  <input
                                    type="text"
                                    value={entry.to}
                                    onChange={(e) => updateTransportationEntry(index, 'to', e.target.value)}
                                    placeholder="Destination"
                                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Arrival Time</label>
                                <div className="flex gap-2">
                                  <select
                                    value={entry.arrivalTime.split(':')[0] || ''}
                                    onChange={(e) => updateTransportationEntry(index, 'arrivalTime', `${e.target.value}:${entry.arrivalTime.split(':')[1] || '00'}`)}
                                    className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                  >
                                    <option value="">Hour</option>
                                    {Array.from({ length: 24 }, (_, i) => (
                                      <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={entry.arrivalTime.split(':')[1] || ''}
                                    onChange={(e) => updateTransportationEntry(index, 'arrivalTime', `${entry.arrivalTime.split(':')[0] || '00'}:${e.target.value}`)}
                                    className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                  >
                                    <option value="">Min</option>
                                    {Array.from({ length: 60 }, (_, i) => (
                                      <option key={i} value={i.toString().padStart(2, '0')}>{i.toString().padStart(2, '0')}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-2 items-center">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={entry.price}
                                  onChange={(e) => updateTransportationEntry(index, 'price', e.target.value)}
                                  placeholder="Transportation price"
                                  className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                />
                                <span className="text-slate-900 font-semibold text-sm">USD</span>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1">Description</label>
                                <textarea
                                  value={entry.description}
                                  onChange={(e) => updateTransportationEntry(index, 'description', e.target.value)}
                                  placeholder="Enter description for this trip"
                                  rows={2}
                                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                                />
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={addTransportationEntry}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold text-sm w-full justify-center"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Another Trip
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incomeLunch}
                          onChange={(e) => {
                            setIncomeLunch(e.target.checked);
                            if (e.target.checked && incomeLunchCount === 0) {
                              setIncomeLunchCount(1);
                            }
                          }}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-900 font-semibold">Lunch</span>
                      </label>
                      {incomeLunch && (
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIncomeLunchCount(Math.max(1, incomeLunchCount - 1))}
                            className="w-10 h-10 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all font-black text-xl"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={incomeLunchCount}
                            onChange={(e) => setIncomeLunchCount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-center"
                          />
                          <button
                            type="button"
                            onClick={() => setIncomeLunchCount(incomeLunchCount + 1)}
                            className="w-10 h-10 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-black text-xl"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incomeDinner}
                          onChange={(e) => {
                            setIncomeDinner(e.target.checked);
                            if (e.target.checked && incomeDinnerCount === 0) {
                              setIncomeDinnerCount(1);
                            }
                          }}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-900 font-semibold">Dinner</span>
                      </label>
                      {incomeDinner && (
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIncomeDinnerCount(Math.max(1, incomeDinnerCount - 1))}
                            className="w-10 h-10 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all font-black text-xl"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={incomeDinnerCount}
                            onChange={(e) => setIncomeDinnerCount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-center"
                          />
                          <button
                            type="button"
                            onClick={() => setIncomeDinnerCount(incomeDinnerCount + 1)}
                            className="w-10 h-10 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-black text-xl"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incomeDrinks}
                          onChange={(e) => {
                            setIncomeDrinks(e.target.checked);
                            if (e.target.checked && incomeDrinksCount === 0) {
                              setIncomeDrinksCount(1);
                            }
                          }}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-900 font-semibold">Drinks</span>
                      </label>
                      {incomeDrinks && (
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIncomeDrinksCount(Math.max(1, incomeDrinksCount - 1))}
                            className="w-10 h-10 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-all font-black text-xl"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={incomeDrinksCount}
                            onChange={(e) => setIncomeDrinksCount(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-center"
                          />
                          <button
                            type="button"
                            onClick={() => setIncomeDrinksCount(incomeDrinksCount + 1)}
                            className="w-10 h-10 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-black text-xl"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incomeLaundry}
                          onChange={(e) => setIncomeLaundry(e.target.checked)}
                          className="w-5 h-5 rounded border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-900 font-semibold">Laundry</span>
                      </label>
                      {incomeLaundry && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={incomeLaundryPrice}
                            onChange={(e) => setIncomeLaundryPrice(e.target.value)}
                            placeholder="Laundry price"
                            className="flex-1 px-4 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                          />
                          <select
                            value={incomeLaundryCurrency}
                            onChange={(e) => setIncomeLaundryCurrency(e.target.value as 'UZS' | 'USD')}
                            className="px-3 py-2 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold text-sm"
                          >
                            <option value="UZS">UZS</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Payment Method *</label>
                  <div className="flex gap-4 flex-wrap">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={incomePaymentMethod === 'cash'}
                        onChange={() => setIncomePaymentMethod('cash')}
                        className="w-5 h-5 border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-900 font-semibold">Cash</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={incomePaymentMethod === 'online'}
                        onChange={() => setIncomePaymentMethod('online')}
                        className="w-5 h-5 border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-900 font-semibold">Online</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={incomePaymentMethod === 'already_paid'}
                        onChange={() => setIncomePaymentMethod('already_paid')}
                        className="w-5 h-5 border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-900 font-semibold">Already paid</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={incomePaymentMethod === 'partially_paid'}
                        onChange={() => setIncomePaymentMethod('partially_paid')}
                        className="w-5 h-5 border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-900 font-semibold">Partially paid</span>
                    </label>
                  </div>
                </div>

                {incomePaymentMethod !== 'already_paid' && (
                  <>
                    <div>
                      <label className="block text-sm font-black text-slate-900 mb-2">Currency {(incomePaymentMethod === 'online' || incomePaymentMethod === 'partially_paid') ? '(Optional)' : '*'}</label>
                      <select
                        value={incomeCurrency}
                        onChange={(e) => {
                          setIncomeCurrency(e.target.value as 'UZS' | 'USD' | 'EUR');
                          setIncomeExchangeRate(e.target.value === 'UZS' ? '1' : incomeExchangeRate);
                        }}
                        className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                        required={incomePaymentMethod === 'cash'}
                      >
                        <option value="UZS">Uzbek Sum (UZS)</option>
                        <option value="USD">US Dollar (USD)</option>
                        <option value="EUR">Euro (EUR)</option>
                      </select>
                    </div>

                    {incomeCurrency !== 'UZS' && (
                      <div>
                        <label className="block text-sm font-black text-slate-900 mb-2">Exchange Rate (to UZS)</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={incomeExchangeRate}
                            onChange={(e) => setIncomeExchangeRate(e.target.value)}
                            placeholder={`1 ${incomeCurrency} = ? UZS`}
                            className="flex-1 px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                          />
                          <button
                            type="button"
                            onClick={getTodayRate}
                            className="px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all font-bold whitespace-nowrap"
                          >
                            Get Today's Rate
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-black text-slate-900 mb-2">Total Amount ({incomeCurrency}) {(incomePaymentMethod === 'online' || incomePaymentMethod === 'partially_paid') ? '(Optional)' : '*'}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={incomeAmount}
                        onChange={(e) => setIncomeAmount(e.target.value)}
                        placeholder={`Enter amount in ${incomeCurrency}`}
                        className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                        required={incomePaymentMethod === 'cash'}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-2">Description {incomePaymentMethod === 'cash' ? '*' : '(Optional)'}</label>
                  <textarea
                    value={incomeDescription}
                    onChange={(e) => setIncomeDescription(e.target.value)}
                    placeholder="Additional notes..."
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all text-slate-900 font-semibold"
                    required={incomePaymentMethod === 'cash'}
                  />
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

          {/* Recent Expenses Section */}
          <div className="mt-8 bg-white rounded-2xl shadow-xl p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">Recent Transactions (Last 3 Days)</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentDayOffset(Math.min(2, currentDayOffset + 1))}
                  className="p-2 bg-slate-200 hover:bg-slate-300 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={currentDayOffset >= 2}
                >
                  <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentDayOffset(Math.max(0, currentDayOffset - 1))}
                  className="p-2 bg-slate-200 hover:bg-slate-300 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={currentDayOffset <= 0}
                >
                  <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            
            {loadingRecent ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              (() => {
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() - currentDayOffset);
                const dateStr = targetDate.toISOString().split('T')[0];
                const dayFinances = recentExpenses.filter(f => f.date === dateStr);
                
                const today = new Date().toISOString().split('T')[0];
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().split('T')[0];
                const dayBeforeYesterday = new Date();
                dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
                const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split('T')[0];
                
                let dayLabel = targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                if (dateStr === today) dayLabel = 'Today';
                else if (dateStr === yesterdayStr) dayLabel = 'Yesterday';
                else if (dateStr === dayBeforeYesterdayStr) dayLabel = 'Day Before Yesterday';
                
                return (
                  <div key={dateStr} className="bg-slate-50 rounded-xl p-6 border-2 border-slate-300">
                    <h4 className="font-black text-slate-900 mb-4">{dayLabel}</h4>
                    
                    {dayFinances.length === 0 ? (
                      <p className="text-slate-500 italic text-sm">No transactions</p>
                    ) : (
                      <div className="space-y-3">
                        {dayFinances.map((item) => (
                          <div 
                            key={item.id} 
                            className="bg-white rounded-lg p-4 border border-slate-200 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
                            onClick={() => router.push(`/financials/detail/${item.id}`)}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-black text-slate-900">{item.type === 'expense' ? item.category : (item.guest_name || 'Income')}</p>
                                <p className="text-sm text-slate-700">{item.description}</p>
                              </div>
                              <div className="text-right">
                                <p className={`font-black ${item.type === 'expense' ? 'text-rose-700' : 'text-emerald-700'}`}>
                                  {item.original_amount.toLocaleString()} {item.currency || 'UZS'}
                                </p>
                                {item.receipt_url && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setReceiptUrl(item.receipt_url!);
                                      setZoomLevel(1);
                                      setReceiptViewerOpen(true);
                                    }}
                                    className="text-xs text-blue-600 hover:underline font-bold mt-1"
                                  >
                                    View Receipt
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </main>

      {/* Edit Modal */}
      {editModalOpen && editingExpense && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setEditModalOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-slate-900 mb-6">Edit {editingExpense.type === 'income' ? 'Income' : 'Expense'}</h3>
            <form onSubmit={handleUpdateExpense} className="space-y-4">
              {editingExpense.type === 'expense' ? (
                <>
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Category</label>
                    <select
                      value={editingExpense.category}
                      onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                      required
                    >
                      {expenseCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Description</label>
                    <textarea
                      value={editingExpense.description || ''}
                      onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Amount (UZS)</label>
                    <input
                      type="number"
                  step="0.01"
                  value={editingExpense.original_amount}
                  onChange={(e) => setEditingExpense({ 
                    ...editingExpense, 
                    original_amount: parseFloat(e.target.value),
                    amount_uzs: parseFloat(e.target.value)
                  })}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                  required
                />
              </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Guest Name</label>
                    <input
                      type="text"
                      value={editingExpense.guest_name || ''}
                      onChange={(e) => setEditingExpense({ ...editingExpense, guest_name: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Description</label>
                    <textarea
                      value={editingExpense.description || ''}
                      onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-slate-900 mb-2">Amount ({editingExpense.currency || 'UZS'})</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingExpense.original_amount}
                      onChange={(e) => setEditingExpense({ 
                        ...editingExpense, 
                        original_amount: parseFloat(e.target.value)
                      })}
                      className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl text-slate-900 font-semibold"
                      required
                    />
                  </div>
                </>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
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
    </div>
  );
}
