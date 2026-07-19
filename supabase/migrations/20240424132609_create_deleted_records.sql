-- Create deleted_records table to store records that have been deleted
CREATE TABLE IF NOT EXISTS deleted_records (
  id INTEGER PRIMARY KEY,
  original_id INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'expense' or 'income'
  date DATE NOT NULL,
  category VARCHAR(255),
  description TEXT,
  original_amount DECIMAL(20, 2) NOT NULL,
  amount_uzs DECIMAL(20, 2),
  currency VARCHAR(10),
  exchange_rate DECIMAL(20, 2),
  guest_name VARCHAR(255),
  guest_count INTEGER,
  children_under_12 INTEGER,
  nights INTEGER,
  payment_method VARCHAR(20),
  guide_service BOOLEAN DEFAULT FALSE,
  guide_names TEXT,
  transportation BOOLEAN DEFAULT FALSE,
  transportation_details TEXT,
  lunch BOOLEAN DEFAULT FALSE,
  lunch_count INTEGER,
  dinner BOOLEAN DEFAULT FALSE,
  dinner_count INTEGER,
  laundry BOOLEAN DEFAULT FALSE,
  laundry_price DECIMAL(20, 2),
  laundry_currency VARCHAR(10),
  receipt_url TEXT,
  delete_reason TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_by VARCHAR(255) -- 'Manager' or 'CEO'
);

-- Create index on original_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_deleted_records_original_id ON deleted_records(original_id);
CREATE INDEX IF NOT EXISTS idx_deleted_records_date ON deleted_records(date);
CREATE INDEX IF NOT EXISTS idx_deleted_records_type ON deleted_records(type);
