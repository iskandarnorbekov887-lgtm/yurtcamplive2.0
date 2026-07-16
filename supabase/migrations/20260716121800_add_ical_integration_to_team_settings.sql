-- Add iCal feed integration method as an alternative to service account API
ALTER TABLE team_settings ADD COLUMN google_calendar_integration_method TEXT NOT NULL DEFAULT 'api' CHECK (google_calendar_integration_method IN ('api', 'ical'));
ALTER TABLE team_settings ADD COLUMN google_ical_url TEXT NOT NULL DEFAULT '';
