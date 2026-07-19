-- Add idempotency_key column to bookings table for duplicate-booking protection
ALTER TABLE bookings ADD COLUMN idempotency_key text;

-- Create unique index on idempotency_key (only for non-null values)
-- This allows the column to be null for existing rows and other insert paths
CREATE UNIQUE INDEX bookings_idempotency_key_idx
  ON bookings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
