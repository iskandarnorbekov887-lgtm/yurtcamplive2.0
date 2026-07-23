-- ============================================================
-- UPDATE DRINKS CATEGORIES TO 4 FIXED VALUES
-- ============================================================

-- Step 1: Drop old CHECK constraint if it exists
ALTER TABLE drinks DROP CONSTRAINT IF EXISTS drinks_category_check;

-- Step 2: Migrate existing data
-- alkogolsiz -> saqlangan_ichimliklar
UPDATE drinks SET category = 'saqlangan_ichimliklar' WHERE category = 'alkogolsiz';

-- alkogolli -> split by type
-- Sarbast, Tuborg are beers -> piva
UPDATE drinks SET category = 'piva'
WHERE category = 'alkogolli' AND name IN ('Sarbast', 'Tuborg');

-- Vino is wine -> vino
UPDATE drinks SET category = 'vino'
WHERE category = 'alkogolli' AND name = 'Vino';

-- Aroq is vodka -> aroq
UPDATE drinks SET category = 'aroq'
WHERE category = 'alkogolli' AND name = 'Aroq';

-- Report any remaining alkogolli rows (should be none)
-- This will fail if there are any unhandled rows
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM drinks WHERE category = 'alkogolli';
  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'Found % unhandled alkogolli drinks. Please review migration.', remaining_count;
  END IF;
END $$;

-- Step 3: Add new CHECK constraint with 4 fixed categories
ALTER TABLE drinks ADD CONSTRAINT drinks_category_check
  CHECK (category IN ('saqlangan_ichimliklar', 'piva', 'vino', 'aroq'));
