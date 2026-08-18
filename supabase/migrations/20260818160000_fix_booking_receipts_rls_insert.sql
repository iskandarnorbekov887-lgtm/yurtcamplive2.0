-- ============================================================
-- FIX: Add missing INSERT/UPDATE policies for booking_receipts
-- ============================================================
-- The 20260808060000 migration dropped "Authenticated users can manage booking_receipts"
-- but didn't replace it with a proper INSERT policy. This blocked all client-side receipt inserts.
-- This migration adds team-scoped INSERT/UPDATE policies for all authenticated users (matching bookings table policy).
-- The bookings table uses "bookings_all" policy allowing all authenticated users within their team,
-- so booking_receipts should follow the same pattern to allow any staff (Manager, CEO, Cook) to perform checkouts.

-- Allow all authenticated team members to insert booking_receipts for their team's bookings
CREATE POLICY "Team members can insert booking_receipts"
  ON public.booking_receipts
  FOR INSERT
  WITH CHECK (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.team_id = (SELECT profiles.team_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- Allow all authenticated team members to update booking_receipts for their team's bookings
CREATE POLICY "Team members can update booking_receipts"
  ON public.booking_receipts
  FOR UPDATE
  USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.team_id = (SELECT profiles.team_id FROM profiles WHERE profiles.id = auth.uid())
    )
  )
  WITH CHECK (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.team_id = (SELECT profiles.team_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- Allow all team members to view booking_receipts for their team's bookings
CREATE POLICY "Team members can view booking_receipts"
  ON public.booking_receipts
  FOR SELECT
  USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.team_id = (SELECT profiles.team_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
