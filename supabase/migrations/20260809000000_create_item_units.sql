-- Create item_units table for storing most recently used units per item name
CREATE TABLE IF NOT EXISTS item_units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL,
  team_id UUID NOT NULL REFERENCES profiles(team_id) ON DELETE CASCADE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE item_units ENABLE ROW LEVEL SECURITY;

-- Create index for fast lookups by item_name and team_id
CREATE INDEX IF NOT EXISTS idx_item_units_item_name_team_id ON item_units(item_name, team_id);

-- RLS policies: team members can read/write their own team's item units
CREATE POLICY "Team members can read item_units"
  ON item_units FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Team members can insert item_units"
  ON item_units FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Team members can update item_units"
  ON item_units FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Team members can delete item_units"
  ON item_units FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_item_units_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER item_units_updated_at_trigger
  BEFORE UPDATE ON item_units
  FOR EACH ROW
  EXECUTE FUNCTION update_item_units_updated_at();
