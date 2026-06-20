/* Migration: add_amount_to_bookings.sql */
ALTER TABLE public.bookings
ADD COLUMN amount NUMERIC(12,2) DEFAULT 0;
