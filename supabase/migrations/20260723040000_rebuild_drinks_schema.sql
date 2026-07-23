-- ============================================================
-- REBUILD DRINKS SCHEMA - NEW NORMALIZED STRUCTURE
-- ============================================================

-- Drop old tables (if they exist)
DROP TABLE IF EXISTS drink_sales CASCADE;
DROP TABLE IF EXISTS drinks CASCADE;

-- Create new drinks table (parent drinks)
CREATE TABLE drinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('alkogolsiz', 'alkogolli')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create new drink_variants table (variants per drink)
CREATE TABLE drink_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drink_id UUID NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  unit TEXT NOT NULL,
  quantity_in_stock INTEGER DEFAULT 0,
  buy_price NUMERIC,
  sell_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create new drink_sales table (sales tracking)
CREATE TABLE drink_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES drink_variants(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  price_at_sale NUMERIC NOT NULL,
  sold_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_drinks_category ON drinks(category);
CREATE INDEX idx_drink_variants_drink_id ON drink_variants(drink_id);
CREATE INDEX idx_drink_sales_variant_id ON drink_sales(variant_id);
CREATE INDEX idx_drink_sales_booking_id ON drink_sales(booking_id);
CREATE INDEX idx_drink_sales_sold_at ON drink_sales(sold_at);

-- Enable RLS
ALTER TABLE drinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE drink_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE drink_sales ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow all authenticated users for now - can be refined later)
CREATE POLICY "Allow all authenticated on drinks" ON drinks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all authenticated on drink_variants" ON drink_variants FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all authenticated on drink_sales" ON drink_sales FOR ALL USING (auth.role() = 'authenticated');
