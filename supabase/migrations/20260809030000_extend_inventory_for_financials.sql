-- Extend existing inventory table for financials integration
-- Add team_id for multi-tenancy and updated_at timestamp

-- Add team_id column to inventory
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES profiles(team_id) ON DELETE CASCADE;

-- Add updated_at column to inventory
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Drop existing unique constraint on item_name
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_item_name_key;

-- Add composite unique constraint on (item_name, team_id)
ALTER TABLE inventory 
ADD CONSTRAINT inventory_item_name_team_id_key UNIQUE (item_name, team_id);

-- Create trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_updated_at_trigger ON inventory;
CREATE TRIGGER update_inventory_updated_at_trigger
  BEFORE UPDATE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_updated_at();

-- Update RLS policies for inventory to support team scoping
DROP POLICY IF EXISTS "Allow all for auth" ON inventory;
CREATE POLICY "Team members can read inventory"
  ON inventory FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Team members can insert inventory"
  ON inventory FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Team members can update inventory"
  ON inventory FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Team members can delete inventory"
  ON inventory FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_team_id ON inventory(team_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_name_team_id ON inventory(item_name, team_id);
