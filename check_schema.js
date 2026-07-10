import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runQuery() {
  const { data, error } = await supabase.from('team_settings').select('team_id, google_service_account_email, google_calendar_id, google_private_key');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const result = data.map(row => ({
    team_id: row.team_id,
    google_service_account_email: row.google_service_account_email,
    google_calendar_id: row.google_calendar_id,
    key_length: row.google_private_key ? row.google_private_key.length : 0
  }));
  
  console.table(result);
}

runQuery();
