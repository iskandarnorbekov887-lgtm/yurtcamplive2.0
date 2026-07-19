-- Add is_accommodation_prepaid column to bookings table
-- This flag specifically tracks whether accommodation is prepaid, separate from general is_prepaid

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_accommodation_prepaid BOOLEAN DEFAULT FALSE;

-- Reload schema cache so PostgREST sees the new column
NOTIFY pgrst, 'reload schema';

-- Verify the change
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'bookings'
AND column_name = 'is_accommodation_prepaid';
