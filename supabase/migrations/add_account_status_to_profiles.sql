-- Add account_status column to profiles table for ban functionality
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' 
CHECK (account_status IN ('active', 'banned'));

-- Create index on account_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON profiles(account_status);

-- Update existing profiles to have 'active' status (in case any NULL values exist)
UPDATE profiles 
SET account_status = 'active' 
WHERE account_status IS NULL;

SELECT 'account_status column added to profiles table successfully' AS status;
