-- Add default_vegetarian_qty column to bookings table
-- This tracks the default vegetarian count for a booking to pre-fill meal requests

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS default_vegetarian_qty INTEGER NOT NULL DEFAULT 0;

-- Reload schema cache so PostgREST sees the new column
NOTIFY pgrst, 'reload schema';

-- Verify the change
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'bookings'
AND column_name = 'default_vegetarian_qty';
