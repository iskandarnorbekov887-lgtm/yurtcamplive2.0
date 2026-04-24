-- Create service_pricing table for CEO to configure service prices
CREATE TABLE IF NOT EXISTS service_pricing (
  id INTEGER PRIMARY KEY DEFAULT 1,
  guide_price DECIMAL(10, 2) DEFAULT 0,
  lunch_price DECIMAL(10, 2) DEFAULT 0,
  dinner_price DECIMAL(10, 2) DEFAULT 0,
  night_stay_price DECIMAL(10, 2) DEFAULT 0,
  laundry_price DECIMAL(10, 2) DEFAULT 0,
  pricing_enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default pricing row if it doesn't exist
INSERT INTO service_pricing (id, guide_price, lunch_price, dinner_price, night_stay_price, laundry_price, pricing_enabled)
SELECT 1, 0, 0, 0, 0, 0, FALSE
WHERE NOT EXISTS (SELECT 1 FROM service_pricing WHERE id = 1);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_pricing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_service_pricing_updated_at_trigger ON service_pricing;
CREATE TRIGGER update_service_pricing_updated_at_trigger
  BEFORE UPDATE ON service_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_service_pricing_updated_at();
