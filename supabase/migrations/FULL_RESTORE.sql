-- ============================================================
-- FULL DATABASE RESTORE — Run this ENTIRE script in Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/blcgjsnorpxsvaxohzxl/sql/new
-- ============================================================

-- ============================================================
-- 1. YURTS
-- ============================================================
CREATE TABLE IF NOT EXISTS yurts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  capacity INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO yurts (name, capacity)
SELECT * FROM (VALUES ('Yurt 1', 2), ('Yurt 2', 2), ('Yurt 3', 2)) AS v(name, capacity)
WHERE NOT EXISTS (SELECT 1 FROM yurts LIMIT 1);

ALTER TABLE yurts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "yurts_all" ON yurts;
CREATE POLICY "yurts_all" ON yurts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. BOOKINGS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  guest_count INTEGER DEFAULT 1,
  children_under_12 INTEGER DEFAULT 0,

  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  nights INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,

  yurt_id INTEGER REFERENCES yurts(id) ON DELETE SET NULL,

  total_price NUMERIC(12,2) DEFAULT 0,
  collected_amount NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  exchange_rate NUMERIC(10,4) DEFAULT 1,

  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_arrival')),
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('System', 'manual', 'calendar', 'both')),

  google_event_id TEXT,
  is_manually_updated BOOLEAN DEFAULT FALSE,
  last_edited_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_edited_by_role TEXT DEFAULT 'Manager',
  last_edited_at TIMESTAMPTZ,

  meta JSONB DEFAULT '{}',
  special_requests TEXT,
  payment_status TEXT DEFAULT 'unpaid',
  payment_method TEXT,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_role TEXT DEFAULT 'Manager',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT check_out_after_check_in CHECK (check_out >= check_in),
  CONSTRAINT guest_count_positive CHECK (guest_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_check_out ON bookings(check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_google_event ON bookings(google_event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings(created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_meta ON bookings USING GIN(meta);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bookings_all" ON bookings;
CREATE POLICY "bookings_all" ON bookings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. BOOKING SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_services (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL
    CHECK (service_type IN ('lunch', 'dinner', 'drinks', 'laundry', 'guide', 'transportation')),
  unit_price NUMERIC(12,2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  currency TEXT DEFAULT 'UZS',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_services_booking_id ON booking_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_type ON booking_services(service_type);

ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "booking_services_all" ON booking_services;
CREATE POLICY "booking_services_all" ON booking_services FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_original NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_original TEXT NOT NULL DEFAULT 'USD',
  amount_usd_equivalent NUMERIC(12,2) NOT NULL DEFAULT 0,
  exchange_rate_used NUMERIC(10,4) NOT NULL DEFAULT 1,
  method TEXT NOT NULL DEFAULT 'Cash'
    CHECK (method IN ('Cash', 'Card', 'Online', 'Bank Transfer')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_all" ON payments;
CREATE POLICY "payments_all" ON payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5. BOOKING RECEIPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_receipts (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  receipt_id TEXT NOT NULL UNIQUE,
  snapshot JSONB NOT NULL DEFAULT '{}',
  total_usd NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_receipts_booking_id ON booking_receipts(booking_id);

ALTER TABLE booking_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "booking_receipts_all" ON booking_receipts;
CREATE POLICY "booking_receipts_all" ON booking_receipts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6. CAMP FINANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS camp_finances (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'UZS',
  exchange_rate NUMERIC(10,4) DEFAULT 1,
  amount_usd NUMERIC(12,2) GENERATED ALWAYS AS (amount / NULLIF(exchange_rate, 0)) STORED,
  payment_method TEXT DEFAULT 'Cash',
  receipt_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_role TEXT DEFAULT 'Manager',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camp_finances_type ON camp_finances(type);
CREATE INDEX IF NOT EXISTS idx_camp_finances_category ON camp_finances(category);
CREATE INDEX IF NOT EXISTS idx_camp_finances_created_by ON camp_finances(created_by);

ALTER TABLE camp_finances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "camp_finances_all" ON camp_finances;
CREATE POLICY "camp_finances_all" ON camp_finances FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_camp_finances_updated_at ON camp_finances;
CREATE TRIGGER trg_camp_finances_updated_at
  BEFORE UPDATE ON camp_finances FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('date_change_request', 'booking_alert', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_all" ON notifications;
CREATE POLICY "notifications_all" ON notifications FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. SERVICE PRICING
-- ============================================================
CREATE TABLE IF NOT EXISTS service_pricing (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  guide_price NUMERIC(12,2) DEFAULT 0,
  lunch_price NUMERIC(12,2) DEFAULT 0,
  dinner_price NUMERIC(12,2) DEFAULT 0,
  night_stay_price NUMERIC(12,2) DEFAULT 0,
  laundry_price NUMERIC(12,2) DEFAULT 0,
  drinks_price NUMERIC(12,2) DEFAULT 0,
  pricing_enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Patch any missing columns on already-existing table
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS guide_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS lunch_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS dinner_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS night_stay_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS laundry_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS drinks_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS pricing_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO service_pricing (id, guide_price, lunch_price, dinner_price, night_stay_price, laundry_price, drinks_price, pricing_enabled)
SELECT 1, 0, 0, 0, 0, 0, 0, FALSE
WHERE NOT EXISTS (SELECT 1 FROM service_pricing WHERE id = 1);

ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_pricing_all" ON service_pricing;
CREATE POLICY "service_pricing_all" ON service_pricing FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_service_pricing_updated_at ON service_pricing;
CREATE TRIGGER trg_service_pricing_updated_at
  BEFORE UPDATE ON service_pricing FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. DELETED RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS deleted_records (
  id SERIAL PRIMARY KEY,
  original_table TEXT NOT NULL,
  original_id INTEGER NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  delete_reason TEXT,
  deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE deleted_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deleted_records_all" ON deleted_records;
CREATE POLICY "deleted_records_all" ON deleted_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 10. GROCERY REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS grocery_requests (
  id SERIAL PRIMARY KEY,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'purchased', 'received')),
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE grocery_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grocery_requests_all" ON grocery_requests;
CREATE POLICY "grocery_requests_all" ON grocery_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_grocery_requests_updated_at ON grocery_requests;
CREATE TRIGGER trg_grocery_requests_updated_at
  BEFORE UPDATE ON grocery_requests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 11. MEAL REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_requests (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  order_id TEXT,
  meal_date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('Lunch', 'Dinner')),
  adult_qty INTEGER NOT NULL DEFAULT 1,
  child_qty INTEGER NOT NULL DEFAULT 0,
  dietary_type TEXT NOT NULL DEFAULT 'Normal' CHECK (dietary_type IN ('Normal', 'Vegetarian')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Accepted', 'Served')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_requests_booking ON meal_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_meal_requests_date ON meal_requests(meal_date);
CREATE INDEX IF NOT EXISTS idx_meal_requests_status ON meal_requests(status);

ALTER TABLE meal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meal_requests_all" ON meal_requests;
CREATE POLICY "meal_requests_all" ON meal_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_meal_requests_updated_at ON meal_requests;
CREATE TRIGGER trg_meal_requests_updated_at
  BEFORE UPDATE ON meal_requests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. PROCUREMENT TABLES
-- ============================================================
DO $$ BEGIN
    CREATE TYPE procurement_status AS ENUM ('draft', 'sent', 'reviewed', 'finalized');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE unit_type AS ENUM ('kg', 'l', 'unit');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE item_status AS ENUM ('pending', 'discrepancy', 'ok');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT UNIQUE NOT NULL,
  current_stock FLOAT NOT NULL DEFAULT 0,
  unit_type unit_type NOT NULL DEFAULT 'kg',
  min_threshold FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status procurement_status NOT NULL DEFAULT 'draft',
  total_cost DECIMAL(12, 2) DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS procurement_items (
  id SERIAL PRIMARY KEY,
  request_id UUID REFERENCES procurement_requests(id) ON DELETE CASCADE,
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  requested_qty FLOAT NOT NULL DEFAULT 0,
  actual_received_qty FLOAT DEFAULT 0,
  unit_price DECIMAL(12, 2) DEFAULT 0,
  item_status item_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id SERIAL PRIMARY KEY,
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  amount_used FLOAT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_all" ON inventory;
DROP POLICY IF EXISTS "procurement_requests_all" ON procurement_requests;
DROP POLICY IF EXISTS "procurement_items_all" ON procurement_items;
DROP POLICY IF EXISTS "usage_logs_all" ON usage_logs;

CREATE POLICY "inventory_all" ON inventory FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "procurement_requests_all" ON procurement_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "procurement_items_all" ON procurement_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "usage_logs_all" ON usage_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 13. GRANTS — Allow PostgREST (anon + authenticated) to access everything
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- ============================================================
-- 14. RELOAD PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY — You should see all tables listed below
-- ============================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
