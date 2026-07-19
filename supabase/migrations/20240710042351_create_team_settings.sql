-- ============================================================
-- Migration: create_team_settings
-- Purpose : Stores per-team Google Calendar credentials.
--           Row Level Security ensures only CEO-role users
--           can read or write their own team's credentials.
-- ============================================================

CREATE TABLE IF NOT EXISTS team_settings (
  -- Uses the team owner's profile ID as the team identifier.
  -- For a multi-user team, replace with a dedicated teams.id FK.
  team_id        UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  google_calendar_id  TEXT    NOT NULL DEFAULT '',
  google_api_key      TEXT    NOT NULL DEFAULT '',

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_team_settings_updated_at ON team_settings;
CREATE TRIGGER trg_team_settings_updated_at
  BEFORE UPDATE ON team_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;

-- Only authenticated users whose team_id matches their own profile id may read.
-- (Edge Function uses service-role key, bypasses RLS — this protects direct
--  client queries if they accidentally reach this table.)
DROP POLICY IF EXISTS "team_settings_select_own" ON team_settings;
CREATE POLICY "team_settings_select_own"
  ON team_settings
  FOR SELECT
  USING (auth.uid() = team_id);

-- Only CEO role may insert/update credentials.
DROP POLICY IF EXISTS "team_settings_upsert_ceo" ON team_settings;
CREATE POLICY "team_settings_upsert_ceo"
  ON team_settings
  FOR ALL
  USING (
    auth.uid() = team_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'CEO'
    )
  )
  WITH CHECK (
    auth.uid() = team_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'CEO'
    )
  );

-- ── Index ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_team_settings_team_id ON team_settings(team_id);

-- ── Done ──────────────────────────────────────────────────────────────────────
SELECT 'team_settings table created successfully' AS status;
