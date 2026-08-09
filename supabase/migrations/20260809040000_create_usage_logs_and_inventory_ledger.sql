-- Create usage_logs and inventory_ledger tables for inventory tracking
-- Based on actual code expectations from financials/page.tsx and meal-actions.ts

-- ============================================================
-- 1. USAGE_LOGS (Financials purchase/usage logging)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_logs (
  id SERIAL PRIMARY KEY,
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  amount_used FLOAT NOT NULL,
  change_type TEXT CHECK (change_type IN ('purchase', 'usage', 'adjustment')),
  resulting_quantity FLOAT,
  logged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES profiles(team_id) ON DELETE CASCADE,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for usage_logs
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read usage_logs"
  ON usage_logs FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Team members can insert usage_logs"
  ON usage_logs FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Indexes for usage_logs
CREATE INDEX IF NOT EXISTS idx_usage_logs_item_id ON usage_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_team_id ON usage_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_change_type ON usage_logs(change_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_item_id_team_id ON usage_logs(item_id, team_id);

-- ============================================================
-- 2. INVENTORY_LEDGER (Meal-based deduction logging)
-- ============================================================
CREATE TYPE ledger_type AS ENUM ('IN', 'OUT', 'WASTE', 'ADJUSTMENT');

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory(id) ON DELETE CASCADE,
  type ledger_type NOT NULL,
  qty FLOAT NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS for inventory_ledger
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can read inventory_ledger"
  ON inventory_ledger FOR SELECT
  USING (
    item_id IN (
      SELECT id FROM inventory WHERE team_id IN (
        SELECT team_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Team members can insert inventory_ledger"
  ON inventory_ledger FOR INSERT
  WITH CHECK (
    item_id IN (
      SELECT id FROM inventory WHERE team_id IN (
        SELECT team_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Indexes for inventory_ledger
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_item_id ON inventory_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_type ON inventory_ledger(type);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_created_at ON inventory_ledger(created_at DESC);

-- ============================================================
-- 3. Enable Realtime
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE usage_logs; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE inventory_ledger; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
