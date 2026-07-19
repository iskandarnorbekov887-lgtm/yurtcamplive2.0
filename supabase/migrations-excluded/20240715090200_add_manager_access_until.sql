-- Add manager_access_until column to bookings table
-- This allows CEO to grant temporary manager access to closed tabs
-- When set, managers can view the tab until this timestamp expires

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manager_access_until TIMESTAMPTZ;

-- Reload schema cache so PostgREST sees the new column
NOTIFY pgrst, 'reload schema';

-- Verify the change
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
AND column_name = 'manager_access_until';
