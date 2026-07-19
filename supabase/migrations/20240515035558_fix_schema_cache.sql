-- ============================================================
-- FIX: "Could not find table 'public.bookings' in schema cache"
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- STEP 1: Verify the bookings table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bookings'
  ) THEN
    RAISE EXCEPTION 'bookings table does NOT exist — run 000_optimized_schema.sql first!';
  ELSE
    RAISE NOTICE 'bookings table EXISTS ✓';
  END IF;
END $$;

-- STEP 2: Ensure RLS policy is permissive (anon key must be able to access it)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Drop and recreate with explicit anon + authenticated grants
DROP POLICY IF EXISTS "bookings_all" ON public.bookings;
CREATE POLICY "bookings_all" ON public.bookings
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- STEP 3: Grant explicit table-level privileges to PostgREST roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.bookings TO anon, authenticated;
GRANT ALL ON public.bookings TO service_role;

-- Also grant sequence access (needed for INSERT with SERIAL pk)
GRANT USAGE, SELECT ON SEQUENCE public.bookings_id_seq TO anon, authenticated;

-- STEP 4: Reload PostgREST schema cache
-- This tells PostgREST to re-read the schema without restarting
NOTIFY pgrst, 'reload schema';

-- STEP 5: Verify related tables also have proper grants
GRANT ALL ON public.meal_requests TO anon, authenticated;
GRANT ALL ON public.payments TO anon, authenticated;
GRANT ALL ON public.booking_services TO anon, authenticated;
GRANT ALL ON public.booking_receipts TO anon, authenticated;
GRANT ALL ON public.profiles TO anon, authenticated;

-- Confirm success
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bookings', 'meal_requests', 'payments', 'booking_services', 'profiles')
ORDER BY table_name;
