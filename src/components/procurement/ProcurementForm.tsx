'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Product,
  ProcurementRequestItem,
  ProductUnit,
  ProcurementStatus,
} from '@/types/procurement';
import FuzzySearchInput from './FuzzySearchInput';
import ProcurementTable from './ProcurementTable';
import StatusBadge from './StatusBadge';

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
          <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
          <FuzzySearchInput
            products={products}
            selectedProduct={selectedProduct}
            onSelect={setSelectedProduct}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!selectedProduct}
            />
            {selectedProduct && (
              <span className="flex items-center px-3 py-2 bg-gray-100 rounded-lg text-gray-700 font-medium">
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
          <ProcurementTable
            items={items}
            products={products}
            onRemove={removeItem}
            showManagerAdjustments={false}
          />

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
