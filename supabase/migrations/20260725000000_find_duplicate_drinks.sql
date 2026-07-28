-- Find duplicate drink names (case-insensitive, trimmed)
-- This query identifies drinks that are the same brand but have different casing/spacing

SELECT 
  lower(trim(name)) as normalized_name,
  category,
  count(*) as duplicate_count,
  array_agg(id) as drink_ids,
  array_agg(name) as original_names
FROM drinks
GROUP BY lower(trim(name)), category
HAVING count(*) > 1
ORDER BY normalized_name, category;
