-- ============================================================
-- LOCKED BOOKING: booking_edit_requests + booking_extensions
-- Created for: paid-booking edit-request workflow + stay extensions
-- ============================================================

-- ============================================================
-- TABLE 1: booking_edit_requests
-- Stores requests to change a locked (paid) booking's fields.
-- Only CEO can approve/reject (UPDATE status/reviewed_by/reviewed_at).
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_edit_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  team_id         UUID    NOT NULL,
  requested_by    UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field_name      TEXT    NOT NULL,
  current_value   TEXT,
  requested_value TEXT,
  reason          TEXT,
  status          TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ber_booking_id ON booking_edit_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_ber_team_id    ON booking_edit_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_ber_status     ON booking_edit_requests(status);

ALTER TABLE booking_edit_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user whose team_id matches the row
DROP POLICY IF EXISTS "ber_team_select" ON booking_edit_requests;
CREATE POLICY "ber_team_select"
  ON booking_edit_requests FOR SELECT
  USING (team_id = (SELECT team_id FROM profiles WHERE id = auth.uid()));

-- INSERT: any authenticated user on the same team
DROP POLICY IF EXISTS "ber_team_insert" ON booking_edit_requests;
CREATE POLICY "ber_team_insert"
  ON booking_edit_requests FOR INSERT
  WITH CHECK (team_id = (SELECT team_id FROM profiles WHERE id = auth.uid()));

-- UPDATE: CEO only — to change status / reviewed_by / reviewed_at
DROP POLICY IF EXISTS "ber_ceo_update" ON booking_edit_requests;
CREATE POLICY "ber_ceo_update"
  ON booking_edit_requests FOR UPDATE
  USING (
    team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'CEO'
  )
  WITH CHECK (
    team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'CEO'
  );

-- ============================================================
-- TABLE 2: booking_extensions
-- Stores individual stay extensions for a paid booking.
-- Extensions are applied directly (no CEO approval required).
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_extensions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  team_id       UUID    NOT NULL,
  added_by      UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  days_added    INTEGER NOT NULL,
  amount_added  NUMERIC(12,2) NOT NULL DEFAULT 0,
  new_check_out DATE    NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bext_booking_id ON booking_extensions(booking_id);
CREATE INDEX IF NOT EXISTS idx_bext_team_id    ON booking_extensions(team_id);

ALTER TABLE booking_extensions ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user on the same team
DROP POLICY IF EXISTS "bext_team_select" ON booking_extensions;
CREATE POLICY "bext_team_select"
  ON booking_extensions FOR SELECT
  USING (team_id = (SELECT team_id FROM profiles WHERE id = auth.uid()));

-- INSERT: any authenticated user on the same team
DROP POLICY IF EXISTS "bext_team_insert" ON booking_extensions;
CREATE POLICY "bext_team_insert"
  ON booking_extensions FOR INSERT
  WITH CHECK (team_id = (SELECT team_id FROM profiles WHERE id = auth.uid()));

-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL ON booking_edit_requests TO anon, authenticated;
GRANT ALL ON booking_extensions     TO anon, authenticated;

-- Reload PostgREST schema cache so the new tables are immediately available
NOTIFY pgrst, 'reload schema';

SELECT 'booking_edit_requests + booking_extensions created successfully' AS status;
