-- Add manager_access column to team_settings table
-- This allows CEO to grant temporary global manager access to closed tabs
-- Value is JSONB: { enabled: boolean, expires_at: timestamptz | null }

ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS manager_access JSONB DEFAULT '{"enabled": false, "expires_at": null}'::jsonb;

-- Reload schema cache so PostgREST sees the new column
NOTIFY pgrst, 'reload schema';

-- Verify the change
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'team_settings' 
AND column_name = 'manager_access';
