-- Add OAuth token storage for Personal OAuth Login integration method
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS google_oauth_access_token TEXT;
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS google_oauth_refresh_token TEXT;
ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS google_oauth_token_expiry TIMESTAMPTZ;
