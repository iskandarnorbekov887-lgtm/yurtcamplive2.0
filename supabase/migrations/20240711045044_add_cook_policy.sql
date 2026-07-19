-- Migration: Cook can view team notifications
DROP POLICY IF EXISTS "Cook can view notifications" ON notifications;

DROP POLICY IF EXISTS "Cook can view team notifications" ON notifications;
CREATE POLICY "Cook can view team notifications"
  ON notifications
  FOR SELECT
  USING (
    (target_role = 'Cook' OR target_role = 'all')
    AND team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );
