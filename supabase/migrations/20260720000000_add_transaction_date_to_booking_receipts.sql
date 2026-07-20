-- Backfill settled_at with booking's check_out date for all existing rows
UPDATE booking_receipts br
SET settled_at = b.check_out::date
FROM bookings b
WHERE br.booking_id = b.id;
