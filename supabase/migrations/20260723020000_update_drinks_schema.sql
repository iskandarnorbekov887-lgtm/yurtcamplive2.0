-- ============================================================
-- UPDATE DRINKS TABLE SCHEMA - ADD UNIT TYPE AND PRICE FIELDS
-- ============================================================

-- Add new columns to drinks table
ALTER TABLE drinks 
  ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'bottle',
  ADD COLUMN IF NOT EXISTS buy_price NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) DEFAULT 0;

-- Migrate existing price to sell_price for backward compatibility
UPDATE drinks 
SET sell_price = price 
WHERE sell_price = 0 AND price IS NOT NULL;

-- Drop the old price column (after migration)
ALTER TABLE drinks DROP COLUMN IF EXISTS price;

-- Add comment for documentation
COMMENT ON COLUMN drinks.unit_type IS 'Unit type for the drink (e.g., 0.5L, 1L, glass, bottle)';
COMMENT ON COLUMN drinks.buy_price IS 'Price the drink was purchased for';
COMMENT ON COLUMN drinks.sell_price IS 'Price the drink is sold to guests for';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
