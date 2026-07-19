-- Restrict profile UPDATE to CEO only for security
-- This prevents regular staff from modifying their own or others' profiles

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can update profiles" ON profiles;

-- Create CEO-only update policy
DROP POLICY IF EXISTS "CEO can update profiles" ON profiles;
CREATE POLICY "CEO can update profiles"
  ON profiles FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'CEO'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'CEO'
  );

SELECT 'Profile UPDATE policy restricted to CEO only successfully' AS status;
