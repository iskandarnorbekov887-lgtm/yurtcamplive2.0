-- Add is_manual_entry column to meal_requests to distinguish manager-added entries from kitchen-processed orders
ALTER TABLE meal_requests ADD COLUMN is_manual_entry boolean NOT NULL DEFAULT false;
