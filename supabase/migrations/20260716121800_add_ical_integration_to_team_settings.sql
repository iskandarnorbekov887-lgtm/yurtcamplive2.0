-- Add iCal feed integration method as an alternative to service account API
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_settings' AND column_name = 'google_calendar_integration_method'
  ) THEN
    ALTER TABLE team_settings ADD COLUMN google_calendar_integration_method TEXT NOT NULL DEFAULT 'api' CHECK (google_calendar_integration_method IN ('api', 'ical'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_settings' AND column_name = 'google_ical_url'
  ) THEN
    ALTER TABLE team_settings ADD COLUMN google_ical_url TEXT NOT NULL DEFAULT '';
  END IF;
END $$;
