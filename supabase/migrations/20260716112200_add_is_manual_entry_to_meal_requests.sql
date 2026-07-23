-- Add is_manual_entry column to meal_requests to distinguish manager-added entries from kitchen-processed orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meal_requests' AND column_name = 'is_manual_entry'
  ) THEN
    ALTER TABLE meal_requests ADD COLUMN is_manual_entry boolean NOT NULL DEFAULT false;
  END IF;
END $$;
