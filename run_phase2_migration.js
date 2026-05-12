const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/phase2_bulletproof_logic.sql'), 'utf8');
  const connectionString = "postgres://postgres.blcgjsnorpxsvaxohzxl:srWtnTWjcwutmIS6@aws-1-eu-central-1.pooler.supabase.com:5432/postgres";

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🚀 Connecting to database for Phase 2 Migration...');
    await client.connect();
    console.log('📦 Executing SQL...');
    await client.query(sql);
    console.log('✅ Phase 2 Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
