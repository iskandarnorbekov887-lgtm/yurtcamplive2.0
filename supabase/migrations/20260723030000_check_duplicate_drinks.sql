-- Check for duplicate drinks (same name and unit_type)
-- This query identifies drinks that have the same name and unit_type combination
-- which would indicate duplicate entries that should be merged or cleaned up.

SELECT 
  name,
  unit_type,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as drink_ids,
  STRING_AGG(quantity_in_stock::text, ', ') as stock_levels,
  STRING_AGG(buy_price::text, ', ') as buy_prices,
  STRING_AGG(sell_price::text, ', ') as sell_prices
FROM drinks
GROUP BY name, unit_type
HAVING COUNT(*) > 1
ORDER BY name, unit_type;

-- If duplicates are found, you can use this query to see all details of the duplicates:
-- SELECT * FROM drinks WHERE (name, unit_type) IN (
--   SELECT name, unit_type FROM drinks GROUP BY name, unit_type HAVING COUNT(*) > 1
-- ) ORDER BY name, unit_type, created_at;
