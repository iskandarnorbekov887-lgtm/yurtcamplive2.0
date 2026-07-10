const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://blcgjsnorpxsvaxohzxl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsY2dqc25vcnB4c3ZheG9oenhsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAwMzk2MiwiZXhwIjoyMDkzNTc5OTYyfQ.gqSdc2G4PtAnCoQwyjEfWCel_zvgSkcRKD7q6Oe3_DI');
async function run() {
  const { data, error } = await supabase.rpc('run_sql', { sql: "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'team_id';" });
  console.log('Result:', JSON.stringify(data || error, null, 2));
}
run();
