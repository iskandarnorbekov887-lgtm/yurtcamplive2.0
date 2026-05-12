'use client';

import { useState, useRef, useEffect } from 'react';
import type { InventoryItem } from '@/lib/supabase';

interface ProductSearchProps {
  products: InventoryItem[];
  onSelect: (product: InventoryItem) => void;
  onAddNew: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Levenshtein distance for fuzzy matching */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/** Score a product against a query — lower is better */
function scoreProduct(product: InventoryItem, query: string): number {
  const name = product.item_name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 999;

  // Exact match
  if (name === q) return 0;
  // Starts with
  if (name.startsWith(q)) return 1;
  // Contains
  if (name.includes(q)) return 2;
  // Fuzzy
  const dist = levenshtein(q, name.substring(0, Math.max(q.length + 2, name.length)));
  if (dist <= 2) return 3 + dist;
  return 100 + dist;
}

export function ProductSearch({ products, onSelect, onAddNew, placeholder = 'Search product...', disabled }: ProductSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim().length >= 1
    ? products
        .map(p => ({ product: p, score: scoreProduct(p, query) }))
        .filter(x => x.score < 20)
        .sort((a, b) => a.score - b.score)
        .slice(0, 8)
        .map(x => x.product)
    : [];

  const showAddNew = query.trim().length >= 2 && filtered.length === 0;

  const handleSelect = (product: InventoryItem) => {
    onSelect(product);
    setQuery('');
    setIsOpen(false);
    setHighlightIndex(0);
  };

  const handleAddNew = () => {
    onAddNew(query.trim());
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, (showAddNew ? 0 : filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showAddNew) {
        handleAddNew();
      } else if (filtered[highlightIndex]) {
        handleSelect(filtered[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const unitLabel: Record<string, string> = {
    kg: '🏋️ Kilograms',
    unit: '🔢 Units',
    l: '💧 Liters',
  };

  return (
    <div className="relative">
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setHighlightIndex(0); }}
          onFocus={() => { if (query.trim().length >= 1) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:border-orange-400 focus:bg-white outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          autoComplete="off"
        />
      </div>

      {isOpen && (filtered.length > 0 || showAddNew) && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {filtered.map((product, i) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              className={`w-full text-left px-5 py-3.5 flex items-center justify-between transition-all ${
                i === highlightIndex ? 'bg-orange-50 border-l-4 border-l-orange-400' : 'hover:bg-slate-50 border-l-4 border-l-transparent'
              }`}
            >
              <div>
                <p className="font-bold text-slate-900">{product.item_name}</p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {unitLabel[product.use_unit] || product.use_unit} · Stock: {product.current_stock} {product.use_unit}
                </p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                {product.use_unit}
              </span>
            </button>
          ))}

          {showAddNew && (
            <button
              onClick={handleAddNew}
              className="w-full text-left px-5 py-4 bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 transition-all border-t border-slate-100 flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 font-black text-lg">+</div>
              <div>
                <p className="font-black text-orange-700 text-sm">Add New Item</p>
                <p className="text-[10px] text-orange-500 font-bold">"{query}" not found — create it</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
