-- Migration: Add missing procurement columns
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'UZS';
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4) DEFAULT 1;
ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS total_spent_uzs NUMERIC(12,2) DEFAULT 0;

ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS actual_received_qty NUMERIC(12,3) DEFAULT 0;
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS unit_price_uzs NUMERIC(12,2) DEFAULT 0;
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE procurement_items ADD COLUMN IF NOT EXISTS cook_comment TEXT;
