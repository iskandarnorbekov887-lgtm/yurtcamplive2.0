-- ============================================================
-- MEAL REQUESTS TABLE (Standalone Migration)
-- Links meal orders to bookings with dates, quantities, and status.
-- ============================================================

CREATE TABLE IF NOT EXISTS meal_requests (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
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

-- Indexes for fast cook/manager lookups
CREATE INDEX IF NOT EXISTS idx_meal_requests_booking ON meal_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_meal_requests_date ON meal_requests(meal_date);
CREATE INDEX IF NOT EXISTS idx_meal_requests_status ON meal_requests(status);

ALTER TABLE meal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meal_requests_all" ON meal_requests FOR ALL USING (true) WITH CHECK (true);

-- Auto-update trigger
DROP TRIGGER IF EXISTS trg_meal_requests_updated_at ON meal_requests;
CREATE TRIGGER trg_meal_requests_updated_at
  BEFORE UPDATE ON meal_requests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Realtime for instant dashboard sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meal_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE meal_requests;
  END IF;
END $$;
