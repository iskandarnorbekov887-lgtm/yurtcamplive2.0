const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function runMigration() {
  const migrationPath = path.join(__dirname, '../../../supabase/migrations/schema_refactor.sql');
  const connectionString = "postgres://postgres.blcgjsnorpxsvaxohzxl:srWtnTWjcwutmIS6@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require";

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('Executing refactor migration...');
    await client.query(sql);
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

runMigration();
