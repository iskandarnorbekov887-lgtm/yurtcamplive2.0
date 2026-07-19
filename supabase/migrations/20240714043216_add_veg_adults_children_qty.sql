-- Add veg_adults_qty and veg_children_qty columns to meal_requests table
ALTER TABLE meal_requests
ADD COLUMN IF NOT EXISTS veg_adults_qty INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS veg_children_qty INTEGER NOT NULL DEFAULT 0;
