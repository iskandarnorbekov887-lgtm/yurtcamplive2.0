-- ============================================================
-- SEED DATA - COMMON UZBEK DRINKS
-- ============================================================

-- Insert Alkogolsiz drinks (non-alcoholic)
INSERT INTO drinks (name, category) VALUES
  ('Coca-Cola', 'alkogolsiz'),
  ('Fanta', 'alkogolsiz'),
  ('Sprite', 'alkogolsiz'),
  ('Pepsi', 'alkogolsiz'),
  ('Mirinda', 'alkogolsiz'),
  ('7UP', 'alkogolsiz');

-- Insert Alkogolli drinks (alcoholic)
INSERT INTO drinks (name, category) VALUES
  ('Sarbast', 'alkogolli'),
  ('Tuborg', 'alkogolli'),
  ('Vino', 'alkogolli'),
  ('Aroq', 'alkogolli');

-- Insert variants for Alkogolsiz drinks (0.5L each)
INSERT INTO drink_variants (drink_id, unit, quantity_in_stock, buy_price, sell_price)
SELECT 
  id, 
  '0.5L', 
  0, 
  5000,  -- placeholder buy price in UZS
  8000   -- placeholder sell price in UZS
FROM drinks 
WHERE category = 'alkogolsiz';

-- Insert variants for Alkogolli drinks
-- Beers: 0.5L banka
INSERT INTO drink_variants (drink_id, unit, quantity_in_stock, buy_price, sell_price)
SELECT 
  id, 
  '0.5L banka', 
  0, 
  12000,
  18000
FROM drinks 
WHERE category = 'alkogolli' AND name IN ('Sarbast', 'Tuborg');

-- Wine and Vodka: shisha (bottle)
INSERT INTO drink_variants (drink_id, unit, quantity_in_stock, buy_price, sell_price)
SELECT 
  id, 
  'shisha', 
  0, 
  45000,
  65000
FROM drinks 
WHERE category = 'alkogolli' AND name IN ('Vino', 'Aroq');
