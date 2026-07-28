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
    let isMounted = true;
    
    fetchDrinks();
    
    // Subscribe to realtime changes
    const channel = supabase
      .channel('storage-drinks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drink_variants' }, () => {
        if (isMounted) {
          fetchDrinks();
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
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
                <div key={category} className="bg-[#1C232E] rounded-xl shadow-lg border border-[#5C4A2E]/30 p-2 md:p-3">
                  <h2 className="text-sm md:text-base font-black text-[#C9A227] mb-2 md:mb-3">{t(`drinks.category_${category}`)}</h2>
                  
                  <div className="space-y-1.5 md:space-y-2">
                    {Object.entries(groupedByBrand).map(([brandName, variants]) => (
                      <div key={brandName} className="bg-[#0F1419] rounded-lg border border-[#5C4A2E]/30 p-2 md:p-3">
                        <h3 className="font-bold text-[#EDE6D6] mb-1 md:mb-2 text-xs md:text-sm">{brandName}</h3>
                        <div className="space-y-0.5 md:space-y-1">
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
                              <div key={variant.id} className="flex items-center justify-between pl-3 md:pl-4 border-l-2 border-[#5C4A2E]/30">
                                <span className="text-[10px] md:text-xs text-[#9C9384]">{variant.unit}</span>
                                <span className={`font-black text-[10px] md:text-xs ${variant.quantity_in_stock === 0 ? 'text-[#DC2626]' : variant.quantity_in_stock < 5 ? 'text-[#DC2626]' : 'text-[#0B6E4F]'}`}>
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
