'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { ChevronDown } from 'lucide-react';

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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
            {['salqin_ichimliklar', 'piva', 'vino', 'aroq'].map(category => {
              // Filter to only variants with stock > 0
              const categoryDrinks = drinks.filter(d => d.category === category && d.quantity_in_stock > 0);
              
              // Hide category if no variants available
              if (categoryDrinks.length === 0) return null;

              const categoryStock = categoryDrinks.reduce((sum, v) => sum + v.quantity_in_stock, 0);
              const isCategoryExpanded = expandedCategories.has(category);

              return (
                <div key={category} className="bg-[#1C232E] rounded-xl shadow-lg border border-[#5C4A2E]/30 p-2 md:p-3">
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
                    className="w-full flex items-center justify-between mb-2 md:mb-3 hover:bg-[#1C232E]/50 transition-all rounded-lg p-1"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown 
                        size={16} 
                        className={`text-[#C9A227] transition-transform ${isCategoryExpanded ? 'rotate-180' : ''}`} 
                      />
                      <h2 className="text-sm md:text-base font-black text-[#C9A227]">{t(`drinks.category_${category}`)}</h2>
                    </div>
                    <span className="text-xs text-[#9C9384]">{categoryStock}</span>
                  </button>
                  
                  {isCategoryExpanded && (
                    <div className="space-y-0.5 md:space-y-1">
                      {categoryDrinks
                        .sort((a, b) => {
                          // Sort by brand name first, then by unit size
                          if (a.drink_name !== b.drink_name) {
                            return a.drink_name.localeCompare(b.drink_name);
                          }
                          const getNumericValue = (unit: string) => {
                            const match = unit.match(/(\d+\.?\d*)/);
                            return match ? parseFloat(match[1]) : 0;
                          };
                          return getNumericValue(a.unit) - getNumericValue(b.unit);
                        })
                        .map(variant => (
                          <div key={variant.id} className="flex items-center justify-between pl-3 md:pl-4 border-l-2 border-[#5C4A2E]/30">
                            <span className="text-[10px] md:text-xs text-[#9C9384]">{variant.drink_name} — {variant.unit}</span>
                            <span className={`font-black text-[10px] md:text-xs ${variant.quantity_in_stock < 5 ? 'text-[#DC2626]' : 'text-[#0B6E4F]'}`}>
                              {variant.quantity_in_stock}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
