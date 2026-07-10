-- ============================================================
-- OPTIMIZED SCHEMA MIGRATION (Clean Structure)
-- Run this in a fresh Supabase SQL Editor for new project
-- ============================================================

-- Drop existing tables if migrating fresh (WARNING: DESTROYS DATA)
-- Uncomment below lines only if starting from zero:
-- DROP TABLE IF EXISTS booking_receipts CASCADE;
-- DROP TABLE IF EXISTS payments CASCADE;
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS camp_finances CASCADE;
-- DROP TABLE IF EXISTS booking_services CASCADE;
-- DROP TABLE IF EXISTS deleted_records CASCADE;
-- DROP TABLE IF EXISTS service_pricing CASCADE;
-- DROP TABLE IF EXISTS bookings CASCADE;
-- DROP TABLE IF EXISTS yurts CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================
-- 1. PROFILES (Staff accounts)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'Manager' CHECK (role IN ('CEO', 'Manager', 'Reserver', 'Cook')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);
-- CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (true);
-- CREATE POLICY "profiles_delete" ON profiles FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'CEO')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. YURTS (Accommodation units)
-- ============================================================
CREATE TABLE IF NOT EXISTS yurts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  capacity INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default yurts if empty
INSERT INTO yurts (name, capacity)
SELECT * FROM (VALUES ('Yurt 1', 2), ('Yurt 2', 2), ('Yurt 3', 2)) AS v(name, capacity)
WHERE NOT EXISTS (SELECT 1 FROM yurts LIMIT 1);

-- ============================================================
-- 3. BOOKINGS (Core reservation data only — no services here)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  guest_count INTEGER DEFAULT 1,
  children_under_12 INTEGER DEFAULT 0,

  -- Stay dates
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  nights INTEGER GENERATED ALWAYS AS (check_out - check_in) STORED,

  -- Yurt assignment (nullable for service-only bookings)
  yurt_id INTEGER REFERENCES yurts(id) ON DELETE SET NULL,

  -- Financial totals (single source of truth)
  total_price NUMERIC(12,2) DEFAULT 0,
  collected_amount NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  exchange_rate NUMERIC(10,4) DEFAULT 1,

  -- Booking metadata
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_arrival')),
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('System', 'manual', 'calendar', 'both')),

  -- Google Calendar sync
  google_event_id TEXT,
  is_manually_updated BOOLEAN DEFAULT FALSE,
  last_edited_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_edited_at TIMESTAMPTZ,

  -- Manager-created booking metadata (JSONB for flexibility)
  meta JSONB DEFAULT '{}',

  -- Staff who created this
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_role TEXT DEFAULT 'Manager',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_out_after_check_in CHECK (check_out >= check_in),
  CONSTRAINT guest_count_positive CHECK (guest_count > 0)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_check_out ON bookings(check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_google_event ON bookings(google_event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings(created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_meta ON bookings USING GIN(meta);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "bookings_all" ON bookings FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. BOOKING SERVICES (Normalized — one row per service type)
-- Replaces all the lunch/dinner/drinks/laundry/guide/transport columns
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_services (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL
    CHECK (service_type IN ('lunch', 'dinner', 'drinks', 'laundry', 'guide', 'transportation')),

  -- Pricing
  unit_price NUMERIC(12,2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  total_price NUMERIC(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
  currency TEXT DEFAULT 'UZS',

  -- Service-specific details in JSONB
  details JSONB DEFAULT '{}',
  -- Examples stored in details:
  -- guide:    {"names": "John, Mike", "hours": 4}
  -- transport:{"vehicle_type": "van", "from": "airport"}
  -- laundry:  {"items": 5, "weight_kg": 2.5}

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_services_booking_id ON booking_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_services_type ON booking_services(service_type);

ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "booking_services_all" ON booking_services FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 5. PAYMENTS (Individual payment records per booking)
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
-- CREATE POLICY "payments_all" ON payments FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 6. BOOKING RECEIPTS (Receipt snapshots)
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
-- CREATE POLICY "booking_receipts_all" ON booking_receipts FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 7. CAMP FINANCES (Income/Expense ledger)
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

  -- Staff tracking
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_role TEXT DEFAULT 'Manager',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camp_finances_type ON camp_finances(type);
CREATE INDEX IF NOT EXISTS idx_camp_finances_category ON camp_finances(category);
CREATE INDEX IF NOT EXISTS idx_camp_finances_created_by ON camp_finances(created_by);

ALTER TABLE camp_finances ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "camp_finances_all" ON camp_finances FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_camp_finances_updated_at ON camp_finances;
CREATE TRIGGER trg_camp_finances_updated_at
  BEFORE UPDATE ON camp_finances FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. NOTIFICATIONS (Alerts for staff)
-- FIXED: user_id now UUID to match profiles.id
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('date_change_request', 'booking_alert', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_id INTEGER, -- can reference bookings.id or camp_finances.id depending on context
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "notifications_all" ON notifications FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON notifications FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. SERVICE PRICING (CEO-configurable prices)
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

INSERT INTO service_pricing (id, guide_price, lunch_price, dinner_price, night_stay_price, laundry_price, drinks_price, pricing_enabled)
SELECT 1, 0, 0, 0, 0, 0, 0, FALSE
WHERE NOT EXISTS (SELECT 1 FROM service_pricing WHERE id = 1);

ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service_pricing_all" ON service_pricing FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_service_pricing_updated_at ON service_pricing;
CREATE TRIGGER trg_service_pricing_updated_at
  BEFORE UPDATE ON service_pricing FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10. DELETED RECORDS (Soft-delete audit log using JSONB)
-- FIXED: proper auto-increment, stores snapshot instead of 25 columns
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

CREATE INDEX IF NOT EXISTS idx_deleted_records_table ON deleted_records(original_table);
CREATE INDEX IF NOT EXISTS idx_deleted_records_original_id ON deleted_records(original_id);
CREATE INDEX IF NOT EXISTS idx_deleted_records_deleted_at ON deleted_records(deleted_at);

ALTER TABLE deleted_records ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "deleted_records_all" ON deleted_records FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 11. GROCERY REQUESTS (Kitchen supply requests)
-- ============================================================
CREATE TABLE IF NOT EXISTS grocery_requests (
  id SERIAL PRIMARY KEY,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'purchased', 'received')),
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grocery_requests_status ON grocery_requests(status);

ALTER TABLE grocery_requests ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "grocery_requests_all" ON grocery_requests FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_grocery_requests_updated_at ON grocery_requests;
CREATE TRIGGER trg_grocery_requests_updated_at
  BEFORE UPDATE ON grocery_requests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Optimized schema created successfully' AS status;
