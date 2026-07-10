-- ============================================================
-- ULTIMATE SCHEMA FIX — Fixes all mismatches between Code & DB
-- Run this ENTIRE script in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/blcgjsnorpxsvaxohzxl/sql/new
-- ============================================================

-- 1. FIX BOOKINGS TABLE (Add all missing columns)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS approved_by_manager    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS number_of_people       INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS num_people             INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payment_status         TEXT DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method         TEXT,
  ADD COLUMN IF NOT EXISTS payment_note           TEXT,
  ADD COLUMN IF NOT EXISTS notes                  TEXT,
  ADD COLUMN IF NOT EXISTS meal_notes             TEXT,
  ADD COLUMN IF NOT EXISTS transportation         TEXT,
  ADD COLUMN IF NOT EXISTS meal_preference        TEXT,
  ADD COLUMN IF NOT EXISTS guide_required         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS special_requests       TEXT,
  ADD COLUMN IF NOT EXISTS last_edited_by_role    TEXT DEFAULT 'Manager',
  ADD COLUMN IF NOT EXISTS created_by_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cooking_class          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cooking_class_amount   TEXT,
  ADD COLUMN IF NOT EXISTS laundry_price          TEXT,
  ADD COLUMN IF NOT EXISTS laundry_currency       TEXT DEFAULT 'UZS',
  ADD COLUMN IF NOT EXISTS guide_service          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guide_names            TEXT,
  ADD COLUMN IF NOT EXISTS guide_amount           TEXT,
  ADD COLUMN IF NOT EXISTS has_transportation     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transportation_details TEXT,
  ADD COLUMN IF NOT EXISTS lunch                  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lunch_count            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lunch_dietary          TEXT,
  ADD COLUMN IF NOT EXISTS dinner                 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dinner_count           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinner_dietary         TEXT,
  ADD COLUMN IF NOT EXISTS drinks                 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drinks_count           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laundry                BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stay_price             NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stay_paid              BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_system_only         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_prepaid             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lunch_prepaid          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dinner_prepaid         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drinks_tab             JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS extra_services         JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS collected_currency     TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS guest_category         TEXT,
  ADD COLUMN IF NOT EXISTS local_stay_type        TEXT,
  ADD COLUMN IF NOT EXISTS last_adjustment        TEXT,
  ADD COLUMN IF NOT EXISTS description            TEXT,
  ADD COLUMN IF NOT EXISTS amount                 NUMERIC(12,2) DEFAULT 0;

-- 2. DRINKS TABLE
CREATE TABLE IF NOT EXISTS drinks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sold_price NUMERIC(12,2) DEFAULT 0,
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed some drinks if empty
INSERT INTO drinks (name, sold_price)
SELECT * FROM (VALUES ('Coke', 15000), ('Fanta', 15000), ('Beer', 30000), ('Wine', 150000)) AS v(name, price)
WHERE NOT EXISTS (SELECT 1 FROM drinks LIMIT 1);

-- 3. INVENTORY_ITEMS (Rename from inventory or create)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory') 
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_items') THEN
        ALTER TABLE inventory RENAME TO inventory_items;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT UNIQUE NOT NULL,
  current_stock FLOAT NOT NULL DEFAULT 0,
  use_unit TEXT DEFAULT 'kg',
  buy_unit TEXT DEFAULT 'kg',
  conversion_factor FLOAT DEFAULT 1,
  min_threshold FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all columns exist in inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS buy_unit TEXT DEFAULT 'kg';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS conversion_factor FLOAT DEFAULT 1;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS use_unit TEXT DEFAULT 'kg';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 4. INVENTORY_LEDGER (Rename from usage_logs or create)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usage_logs')
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_ledger') THEN
        ALTER TABLE usage_logs RENAME TO inventory_ledger;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('IN', 'OUT', 'WASTE', 'ADJUSTMENT')),
  qty FLOAT NOT NULL,
  unit TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- 5. PROCUREMENT UPGRADES
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UZS';
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4) DEFAULT 1;
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS total_spent_uzs NUMERIC(12,2) DEFAULT 0;

ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS unit_price_uzs NUMERIC(12,2) DEFAULT 0;
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS cook_comment TEXT;

-- 6. SECURITY & GRANTS
ALTER TABLE drinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drinks_all" ON drinks;
DROP POLICY IF EXISTS "inventory_items_all" ON inventory_items;
DROP POLICY IF EXISTS "inventory_ledger_all" ON inventory_ledger;

-- CREATE POLICY "drinks_all" ON drinks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "inventory_items_all" ON inventory_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "inventory_ledger_all" ON inventory_ledger FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- 7. REALTIME
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'inventory_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'inventory_ledger') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_ledger;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'drinks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE drinks;
  END IF;
END $$;

-- 8. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- 9. VERIFY
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
