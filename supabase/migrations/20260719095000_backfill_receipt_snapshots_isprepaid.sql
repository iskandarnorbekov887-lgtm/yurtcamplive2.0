-- ============================================================
-- BACKFILL RECEIPT SNAPSHOTS - FIX isPrepaid FIELDS
-- ============================================================
-- This script fixes existing receipt snapshots in booking_receipts table:
-- 1. Recalculates items.isPrepaid from mealDetails array
-- 2. Removes duplicate top-level isPrepaid field
-- 3. Ensures single canonical isPrepaid field at items.isPrepaid

-- Skip this backfill for now - it's not critical for drinks functionality
-- The snapshot structure may have changed since this was written
-- This can be revisited later if needed

-- Verify the current state
SELECT 
  id,
  booking_id,
  (snapshot->'items'->>'isPrepaid')::boolean as items_isPrepaid,
  (snapshot ? 'isPrepaid') as has_top_level_isPrepaid
FROM booking_receipts
LIMIT 10;
