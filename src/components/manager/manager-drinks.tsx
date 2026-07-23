'use client';

import { useState, useEffect } from 'react';
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
  created_at: string;
  updated_at: string;
}

interface CartItem {
  drink: Drink;
  quantity: number;
}

export function ManagerDrinks() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'inventory' | 'pos'>('inventory');
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDrink, setEditingDrink] = useState<Drink | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    icon: '🍹',
    price: '',
    quantity_in_stock: ''
  });
  
  // POS Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [closingTab, setClosingTab] = useState(false);

  useEffect(() => {
    fetchDrinks();
  }, []);

  async function fetchDrinks() {
    const { data, error } = await supabase
      .from('drinks')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching drinks:', error);
    } else {
      setDrinks(data || []);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (editingDrink) {
      // Update existing drink
      const { error } = await supabase
        .from('drinks')
        .update({
          name: formData.name,
          icon: formData.icon,
          price: parseFloat(formData.price),
          quantity_in_stock: parseInt(formData.quantity_in_stock)
        })
        .eq('id', editingDrink.id);
      
      if (error) {
        console.error('Error updating drink:', error);
        return;
      }
    } else {
      // Add new drink
      const { error } = await supabase
        .from('drinks')
        .insert({
          name: formData.name,
          icon: formData.icon,
          price: parseFloat(formData.price),
          quantity_in_stock: parseInt(formData.quantity_in_stock)
        });
      
      if (error) {
        console.error('Error adding drink:', error);
        return;
      }
    }
    
    setFormData({ name: '', icon: '🍹', price: '', quantity_in_stock: '' });
    setShowAddForm(false);
    setEditingDrink(null);
    fetchDrinks();
  }

  async function handleRestock(drink: Drink, quantity: number) {
    const { error } = await supabase
      .from('drinks')
      .update({
        quantity_in_stock: drink.quantity_in_stock + quantity
      })
      .eq('id', drink.id);
    
    if (error) {
      console.error('Error restocking drink:', error);
      return;
    }
    
    fetchDrinks();
  }

  async function handleDelete(drinkId: string) {
    if (!confirm(t('drinks.confirm_delete'))) return;
    
    const { error } = await supabase
      .from('drinks')
      .delete()
      .eq('id', drinkId);
    
    if (error) {
      console.error('Error deleting drink:', error);
      return;
    }
    
    fetchDrinks();
  }

  function handleEdit(drink: Drink) {
    setEditingDrink(drink);
    setFormData({
      name: drink.name,
      icon: drink.icon,
      price: drink.sell_price.toString(),
      quantity_in_stock: drink.quantity_in_stock.toString()
    });
    setShowAddForm(true);
  }

  function handleCancel() {
    setFormData({ name: '', icon: '🍹', price: '', quantity_in_stock: '' });
    setShowAddForm(false);
    setEditingDrink(null);
  }

  // POS Functions
  function addToCart(drink: Drink) {
    if (drink.quantity_in_stock === 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.drink.id === drink.id);
      if (existing) {
        const newQuantity = Math.min(existing.quantity + 1, drink.quantity_in_stock);
        return prev.map(item =>
          item.drink.id === drink.id ? { ...item, quantity: newQuantity } : item
        );
      }
      return [...prev, { drink, quantity: 1 }];
    });
  }

  function updateCartQuantity(drinkId: string, quantity: number) {
    setCart(prev => prev.map(item => {
      if (item.drink.id === drinkId) {
        const maxQuantity = item.drink.quantity_in_stock;
        return { ...item, quantity: Math.max(1, Math.min(quantity, maxQuantity)) };
      }
      return item;
    }));
  }

  function removeFromCart(drinkId: string) {
    setCart(prev => prev.filter(item => item.drink.id !== drinkId));
  }

  function getCartTotal() {
    return cart.reduce((sum, item) => sum + (item.drink.sell_price * item.quantity), 0);
  }

  async function closeTab() {
    if (cart.length === 0) return;
    
    setClosingTab(true);
    
    try {
      // Process each item in cart
      for (const item of cart) {
        const drinkId = item.drink.id;
        const quantity = item.quantity;
        const price = item.drink.sell_price;
        
        // Get current stock
        const { data: drinkData } = await supabase
          .from('drinks')
          .select('quantity_in_stock')
          .eq('id', drinkId)
          .single();
        
        if (drinkData) {
          // Decrement stock
          await supabase
            .from('drinks')
            .update({ quantity_in_stock: Math.max(0, drinkData.quantity_in_stock - quantity) })
            .eq('id', drinkId);
        }
        
        // Log sale (booking_id is null for walk-up sales)
        await supabase
          .from('drink_sales')
          .insert({
            drink_id: drinkId,
            booking_id: null,
            quantity: quantity,
            price_at_sale: price
          });
      }
      
      // Clear cart and refresh drinks
      setCart([]);
      fetchDrinks();
    } catch (error) {
      console.error('Error closing tab:', error);
    } finally {
      setClosingTab(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#1C232E] rounded-[32px] p-8 shadow-xl border border-[#5C4A2E]/30">
        <div className="text-center py-20 text-[#9C9384]">
          <p>{t('drinks.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-[#1C232E] rounded-[32px] p-8 shadow-xl border border-[#5C4A2E]/30">
        {/* Tab Switcher */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-[0.2em] transition-all ${
              activeTab === 'inventory'
                ? 'bg-[#0B6E4F] text-[#C9A227]'
                : 'bg-[#2A2F36] text-[#9C9384] hover:bg-[#2A2F36]/80'
            }`}
          >
            {t('drinks.inventory_tab')}
          </button>
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex-1 py-3 rounded-xl text-sm font-black uppercase tracking-[0.2em] transition-all ${
              activeTab === 'pos'
                ? 'bg-[#0B6E4F] text-[#C9A227]'
                : 'bg-[#2A2F36] text-[#9C9384] hover:bg-[#2A2F36]/80'
            }`}
          >
            {t('drinks.pos_tab')}
          </button>
        </div>

        {activeTab === 'inventory' && (
          <>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-[#EDE6D6] uppercase tracking-tight">{t('drinks.title')}</h2>
                <p className="text-[#9C9384] font-bold">{t('drinks.subtitle')}</p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-6 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-[24px] text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-[#0B6E4F]/30 hover:bg-[#0B6E4F]/80 transition-all active:scale-95"
              >
                {t('drinks.add_drink')}
              </button>
            </div>

            {showAddForm && (
              <div className="mb-8 p-6 bg-[#0F1419] rounded-2xl border border-[#5C4A2E]/30">
                <h3 className="text-xl font-black text-[#EDE6D6] mb-4">
                  {editingDrink ? t('drinks.edit_drink') : t('drinks.add_new_drink')}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-[#9C9384] uppercase mb-2">{t('drinks.name')}</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[#9C9384] uppercase mb-2">{t('drinks.icon')}</label>
                      <input
                        type="text"
                        value={formData.icon}
                        onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                        className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6] text-center text-2xl"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[#9C9384] uppercase mb-2">{t('drinks.price')}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[#9C9384] uppercase mb-2">{t('drinks.quantity')}</label>
                      <input
                        type="number"
                        value={formData.quantity_in_stock}
                        onChange={(e) => setFormData({ ...formData, quantity_in_stock: e.target.value })}
                        className="w-full px-4 py-3 bg-[#1C232E] border border-[#5C4A2E]/30 rounded-xl font-bold text-[#EDE6D6]"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-[#0B6E4F] text-[#C9A227] rounded-xl text-sm font-black uppercase tracking-[0.2em] hover:bg-[#0B6E4F]/80 transition-all active:scale-95"
                    >
                      {editingDrink ? t('drinks.update') : t('drinks.add')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-6 py-3 bg-[#2A2F36] text-[#9C9384] rounded-xl text-sm font-black uppercase tracking-[0.2em] hover:bg-[#2A2F36]/80 transition-all active:scale-95"
                    >
                      {t('drinks.cancel')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {drinks.length === 0 ? (
              <div className="py-20 text-center text-[#9C9384]">
                <div className="text-5xl mb-4">🍹</div>
                <p className="text-lg font-bold">{t('drinks.no_drinks')}</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {drinks.map((drink) => (
                  <div key={drink.id} className="flex gap-4 items-center p-4 bg-[#0F1419] rounded-2xl border border-[#5C4A2E]/30">
                    <div className="text-4xl">{drink.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-[#EDE6D6]">{drink.name}</h3>
                      <p className="text-sm text-[#9C9384] font-bold">
                        ${drink.sell_price.toFixed(2)} · {t('drinks.stock')}: {drink.quantity_in_stock}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRestock(drink, 10)}
                        className="px-4 py-2 bg-[#0B6E4F]/20 text-[#0B6E4F] rounded-xl text-xs font-black uppercase border border-[#0B6E4F]/40 hover:bg-[#0B6E4F]/30 transition-all"
                      >
                        +10
                      </button>
                      <button
                        onClick={() => handleEdit(drink)}
                        className="px-4 py-2 bg-[#2A2F36] text-[#9C9384] rounded-xl text-xs font-black uppercase hover:bg-[#2A2F36]/80 transition-all"
                      >
                        {t('drinks.edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(drink.id)}
                        className="px-4 py-2 bg-[#DC2626]/20 text-[#DC2626] rounded-xl text-xs font-black uppercase border border-[#DC2626]/40 hover:bg-[#DC2626]/30 transition-all"
                      >
                        {t('drinks.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'pos' && (
          <>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-[#EDE6D6] uppercase tracking-tight">{t('drinks.pos_title')}</h2>
                <p className="text-[#9C9384] font-bold">{t('drinks.pos_subtitle')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Drink Selection */}
              <div className="lg:col-span-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {drinks.map((drink) => (
                    <button
                      key={drink.id}
                      onClick={() => addToCart(drink)}
                      disabled={drink.quantity_in_stock === 0}
                      className={`p-6 rounded-2xl border transition-all text-left ${
                        drink.quantity_in_stock === 0
                          ? 'bg-[#2A1518]/30 border-[#5C4A2E]/20 text-[#9C9384] opacity-50 cursor-not-allowed'
                          : 'bg-[#0F1419] border-[#5C4A2E]/30 text-[#EDE6D6] hover:bg-[#0B6E4F]/20 hover:border-[#0B6E4F]/40 active:scale-95'
                      }`}
                    >
                      <div className="text-4xl mb-3">{drink.icon}</div>
                      <h3 className="text-lg font-black uppercase">{drink.name}</h3>
                      <p className="text-sm text-[#9C9384] font-bold">${drink.sell_price.toFixed(2)}</p>
                      <p className={`text-xs font-bold uppercase mt-2 ${drink.quantity_in_stock < 5 ? 'text-[#DC2626]' : 'text-[#9C9384]'}`}>
                        {t('drinks.stock')}: {drink.quantity_in_stock}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cart */}
              <div className="lg:col-span-1">
                <div className="bg-[#0F1419] rounded-2xl border border-[#5C4A2E]/30 p-6 sticky top-4">
                  <h3 className="text-xl font-black text-[#EDE6D6] mb-4">{t('drinks.current_tab')}</h3>
                  
                  {cart.length === 0 ? (
                    <div className="py-12 text-center text-[#9C9384]">
                      <p className="text-sm font-bold">{t('drinks.tab_empty')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 max-h-[300px] overflow-y-auto mb-4">
                        {cart.map((item) => (
                          <div key={item.drink.id} className="flex gap-3 items-center p-3 bg-[#1C232E] rounded-xl">
                            <span className="text-2xl">{item.drink.icon}</span>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-[#EDE6D6]">{item.drink.name}</p>
                              <p className="text-xs text-[#9C9384]">${item.drink.sell_price.toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateCartQuantity(item.drink.id, item.quantity - 1)}
                                className="w-8 h-8 bg-[#2A2F36] rounded-lg text-[#EDE6D6] font-bold hover:bg-[#2A2F36]/80"
                              >
                                -
                              </button>
                              <span className="w-8 text-center font-bold text-[#EDE6D6]">{item.quantity}</span>
                              <button
                                onClick={() => updateCartQuantity(item.drink.id, item.quantity + 1)}
                                className="w-8 h-8 bg-[#0B6E4F]/20 rounded-lg text-[#0B6E4F] font-bold hover:bg-[#0B6E4F]/30"
                              >
                                +
                              </button>
                              <button
                                onClick={() => removeFromCart(item.drink.id)}
                                className="w-8 h-8 bg-[#DC2626]/20 rounded-lg text-[#DC2626] font-bold hover:bg-[#DC2626]/30"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="border-t border-[#5C4A2E]/30 pt-4">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm font-bold text-[#9C9384]">{t('drinks.total')}:</span>
                          <span className="text-2xl font-black text-[#C9A227]">${getCartTotal().toFixed(2)}</span>
                        </div>
                        <button
                          onClick={closeTab}
                          disabled={closingTab}
                          className="w-full py-4 bg-[#0B6E4F] text-[#C9A227] rounded-xl text-sm font-black uppercase tracking-[0.2em] hover:bg-[#0B6E4F]/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {closingTab ? t('drinks.closing') : t('drinks.close_tab')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
