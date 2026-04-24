-- Update camp_finances table to add missing columns for income form

-- Add drinks columns if they don't exist
ALTER TABLE camp_finances 
ADD COLUMN IF NOT EXISTS drinks BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS drinks_count INTEGER DEFAULT 0;

-- Add laundry currency column if it doesn't exist
ALTER TABLE camp_finances 
ADD COLUMN IF NOT EXISTS laundry_currency TEXT DEFAULT 'UZS';

-- Update payment_method column to support new values
-- Note: If payment_method was previously constrained, we may need to drop and recreate
-- For Supabase, we can just ensure the column exists
ALTER TABLE camp_finances 
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Create index on payment_method for faster filtering
CREATE INDEX IF NOT EXISTS idx_camp_finances_payment_method ON camp_finances(payment_method);

-- Create index on created_by for faster filtering by role
CREATE INDEX IF NOT EXISTS idx_camp_finances_created_by ON camp_finances(created_by);
