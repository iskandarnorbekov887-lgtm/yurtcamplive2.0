-- Fix RLS on payments: allow team members to view, keep write access Manager/CEO-only
DROP POLICY IF EXISTS "Manager and CEO can manage payments" ON public.payments;

CREATE POLICY "Team members can view payments" ON public.payments
  FOR SELECT
  USING (
    booking_id IS NULL
    OR booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.team_id = (SELECT profiles.team_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

CREATE POLICY "Manager and CEO can modify payments" ON public.payments
  FOR ALL
  USING (
    (booking_id IS NULL OR booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.team_id = (SELECT profiles.team_id FROM profiles WHERE profiles.id = auth.uid())
    ))
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Manager','CEO'))
  )
  WITH CHECK (
    (booking_id IS NULL OR booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.team_id = (SELECT profiles.team_id FROM profiles WHERE profiles.id = auth.uid())
    ))
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Manager','CEO'))
  );

-- Fix duplicate/leaky RLS on booking_receipts: drop overlapping policies, keep single team-scoped policy
DROP POLICY IF EXISTS "Authenticated users can manage booking_receipts" ON public.booking_receipts;
DROP POLICY IF EXISTS "Team isolation for booking receipts" ON public.booking_receipts;
-- keep only "Team Isolation Policy"
