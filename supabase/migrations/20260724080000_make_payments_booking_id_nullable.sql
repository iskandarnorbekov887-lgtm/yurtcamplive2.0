-- ============================================================
-- MAKE PAYMENTS.BOOKING_ID NULLABLE FOR WALK-IN POS SALES
-- ============================================================

-- Drop the NOT NULL constraint on booking_id
ALTER TABLE payments ALTER COLUMN booking_id DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN payments.booking_id IS 'Booking ID (NULL for walk-in POS sales)';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
