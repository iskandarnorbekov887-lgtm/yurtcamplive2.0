-- Update bookings table to add service fields for Reserver booking form

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
