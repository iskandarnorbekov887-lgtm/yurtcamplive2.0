'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';

export const dynamic = 'force-dynamic';

interface DrinkVariant {
  id: string;
  drink_id: string;
  drink_name: string;
  category: string;
  unit: string;
  quantity_in_stock: number;
  sell_price: number | null;
  buy_price: number;
}

export default function StoragePage() {
  return (
    <ProtectedRoute allowedRoles={['Manager', 'CEO']}>
      <Storage />
    </ProtectedRoute>
  );
}

function Storage() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const [drinks, setDrinks] = useState<DrinkVariant[]>([]);

  // Fetch drinks with realtime sync
  useEffect(() => {
    fetchDrinks();
    
    // Subscribe to realtime changes
    const channel = supabase
      .channel('drinks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks' }, () => {
        fetchDrinks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDrinks = async () => {
    const { data, error } = await supabase
      .from('drink_variants')
      .select('*, drinks!inner(name, category)')
      .order('drinks(name)');
    
    if (error) {
      console.error('Error fetching drinks:', error);
    } else {
      const variants = (data || []).map(v => ({
        id: v.id,
        drink_id: v.drink_id,
        drink_name: v.drinks.name,
        category: v.drinks.category,
        unit: v.unit,
        quantity_in_stock: v.quantity_in_stock,
        sell_price: v.sell_price,
        buy_price: v.buy_price
      }));
      setDrinks(variants);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1419] text-[#EDE6D6]">
      {/* Header */}
      <header className="bg-[#1C232E] border-b border-[#5C4A2E]/30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#C9A227]">{t('storage.title')}</h1>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <button
              onClick={() => signOut()}
              className="px-4 py-2 bg-[#722F37] text-[#EDE6D6] rounded-lg font-bold hover:bg-[#722F37]/80 transition-all"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {drinks.length === 0 ? (
          <p className="text-[#9C9384] italic">{t('drinks.no_drinks')}</p>
        ) : (
          <div className="space-y-6">
            {['saqlangan_ichimliklar', 'piva', 'vino', 'aroq'].map(category => {
              const categoryDrinks = drinks.filter(d => d.category === category);
              
              if (categoryDrinks.length === 0) return null;

              // Group by brand name
              const groupedByBrand = categoryDrinks.reduce((acc, variant) => {
                if (!acc[variant.drink_name]) {
                  acc[variant.drink_name] = [];
                }
                acc[variant.drink_name].push(variant);
                return acc;
              }, {} as Record<string, typeof categoryDrinks>);

              return (
                <div key={category} className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-4 md:p-6">
                  <h2 className="text-lg md:text-xl font-black text-[#C9A227] mb-4">{t(`drinks.category_${category}`)}</h2>
                  
                  <div className="space-y-3 md:space-y-4">
                    {Object.entries(groupedByBrand).map(([brandName, variants]) => (
                      <div key={brandName} className="bg-[#0F1419] rounded-lg border border-[#5C4A2E]/30 p-3 md:p-4">
                        <h3 className="font-bold text-[#EDE6D6] mb-2 md:mb-3 text-sm md:text-base">{brandName}</h3>
                        <div className="space-y-1 md:space-y-2">
                          {variants
                            .sort((a, b) => {
                              // Simple numeric sort for unit sizes
                              const getNumericValue = (unit: string) => {
                                const match = unit.match(/(\d+\.?\d*)/);
                                return match ? parseFloat(match[1]) : 0;
                              };
                              return getNumericValue(a.unit) - getNumericValue(b.unit);
                            })
                            .map(variant => (
                              <div key={variant.id} className="flex items-center justify-between pl-4 border-l-2 border-[#5C4A2E]/30">
                                <span className="text-xs md:text-sm text-[#9C9384]">{variant.unit}</span>
                                <span className={`font-black text-xs md:text-sm ${variant.quantity_in_stock === 0 ? 'text-[#DC2626]' : variant.quantity_in_stock < 5 ? 'text-[#DC2626]' : 'text-[#0B6E4F]'}`}>
                                  {variant.quantity_in_stock}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
