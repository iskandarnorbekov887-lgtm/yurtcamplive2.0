'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Product,
  ProcurementRequestItem,
  ProductUnit,
  ProcurementStatus,
} from '@/types/procurement';
import { Search, Trash2, Check, Clock, AlertTriangle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface ProcurementFormProps {
  onSubmit: (items: ProcurementRequestItem[]) => void;
  isLoading?: boolean;
}

export default function ProcurementForm({ onSubmit, isLoading = false }: ProcurementFormProps) {
  const [items, setItems] = useState<ProcurementRequestItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Load products on mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('name');
        if (error) throw error;
        setProducts(data || []);
      } catch (err) {
        console.error('Failed to load products:', err);
      }
    };
    loadProducts();
  }, []);

  const addItem = () => {
    if (!selectedProduct || !quantity) {
      setError('Please select a product and enter a quantity');
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Quantity must be a valid positive number');
      return;
    }

    const newItem: ProcurementRequestItem = {
      id: `temp_${Date.now()}`,
      procurement_request_id: '',
      product_id: selectedProduct.id,
      requested_quantity: qty,
      requested_unit: selectedProduct.unit,
      manager_adjusted_quantity: null,
      manager_adjusted_unit: null,
      unit_price: null,
      total_price: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setItems([...items, newItem]);
    setSelectedProduct(null);
    setQuantity('');
    setError('');
    setSuccess(`Added ${selectedProduct.name}`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter((item) => item.id !== itemId));
  };

  const handleSubmit = () => {
    if (items.length === 0) {
      setError('Add at least one item before submitting');
      return;
    }
    onSubmit(items);
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900">New Procurement Request</h2>
        <p className="text-gray-600 mt-1">Add items to request from the manager</p>
      </div>

      {/* Error & Success Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {success}
        </div>
      )}

      {/* Product Selection & Quantity Input */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Product Search</label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
              <input
                type="text"
                value={selectedProduct ? selectedProduct.name : searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedProduct(null);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="Search products..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-zinc-950 placeholder:text-slate-300 focus:border-emerald-500 outline-none transition-all"
              />
            </div>
            
            {isDropdownOpen && !selectedProduct && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {products
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(product => (
                    <button
                      key={product.id}
                      onClick={() => {
                        setSelectedProduct(product);
                        setSearchQuery('');
                        setIsDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-slate-50 text-sm text-zinc-950 transition-colors flex justify-between items-center"
                    >
                      <span>{product.name}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{product.unit}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Quantity</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
              className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-zinc-950 font-data focus:border-emerald-500 outline-none transition-all disabled:opacity-50"
              disabled={!selectedProduct}
            />
            {selectedProduct && (
              <span className="flex items-center px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-400 uppercase">
                {selectedProduct.unit}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Add Button */}
      <button
        onClick={addItem}
        disabled={!selectedProduct || !quantity || isLoading}
        className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
      >
        + Add Item
      </button>

      {/* Items Table */}
      {items.length > 0 && (
        <>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</th>
                  <th className="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const product = products.find(p => p.id === item.product_id);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-zinc-950">{product?.name || 'Unknown'}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-data font-bold text-zinc-950">{item.requested_quantity}</span>
                        <span className="ml-1 text-[9px] font-bold text-slate-400 uppercase">{item.requested_unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-gray-700">
              <span className="font-medium">Items to Request:</span> {items.length}
            </p>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Submitting...
              </>
            ) : (
              '✓ Submit Request'
            )}
          </button>
        </>
      )}
    </div>
  );
}
