-- Add 'extra' to the booking_services service_type CHECK constraint
-- This allows extra services to be stored in the normalized booking_services table
-- instead of the bookings.extra_services array column

ALTER TABLE booking_services DROP CONSTRAINT IF EXISTS booking_services_service_type_check;
ALTER TABLE booking_services ADD CONSTRAINT booking_services_service_type_check 
  CHECK (service_type IN ('lunch', 'dinner', 'drinks', 'laundry', 'guide', 'transportation', 'extra'));
