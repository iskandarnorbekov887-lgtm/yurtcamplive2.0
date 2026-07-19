-- Create payments table for tracking individual payment records per booking
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_original NUMERIC NOT NULL DEFAULT 0,
  currency_original TEXT NOT NULL DEFAULT 'USD',
  amount_usd_equivalent NUMERIC NOT NULL DEFAULT 0,
  exchange_rate_used NUMERIC NOT NULL DEFAULT 1,
  method TEXT NOT NULL DEFAULT 'Cash',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create booking_receipts table for persisting receipt snapshots
CREATE TABLE IF NOT EXISTS booking_receipts (
  id BIGSERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  receipt_id TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}',
  total_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_receipts_booking_id ON booking_receipts(booking_id);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_receipts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
DROP POLICY IF EXISTS "Authenticated users can manage payments" ON payments;
CREATE POLICY "Authenticated users can manage payments"
  ON payments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage booking_receipts" ON booking_receipts;
CREATE POLICY "Authenticated users can manage booking_receipts"
  ON booking_receipts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
