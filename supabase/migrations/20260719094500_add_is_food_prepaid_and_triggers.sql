-- ============================================================
-- ADD is_food_prepaid COLUMN AND TRIGGERS FOR PREPAID SYNC
-- ============================================================

-- 1. Add is_food_prepaid column to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_food_prepaid BOOLEAN DEFAULT FALSE;

-- 2. Create function to recalculate is_food_prepaid from meal_requests
CREATE OR REPLACE FUNCTION recalculate_is_food_prepaid()
RETURNS TRIGGER AS $$
BEGIN
  -- For the affected booking, check if ALL meal_requests have prepaid = true
  -- If zero meal requests exist, treat food as satisfied (true)
  -- Count ALL meal_requests regardless of status (Accepted, Paid, etc.)
  UPDATE bookings
  SET is_food_prepaid = (
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN true  -- No meals = satisfied
        WHEN COUNT(*) = COUNT(*) FILTER (WHERE prepaid = true) THEN true  -- All meals prepaid
        ELSE false
      END
    FROM meal_requests
    WHERE booking_id = COALESCE(NEW.booking_id, OLD.booking_id)
  )
  WHERE id = COALESCE(NEW.booking_id, OLD.booking_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger on meal_requests to fire the recalculation
DROP TRIGGER IF EXISTS trg_meal_requests_recalc_food_prepaid ON meal_requests;
CREATE TRIGGER trg_meal_requests_recalc_food_prepaid
  AFTER INSERT OR UPDATE OF prepaid, status ON meal_requests
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_is_food_prepaid();

-- 4. Create function to recalculate is_prepaid from is_food_prepaid, is_accommodation_prepaid, and stay_price
CREATE OR REPLACE FUNCTION recalculate_is_prepaid()
RETURNS TRIGGER AS $$
DECLARE
  new_is_prepaid BOOLEAN;
BEGIN
  -- Calculate new is_prepaid value
  SELECT
    CASE
      WHEN (is_food_prepaid = true OR is_food_prepaid IS NULL) AND
           (is_accommodation_prepaid = true OR stay_price = 0 OR stay_price IS NULL)
      THEN true
      ELSE false
    END
  INTO new_is_prepaid
  FROM bookings
  WHERE id = COALESCE(NEW.id, OLD.id);

  -- Only update if the value would actually change (prevents infinite loop)
  IF COALESCE(NEW.is_prepaid, false) != new_is_prepaid THEN
    UPDATE bookings
    SET is_prepaid = new_is_prepaid
    WHERE id = COALESCE(NEW.id, OLD.id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger on bookings to fire is_prepaid recalculation
DROP TRIGGER IF EXISTS trg_bookings_recalc_is_prepaid ON bookings;
CREATE TRIGGER trg_bookings_recalc_is_prepaid
  AFTER UPDATE OF is_food_prepaid, is_accommodation_prepaid, stay_price ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_is_prepaid();

-- 6. Backfill query to fix all existing bookings
-- Run this manually after applying the migration:
/*
UPDATE bookings
SET is_food_prepaid = (
  SELECT
    CASE
      WHEN COUNT(*) = 0 THEN true
      WHEN COUNT(*) = COUNT(*) FILTER (WHERE prepaid = true) THEN true
      ELSE false
    END
  FROM meal_requests
  WHERE meal_requests.booking_id = bookings.id
);

UPDATE bookings
SET is_prepaid = (
  CASE
    WHEN (is_food_prepaid = true OR is_food_prepaid IS NULL) AND
         (is_accommodation_prepaid = true OR stay_price = 0 OR stay_price IS NULL)
    THEN true
    ELSE false
  END
);
*/

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
