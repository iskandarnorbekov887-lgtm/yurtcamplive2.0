'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Finance } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useRouter } from 'next/navigation';

// Force dynamic rendering to avoid SSR issues with auth
export const dynamic = 'force-dynamic';

export default function FinancialsPage() {
  return (
    <ProtectedRoute allowedRoles={['Manager', 'CEO']}>
      <ManagerFinancials />
    </ProtectedRoute>
  );
}

function ManagerFinancials() {
  const { user, signOut } = useAuth();
  const { t, getLocale } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [type, setType] = useState<'expense' | 'income' | 'drinks'>('expense');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  
  // Initialize type from URL query param on mount
  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam && ['expense', 'income', 'drinks'].includes(typeParam)) {
      setType(typeParam as 'expense' | 'income' | 'drinks');
    }
  }, [searchParams]);

  // Update URL when type changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('type', type);
    window.history.replaceState({}, '', url.toString());
  }, [type]);
  
  // Form fields
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [selectedWorkerOption, setSelectedWorkerOption] = useState('');
  const [newWorkerName, setNewWorkerName] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  
  // Currency exchange state
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [exchangeForm, setExchangeForm] = useState({
    usdAmount: '',
    exchangeRate: '11000'
  });
  
  // New exchange modal state
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [exchangeFromCurrency, setExchangeFromCurrency] = useState<'USD' | 'EUR'>('USD');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [exchangeRateSource, setExchangeRateSource] = useState<'auto' | 'manual'>('manual');
  const [submittingExchange, setSubmittingExchange] = useState(false);
  const [exchangeMessage, setExchangeMessage] = useState('');
  const [exchangeAmountError, setExchangeAmountError] = useState('');
  const [cashBox, setCashBox] = useState<{ USD: number; UZS: number; EUR: number }>({ USD: 0, UZS: 0, EUR: 0 });
  // Store all payments for current month to combine with finances in calendar view
  const [allPayments, setAllPayments] = useState<any[]>([]);
  
  // Worker names for dropdown
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [showNewWorkerInput, setShowNewWorkerInput] = useState(false);
  
  // Date - set via calendar selection
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Recent expenses
  const [recentExpenses, setRecentExpenses] = useState<Finance[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [currentDayOffset, setCurrentDayOffset] = useState(0);

  // Worker payments
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);
  const [loadingWorkerPayments, setLoadingWorkerPayments] = useState(false);

  // Calendar states
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Day transactions modal state
  const [showDayTransactionsModal, setShowDayTransactionsModal] = useState(false);
  const [dayTransactions, setDayTransactions] = useState<any[]>([]);
  const [loadingDayTransactions, setLoadingDayTransactions] = useState(false);

  // Drinks state - new normalized structure
  const [drinks, setDrinks] = useState<any[]>([]);
  const [drinkVariants, setDrinkVariants] = useState<any[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [showAddDrinkModal, setShowAddDrinkModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockingVariant, setRestockingVariant] = useState<any>(null);
  const [drinkFormMode, setDrinkFormMode] = useState<'add' | 'restock'>('add');
  const [lockCategory, setLockCategory] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showNewBrandInput, setShowNewBrandInput] = useState(false);
  const [lockBrandAndUnit, setLockBrandAndUnit] = useState(false);
  const [drinkForm, setDrinkForm] = useState({
    name: '',
    category: 'salqin_ichimliklar',
    unit: '0.5L',
    quantity: '',
    buy_price: '',
    sell_price: ''
  });

  // Unit presets per category
  const unitPresets: Record<string, string[]> = {
    salqin_ichimliklar: ['0.25L banka', '0.33L banka', '0.5L', '1L', '1.5L', '2L'],
    piva: ['0.5L banka', '0.5L shisha', '1L'],
    vino: ['shisha', '0.75L'],
    aroq: ['0.25L shisha', '0.5L shisha', '0.7L shisha', '1L shisha']
  };

  // Fetch all payments for the current month to use in calendar calculations
  const fetchAllPayments = async () => {
    try {
      const month = String(currentMonth + 1).padStart(2, '0');
      const year = String(currentYear);
      const start = `${year}-${month}-01T00:00:00`;
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const endMonth = String(nextMonth + 1).padStart(2, '0');
      const end = `${nextYear}-${endMonth}-01T00:00:00`;

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end);

      if (error) throw error;
      setAllPayments(data || []);
    } catch (err: any) {
      console.error('Error fetching payments for calendar:', err);
    }
  };

  // Fetch recent expenses on load
  useEffect(() => {
    fetchRecentExpenses();
    fetchWorkerNames();
    fetchWorkerPayments();
    fetchDrinks();
    fetchCashBox();
    fetchAllPayments();
  }, []);

  // Re‑fetch payments when month/year changes (e.g., navigating calendar)
  useEffect(() => {
    fetchAllPayments();
  }, [currentMonth, currentYear]);

  const fetchCashBox = async () => {
    // Fetch cash payments from payments table
    const { data: paymentsData } = await supabase.from('payments').select('*').eq('method', 'Cash');
    
    // Fetch income/expense from camp_finances
    const { data: financesData } = await supabase.from('camp_finances').select('*');
    
    // Fetch currency exchanges
    const { data: exchangesData } = await supabase
      .from('currency_exchanges')
      .select('*')
      .eq('team_id', user?.team_id);
    
    // Start with payments summary (sale adds, expense subtracts)
    const summary = paymentsData?.reduce((acc: any, p: any) => {
      const amount = Number(p.amount_original) || 0;
      const currency = p.currency_original || 'USD';
      if (p.type === 'expense') {
        acc[currency] = (acc[currency] || 0) - amount;
      } else {
        // Default to 'sale' or treat as income
        acc[currency] = (acc[currency] || 0) + amount;
      }
      return acc;
    }, { USD: 0, UZS: 0, EUR: 0 }) || { USD: 0, UZS: 0, EUR: 0 };
    
    // Add camp_finances (income adds, expense subtracts)
    if (financesData) {
      financesData.forEach((f: any) => {
        const amount = Number(f.original_amount) || 0;
        const currency = f.currency || 'UZS';
        if (f.type === 'income') {
          summary[currency] = (summary[currency] || 0) + amount;
        } else if (f.type === 'expense') {
          summary[currency] = (summary[currency] || 0) - amount;
        }
      });
    }
    
    // Add currency exchanges (subtract from_currency, add to UZS)
    if (exchangesData) {
      exchangesData.forEach((e: any) => {
        const fromAmount = Number(e.from_amount) || 0;
        const toAmount = Number(e.to_amount) || 0;
        const fromCurrency = e.from_currency;
        
        summary[fromCurrency] = (summary[fromCurrency] || 0) - fromAmount;
        summary['UZS'] = (summary['UZS'] || 0) + toAmount;
      });
    }
    
    setCashBox(summary);
    return summary;
  };

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    } else {
      return value.toFixed(0);
    }
  };

  const handleFetchExchangeRate = async () => {
    try {
      const response = await fetch('/api/exchange-rate');
      const data = await response.json();
      
      if (response.ok) {
        setExchangeRate(data[exchangeFromCurrency].toString());
        setExchangeRateSource('auto');
        setExchangeMessage('');
      } else {
        setExchangeMessage(data.error || t('exchange.rate_fetch_error'));
      }
    } catch (error) {
      setExchangeMessage(t('exchange.rate_fetch_error'));
    }
  };

  const handleConfirmExchange = async () => {
    if (!exchangeAmount.trim() || !exchangeRate.trim()) {
      setExchangeMessage('Please fill in all fields');
      return;
    }
    
    const amount = parseFloat(exchangeAmount);
    const rate = parseFloat(exchangeRate);
    const toAmount = amount * rate;
    
    if (amount <= 0 || rate <= 0) {
      setExchangeMessage('Amount and rate must be positive');
      return;
    }
    
    // Re-fetch cash box to get current balance (in case it changed since modal opened)
    const freshBalance = await fetchCashBox();
    
    // Validate against current balance
    const availableBalance = freshBalance[exchangeFromCurrency] || 0;
    if (amount > availableBalance) {
      setExchangeMessage(
        t('exchange.insufficient_balance')
          .replace('{amount}', availableBalance.toLocaleString())
          .replace('{currency}', exchangeFromCurrency)
      );
      return;
    }
    
    setSubmittingExchange(true);
    setExchangeMessage('');
    
    try {
      await supabase.from('currency_exchanges').insert({
        team_id: user?.team_id,
        from_currency: exchangeFromCurrency,
        from_amount: amount,
        to_currency: 'UZS',
        to_amount: toAmount,
        rate: rate,
        rate_source: exchangeRateSource,
        created_by: user?.id,
      });
      
      setExchangeMessage(t('exchange.success'));
      setExchangeModalOpen(false);
      setExchangeAmount('');
      setExchangeRate('');
      setExchangeRateSource('manual');
      setExchangeAmountError('');
      
      // Refresh cash box
      fetchCashBox();
      
      setTimeout(() => setExchangeMessage(''), 3000);
    } catch (error) {
      setExchangeMessage('Error recording exchange');
    } finally {
      setSubmittingExchange(false);
    }
  };

  const fetchDayTransactions = async (dateStr: string) => {
    setLoadingDayTransactions(true);
    try {
      // Fetch camp_finances for the date
      const { data: financesData, error: financesError } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('transaction_date', dateStr);

      // Fetch payments for the date
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`);

      // Combine and format transactions
      const combinedTransactions: any[] = [];

      // Add camp_finances transactions
      (financesData || []).forEach((item: any) => {
        combinedTransactions.push({
          id: item.id,
          type: item.type === 'income' ? 'income' : 'expense',
          category: item.type === 'expense' ? item.category : (item.guest_name || 'Income'),
          description: item.description || '',
          amount: item.original_amount,
          currency: item.currency || 'UZS',
          created_at: item.created_at,
          source: 'camp_finances'
        });
      });

      // Add payments transactions
      (paymentsData || []).forEach((item: any) => {
        if (item.exchange_id) {
          // Currency exchange
          combinedTransactions.push({
            id: item.id,
            type: item.type === 'expense' ? 'expense' : 'income',
            category: 'Currency Exchange',
            description: item.note || '',
            amount: item.amount_original,
            currency: item.currency_original,
            created_at: item.created_at,
            source: 'payment_exchange'
          });
        } else if (item.note && item.note.startsWith('Stock purchase:')) {
          // Drink restock
          combinedTransactions.push({
            id: item.id,
            type: 'expense',
            category: 'Stock Purchase',
            description: item.note || '',
            amount: item.amount_original,
            currency: item.currency_original,
            created_at: item.created_at,
            source: 'payment_restock'
          });
        } else if (item.type === 'sale') {
          // Drink sale (POS)
          combinedTransactions.push({
            id: item.id,
            type: 'income',
            category: 'POS Sale',
            description: item.note || 'Walk-in POS sale',
            amount: item.amount_original,
            currency: item.currency_original,
            created_at: item.created_at,
            source: 'payment_sale'
          });
        }
      });

      // Sort by created_at, newest first
      combinedTransactions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setDayTransactions(combinedTransactions);
      setShowDayTransactionsModal(true);
    } catch (error) {
      console.error('Error fetching day transactions:', error);
    } finally {
      setLoadingDayTransactions(false);
    }
  };

  const handleCurrencyExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const usdAmount = parseFloat(exchangeForm.usdAmount);
      const exchangeRate = parseFloat(exchangeForm.exchangeRate);

      if (isNaN(usdAmount) || isNaN(exchangeRate) || usdAmount <= 0 || exchangeRate <= 0) {
        setMessage('Please enter valid amounts');
        setSubmitting(false);
        return;
      }

      // Validate USD balance
      if (usdAmount > cashBox.USD) {
        setMessage(`Insufficient USD balance. Available: $${cashBox.USD.toFixed(2)}`);
        setSubmitting(false);
        return;
      }

      const uzsAmount = usdAmount * exchangeRate;
      const exchangeId = crypto.randomUUID();

      // Insert USD expense payment
      const { error: usdError } = await supabase
        .from('payments')
        .insert({
          booking_id: null,
          amount_original: usdAmount,
          currency_original: 'USD',
          amount_usd_equivalent: usdAmount,
          exchange_rate_used: 1,
          method: 'Cash',
          type: 'expense',
          note: `Currency exchange: USD to so'm @ rate ${exchangeRate}`,
          exchange_id: exchangeId
        });
      if (usdError) throw usdError;

      // Insert UZS sale payment
      const { error: uzsError } = await supabase
        .from('payments')
        .insert({
          booking_id: null,
          amount_original: uzsAmount,
          currency_original: 'UZS',
          amount_usd_equivalent: uzsAmount / exchangeRate,
          exchange_rate_used: exchangeRate,
          method: 'Cash',
          type: 'sale',
          note: `Currency exchange: from USD @ rate ${exchangeRate}`,
          exchange_id: exchangeId
        });
      if (uzsError) throw uzsError;

      setMessage('Currency exchange completed successfully!');
      setExchangeForm({ usdAmount: '', exchangeRate: '11000' });
      setShowExchangeModal(false);
      fetchCashBox();
    } catch (err: any) {
      setMessage(`${t('msg.error')}: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchDrinks = async () => {
    try {
      // Fetch drink_variants joined with drinks for name/category
      const { data: variantsData } = await supabase
        .from('drink_variants')
        .select('*, drinks!inner(name, category)')
        .order('drinks(name)');
      
      // Extract unique drinks from variants
      const drinksMap = new Map();
      (variantsData || []).forEach(v => {
        if (!drinksMap.has(v.drink_id)) {
          drinksMap.set(v.drink_id, {
            id: v.drink_id,
            name: v.drinks.name,
            category: v.drinks.category
          });
        }
      });
      
      setDrinks(Array.from(drinksMap.values()));
      setDrinkVariants(variantsData || []);
    } catch (error) {
      console.error('Error fetching drinks:', error);
    }
  };

  const fetchWorkerNames = async () => {
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('worker_name')
        .eq('category', 'workers income')
        .eq('team_id', user?.team_id)
        .not('worker_name', 'is', null);
      
      const names = [...new Set(data?.map(r => r.worker_name).filter(Boolean) || [])].sort();
      setWorkerNames(names);
    } catch (error) {
      console.error('Error fetching worker names:', error);
    }
  };

  const fetchRecentExpenses = async () => {
    setLoadingRecent(true);
    try {
      const { data, error } = await supabase
        .from('camp_finances')
        .select('*');

      console.log('All finances data:', data);
      console.log('Recent finances error:', error);
      // Map data to use transaction_date as the date field for calendar/list display
      const mappedData = (data || []).map(item => ({
        ...item,
        date: item.transaction_date || item.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
      }));
      setRecentExpenses(mappedData);
    } catch (error) {
      console.error('Error fetching recent finances:', error);
    } finally {
      setLoadingRecent(false);
    }
  };

  const fetchWorkerPayments = async () => {
    setLoadingWorkerPayments(true);
    try {
      const { data } = await supabase
        .from('camp_finances')
        .select('*')
        .eq('category', 'workers income')
        .eq('team_id', user?.team_id)
        .order('period_start', { ascending: false });
      
      setWorkerPayments(data || []);
    } catch (error) {
      console.error('Error fetching worker payments:', error);
    } finally {
      setLoadingWorkerPayments(false);
    }
  };

  const expenseCategories = [
    { value: 'groceries', label: t('txn.category_groceries') },
    { value: 'workers income', label: t('txn.category_workers_income') },
    { value: 'gas for car', label: t('txn.category_gas') },
    { value: 'shezod akaga berildi', label: 'shezod akaga berildi' },
    { value: 'other expenses', label: t('txn.category_other_expenses') }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Route to drink purchase handler if drinks tab
    if (type === 'drinks') {
      handleDrinkPurchase(e);
      return;
    }
    
    if (!user) return;

    setSubmitting(true);
    setMessage('');

    try {
      // Validate worker name for workers income category
      const finalWorkerName = selectedWorkerOption === '__new__' ? newWorkerName : selectedWorkerOption;
      if (type === 'expense' && category === 'workers income' && !finalWorkerName.trim()) {
        setMessage(t('msg.please_enter_worker_name'));
        setSubmitting(false);
        return;
      }

      // Check for duplicate worker name (case-insensitive) only when adding new worker
      if (type === 'expense' && category === 'workers income' && showNewWorkerInput && newWorkerName.trim()) {
        const normalizedInput = newWorkerName.trim().toLowerCase();
        const existingWorker = workerNames.find(name => name.toLowerCase() === normalizedInput);
        if (existingWorker) {
          setMessage('Bu ishchi allaqachon mavjud');
          setSubmitting(false);
          return;
        }
      }

      const amountValue = parseFloat(amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        setMessage(t('msg.please_enter_valid_amount'));
        setSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase.from('camp_finances').insert({
        transaction_date: date,
        type,
        category: type === 'expense' ? category : 'Income',
        currency: 'UZS',
        original_amount: amountValue,
        exchange_rate: 1,
        amount_uzs: amountValue,
        description,
        worker_name: type === 'expense' && category === 'workers income' ? finalWorkerName : null,
        period_start: type === 'expense' && category === 'workers income' ? periodStart : null,
        period_end: type === 'expense' && category === 'workers income' ? periodEnd : null,
        created_by: user.id,
        team_id: user?.team_id,
      });

      if (insertError) throw insertError;

      setMessage(t('msg.record_saved'));
      fetchRecentExpenses();
      fetchWorkerNames();
      
      // Reset form
      setCategory('');
      setDescription('');
      setAmount('');
      setWorkerName('');
      setSelectedWorkerOption('');
      setNewWorkerName('');
      setShowNewWorkerInput(false);
      setPeriodStart('');
      setPeriodEnd('');
    } catch (err: any) {
      setMessage(`${t('msg.error')}: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrinkPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const quantity = parseInt(drinkForm.quantity);
      const buyPrice = parseFloat(drinkForm.buy_price);
      const sellPrice = parseFloat(drinkForm.sell_price);

      if (isNaN(quantity) || isNaN(buyPrice) || isNaN(sellPrice)) {
        setMessage(t('msg.please_fill_all_drink_fields'));
        setSubmitting(false);
        return;
      }

      if (drinkFormMode === 'restock' && restockingVariant) {
        // Restock existing variant - increment stock and optionally update prices
        const existingVariant = drinkVariants.find(v => v.id === restockingVariant.id);
        if (existingVariant) {
          const { error: updateError } = await supabase
            .from('drink_variants')
            .update({
              quantity_in_stock: existingVariant.quantity_in_stock + quantity,
              buy_price: buyPrice || existingVariant.buy_price,
              sell_price: sellPrice || existingVariant.sell_price
            })
            .eq('id', restockingVariant.id);
          if (updateError) throw updateError;

          // Create expense payment for the purchase
          const totalCost = buyPrice * quantity;
          const drinkName = drinks.find(d => d.id === existingVariant.drink_id)?.name || drinkForm.name || 'Unknown drink';
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              booking_id: null,
              amount_original: totalCost,
              currency_original: 'UZS',
              method: 'Cash',
              type: 'expense',
              note: `Stock purchase: ${drinkName} ${existingVariant.unit} x${quantity}`
            });
          if (paymentError) throw paymentError;
          fetchCashBox();
        }
      } else {
        // Create new drink or variant
        if (!drinkForm.name) {
          setMessage(t('msg.please_fill_all_drink_fields'));
          setSubmitting(false);
          return;
        }

        let drinkId: string;

        if (selectedBrandId && selectedBrandId !== 'new') {
          // Existing brand selected from dropdown - use its id directly
          drinkId = selectedBrandId;
        } else {
          // New brand - normalize the drink name (trim whitespace)
          const normalizedName = drinkForm.name.trim();

          // Check if drink already exists by name (case-insensitive, trimmed) - safety net
          const { data: existingDrink, error: fetchErr } = await supabase
            .from('drinks')
            .select('*')
            .ilike('name', normalizedName)
            .eq('category', drinkForm.category)
            .maybeSingle();
          if (fetchErr) throw fetchErr;

          if (existingDrink) {
            // Use existing drink's canonical name (preserve original casing)
            drinkId = existingDrink.id;
          } else {
            // Create new drink with normalized name
            const { data: newDrink, error: insertDrinkErr } = await supabase
              .from('drinks')
              .insert({
                name: normalizedName,
                category: drinkForm.category
              })
              .select()
              .single();
            if (insertDrinkErr) throw insertDrinkErr;

            if (!newDrink) {
              throw new Error('Failed to create drink');
            }
            drinkId = newDrink.id;
          }
        }

        // Check if variant with same unit already exists for this drink
        const { data: existingVariant, error: fetchVariantErr } = await supabase
          .from('drink_variants')
          .select('*')
          .eq('drink_id', drinkId)
          .eq('unit', drinkForm.unit)
          .maybeSingle();
        if (fetchVariantErr) throw fetchVariantErr;

        if (existingVariant) {
          // Restock existing variant
          const { error: restockError } = await supabase
            .from('drink_variants')
            .update({
              quantity_in_stock: existingVariant.quantity_in_stock + quantity,
              buy_price: buyPrice,
              sell_price: sellPrice
            })
            .eq('id', existingVariant.id);
          if (restockError) throw restockError;
          setMessage(t('msg.variant_restocked'));

          // Create expense payment for the purchase
          const totalCost = buyPrice * quantity;
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              booking_id: null,
              amount_original: totalCost,
              currency_original: 'UZS',
              method: 'Cash',
              type: 'expense',
              note: `Stock purchase: ${existingVariant.drink_name} ${existingVariant.unit} x${quantity}`
            });
          if (paymentError) throw paymentError;
          fetchCashBox();
        } else {
          // Insert new variant
          const { error: insertVariantError } = await supabase
            .from('drink_variants')
            .insert({
              drink_id: drinkId,
              unit: drinkForm.unit,
              quantity_in_stock: quantity,
              buy_price: buyPrice,
              sell_price: sellPrice
            });
          if (insertVariantError) throw insertVariantError;
          setMessage(t('msg.drink_purchase_saved'));

          // Create expense payment for the purchase
          const totalCost = buyPrice * quantity;
          const drinkName = (selectedBrandId && selectedBrandId !== 'new' ? drinks.find(d => d.id === selectedBrandId)?.name : null) || drinkForm.name || 'Unknown drink';
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              booking_id: null,
              amount_original: totalCost,
              currency_original: 'UZS',
              method: 'Cash',
              type: 'expense',
              note: `Stock purchase: ${drinkName} ${drinkForm.unit} x${quantity}`
            });
          if (paymentError) throw paymentError;
          fetchCashBox();
        }
      }

      setDrinkForm({ name: '', category: 'salqin_ichimliklar', unit: '0.5L', quantity: '', buy_price: '', sell_price: '' });
      setRestockingVariant(null);
      setDrinkFormMode('add');
      setSelectedBrandId('');
      setShowNewBrandInput(false);
      setLockBrandAndUnit(false);
      setShowRestockModal(false);
      setShowAddDrinkModal(false);
      setLockCategory(false);
      fetchDrinks();
    } catch (err: any) {
      setMessage(`${t('msg.error')}: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#0F1419] font-sans">
      <header className="bg-gradient-to-r from-[#0B6E4F] to-[#0B6E4F] text-[#C9A227] shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a
              href="/manager"
              className="p-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl hover:bg-[#0B6E4F] transition-all shadow-lg"
            >
              <svg className="w-8 h-8 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div className="p-2 bg-[#1C232E]/30 rounded-xl backdrop-blur-sm border border-[#5C4A2E]/30">
              <svg className="w-8 h-8 text-[#C9A227]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#EDE6D6] font-heading">{t('form.financial_tracker')}</h1>
              <p className="text-xs text-[#9C9384] font-bold tracking-widest uppercase opacity-80">{t('form.manager_recording')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher variant="light" />
            {cashBox.USD > 0 && (
              <button
                type="button"
                onClick={() => setShowExchangeModal(true)}
                className="px-4 py-2.5 bg-[#C9A227]/90 hover:bg-[#C9A227] rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-[#C9A227]/20 active:scale-95 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Exchange USD
              </button>
            )}
            <button
              onClick={signOut}
              className="px-5 py-2.5 bg-[#722F37]/90 hover:bg-[#722F37] rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-[#722F37]/20 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Cashbox Balance Display */}
        <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-black text-[#EDE6D6] font-heading">Cashbox Balance</h3>
            <button
              onClick={() => setExchangeModalOpen(true)}
              className="px-3 py-1.5 bg-[#0B6E4F]/10 hover:bg-[#0B6E4F]/20 text-[#0B6E4F] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[#0B6E4F]/20"
            >
              {t('exchange.title')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cashBox.USD !== 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">USD Total</p>
                <p className="text-2xl font-data font-bold tracking-tight text-white">${cashBox.USD.toLocaleString()}</p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">UZS Total</p>
              <p className="text-2xl font-data font-bold tracking-tight text-white">{cashBox.UZS.toLocaleString()} <span className="text-[10px] text-slate-500 font-medium">SUM</span></p>
            </div>
            {cashBox.EUR !== 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">EUR Total</p>
                <p className="text-2xl font-data font-bold tracking-tight text-white">€{cashBox.EUR.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Section */}
          <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-8">
          <h2 className="text-2xl font-black text-[#EDE6D6] mb-6 font-heading">{t('btn.record_transaction')}</h2>
          
          {message && (
            <div className={`mb-4 p-4 rounded-xl ${
              message.includes('Error') ? 'bg-[#722F37]/20 text-[#722F37] border border-[#722F37]/40' : 'bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40'
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
                    ? 'bg-[#722F37] text-[#C9A227] shadow-lg shadow-[#722F37]/30' 
                    : 'bg-[#1C232E] text-[#9C9384] hover:bg-[#2A1518]'
                }`}
              >
                {t('form.expense')}
              </button>
              <button
                type="button"
                onClick={() => setType('income')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                  type === 'income' 
                    ? 'bg-[#0B6E4F] text-[#C9A227] shadow-lg shadow-[#0B6E4F]/30' 
                    : 'bg-[#1C232E] text-[#9C9384] hover:bg-[#2A1518]'
                }`}
              >
                {t('form.income')}
              </button>
              <button
                type="button"
                onClick={() => setType('drinks')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                  type === 'drinks' 
                    ? 'bg-[#C9A227] text-[#0F1419] shadow-lg shadow-[#C9A227]/30' 
                    : 'bg-[#1C232E] text-[#9C9384] hover:bg-[#2A1518]'
                }`}
              >
                {t('txn.tab_drinks')}
              </button>
            </div>

            {/* Selected Date Display - only for expense/income */}
            {type !== 'drinks' && (
              <div>
                <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('form.selected_date')}</label>
                <div className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl bg-[#0B6E4F]/10 text-[#C9A227] font-black">
                  {new Date(date).toLocaleDateString(getLocale(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                <p className="text-xs text-[#9C9384] mt-1 font-semibold">{t('form.select_date_from_calendar')}</p>
              </div>
            )}

            {/* Category - only for expense/income */}
            {type === 'expense' && (
              <div>
                <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('form.select_category')}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                  required
                >
                  <option value="">{t('form.select_category')}</option>
                  {expenseCategories.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Worker Name - only for workers income category */}
            {type === 'expense' && category === 'workers income' && (
              <div>
                <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('txn.worker_name_label')} *</label>
                <select
                  value={selectedWorkerOption}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSelectedWorkerOption(newValue);
                    setShowNewWorkerInput(newValue === '__new__');
                    if (newValue !== '__new__') {
                      setWorkerName(newValue);
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                  required
                >
                  <option value="">{t('form.select_worker')}</option>
                  {workerNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  <option value="__new__">{t('txn.add_new_worker')}</option>
                </select>
                {showNewWorkerInput && (
                  <div className="mt-3">
                    <input
                      type="text"
                      value={newWorkerName}
                      onChange={(e) => setNewWorkerName(e.target.value)}
                      placeholder={t('form.enter_worker_name')}
                      className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            {/* Period Date Fields - only for workers income category */}
            {type === 'expense' && category === 'workers income' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('txn.period_start_label')}</label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('txn.period_end_label')}</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                  />
                </div>
              </div>
            )}

            {/* Amount - only for expense/income */}
            {type !== 'drinks' && (
              <div>
                <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('form.enter_amount_uzs')} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('form.enter_amount_uzs')}
                  className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                  required
                />
              </div>
            )}

            {/* Description - only for expense/income */}
            {type !== 'drinks' && (
              <div>
                <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('form.describe_transaction')} *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('form.describe_transaction')}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                  required
                />
              </div>
            )}

            {/* Drink Inventory - 3-level accordion */}
            {type === 'drinks' && (
              <div className="space-y-4 md:space-y-6">
                <h4 className="text-sm md:text-base font-black text-[#EDE6D6]">{t('drinks.existing_drinks')}</h4>
                {drinkVariants.length === 0 ? (
                  <p className="text-xs text-[#9C9384]">{t('drinks.no_drinks')}</p>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {['salqin_ichimliklar', 'piva', 'vino', 'aroq'].map(category => {
                      const categoryDrinks = drinks.filter(d => d.category === category);
                      const categoryVariants = drinkVariants.filter(v => categoryDrinks.some(d => d.id === v.drink_id));
                      const categoryStock = categoryVariants.reduce((sum, v) => sum + (v.quantity_in_stock || 0), 0);
                      const isExpanded = expandedCategories.has(category);

                      return (
                        <div key={category} className="bg-[#0F1419] rounded-xl border border-[#5C4A2E]/30">
                          <div className="flex items-center justify-between px-3 md:px-4 py-2 md:py-3">
                            <button
                              type="button"
                              onClick={() => {
                                const newExpanded = new Set(expandedCategories);
                                if (newExpanded.has(category)) {
                                  newExpanded.delete(category);
                                } else {
                                  newExpanded.add(category);
                                }
                                setExpandedCategories(newExpanded);
                              }}
                              className="flex items-center gap-2 flex-1 hover:bg-[#1C232E]/50 transition-all rounded-xl px-2 py-1"
                            >
                              <span className="text-xs md:text-sm font-bold text-[#EDE6D6]">{t(`drinks.category_${category}`)}</span>
                              <span className="text-xs text-[#9C9384]">{t('drinks.stock')}: {categoryStock}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRestockingVariant(null);
                                setDrinkFormMode('add');
                                setSelectedBrandId('');
                                setShowNewBrandInput(false);
                                setLockBrandAndUnit(false);
                                setShowAddDrinkModal(true);
                                setLockCategory(true);
                                setDrinkForm({ name: '', category: category as any, unit: unitPresets[category][0], quantity: '', buy_price: '', sell_price: '' });
                              }}
                              className="px-3 py-1 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold hover:bg-[#0B6E4F]/80 transition-all text-sm"
                              aria-label={t('drinks.add_new_drink')}
                            >
                              +
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-1 md:space-y-2">
                              {categoryDrinks.map(drink => {
                                const drinkVariantsList = drinkVariants.filter(v => v.drink_id === drink.id);
                                const drinkStock = drinkVariantsList.reduce((sum, v) => sum + (v.quantity_in_stock || 0), 0);
                                const isBrandExpanded = expandedBrands.has(drink.id);

                                return (
                                  <div key={drink.id} className="ml-2 md:ml-4 bg-[#1C232E]/50 rounded-lg border border-[#5C4A2E]/20">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newExpanded = new Set(expandedBrands);
                                        if (newExpanded.has(drink.id)) {
                                          newExpanded.delete(drink.id);
                                        } else {
                                          newExpanded.add(drink.id);
                                        }
                                        setExpandedBrands(newExpanded);
                                      }}
                                      className="w-full px-2 md:px-3 py-2 flex items-center justify-between hover:bg-[#1C232E] transition-all rounded-lg"
                                    >
                                      <span className="text-xs font-bold text-[#EDE6D6]">{drink.name}</span>
                                      <span className="text-xs text-[#9C9384]">{t('drinks.stock')}: {drinkStock}</span>
                                    </button>
                                    {isBrandExpanded && (
                                      <div className="px-2 md:px-3 pb-2 md:pb-3 space-y-1">
                                        {unitPresets[drink.category]?.map(unit => {
                                          const existingVariant = drinkVariantsList.find(v => v.unit === unit);
                                          const displayVariant = existingVariant || {
                                            id: `virtual-${drink.id}-${unit}`,
                                            drink_id: drink.id,
                                            unit: unit,
                                            quantity_in_stock: 0,
                                            sell_price: null,
                                            buy_price: null,
                                            isVirtual: true
                                          };

                                          return (
                                            <div key={unit} className="flex items-center justify-between bg-[#0F1419] p-2 rounded border border-[#5C4A2E]/20">
                                              <div>
                                                <p className="text-xs text-[#EDE6D6]">{unit}</p>
                                                <p className={`text-xs font-bold ${displayVariant.quantity_in_stock < 5 ? 'text-[#DC2626]' : 'text-[#9C9384]'}`}>
                                                  {t('drinks.stock')}: {displayVariant.quantity_in_stock} · {displayVariant.sell_price?.toLocaleString() || (displayVariant.isVirtual ? t('pos.price_not_set') : '0')} so'm
                                                </p>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (displayVariant.isVirtual) {
                                                    // Virtual row - open Add drink modal with locked brand/unit
                                                    setSelectedBrandId(drink.id);
                                                    setLockBrandAndUnit(true);
                                                    setDrinkFormMode('add');
                                                    setDrinkForm({
                                                      name: drink.name,
                                                      category: drink.category,
                                                      unit: unit,
                                                      quantity: '',
                                                      buy_price: '',
                                                      sell_price: ''
                                                    });
                                                    setShowAddDrinkModal(true);
                                                  } else {
                                                    // Real variant - open Restock modal
                                                    setRestockingVariant(displayVariant);
                                                    setDrinkFormMode('restock');
                                                    setSelectedBrandId(drink.id);
                                                    setDrinkForm({
                                                      name: drink.name,
                                                      category: drink.category,
                                                      unit: unit,
                                                      quantity: '',
                                                      buy_price: displayVariant.buy_price?.toString() || '',
                                                      sell_price: displayVariant.sell_price?.toString() || ''
                                                    });
                                                    setShowRestockModal(true);
                                                  }
                                                }}
                                                className={`px-2 py-1 ${displayVariant.isVirtual ? 'bg-[#0B6E4F] text-[#C9A227]' : 'bg-[#0B6E4F]/20 text-[#0B6E4F]'} rounded font-bold uppercase text-xs hover:opacity-80 transition-all border border-[#0B6E4F]/40`}
                                              >
                                                {displayVariant.isVirtual ? '+' : t('drinks.restock_button')}
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-[#0B6E4F] text-[#C9A227] rounded-xl font-black uppercase tracking-widest hover:bg-[#0B6E4F] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#0B6E4F]/30"
            >
              {submitting ? t('btn.saving') : (type === 'drinks' ? t('drinks.add_purchase') : t('btn.save_record'))}
            </button>
          </form>
          </div>

          {/* Add Drink Modal */}
          {showAddDrinkModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#1C232E] rounded-2xl p-6 max-w-md w-full border border-[#5C4A2E]/30">
                <h3 className="text-lg font-black text-[#EDE6D6] mb-4">{t('drinks.add_new_drink')}</h3>
                <form onSubmit={handleDrinkPurchase} className="space-y-4">
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2 flex items-center gap-2">
                      {t('drinks.category')}
                      {(lockCategory || lockBrandAndUnit) && (
                        <svg className="w-4 h-4 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </label>
                    {!(lockCategory || lockBrandAndUnit) ? (
                      <select
                        value={drinkForm.category}
                        onChange={(e) => {
                          setDrinkForm({ ...drinkForm, category: e.target.value, unit: unitPresets[e.target.value][0] });
                        }}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      >
                        <option value="salqin_ichimliklar">{t('drinks.category_salqin_ichimliklar')}</option>
                        <option value="piva">{t('drinks.category_piva')}</option>
                        <option value="vino">{t('drinks.category_vino')}</option>
                        <option value="aroq">{t('drinks.category_aroq')}</option>
                      </select>
                    ) : (
                      <div className="w-full px-4 py-3 border-2 border-[#5C4A2E]/20 rounded-xl bg-[#1C232E] text-[#9C9384] font-semibold cursor-not-allowed">
                        {t(`drinks.category_${drinkForm.category}`)}
                      </div>
                    )}
                  </div>
                  {!lockBrandAndUnit && (
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.name')}</label>
                      <select
                        value={selectedBrandId}
                        onChange={(e) => {
                          setSelectedBrandId(e.target.value);
                          if (e.target.value === 'new') {
                            setShowNewBrandInput(true);
                            setDrinkForm({ ...drinkForm, name: '' });
                          } else {
                            setShowNewBrandInput(false);
                            const selectedDrink = drinks.find(d => d.id === e.target.value);
                            setDrinkForm({ ...drinkForm, name: selectedDrink?.name || '' });
                          }
                        }}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                        required
                      >
                        <option value="">{t('drinks.select_brand')}</option>
                        {drinks.filter(d => d.category === drinkForm.category).map(drink => (
                          <option key={drink.id} value={drink.id}>{drink.name}</option>
                        ))}
                        <option value="new">+ Yangi brend</option>
                      </select>
                    </div>
                  )}
                  {showNewBrandInput && !lockBrandAndUnit && (
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.new_brand_name')}</label>
                      <input
                        type="text"
                        value={drinkForm.name}
                        onChange={(e) => setDrinkForm({ ...drinkForm, name: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                        required
                      />
                    </div>
                  )}
                  {lockBrandAndUnit && (
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2 flex items-center gap-2">
                        {t('drinks.name')}
                        <svg className="w-4 h-4 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </label>
                      <div className="w-full px-4 py-3 border-2 border-[#5C4A2E]/20 rounded-xl bg-[#1C232E] text-[#9C9384] font-semibold cursor-not-allowed">
                        {drinkForm.name}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2 flex items-center gap-2">
                      {t('drinks.unit')}
                      {lockBrandAndUnit && (
                        <svg className="w-4 h-4 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </label>
                    {!lockBrandAndUnit ? (
                      <select
                        value={drinkForm.unit}
                        onChange={(e) => setDrinkForm({ ...drinkForm, unit: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      >
                        {unitPresets[drinkForm.category]?.map(unit => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                        <option value="custom">{t('drinks.unit_custom')}</option>
                      </select>
                    ) : (
                      <div className="w-full px-4 py-3 border-2 border-[#5C4A2E]/20 rounded-xl bg-[#1C232E] text-[#9C9384] font-semibold cursor-not-allowed">
                        {drinkForm.unit}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.quantity')}</label>
                      <input
                        type="number"
                        value={drinkForm.quantity}
                        onChange={(e) => setDrinkForm({ ...drinkForm, quantity: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.buy_price')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={drinkForm.buy_price}
                        onChange={(e) => setDrinkForm({ ...drinkForm, buy_price: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.sell_price')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={drinkForm.sell_price}
                        onChange={(e) => setDrinkForm({ ...drinkForm, sell_price: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddDrinkModal(false);
                        setLockCategory(false);
                        setDrinkFormMode('add');
                        setRestockingVariant(null);
                        setSelectedBrandId('');
                        setShowNewBrandInput(false);
                        setLockBrandAndUnit(false);
                        setDrinkForm({ name: '', category: 'salqin_ichimliklar', unit: '0.5L', quantity: '', buy_price: '', sell_price: '' });
                      }}
                      className="flex-1 py-3 bg-[#2A1518] text-[#9C9384] rounded-xl font-bold uppercase text-xs hover:bg-[#2A1518]/80 transition-all border border-[#5C4A2E]/30"
                    >
                      {t('drinks.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl font-bold uppercase text-xs hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50"
                    >
                      {submitting ? t('btn.saving') : t('drinks.add')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Restock Modal */}
          {showRestockModal && restockingVariant && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#1C232E] rounded-2xl p-6 max-w-md w-full border border-[#5C4A2E]/30">
                <h3 className="text-lg font-black text-[#EDE6D6] mb-4">{t('drinks.restock_button')}</h3>
                <form onSubmit={handleDrinkPurchase} className="space-y-4">
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.unit')}</label>
                    <input
                      type="text"
                      value={drinkForm.unit}
                      disabled
                      className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl text-[#9C9384] font-semibold bg-[#0F1419] opacity-60 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.quantity_to_add')}</label>
                    <input
                      type="number"
                      value={drinkForm.quantity}
                      onChange={(e) => setDrinkForm({ ...drinkForm, quantity: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.buy_price')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={drinkForm.buy_price}
                        onChange={(e) => setDrinkForm({ ...drinkForm, buy_price: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.sell_price')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={drinkForm.sell_price}
                        onChange={(e) => setDrinkForm({ ...drinkForm, sell_price: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRestockModal(false);
                        setDrinkFormMode('add');
                        setRestockingVariant(null);
                        setDrinkForm({ name: '', category: 'salqin_ichimliklar', unit: '0.5L', quantity: '', buy_price: '', sell_price: '' });
                      }}
                      className="flex-1 py-3 bg-[#2A1518] text-[#9C9384] rounded-xl font-bold uppercase text-xs hover:bg-[#2A1518]/80 transition-all border border-[#5C4A2E]/30"
                    >
                      {t('drinks.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl font-bold uppercase text-xs hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50"
                    >
                      {submitting ? t('btn.saving') : t('drinks.restock_button')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            )}
          {type !== 'drinks' && (
          <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#EDE6D6] font-heading">{t('calendar.title')}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (currentMonth === 0) {
                      setCurrentMonth(11);
                      setCurrentYear(currentYear - 1);
                    } else {
                      setCurrentMonth(currentMonth - 1);
                    }
                  }}
                  className="p-2 bg-[#1C232E] hover:bg-[#2A1518] rounded-lg transition-all border border-[#5C4A2E]/30"
                >
                  <svg className="w-5 h-5 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <span className="text-sm md:text-lg font-black text-[#EDE6D6] min-w-[100px] md:min-w-[140px] text-center">
                  {new Date(currentYear, currentMonth).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => {
                    if (currentMonth === 11) {
                      setCurrentMonth(0);
                      setCurrentYear(currentYear + 1);
                    } else {
                      setCurrentMonth(currentMonth + 1);
                    }
                  }}
                  className="p-2 bg-[#1C232E] hover:bg-[#2A1518] rounded-lg transition-all border border-[#5C4A2E]/30"
                >
                  <svg className="w-5 h-5 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    setCurrentMonth(today.getMonth());
                    setCurrentYear(today.getFullYear());
                    setDate(today.toISOString().split('T')[0]);
                  }}
                  className="px-3 py-2 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold hover:bg-[#0B6E4F]/80 transition-all"
                >
                  {t('calendar.today')}
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {/* Day Headers */}
              {[t('day.1'), t('day.2'), t('day.3'), t('day.4'), t('day.5'), t('day.6'), t('day.0')].map((day, i) => (
                <div key={day} className="text-center text-xs md:text-sm font-black text-[#9C9384] py-1 md:py-2">
                  {day}
                </div>
              ))}

              {/* Calendar Days */}
              {(() => {
                const firstDay = new Date(currentYear, currentMonth, 1);
                const lastDay = new Date(currentYear, currentMonth + 1, 0);
                const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0
                const totalDays = lastDay.getDate();

                const days = [];
                for (let i = 0; i < startDay; i++) {
                  days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
                }

                for (let day = 1; day <= totalDays; day++) {
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayFinances = recentExpenses.filter(f => f.date === dateStr);
                  // Payments for this day (date portion of created_at)
                  const dayPayments = allPayments.filter(p => p.created_at?.slice(0, 10) === dateStr);
                  const finIncome = dayFinances.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount_uzs, 0);
                  const finExpense = dayFinances.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount_uzs, 0);
                  const payIncome = dayPayments.filter(p => p.type === 'sale').reduce((sum, p) => sum + Number(p.amount_original), 0);
                  const payExpense = dayPayments.filter(p => p.type === 'expense').reduce((sum, p) => sum + Number(p.amount_original), 0);
                  const netIncome = finIncome + payIncome;
                  const netExpense = finExpense + payExpense;
                  const netProfit = netIncome - netExpense;
                  
                  const today = new Date().toISOString().split('T')[0];
                  const isToday = dateStr === today;
                  const isSelected = dateStr === date;

                  days.push(
                    <button
                      key={day}
                      onClick={() => {
                        setDate(dateStr);
                        fetchDayTransactions(dateStr);
                      }}
                      className={`
                        aspect-square rounded-lg border-2 p-1 flex flex-col items-center justify-center transition-all hover:border-[#0B6E4F] hover:shadow-md
                        ${isToday ? 'border-2 border-[#C9A227] bg-[#0F1419]' : 'border-[#5C4A2E]/30 bg-[#0F1419]'}
                        ${isSelected ? 'border-2 border-[#0B6E4F] bg-[#0B6E4F]/20' : ''}
                        ${netProfit > 0 ? 'bg-[#0B6E4F]/10' : ''}
                        ${netProfit < 0 ? 'bg-[#722F37]/10' : ''}
                      `}
                    >
                      <span className="text-xs sm:text-sm font-black text-[#EDE6D6]">{day}</span>
                      {netProfit !== 0 && (
                        <div className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 truncate w-full text-center">
                          <span className={`font-bold ${netProfit > 0 ? 'text-[#0B6E4F]' : 'text-[#722F37]'}`}>
                            {netProfit > 0 ? '+' : ''}{formatCurrency(netProfit)}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                }

                return days;
              })()}
            </div>
          </div>
          )}

          {/* Selected Date Transactions - only for expense/income */}
          {type !== 'drinks' && (
          <div className="lg:col-span-2 mt-6 bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-8">
            <h3 className="text-2xl font-black text-[#EDE6D6] font-heading mb-6">
              {date === new Date().toISOString().split('T')[0] ? t('calendar.today') : date} {t('form.transactions')}
            </h3>
            
            {loadingRecent ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              (() => {
                const dayFinances = recentExpenses.filter(f => f.date === date);
                
                if (dayFinances.length === 0) {
                  return <p className="text-[#9C9384] italic text-sm">{t('msg.no_transactions_for_date')}</p>;
                }

                return (
                  <div className="space-y-3">
                    {dayFinances.map((item) => (
                      <div 
                        key={item.id} 
                        className="bg-[#0F1419] rounded-lg p-4 border border-[#5C4A2E]/30 cursor-pointer hover:border-[#0B6E4F] hover:shadow-md transition-all"
                        onClick={() => router.push(`/financials/detail/${item.id}`)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-black text-[#EDE6D6]">{item.type === 'expense' ? item.category : (item.guest_name || 'Income')}</p>
                            <p className="text-sm text-[#9C9384]">{item.description}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-black ${item.type === 'expense' ? 'text-[#722F37]' : 'text-[#0B6E4F]'}`}>
                              {item.original_amount.toLocaleString()} {item.currency || 'UZS'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
          )}

          {/* Worker Payments Section */}
          <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-8 mt-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#EDE6D6] font-heading">{t('txn.worker_payments_section')}</h3>
              <button
                onClick={() => router.push('/financials/workers')}
                className="px-4 py-2 bg-[#0B6E4F] hover:bg-[#0B6E4F]/80 text-[#C9A227] rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-[#0B6E4F]/20 active:scale-95"
              >
                {t('txn.view_all_workers')}
              </button>
            </div>
            
            {loadingWorkerPayments ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : workerPayments.length === 0 ? (
              <p className="text-[#9C9384] italic text-sm">No worker payments recorded</p>
            ) : (
              (() => {
                const groupedByWorker = workerPayments.reduce((acc: any, payment: any) => {
                  const workerName = payment.worker_name || 'Unknown';
                  if (!acc[workerName]) {
                    acc[workerName] = [];
                  }
                  acc[workerName].push(payment);
                  return acc;
                }, {});

                Object.keys(groupedByWorker).forEach(workerName => {
                  groupedByWorker[workerName].sort((a: any, b: any) => 
                    new Date(b.period_start || '').getTime() - new Date(a.period_start || '').getTime()
                  );
                });

                return (
                  <div className="space-y-6">
                    {Object.entries(groupedByWorker).map(([workerName, payments]: [string, any]) => (
                      <div key={workerName} className="bg-[#0F1419] rounded-xl p-6 border border-[#5C4A2E]/30">
                        <h4 className="text-lg font-black text-[#C9A227] mb-4">{workerName}</h4>
                        <div className="space-y-3">
                          {payments.map((payment: any) => (
                            <div key={payment.id} className="flex justify-between items-center bg-[#1C232E] rounded-lg p-4 border border-[#5C4A2E]/20">
                              <div>
                                <p className="text-sm text-[#9C9384]">
                                  {payment.period_start && payment.period_end 
                                    ? `${payment.period_start} – ${payment.period_end}`
                                    : payment.period_start || payment.period_end || 'No period specified'
                                  }
                                </p>
                                <p className="text-xs text-[#5C4A2E] mt-1">{payment.transaction_date}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-black text-[#EDE6D6]">
                                  {payment.amount_uzs?.toLocaleString()} UZS
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>

          {/* Currency Exchange Modal */}
          {showExchangeModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#1C232E] rounded-2xl p-6 max-w-md w-full border border-[#5C4A2E]/30">
                <h3 className="text-lg font-black text-[#EDE6D6] mb-4">Exchange USD to UZS</h3>
                <form onSubmit={handleCurrencyExchange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2">USD Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={exchangeForm.usdAmount}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, usdAmount: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      required
                    />
                    <p className="text-xs text-[#9C9384] mt-1">Available: ${cashBox.USD.toFixed(2)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2">Exchange Rate (1 USD = ? UZS)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={exchangeForm.exchangeRate}
                      onChange={(e) => setExchangeForm({ ...exchangeForm, exchangeRate: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      required
                    />
                  </div>
                  {exchangeForm.usdAmount && exchangeForm.exchangeRate && (
                    <div className="bg-[#0F1419] p-3 rounded-lg border border-[#5C4A2E]/30">
                      <p className="text-sm text-[#9C9384]">You will receive:</p>
                      <p className="text-lg font-black text-[#C9A227]">
                        {(parseFloat(exchangeForm.usdAmount) * parseFloat(exchangeForm.exchangeRate)).toLocaleString()} UZS
                      </p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowExchangeModal(false)}
                      className="flex-1 py-3 bg-[#2A1518] text-[#9C9384] rounded-xl font-bold uppercase text-xs hover:bg-[#2A1518]/80 transition-all border border-[#5C4A2E]/30"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl font-bold uppercase text-xs hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50"
                    >
                      {submitting ? 'Processing...' : 'Exchange'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Day Transactions Modal */}
          {showDayTransactionsModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowDayTransactionsModal(false)}>
              <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
              <div className="relative bg-[#1C232E] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200 border border-[#5C4A2E]/30" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-[#5C4A2E]/30 flex justify-between items-center">
                  <h2 className="text-xl font-black text-[#EDE6D6]">{date} - All Transactions</h2>
                  <button
                    onClick={() => setShowDayTransactionsModal(false)}
                    className="p-2 hover:bg-[#2A1518] rounded-lg transition-all"
                  >
                    <svg className="w-6 h-6 text-[#9C9384]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  {loadingDayTransactions ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-8 h-8 border-4 border-[#0B6E4F] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : dayTransactions.length === 0 ? (
                    <p className="text-[#9C9384] italic text-sm">No transactions for this date</p>
                  ) : (
                    <div className="space-y-3">
                      {dayTransactions.map((item) => (
                        <div
                          key={item.id}
                          className="bg-[#0F1419] rounded-lg p-4 border border-[#5C4A2E]/30"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-black text-[#EDE6D6]">{item.category}</p>
                              <p className="text-sm text-[#9C9384]">{item.description}</p>
                              <p className="text-xs text-[#5C4A2E] mt-1">{item.source}</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-black ${item.type === 'expense' ? 'text-[#722F37]' : 'text-[#0B6E4F]'}`}>
                                {item.type === 'expense' ? '-' : '+'}{item.amount.toLocaleString()} {item.currency}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Exchange Modal */}
      {exchangeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setExchangeModalOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative bg-[#1C232E] rounded-xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95 duration-200 border border-[#5C4A2E]/30" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black text-[#EDE6D6] mb-6">{t('exchange.title')}</h2>
            
            {exchangeMessage && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                exchangeMessage.includes('Error') || exchangeMessage.includes('Could not') || exchangeMessage.includes('please')
                  ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
              }`}>
                {exchangeMessage}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">{t('exchange.from_currency')}</label>
                <select
                  value={exchangeFromCurrency}
                  onChange={(e) => {
                    setExchangeFromCurrency(e.target.value as 'USD' | 'EUR');
                    setExchangeRate('');
                    setExchangeRateSource('manual');
                    setExchangeAmountError('');
                    // Re-validate amount if it exists
                    if (exchangeAmount) {
                      const amount = parseFloat(exchangeAmount);
                      const newAvailableBalance = cashBox[e.target.value as 'USD' | 'EUR'] || 0;
                      if (amount > newAvailableBalance) {
                        setExchangeAmountError(
                          t('exchange.insufficient_balance')
                            .replace('{amount}', newAvailableBalance.toLocaleString())
                            .replace('{currency}', e.target.value)
                        );
                      }
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">{t('exchange.amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={exchangeAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    setExchangeAmount(value);
                    
                    // Validate against current balance
                    if (value) {
                      const amount = parseFloat(value);
                      const availableBalance = cashBox[exchangeFromCurrency] || 0;
                      if (amount > availableBalance) {
                        setExchangeAmountError(
                          t('exchange.insufficient_balance')
                            .replace('{amount}', availableBalance.toLocaleString())
                            .replace('{currency}', exchangeFromCurrency)
                        );
                      } else {
                        setExchangeAmountError('');
                      }
                    } else {
                      setExchangeAmountError('');
                    }
                  }}
                  placeholder="0.00"
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419] ${
                    exchangeAmountError 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-[#5C4A2E]/30 focus:border-[#0B6E4F] focus:ring-[#0B6E4F]/20'
                  }`}
                />
                {exchangeAmountError && (
                  <p className="mt-1 text-xs text-red-500">{exchangeAmountError}</p>
                )}
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-2">{t('exchange.rate')}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={exchangeRate}
                    onChange={(e) => {
                      setExchangeRate(e.target.value);
                      setExchangeRateSource('manual');
                    }}
                    placeholder="0.00"
                    className="flex-1 px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                  />
                  <button
                    type="button"
                    onClick={handleFetchExchangeRate}
                    className="px-4 py-3 bg-[#0B6E4F]/10 hover:bg-[#0B6E4F]/20 text-[#0B6E4F] rounded-lg text-xs font-bold uppercase tracking-widest transition-all border border-[#0B6E4F]/20 whitespace-nowrap"
                  >
                    {t('exchange.get_current_rate')}
                  </button>
                </div>
              </div>
              
              <div className="bg-[#0F1419] rounded-xl p-4 border border-[#5C4A2E]/30">
                <p className="text-[10px] font-bold text-[#9C9384] uppercase tracking-widest mb-1">{t('exchange.result')}</p>
                <p className="text-2xl font-bold text-[#0B6E4F]">
                  {exchangeAmount && exchangeRate 
                    ? (parseFloat(exchangeAmount) * parseFloat(exchangeRate)).toLocaleString('uz-UZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                    : '0.00'}
                  {' UZS'}
                </p>
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setExchangeModalOpen(false);
                    setExchangeAmount('');
                    setExchangeRate('');
                    setExchangeRateSource('manual');
                    setExchangeMessage('');
                  }}
                  className="flex-1 py-3 bg-[#1C232E] hover:bg-[#1C232E]/80 text-[#EDE6D6] rounded-lg font-bold uppercase tracking-widest text-xs transition-all"
                >
                  {t('exchange.cancel')}
                </button>
                <button
                  onClick={handleConfirmExchange}
                  disabled={submittingExchange || !exchangeAmount.trim() || !exchangeRate.trim() || !!exchangeAmountError}
                  className="flex-1 py-3 bg-[#0B6E4F] hover:bg-[#0B6E4F]/80 text-[#C9A227] rounded-lg font-bold uppercase tracking-widest text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingExchange ? 'Processing...' : t('exchange.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
