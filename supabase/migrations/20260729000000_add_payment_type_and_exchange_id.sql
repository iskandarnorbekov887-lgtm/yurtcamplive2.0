-- ============================================================
-- ADD TYPE AND EXCHANGE_ID FIELDS TO PAYMENTS TABLE
-- ============================================================

-- Add type field to distinguish between sales (income) and expenses (outflows)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'sale';

-- Add exchange_id field to link related exchange payments together
ALTER TABLE payments ADD COLUMN IF NOT EXISTS exchange_id UUID;

-- Add check constraint to ensure type is valid
ALTER TABLE payments ADD CONSTRAINT payments_type_check CHECK (type IN ('sale', 'expense'));

-- Add comment for documentation
COMMENT ON COLUMN payments.type IS 'Payment type: sale (income) or expense (outflow)';
COMMENT ON COLUMN payments.exchange_id IS 'Optional UUID to link two payment records from the same currency exchange event';

-- Create index on type for faster filtering
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_exchange_id ON payments(exchange_id);
