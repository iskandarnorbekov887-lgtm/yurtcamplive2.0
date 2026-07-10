-- ============================================================
-- Apply this in the Supabase SQL Editor to migrate team_settings
-- from using google_api_key to service account credentials.
-- ============================================================

ALTER TABLE team_settings DROP COLUMN IF EXISTS google_api_key;
ALTER TABLE team_settings ADD COLUMN IF EXISTS google_service_account_email TEXT NOT NULL DEFAULT '';
ALTER TABLE team_settings ADD COLUMN IF EXISTS google_private_key TEXT NOT NULL DEFAULT '';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
