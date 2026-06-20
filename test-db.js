require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing supabase credentials in env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  try {
    const { data, error } = await supabase.from('grocery_requests').select('*').limit(1);
    if (error) {
      console.log("Error querying grocery_requests:", error.message, error);
    } else {
      console.log("Successfully queried grocery_requests! Data:", data);
    }
  } catch (e) {
    console.error("Catch error:", e);
  }
}

check();
