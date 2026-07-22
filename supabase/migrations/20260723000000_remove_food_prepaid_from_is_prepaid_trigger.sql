-- ============================================================
-- REMOVE is_food_prepaid FROM is_prepaid RECALCULATION TRIGGER
-- ============================================================
-- This prevents food prepaid status from affecting the legacy
-- bookings.is_prepaid field, which was causing UI bugs where
-- marking food as prepaid would lock the accommodation section.

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trg_bookings_recalc_is_prepaid ON bookings;

-- Recreate the trigger without is_food_prepaid in the watch list
-- Now it only fires when is_accommodation_prepaid or stay_price changes
CREATE TRIGGER trg_bookings_recalc_is_prepaid
  AFTER UPDATE OF is_accommodation_prepaid, stay_price ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION recalculate_is_prepaid();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
