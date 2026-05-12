-- ============================================================
-- PROCUREMENT SYSTEM (Strict Schema Refactor - CLEAN START)
-- ============================================================

-- Drop existing to ensure fresh UUID-based schema
DROP TABLE IF EXISTS usage_logs CASCADE;
DROP TABLE IF EXISTS procurement_items CASCADE;
DROP TABLE IF EXISTS procurement_requests CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE procurement_status AS ENUM ('draft', 'sent', 'reviewed', 'finalized');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE unit_type AS ENUM ('kg', 'l', 'unit');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE item_status AS ENUM ('pending', 'discrepancy', 'ok');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Inventory
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT UNIQUE NOT NULL,
  current_stock FLOAT NOT NULL DEFAULT 0,
  unit_type unit_type NOT NULL DEFAULT 'kg',
  min_threshold FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Procurement Requests
CREATE TABLE procurement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status procurement_status NOT NULL DEFAULT 'draft',
  total_cost DECIMAL(12, 2) DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Procurement Items
CREATE TABLE procurement_items (
  id SERIAL PRIMARY KEY,
  request_id UUID REFERENCES procurement_requests(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  requested_qty FLOAT NOT NULL DEFAULT 0,
  actual_received_qty FLOAT DEFAULT 0,
  unit_price DECIMAL(12, 2) DEFAULT 0,
  item_status item_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Usage Logs
CREATE TABLE usage_logs (
  id SERIAL PRIMARY KEY,
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  amount_used FLOAT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Seed initial items
INSERT INTO inventory (item_name, unit_type, current_stock) VALUES
  ('Beef', 'kg', 10),
  ('Milk', 'l', 5),
  ('Eggs', 'unit', 30),
  ('Potato', 'kg', 50),
  ('Onion', 'kg', 20);

-- 7. RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for auth" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for auth 2" ON procurement_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for auth 3" ON procurement_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for auth 4" ON usage_logs FOR ALL USING (true) WITH CHECK (true);

-- 8. Enable Realtime
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE procurement_requests;
EXCEPTION WHEN OTHERS THEN 
    -- If already added or publication doesn't exist, ignore
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE procurement_items;
EXCEPTION WHEN OTHERS THEN END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
EXCEPTION WHEN OTHERS THEN END $$;
