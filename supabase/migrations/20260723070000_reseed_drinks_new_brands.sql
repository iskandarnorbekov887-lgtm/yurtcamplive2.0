-- ============================================================
-- RESEED DRINKS WITH NEW BRANDS AND CATEGORIES
-- ============================================================

-- Delete existing drinks and variants
DELETE FROM drink_variants;
DELETE FROM drinks;

-- Insert Saqlangan ichimliklar (soft drinks)
INSERT INTO drinks (name, category) VALUES
  ('Coca-Cola', 'saqlangan_ichimliklar'),
  ('Fanta', 'saqlangan_ichimliklar'),
  ('Sprite', 'saqlangan_ichimliklar'),
  ('Pepsi', 'saqlangan_ichimliklar'),
  ('Mirinda', 'saqlangan_ichimliklar'),
  ('7UP', 'saqlangan_ichimliklar');

-- Insert Piva (beer)
INSERT INTO drinks (name, category) VALUES
  ('Sarbast', 'piva'),
  ('Tuborg', 'piva'),
  ('Pulsar', 'piva'),
  ('Qibray', 'piva');

-- Insert Vino (wine)
INSERT INTO drinks (name, category) VALUES
  ('Bog''i Zafron (qizil)', 'vino'),
  ('Shirin', 'vino');

-- Insert Aroq (vodka)
INSERT INTO drinks (name, category) VALUES
  ('Karat', 'aroq'),
  ('Silk Road', 'aroq'),
  ('Khortytsia', 'aroq');

-- Insert variants for Saqlangan ichimliklar (0.5L each)
INSERT INTO drink_variants (drink_id, unit, quantity_in_stock, buy_price, sell_price)
SELECT 
  id, 
  '0.5L', 
  0, 
  5000,  -- placeholder buy price in UZS
  8000   -- placeholder sell price in UZS
FROM drinks 
WHERE category = 'saqlangan_ichimliklar';

-- Insert variants for Piva (0.5L banka each)
INSERT INTO drink_variants (drink_id, unit, quantity_in_stock, buy_price, sell_price)
SELECT 
  id, 
  '0.5L banka', 
  0, 
  12000,
  18000
FROM drinks 
WHERE category = 'piva';

-- Insert variants for Vino (shisha each)
INSERT INTO drink_variants (drink_id, unit, quantity_in_stock, buy_price, sell_price)
SELECT 
  id, 
  'shisha', 
  0, 
  45000,
  65000
FROM drinks 
WHERE category = 'vino';

-- Insert variants for Aroq (shisha each)
INSERT INTO drink_variants (drink_id, unit, quantity_in_stock, buy_price, sell_price)
SELECT 
  id, 
  'shisha', 
  0, 
  45000,
  65000
FROM drinks 
WHERE category = 'aroq';
