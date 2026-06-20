'use client';

import useSWR from 'swr';
import { supabase } from '@/lib/supabase';

const fetchInventory = async () => {
  const { data } = await supabase.from('inventory_items').select('*');
  return data || [];
};

interface RecipeDisplayProps {
  mealType: string;
  count: number;
  isManager?: boolean;
  orderId?: string;
}

/** 
 * Centralized recipe definitions linked to inventory_items.name
 * This replaces the mock logic in meal-actions.ts for the UI
 */
const RECIPE_MANIFEST: Record<string, Array<{ name: string; qty: number; unit: string }>> = {
  'Lunch': [
    { name: 'Rice', qty: 0.2, unit: 'kg' },
    { name: 'Meat', qty: 0.15, unit: 'kg' },
    { name: 'Oil', qty: 0.05, unit: 'kg' },
    { name: 'Vegetables', qty: 0.25, unit: 'kg' },
  ],
  'Dinner': [
    { name: 'Flour', qty: 0.1, unit: 'kg' },
    { name: 'Potato', qty: 0.2, unit: 'kg' },
    { name: 'Meat', qty: 0.1, unit: 'kg' },
    { name: 'Bread', qty: 1, unit: 'pc' },
  ]
};

export function RecipeDisplay({ mealType, count, isManager = false, orderId, items }: RecipeDisplayProps & { items?: any[] }) {
  const { data: inventory = [] } = useSWR('inventory_items', fetchInventory);
  
  // Priority: 1. Passed JSONB items, 2. Manifest Fallback
  const recipe = items || RECIPE_MANIFEST[mealType] || [];

  if (!isManager) {
    // Cook Side: Maintain clean workspace, show only Identity data
    return (
      <div className="mt-4 pt-4 border-t border-[#5C4A2E]/30 space-y-1">
        <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-widest">Protocol ID</p>
        <p className="font-mono text-[11px] font-black text-[#EDE6D6] uppercase tracking-tighter">{orderId || 'PENDING_OID'}</p>
      </div>
    );
  }

  // Manager Side: Full visibility for auditing
  return (
    <div className="mt-6 p-4 bg-[#1C232E] border border-[#5C4A2E]/30 shadow-[2px_2px_0px_0px_rgba(92,74,46,0.3)] animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex justify-between items-center mb-3">
        <p className="text-[10px] font-black text-[#9C9384] uppercase tracking-[0.2em]">Audit Manifest</p>
        <span className="bg-[#0B6E4F] text-[#C9A227] px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter">Verified</span>
      </div>
      
      <div className="space-y-2">
        {(recipe || []).length === 0 ? (
          <p className="text-[9px] font-black text-[#9C9384] uppercase italic">No specification found for {mealType}</p>
        ) : (
          recipe.map((ing: any, i: number) => {
            const total = (ing.qty || ing.quantity || 0) * count;
            const name = ing.name || ing.item_name || 'UNKNOWN_ITEM';
            const unit = ing.unit || ing.unit_type || 'unit';
            return (
              <div key={i} className="flex justify-between items-center border-b border-[#5C4A2E]/20 pb-1 last:border-0">
                <span className="text-[10px] font-black text-[#EDE6D6] uppercase tracking-tight">{name}</span>
                <span className="font-mono text-[10px] font-black text-[#EDE6D6] uppercase">
                  {total.toFixed(2)} <span className="text-[#9C9384]">{unit}</span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
