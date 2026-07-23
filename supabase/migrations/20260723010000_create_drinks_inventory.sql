-- ============================================================
-- CREATE DRINKS INVENTORY AND SALES TRACKING
-- ============================================================

-- 1. Create drinks table for inventory management
CREATE TABLE IF NOT EXISTS drinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_in_stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create drink_sales table for tracking sales
CREATE TABLE IF NOT EXISTS drink_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drink_id UUID NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_sale NUMERIC(12,2) NOT NULL,
  sold_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_drink_sales_drink_id ON drink_sales(drink_id);
CREATE INDEX IF NOT EXISTS idx_drink_sales_booking_id ON drink_sales(booking_id);
CREATE INDEX IF NOT EXISTS idx_drink_sales_sold_at ON drink_sales(sold_at);

-- 4. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_drinks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to update updated_at
DROP TRIGGER IF EXISTS trg_drinks_updated_at ON drinks;
CREATE TRIGGER trg_drinks_updated_at
  BEFORE UPDATE ON drinks
  FOR EACH ROW
  EXECUTE FUNCTION update_drinks_updated_at();

-- 6. Enable Row Level Security
ALTER TABLE drinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE drink_sales ENABLE ROW LEVEL SECURITY;

-- 7. Create policies for drinks (authenticated users can read/write)
CREATE POLICY "Authenticated users can view drinks"
  ON drinks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert drinks"
  ON drinks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update drinks"
  ON drinks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete drinks"
  ON drinks FOR DELETE
  TO authenticated
  USING (true);

-- 8. Create policies for drink_sales (authenticated users can read/write)
CREATE POLICY "Authenticated users can view drink_sales"
  ON drink_sales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert drink_sales"
  ON drink_sales FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
