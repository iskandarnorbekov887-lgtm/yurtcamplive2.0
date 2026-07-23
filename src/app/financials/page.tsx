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
  
  // Worker names for combobox
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [workerNameInput, setWorkerNameInput] = useState('');
  const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);
  
  // Date - set via calendar selection
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Recent expenses
  const [recentExpenses, setRecentExpenses] = useState<Finance[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [currentDayOffset, setCurrentDayOffset] = useState(0);

  // Calendar states
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Drinks state - new normalized structure
  const [drinks, setDrinks] = useState<any[]>([]);
  const [drinkVariants, setDrinkVariants] = useState<any[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [showAddDrinkModal, setShowAddDrinkModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockingVariant, setRestockingVariant] = useState<any>(null);
  const [lockCategory, setLockCategory] = useState(false);
  const [drinkForm, setDrinkForm] = useState({
    name: '',
    category: 'saqlangan_ichimliklar',
    unit: '0.5L',
    quantity: '',
    buy_price: '',
    sell_price: ''
  });

  // Unit presets per category
  const unitPresets: Record<string, string[]> = {
    saqlangan_ichimliklar: ['0.25L banka', '0.33L banka', '0.5L', '1L', '1.5L', '2L'],
    piva: ['0.5L banka', '0.5L shisha', '1L'],
    vino: ['shisha', '0.75L'],
    aroq: ['0.25L shisha', '0.5L shisha', '0.7L shisha', '1L shisha']
  };

  // Fetch recent expenses on load
  useEffect(() => {
    fetchRecentExpenses();
    fetchWorkerNames();
    fetchDrinks();
  }, []);

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
        .select('guest_name')
        .eq('category', 'workers income')
        .not('guest_name', 'is', null);
      
      const names = [...new Set(data?.map(r => r.guest_name).filter(Boolean) || [])].sort();
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
      if (type === 'expense' && category === 'workers income' && !workerName.trim()) {
        setMessage(t('msg.please_enter_worker_name'));
        setSubmitting(false);
        return;
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
        worker_name: type === 'expense' && category === 'workers income' ? workerName : null,
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

      if (restockingVariant) {
        // Restock existing variant - increment stock and optionally update prices
        const existingVariant = drinkVariants.find(v => v.id === restockingVariant.id);
        if (existingVariant) {
          await supabase
            .from('drink_variants')
            .update({
              quantity_in_stock: existingVariant.quantity_in_stock + quantity,
              unit: drinkForm.unit || existingVariant.unit,
              buy_price: buyPrice || existingVariant.buy_price,
              sell_price: sellPrice || existingVariant.sell_price
            })
            .eq('id', restockingVariant.id);
        }
      } else {
        // Create new drink or variant
        if (!drinkForm.name) {
          setMessage(t('msg.please_fill_all_drink_fields'));
          setSubmitting(false);
          return;
        }

        // Check if drink already exists by name
        const { data: existingDrink } = await supabase
          .from('drinks')
          .select('*')
          .eq('name', drinkForm.name)
          .eq('category', drinkForm.category)
          .single();

        if (existingDrink) {
          // Add as new variant to existing drink
          await supabase
            .from('drink_variants')
            .insert({
              drink_id: existingDrink.id,
              unit: drinkForm.unit,
              quantity_in_stock: quantity,
              buy_price: buyPrice,
              sell_price: sellPrice
            });
        } else {
          // Create new drink and first variant
          const { data: newDrink } = await supabase
            .from('drinks')
            .insert({
              name: drinkForm.name,
              category: drinkForm.category
            })
            .select()
            .single();

          if (newDrink) {
            await supabase
              .from('drink_variants')
              .insert({
                drink_id: newDrink.id,
                unit: drinkForm.unit,
                quantity_in_stock: quantity,
                buy_price: buyPrice,
                sell_price: sellPrice
              });
          }
        }
      }

      setMessage(t('msg.drink_purchase_saved'));
      setDrinkForm({ name: '', category: 'saqlangan_ichimliklar', unit: '0.5L', quantity: '', buy_price: '', sell_price: '' });
      setRestockingVariant(null);
      setShowRestockModal(false);
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
                onClick={() => router.push('/financials/pos')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                  false 
                    ? 'bg-[#C9A227] text-[#0F1419] shadow-lg shadow-[#C9A227]/30' 
                    : 'bg-[#1C232E] text-[#9C9384] hover:bg-[#2A1518]'
                }`}
              >
                {t('pos.title')}
              </button>
              <button
                type="button"
                onClick={() => router.push('/financials/storage')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                  false 
                    ? 'bg-[#C9A227] text-[#0F1419] shadow-lg shadow-[#C9A227]/30' 
                    : 'bg-[#1C232E] text-[#9C9384] hover:bg-[#2A1518]'
                }`}
              >
                {t('storage.title')}
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
              <div className="relative">
                <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('form.guest_name')} *</label>
                <input
                  type="text"
                  value={workerName}
                  onChange={(e) => {
                    setWorkerName(e.target.value);
                    setWorkerNameInput(e.target.value);
                    setShowWorkerDropdown(true);
                  }}
                  onFocus={() => setShowWorkerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowWorkerDropdown(false), 200)}
                  placeholder={t('form.enter_worker_name')}
                  className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#1C232E]"
                  required
                />
                {showWorkerDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-[#1C232E] border-2 border-[#5C4A2E]/30 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {workerNames
                      .filter(name => name.toLowerCase().includes(workerName.toLowerCase()))
                      .map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setWorkerName(name);
                            setWorkerNameInput(name);
                            setShowWorkerDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-[#EDE6D6] hover:bg-[#0B6E4F]/20 transition-all font-semibold"
                        >
                          {name}
                        </button>
                      ))}
                    {workerName && !workerNames.some(name => name.toLowerCase() === workerName.toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setWorkerName(workerName);
                          setWorkerNameInput(workerName);
                          setShowWorkerDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-[#0B6E4F] hover:bg-[#0B6E4F]/20 transition-all font-bold border-t border-[#5C4A2E]/30"
                      >
                        Add '{workerName}' as new worker
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Amount - only for expense/income */}
            {type !== 'drinks' && (
              <div>
                <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('form.enter_amount_uzs')} *</label>
                <input
                  type="number"
                  step="0.01"
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
                    {['saqlangan_ichimliklar', 'piva', 'vino', 'aroq'].map(category => {
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
                                        {drinkVariantsList.map(variant => (
                                          <div key={variant.id} className="flex items-center justify-between bg-[#0F1419] p-2 rounded border border-[#5C4A2E]/20">
                                            <div>
                                              <p className="text-xs text-[#EDE6D6]">{variant.unit}</p>
                                              <p className={`text-xs font-bold ${variant.quantity_in_stock < 5 ? 'text-[#DC2626]' : 'text-[#9C9384]'}`}>
                                                {t('drinks.stock')}: {variant.quantity_in_stock} · {variant.sell_price?.toLocaleString() || '0'} so'm
                                              </p>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setRestockingVariant(variant);
                                                setDrinkForm({
                                                  name: drink.name,
                                                  category: drink.category,
                                                  unit: variant.unit,
                                                  quantity: '',
                                                  buy_price: variant.buy_price?.toString() || '',
                                                  sell_price: variant.sell_price?.toString() || ''
                                                });
                                                setShowRestockModal(true);
                                              }}
                                              className="px-2 py-1 bg-[#0B6E4F]/20 text-[#0B6E4F] rounded font-bold uppercase text-xs hover:bg-[#0B6E4F]/30 transition-all border border-[#0B6E4F]/40"
                                            >
                                              {t('drinks.restock_button')}
                                            </button>
                                          </div>
                                        ))}
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
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.category')}</label>
                    <select
                      value={drinkForm.category}
                      onChange={(e) => {
                        setDrinkForm({ ...drinkForm, category: e.target.value, unit: unitPresets[e.target.value][0] });
                      }}
                      disabled={lockCategory}
                      className={`w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419] ${lockCategory ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="saqlangan_ichimliklar">{t('drinks.category_saqlangan_ichimliklar')}</option>
                      <option value="piva">{t('drinks.category_piva')}</option>
                      <option value="vino">{t('drinks.category_vino')}</option>
                      <option value="aroq">{t('drinks.category_aroq')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.name')}</label>
                    <input
                      type="text"
                      value={drinkForm.name}
                      onChange={(e) => setDrinkForm({ ...drinkForm, name: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-[#5C4A2E]/30 rounded-xl focus:border-[#0B6E4F] focus:ring-2 focus:ring-[#0B6E4F]/20 transition-all text-[#EDE6D6] font-semibold bg-[#0F1419]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-[#EDE6D6] mb-2">{t('drinks.unit')}</label>
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
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        setDrinkForm({ name: '', category: 'saqlangan_ichimliklar', unit: '0.5L', quantity: '', buy_price: '', sell_price: '' });
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
                        setRestockingVariant(null);
                        setDrinkForm({ name: '', category: 'saqlangan_ichimliklar', unit: '0.5L', quantity: '', buy_price: '', sell_price: '' });
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
            <div className="grid grid-cols-7 gap-2">
              {/* Day Headers */}
              {[t('day.1'), t('day.2'), t('day.3'), t('day.4'), t('day.5'), t('day.6'), t('day.0')].map((day, i) => (
                <div key={day} className="text-center text-sm font-black text-[#9C9384] py-2">
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
                  const netIncome = dayFinances.filter(f => f.type === 'income').reduce((sum, f) => sum + f.amount_uzs, 0);
                  const netExpense = dayFinances.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount_uzs, 0);
                  
                  const today = new Date().toISOString().split('T')[0];
                  const isToday = dateStr === today;
                  const isSelected = dateStr === date;

                  days.push(
                    <button
                      key={day}
                      onClick={() => setDate(dateStr)}
                      className={`
                        aspect-square rounded-lg border-2 p-1 flex flex-col items-center justify-center transition-all hover:border-[#0B6E4F] hover:shadow-md
                        ${isToday ? 'border-2 border-[#C9A227] bg-[#0F1419]' : 'border-[#5C4A2E]/30 bg-[#0F1419]'}
                        ${isSelected ? 'border-2 border-[#0B6E4F] bg-[#0B6E4F]/20' : ''}
                        ${netIncome > 0 ? 'bg-[#0B6E4F]/10' : ''}
                        ${netExpense > 0 ? 'bg-[#722F37]/10' : ''}
                      `}
                    >
                      <span className="text-sm font-black text-[#EDE6D6]">{day}</span>
                      {(netIncome > 0 || netExpense > 0) && (
                        <div className="text-xs mt-1">
                          {netIncome > 0 && (
                            <span className="text-[#0B6E4F] font-bold">+{(netIncome / 1000000).toFixed(1)}M</span>
                          )}
                          {netExpense > 0 && (
                            <span className="text-[#722F37] font-bold">-{(netExpense / 1000000).toFixed(1)}M</span>
                          )}
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
        </div>
      </main>
    </div>
  );
}
