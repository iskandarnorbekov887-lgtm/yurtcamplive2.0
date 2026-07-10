-- ============================================================
-- PROCUREMENT & INVENTORY SYSTEM (Full Migration)
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- Ensure the update_updated_at function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. INVENTORY PRODUCTS (Master product catalog)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  name_lower TEXT GENERATED ALWAYS AS (lower(name)) STORED,
  unit TEXT NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'unit', 'liter', 'gram', 'pack')),
  current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12,3) DEFAULT 0,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_products_name_lower ON inventory_products(name_lower);
CREATE INDEX IF NOT EXISTS idx_inventory_products_category ON inventory_products(category);

ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "inventory_products_all" ON inventory_products FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_inventory_products_updated_at ON inventory_products;
CREATE TRIGGER trg_inventory_products_updated_at
  BEFORE UPDATE ON inventory_products FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. PROCUREMENT LISTS (Each procurement cycle)
-- ============================================================
CREATE TABLE IF NOT EXISTS procurement_lists (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'fulfilled', 'in_review', 'disputed', 'finalized')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fulfilled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_lists_status ON procurement_lists(status);
CREATE INDEX IF NOT EXISTS idx_procurement_lists_created_by ON procurement_lists(created_by);

ALTER TABLE procurement_lists ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "procurement_lists_all" ON procurement_lists FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_procurement_lists_updated_at ON procurement_lists;
CREATE TRIGGER trg_procurement_lists_updated_at
  BEFORE UPDATE ON procurement_lists FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. PROCUREMENT ITEMS (Line items per procurement)
-- ============================================================
CREATE TABLE IF NOT EXISTS procurement_items (
  id SERIAL PRIMARY KEY,
  procurement_id INTEGER NOT NULL REFERENCES procurement_lists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  requested_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  actual_qty NUMERIC(12,3),
  verified_qty NUMERIC(12,3),
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (COALESCE(actual_qty, requested_qty) * COALESCE(unit_price, 0)) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_items_procurement_id ON procurement_items(procurement_id);
CREATE INDEX IF NOT EXISTS idx_procurement_items_product_id ON procurement_items(product_id);

ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "procurement_items_all" ON procurement_items FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_procurement_items_updated_at ON procurement_items;
CREATE TRIGGER trg_procurement_items_updated_at
  BEFORE UPDATE ON procurement_items FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. INVENTORY LOGS (Full audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_logs (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('procurement', 'usage', 'adjustment')),
  quantity_change NUMERIC(12,3) NOT NULL,
  previous_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  new_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  source_id INTEGER,
  note TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_change_type ON inventory_logs(change_type);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);

ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "inventory_logs_all" ON inventory_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 5. Enable Realtime for all new tables
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE inventory_products; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE procurement_lists; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE procurement_items; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE inventory_logs; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ============================================================
-- 6. Seed some common kitchen products
-- ============================================================
INSERT INTO inventory_products (name, unit, category) VALUES
  ('Apple', 'kg', 'fruits'),
  ('Banana', 'kg', 'fruits'),
  ('Tomato', 'kg', 'vegetables'),
  ('Potato', 'kg', 'vegetables'),
  ('Onion', 'kg', 'vegetables'),
  ('Carrot', 'kg', 'vegetables'),
  ('Chicken Breast', 'kg', 'meat'),
  ('Ground Beef', 'kg', 'meat'),
  ('Lamb', 'kg', 'meat'),
  ('Rice', 'kg', 'grains'),
  ('Flour', 'kg', 'grains'),
  ('Bread', 'unit', 'bakery'),
  ('Eggs', 'unit', 'dairy'),
  ('Milk', 'liter', 'dairy'),
  ('Butter', 'kg', 'dairy'),
  ('Cheese', 'kg', 'dairy'),
  ('Yogurt', 'liter', 'dairy'),
  ('Cooking Oil', 'liter', 'oils'),
  ('Olive Oil', 'liter', 'oils'),
  ('Salt', 'kg', 'spices'),
  ('Black Pepper', 'gram', 'spices'),
  ('Cumin', 'gram', 'spices'),
  ('Sugar', 'kg', 'grains'),
  ('Tea', 'pack', 'beverages'),
  ('Coffee', 'pack', 'beverages'),
  ('Water', 'liter', 'beverages'),
  ('Cucumber', 'kg', 'vegetables'),
  ('Bell Pepper', 'kg', 'vegetables'),
  ('Garlic', 'kg', 'vegetables'),
  ('Lemon', 'kg', 'fruits')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Procurement system tables created successfully' AS status;
