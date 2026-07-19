-- ============================================================
-- BACKFILL RECEIPT SNAPSHOTS - FIX isPrepaid FIELDS
-- ============================================================
-- This script fixes existing receipt snapshots in booking_receipts table:
-- 1. Recalculates items.isPrepaid from mealDetails array
-- 2. Removes duplicate top-level isPrepaid field
-- 3. Ensures single canonical isPrepaid field at items.isPrepaid

-- Update all receipt snapshots to recalculate isPrepaid from mealDetails
UPDATE booking_receipts
SET snapshot = snapshot || jsonb_build_object(
  'items', (
    SELECT jsonb_build_object(
      'accommodation', (snapshot->'items'->>'accommodation')::numeric,
      'isPrepaid', (
        CASE
          -- Check if all meals in mealDetails are prepaid
          WHEN (snapshot->'items'->'meals'->'mealDetails') IS NOT NULL THEN
            (
              SELECT COALESCE(bool_and(prepaid), true)
              FROM jsonb_array_elements(snapshot->'items'->'meals'->'mealDetails') AS meal
              WHERE meal->>'prepaid' IS NOT NULL
            )
          -- If no mealDetails, check accommodation status
          ELSE
            ((snapshot->'items'->>'accommodation')::numeric = 0 OR 
             (snapshot->'items'->>'isPrepaid')::boolean = true)
        END
      ),
      'settled_meal_ids', snapshot->'items'->'settled_meal_ids',
      'meals', snapshot->'items'->'meals',
      'services', snapshot->'items'->'services',
      'service_details', snapshot->'items'->'service_details',
      'stay_adjustment', snapshot->'items'->'stay_adjustment',
      'extras', snapshot->'items'->'extras',
      'drinks', snapshot->'items'->'drinks',
      'discount', snapshot->'items'->'discount'
    )
  )
) - snapshot->'isPrepaid'  -- Remove top-level isPrepaid if it exists
WHERE snapshot ? 'items';

-- Verify the backfill
SELECT 
  id,
  booking_id,
  (snapshot->'items'->>'isPrepaid')::boolean as items_isPrepaid,
  (snapshot ? 'isPrepaid') as has_top_level_isPrepaid
FROM booking_receipts
LIMIT 10;
