-- ============================================================
-- ADD MISSING BOOKINGS COLUMNS
-- Run in: https://supabase.com/dashboard/project/blcgjsnorpxsvaxohzxl/sql/new
-- ============================================================

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
  -- lunch_prepaid and dinner_prepaid removed - unused, replaced by meal_requests.prepaid
  ADD COLUMN IF NOT EXISTS drinks_tab             JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS extra_services         JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS collected_currency     TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS guest_category         TEXT,
  ADD COLUMN IF NOT EXISTS local_stay_type        TEXT,
  ADD COLUMN IF NOT EXISTS last_adjustment        TEXT,
  ADD COLUMN IF NOT EXISTS description            TEXT,
  ADD COLUMN IF NOT EXISTS amount                 NUMERIC(12,2) DEFAULT 0;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- Confirm
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings'
ORDER BY ordinal_position;
