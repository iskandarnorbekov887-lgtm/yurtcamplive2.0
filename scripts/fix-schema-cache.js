/**
 * fix-schema-cache.js
 * Diagnoses and fixes "Could not find table 'public.bookings' in schema cache"
 * Run with: node scripts/fix-schema-cache.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, '');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function runSQL(sql, description) {
  // Use the management API SQL endpoint via service role
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Management API requires PAT — use direct pg approach via RPC instead
      },
      body: JSON.stringify({ query: sql })
    }
  );
  return response;
}

async function main() {
  console.log('🔍 Supabase Schema Cache Fix Tool');
  console.log('===================================');
  console.log(`📡 Project: ${SUPABASE_URL}`);
  console.log('');

  // STEP 1: Check if bookings table is accessible via anon/service role
  console.log('STEP 1: Testing bookings table access...');
  const { data, error } = await supabase
    .from('bookings')
    .select('count')
    .limit(1);

  if (error) {
    console.error('❌ bookings table ERROR:', error.message);
    console.error('   Code:', error.code);
    console.error('   Hint:', error.hint || 'none');
    console.log('');

    if (error.message.includes('schema cache') || error.code === 'PGRST204') {
      console.log('📋 DIAGNOSIS: PostgREST schema cache is stale OR table is missing.');
      console.log('   The table may exist in the DB but PostgREST hasn\'t loaded it.');
    } else if (error.code === '42P01') {
      console.log('📋 DIAGNOSIS: Table does NOT exist in database. Run the full migration.');
    }
  } else {
    console.log('✅ bookings table is accessible! Count result:', data);
    console.log('   The error may be intermittent or already resolved.');
  }

  // STEP 2: Check related tables
  console.log('');
  console.log('STEP 2: Checking related tables...');
  const tables = ['meal_requests', 'payments', 'booking_services', 'yurts', 'profiles'];
  for (const table of tables) {
    const { error: e } = await supabase.from(table).select('count').limit(1);
    if (e) {
      console.log(`  ❌ ${table}: ${e.message}`);
    } else {
      console.log(`  ✅ ${table}: OK`);
    }
  }

  // STEP 3: Try to trigger schema reload via Supabase Realtime trick
  console.log('');
  console.log('STEP 3: Attempting schema cache reload...');
  
  // The NOTIFY pgrst, 'reload schema' must be done via raw SQL.
  // We'll call a Supabase built-in function if available.
  const { data: reloadData, error: reloadError } = await supabase
    .rpc('reload_types'); // This may not exist, but worth trying

  if (!reloadError) {
    console.log('✅ Schema reload RPC succeeded');
  } else {
    console.log('ℹ️  Schema reload RPC not available (expected).');
    console.log('   You must run the SQL below in the Supabase SQL Editor.');
  }

  // STEP 4: Print the exact SQL to fix this
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('📋 MANUAL FIX: Run this SQL in your Supabase SQL Editor');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('URL: https://supabase.com/dashboard/project/blcgjsnorpxsvaxohzxl/sql/new');
  console.log('');
  console.log(`-- Paste and run this SQL:
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify bookings exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'bookings';
`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
