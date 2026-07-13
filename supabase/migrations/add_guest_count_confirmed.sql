-- Add guest_count_confirmed column to bookings table
-- This flag tracks whether a manager has explicitly confirmed/saved the guest count
-- Used to lock Adults/Children inputs in BookingModal after first save

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_count_confirmed BOOLEAN DEFAULT FALSE;

-- Reload schema cache so PostgREST sees the new column
NOTIFY pgrst, 'reload schema';

-- Verify the change
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
AND column_name = 'guest_count_confirmed';
