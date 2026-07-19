-- PURGE ALL GUEST DATA
-- WARNING: This script will DELETE ALL guest bookings and related data
-- Run this manually in Supabase SQL Editor after confirming you want to purge

-- Delete all bookings (this cascades to related records if foreign keys are set up)
DELETE FROM bookings;

-- Optionally: Delete financial records if they exist separately
-- DELETE FROM camp_finances;
-- DELETE FROM payments;
-- DELETE FROM receipts;

-- NOTE: Profiles table is NOT deleted - those are staff accounts (CEO, Manager, Cook)
-- If you want to delete staff accounts too, uncomment the line below:
-- DELETE FROM profiles;

-- Confirm deletion
SELECT 'All guest data purged successfully' AS status;
