-- Add vegetarian_qty column to meal_requests table
-- This tracks how many of the total meal count is vegetarian

ALTER TABLE meal_requests ADD COLUMN IF NOT EXISTS vegetarian_qty INTEGER NOT NULL DEFAULT 0;

-- Reload schema cache so PostgREST sees the new column
NOTIFY pgrst, 'reload schema';

-- Verify the change
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'meal_requests'
AND column_name = 'vegetarian_qty';
