-- ============================================================
-- EXTRA SERVICES TABLE (Extracted from bookings JSONB)
-- Replaces the drinks_tab and extra_services JSONB blobs
-- with a proper relational table linked to bookings.
-- ============================================================

CREATE TABLE IF NOT EXISTS extra_services (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

  -- 'drink' for drink-tab items, 'other' for laundry/guide/transport etc.
  service_type TEXT NOT NULL DEFAULT 'other'
    CHECK (service_type IN ('drink', 'other')),

  -- For drink entries: optional reference to the drinks catalog row
  source_id INTEGER,

  -- Display name (drink_name or service name)
  name TEXT NOT NULL,

  -- Quantity (always 1 for flat services, >1 for drink refills etc.)
  quantity INTEGER NOT NULL DEFAULT 1,

  -- Pricing
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UZS'
    CHECK (currency IN ('UZS', 'USD', 'EUR')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups per booking and by service type
CREATE INDEX IF NOT EXISTS idx_extra_services_booking ON extra_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_extra_services_type   ON extra_services(service_type);

ALTER TABLE extra_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "extra_services_all" ON extra_services;
CREATE POLICY "extra_services_all" ON extra_services FOR ALL USING (true) WITH CHECK (true);

-- Auto-update timestamp
DROP TRIGGER IF EXISTS trg_extra_services_updated_at ON extra_services;
CREATE TRIGGER trg_extra_services_updated_at
  BEFORE UPDATE ON extra_services FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Realtime for instant dashboard sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'extra_services'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE extra_services;
  END IF;
END $$;
