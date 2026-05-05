-- ============================================================
-- GROCERY REQUESTS TABLE (Standalone Migration)
-- Run this in your Supabase SQL Editor if the table is missing.
-- ============================================================

-- Ensure the update_updated_at function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- GROCERY REQUESTS (Kitchen supply requests)
CREATE TABLE IF NOT EXISTS grocery_requests (
  id SERIAL PRIMARY KEY,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'purchased', 'received')),
  created_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grocery_requests_status ON grocery_requests(status);

ALTER TABLE grocery_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grocery_requests_all" ON grocery_requests FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_grocery_requests_updated_at ON grocery_requests;
CREATE TRIGGER trg_grocery_requests_updated_at
  BEFORE UPDATE ON grocery_requests FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable Realtime for this table (needed for instant dashboard updates)
alter publication supabase_realtime add table grocery_requests;
