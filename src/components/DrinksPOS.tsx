'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Drink {
  id: string;
  name: string;
  icon: string;
  sell_price: number;
  quantity_in_stock: number;
}

interface DrinksPOSProps {
  drinks: Drink[];
  onSale: () => void;
}

export function DrinksPOS({ drinks, onSale }: DrinksPOSProps) {
  const { t } = useLanguage();
  const [selectedDrink, setSelectedDrink] = useState<Drink | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  async function handleSell() {
    if (!selectedDrink) return;
    
    if (quantity > selectedDrink.quantity_in_stock) {
      alert(t('drinks.out_of_stock'));
      return;
    }

    setLoading(true);
    
    try {
      // Decrement stock
      const { error: stockError } = await supabase
        .from('drinks')
        .update({ quantity_in_stock: selectedDrink.quantity_in_stock - quantity })
        .eq('id', selectedDrink.id);
      
      if (stockError) throw stockError;
      
      // Log sale
      const { error: saleError } = await supabase
        .from('drink_sales')
        .insert({
          drink_id: selectedDrink.id,
          booking_id: null, // Walk-up sale
          quantity: quantity,
          price_at_sale: selectedDrink.sell_price
        });
      
      if (saleError) throw saleError;
      
      // Add to recent sales
      setRecentSales(prev => [{
        drink_name: selectedDrink.name,
        quantity: quantity,
        price: selectedDrink.sell_price,
        total: selectedDrink.sell_price * quantity,
        sold_at: new Date()
      }, ...prev].slice(0, 10));
      
      // Reset form
      setSelectedDrink(null);
      setQuantity(1);
      onSale();
    } catch (error) {
      console.error('Sale failed:', error);
      alert(t('drinks.sale_error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-[#EDE6D6]">{t('drinks.pos_title')}</h2>
          <p className="text-xs text-[#9C9384] font-medium uppercase tracking-widest mt-1">{t('drinks.pos_subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drink Selection */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl p-6 shadow-lg">
            <h3 className="text-sm font-black text-[#9C9384] uppercase tracking-widest mb-4">{t('drinks.select_drink')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {drinks.map((drink) => (
                <button
                  key={drink.id}
                  onClick={() => setSelectedDrink(drink)}
                  disabled={drink.quantity_in_stock === 0}
                  className={`p-4 rounded-xl border transition-all text-left ${
                    selectedDrink?.id === drink.id
                      ? 'bg-[#0B6E4F] border-[#0B6E4F] text-[#C9A227]'
                      : drink.quantity_in_stock === 0
                      ? 'bg-[#2A1518]/30 border-[#5C4A2E]/20 text-[#9C9384] opacity-50 cursor-not-allowed'
                      : 'bg-[#1C232E] border-[#5C4A2E]/30 text-[#EDE6D6] hover:bg-[#2A1518] hover:border-[#C9A227]'
                  }`}
                >
                  <div className="text-3xl mb-2">{drink.icon}</div>
                  <h4 className="text-sm font-bold uppercase tracking-tight">{drink.name}</h4>
                  <p className="text-xs font-data mt-1">${drink.sell_price.toFixed(2)}</p>
                  <p className={`text-[10px] font-bold uppercase mt-2 ${drink.quantity_in_stock < 5 ? 'text-[#722F37]' : 'text-[#9C9384]'}`}>
                    {t('drinks.stock')}: {drink.quantity_in_stock}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity Input */}
          {selectedDrink && (
            <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-black text-[#9C9384] uppercase tracking-widest mb-4">{t('drinks.quantity')}</h3>
              <div className="flex gap-4 items-center">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-12 bg-[#2A1518] border border-[#5C4A2E]/30 rounded-lg text-[#EDE6D6] text-2xl font-bold hover:bg-[#2A1518]/80 transition-all"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max={selectedDrink.quantity_in_stock}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.min(selectedDrink.quantity_in_stock, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="flex-1 bg-[#0F1419] border border-[#5C4A2E]/30 rounded-lg px-4 py-3 text-center text-2xl font-bold text-[#EDE6D6]"
                />
                <button
                  onClick={() => setQuantity(Math.min(selectedDrink.quantity_in_stock, quantity + 1))}
                  className="w-12 h-12 bg-[#2A1518] border border-[#5C4A2E]/30 rounded-lg text-[#EDE6D6] text-2xl font-bold hover:bg-[#2A1518]/80 transition-all"
                >
                  +
                </button>
              </div>
              <div className="mt-4 flex justify-between items-center">
                <span className="text-sm text-[#9C9384]">{t('drinks.total')}:</span>
                <span className="text-2xl font-black text-[#C9A227]">${(selectedDrink.sell_price * quantity).toFixed(2)}</span>
              </div>
              <button
                onClick={handleSell}
                disabled={loading || quantity > selectedDrink.quantity_in_stock}
                className="w-full mt-4 py-4 bg-[#0B6E4F] text-[#C9A227] rounded-xl text-sm font-black uppercase tracking-[0.2em] hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('drinks.selling') : t('drinks.sell')}
              </button>
            </div>
          )}
        </div>

        {/* Recent Sales */}
        <div className="lg:col-span-1">
          <div className="bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl p-6 shadow-lg">
            <h3 className="text-sm font-black text-[#9C9384] uppercase tracking-widest mb-4">{t('drinks.recent_sales')}</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {recentSales.length === 0 ? (
                <p className="text-center text-[#9C9384] text-sm py-8">{t('drinks.no_sales')}</p>
              ) : (
                recentSales.map((sale, i) => (
                  <div key={i} className="p-3 bg-[#0F1419] rounded-lg border border-[#5C4A2E]/20">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-bold text-[#EDE6D6]">{sale.drink_name}</span>
                      <span className="text-xs text-[#9C9384]">x{sale.quantity}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-[#9C9384]">{new Date(sale.sold_at).toLocaleTimeString()}</span>
                      <span className="text-sm font-bold text-[#C9A227]">${sale.total.toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
