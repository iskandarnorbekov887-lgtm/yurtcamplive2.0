const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ITEMS = [
  { name: 'Potato', unit: 'kg', price: 5000, stock: 45, threshold: 20 },
  { name: 'Tomato', unit: 'kg', price: 12000, stock: 12, threshold: 15 },
  { name: 'Onion', unit: 'kg', price: 4000, stock: 30, threshold: 10 },
  { name: 'Beef', unit: 'kg', price: 85000, stock: 8, threshold: 5 },
  { name: 'Chicken', unit: 'kg', price: 45000, stock: 15, threshold: 10 },
  { name: 'Rice', unit: 'kg', price: 18000, stock: 60, threshold: 20 },
  { name: 'Cooking Oil', unit: 'l', price: 22000, stock: 20, threshold: 10 },
  { name: 'Flour', unit: 'kg', price: 10000, stock: 50, threshold: 15 },
  { name: 'Eggs', unit: 'unit', price: 45000, stock: 5, threshold: 3 },
  { name: 'Milk', unit: 'l', price: 12000, stock: 10, threshold: 5 },
  { name: 'Bread', unit: 'unit', price: 3000, stock: 25, threshold: 10 },
  { name: 'Salt', unit: 'kg', price: 2000, stock: 5, threshold: 2 },
  { name: 'Sugar', unit: 'kg', price: 15000, stock: 12, threshold: 5 },
];

async function seed() {
  console.log('🚀 Starting Seed for Metabase Demo...');

  // 1. Insert Inventory Items
  const { data: inventoryItems, error: invError } = await supabase.from('inventory').upsert(
    ITEMS.map(item => ({
      item_name: item.name,
      use_unit: item.unit,
      buy_unit: item.unit === 'kg' ? 'Crate (10kg)' : item.unit,
      conversion_factor: item.unit === 'kg' ? 10 : 1,
      current_stock: item.stock,
      min_threshold: item.threshold
      // unit_price: item.price // Removed until column is added in migration
    })),
    { onConflict: 'item_name' }
  ).select();

  if (invError) {
    console.error('Error seeding inventory:', invError);
    return;
  }
  console.log(`✅ Seeded ${inventoryItems.length} inventory items.`);

  // 2. Generate Ledger Entries (Last 14 days)
  const ledgerEntries = [];
  const now = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    inventoryItems.forEach(item => {
      // Daily Usage (Randomized)
      const usageQty = Math.random() * 5;
      if (usageQty > 0.5) {
        ledgerEntries.push({
          item_id: item.id,
          type: Math.random() > 0.9 ? 'WASTE' : 'OUT',
          qty: -usageQty,
          unit: item.use_unit,
          reason: Math.random() > 0.8 ? 'Event Prep' : 'Kitchen Usage',
          created_at: date.toISOString()
        });
      }

      // Occasional Restocks
      if (Math.random() > 0.7) {
        ledgerEntries.push({
          item_id: item.id,
          type: 'IN',
          qty: Math.random() * 20 + 10,
          unit: item.use_unit,
          reason: 'Weekly Restock',
          created_at: date.toISOString()
        });
      }
    });
  }

  const { error: ledError } = await supabase.from('inventory_ledger').insert(ledgerEntries);
  if (ledError) {
    console.error('Error seeding ledger:', ledError);
  } else {
    console.log(`✅ Seeded ${ledgerEntries.length} ledger entries.`);
  }

  // 3. Generate Procurement Requests
  const procurementRequests = [];
  for (let i = 0; i < 8; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - Math.floor(Math.random() * 10));
    
    procurementRequests.push({
      status: ['draft', 'sent', 'finalized'][Math.floor(Math.random() * 3)],
      total_amount: Math.random() * 1000000 + 200000,
      created_at: date.toISOString()
    });
  }

  const { error: proError } = await supabase.from('procurement_requests').insert(procurementRequests);
  if (proError) {
    console.error('Error seeding procurement:', proError);
  } else {
    console.log(`✅ Seeded ${procurementRequests.length} procurement requests.`);
  }

  console.log('✨ Seed Complete! Metabase charts will now look full and vibrant.');
}

seed();
