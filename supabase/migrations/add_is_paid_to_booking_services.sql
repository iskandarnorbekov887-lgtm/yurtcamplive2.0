ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false NOT NULL;
