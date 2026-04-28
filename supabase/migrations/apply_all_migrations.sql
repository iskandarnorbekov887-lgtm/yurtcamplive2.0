-- Combined migration script to apply all schema changes at once
-- This includes: bookings updates, camp_finances updates, and payments/receipts tables

-- ============================================================================
-- PART 1: Update bookings table
-- ============================================================================

-- Make yurt_id nullable for service-only bookings
ALTER TABLE bookings 
ALTER COLUMN yurt_id DROP NOT NULL;

-- Add service fields
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_count INTEGER,
ADD COLUMN IF NOT EXISTS children_under_12 INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS nights TEXT,
ADD COLUMN IF NOT EXISTS guide_service BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS guide_names TEXT,
ADD COLUMN IF NOT EXISTS guide_amount TEXT,
ADD COLUMN IF NOT EXISTS has_transportation BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transportation_details TEXT,
ADD COLUMN IF NOT EXISTS lunch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS lunch_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS dinner BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dinner_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS drinks BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS drinks_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS laundry BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS laundry_price TEXT,
ADD COLUMN IF NOT EXISTS laundry_currency TEXT DEFAULT 'UZS',
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UZS',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1,
ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON bookings(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_check_out ON bookings(check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by_role ON bookings(created_by_role);

-- ============================================================================
-- PART 2: Update camp_finances table
-- ============================================================================

-- Add drinks columns if they don't exist
ALTER TABLE camp_finances 
ADD COLUMN IF NOT EXISTS drinks BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS drinks_count INTEGER DEFAULT 0;

-- Add laundry currency column if it doesn't exist
ALTER TABLE camp_finances 
ADD COLUMN IF NOT EXISTS laundry_currency TEXT DEFAULT 'UZS';

-- Update payment_method column to support new values
ALTER TABLE camp_finances 
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Create index on payment_method for faster filtering
CREATE INDEX IF NOT EXISTS idx_camp_finances_payment_method ON camp_finances(payment_method);

-- Create index on created_by for faster filtering by role
CREATE INDEX IF NOT EXISTS idx_camp_finances_created_by ON camp_finances(created_by);

-- ============================================================================
-- PART 3: Create payments and booking_receipts tables
-- ============================================================================

-- Create payments table for tracking individual payment records per booking
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_original NUMERIC NOT NULL DEFAULT 0,
  currency_original TEXT NOT NULL DEFAULT 'USD',
  amount_usd_equivalent NUMERIC NOT NULL DEFAULT 0,
  exchange_rate_used NUMERIC NOT NULL DEFAULT 1,
  method TEXT NOT NULL DEFAULT 'Cash',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create booking_receipts table for persisting receipt snapshots
CREATE TABLE IF NOT EXISTS booking_receipts (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  receipt_id TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  total_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_receipts_booking_id ON booking_receipts(booking_id);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_receipts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can manage payments"
  ON payments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage booking_receipts"
  ON booking_receipts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
