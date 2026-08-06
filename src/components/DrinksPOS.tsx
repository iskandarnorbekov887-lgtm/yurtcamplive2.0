'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/language-context';

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

interface CartItem {
  variant: DrinkVariant;
  quantity: number;
}

export function DrinksPOS() {
  const { t } = useLanguage();
  const [drinks, setDrinks] = useState<DrinkVariant[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [salesHistory, setSalesHistory] = useState<Array<{ id: string; sold_at: string; quantity: number; price_at_sale: number; drink_variants: { unit: string; drinks: { name: string } } }>>([]);

  // Pricing and payment state
  // sell_price and buy_price are stored in UZS (base currency)
  const [method, setMethod] = useState<'Cash' | 'Online'>('Cash');


  const fetchSalesHistory = async () => {
    const { data, error } = await supabase
      .from('drink_sales')
      .select('*, drink_variants!inner(*, drinks!inner(name))')
      .order('sold_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('Error fetching sales history:', error);
    } else {
      setSalesHistory(data || []);
    }
  };

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

  // Fetch drinks and sales history
  useEffect(() => {
    const fetchData = async () => {
      await fetchDrinks();
      await fetchSalesHistory();
    };
    fetchData();
    
    // Subscribe to realtime changes
    const drinksChannel = supabase
      .channel('pos-drinks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drink_variants' }, () => {
        fetchDrinks();
      })
      .subscribe();

    const salesChannel = supabase
      .channel('pos-sales-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drink_sales' }, () => {
        fetchSalesHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(drinksChannel);
      supabase.removeChannel(salesChannel);
    };
  }, []);

  const addToCart = (variant: DrinkVariant) => {
    if (variant.quantity_in_stock <= 0 || !variant.sell_price) return;
    
    const existingItem = cart.find(item => item.variant.id === variant.id);
    if (existingItem) {
      if (existingItem.quantity < variant.quantity_in_stock) {
        setCart(cart.map(item => 
          item.variant.id === variant.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      }
    } else {
      setCart([...cart, { variant, quantity: 1 }]);
    }
  };

  const updateCartQuantity = (variantId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.variant.id === variantId) {
        const newQuantity = Math.max(0, Math.min(item.quantity + delta, item.variant.quantity_in_stock));
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (variantId: string) => {
    setCart(cart.filter(item => item.variant.id !== variantId));
  };

  const cartTotalUzs = cart.reduce((sum, item) => sum + (item.quantity * (item.variant.sell_price || 0)), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    setSubmitting(true);
    setMessage('');

    try {
      // Start transaction-like operations
      for (const cartItem of cart) {
        // Decrement stock in drink_variants
        const { error: stockError } = await supabase
          .from('drink_variants')
          .update({ quantity_in_stock: cartItem.variant.quantity_in_stock - cartItem.quantity })
          .eq('id', cartItem.variant.id);
        
        if (stockError) throw new Error(`Failed to update stock for ${cartItem.variant.drink_name}: ${stockError.message}`);

        // Insert drink_sales record (booking_id is NULL for walk-in sales)
        const { error: salesError } = await supabase
          .from('drink_sales')
          .insert({
            variant_id: cartItem.variant.id,
            booking_id: null,
            quantity: cartItem.quantity,
            price_at_sale: cartItem.variant.sell_price || 0
          });
        
        if (salesError) throw new Error(`Failed to record sale for ${cartItem.variant.drink_name}: ${salesError.message}`);
      }

      // Insert payment record (booking_id is NULL for walk-in sales)
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: null,
          amount_original: cartTotalUzs,
          currency_original: 'UZS',
          amount_usd_equivalent: cartTotalUzs / 12500,
          exchange_rate_used: 12500,
          method,
          note: 'Walk-in POS sale'
        });
      
      if (paymentError) throw new Error(`Failed to record payment: ${paymentError.message}`);

      // Success
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      setCart([]);
      setMessage(t('pos.sale_success'));
      
      // Refresh drinks and sales history to show updated stock
      await fetchDrinks();
      await fetchSalesHistory();
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-[#EDE6D6]">{t('pos.title')}</h2>
          <p className="text-xs text-[#9C9384] font-medium uppercase tracking-widest mt-1">{t('pos.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl ${
          message.includes('Error') ? 'bg-[#722F37]/20 text-[#722F37] border border-[#722F37]/40' : 'bg-[#0B6E4F]/20 text-[#0B6E4F] border border-[#0B6E4F]/40'
        }`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drinks Grid */}
        <div className="lg:col-span-2 space-y-6 order-2 lg:order-1">
          {['salqin_ichimliklar', 'piva', 'vino', 'aroq'].map(category => {
            const categoryDrinks = drinks.filter(d => d.category === category && d.quantity_in_stock > 0);
            if (categoryDrinks.length === 0) return null;

            return (
              <div key={category} className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-4 md:p-6">
                <h2 className="text-lg md:text-xl font-black text-[#C9A227] mb-4">{t(`drinks.category_${category}`)}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
                  {categoryDrinks.map(variant => (
                    <button
                      key={variant.id}
                      onClick={() => addToCart(variant)}
                      disabled={!variant.sell_price}
                      className={`p-3 md:p-4 rounded-xl border-2 transition-all ${
                        !variant.sell_price
                          ? 'bg-[#0F1419] border-[#5C4A2E]/20 opacity-50 cursor-not-allowed'
                          : 'bg-[#0F1419] border-[#5C4A2E]/30 hover:border-[#0B6E4F] hover:shadow-lg cursor-pointer'
                      }`}
                    >
                      <p className="font-bold text-[#EDE6D6] mb-1 text-sm md:text-base">{variant.drink_name}</p>
                      <p className="text-xs text-[#9C9384] mb-2">{variant.unit}</p>
                      {variant.sell_price ? (
                        <p className="text-sm font-black text-[#C9A227]">{variant.sell_price.toLocaleString()} UZS</p>
                      ) : (
                        <p className="text-sm font-black text-[#DC2626]">{t('pos.price_not_set')}</p>
                      )}
                      <p className={`text-xs mt-2 ${variant.quantity_in_stock < 5 ? 'text-[#DC2626]' : 'text-[#9C9384]'}`}>
                        {t('drinks.stock')}: {variant.quantity_in_stock}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cart */}
        <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-4 md:p-6 sticky top-4 order-1 lg:order-2">
          <h2 className="text-lg md:text-xl font-black text-[#C9A227] mb-4">{t('pos.cart')}</h2>
          
          {cart.length === 0 ? (
            <p className="text-[#9C9384] italic">{t('pos.empty_cart')}</p>
          ) : (
            <>
              <div className="space-y-2 mb-3 max-h-64 md:max-h-96 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.variant.id} className="bg-[#0F1419] p-2 rounded-lg border border-[#5C4A2E]/30">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#EDE6D6] text-xs truncate">{item.variant.drink_name}</p>
                        <p className="text-[10px] text-[#9C9384]">{item.variant.unit}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateCartQuantity(item.variant.id, -1)}
                          className="w-6 h-6 bg-[#5C4A2E]/30 rounded text-[#EDE6D6] text-xs hover:bg-[#5C4A2E]/50"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold text-[#EDE6D6] w-4 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQuantity(item.variant.id, 1)}
                          disabled={item.quantity >= item.variant.quantity_in_stock}
                          className="w-6 h-6 bg-[#5C4A2E]/30 rounded text-[#EDE6D6] text-xs hover:bg-[#5C4A2E]/50 disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs font-black text-[#C9A227] whitespace-nowrap">
                        {item.variant.sell_price ? `${(item.quantity * item.variant.sell_price).toLocaleString()} UZS` : 'N/A'}
                      </p>
                      <button
                        onClick={() => removeFromCart(item.variant.id)}
                        className="text-[#722F37] hover:text-[#DC2626] text-[10px] w-5 h-5 flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Payment Method Toggle */}
              <div className="flex gap-2 mb-3">
                {(['Cash', 'Online'] as const).map((meth) => (
                  <button
                    key={meth}
                    type="button"
                    onClick={() => setMethod(meth)}
                    className={`flex-1 py-1 px-2 rounded-md font-bold text-[10px] transition-all ${
                      method === meth
                        ? 'bg-[#0B6E4F] text-[#C9A227]'
                        : 'bg-[#0F1419] text-[#9C9384] hover:bg-[#5C4A2E]/30'
                    }`}
                  >
                    {meth}
                  </button>
                ))}
              </div>

              <div className="border-t border-[#5C4A2E]/30 pt-3 mb-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[#EDE6D6] text-sm">{t('pos.total')}</span>
                  <span className="text-base md:text-lg font-black text-[#C9A227]">
                    {cartTotalUzs.toLocaleString(undefined, { maximumFractionDigits: 0 })} SUM
                  </span>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={submitting || cart.length === 0}
                className="w-full py-2.5 bg-[#0B6E4F] text-[#C9A227] rounded-lg font-bold uppercase hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              >
                {submitting ? t('btn.saving') : t('pos.checkout')}
              </button>
            </>
          )}
        </div>

        {/* Sales History */}
        <div className="bg-[#1C232E] rounded-2xl shadow-xl border border-[#5C4A2E]/30 p-4 md:p-6 mt-6 lg:col-span-3 order-3">
          <h2 className="text-lg md:text-xl font-black text-[#C9A227] mb-4">{t('pos.sales_history')}</h2>
          {salesHistory.length === 0 ? (
            <p className="text-[#9C9384] italic">{t('pos.no_sales')}</p>
          ) : (
            <div className="space-y-3 max-h-64 md:max-h-96 overflow-y-auto">
              {salesHistory.map((sale) => (
                <div key={sale.id} className="bg-[#0F1419] p-3 rounded-lg border border-[#5C4A2E]/30">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-[#EDE6D6] text-sm">{sale.drink_variants?.drinks?.name || 'Unknown'}</p>
                      <p className="text-xs text-[#9C9384]">{sale.drink_variants?.unit || ''} × {sale.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-[#C9A227]">{(sale.quantity * sale.price_at_sale).toLocaleString()} UZS</p>
                      <p className="text-xs text-[#9C9384]">
                        {new Date(sale.sold_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl">🎉</div>
          </div>
        </div>
      )}
    </div>
  );
}
