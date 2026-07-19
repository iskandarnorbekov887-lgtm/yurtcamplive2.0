const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.blcgjsnorpxsvaxohzxl',
    password: 'srWtnTWjcwutmIS6',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const client = await pool.connect();
    
    // Drop old constraint
    console.log('Dropping old constraint...');
    await client.query('ALTER TABLE booking_services DROP CONSTRAINT IF EXISTS booking_services_service_type_check');
    
    // Add new constraint with 'extra'
    console.log('Adding new constraint with extra...');
    await client.query("ALTER TABLE booking_services ADD CONSTRAINT booking_services_service_type_check CHECK (service_type IN ('lunch', 'dinner', 'drinks', 'laundry', 'guide', 'transportation', 'extra'))");
    
    // Verify
    console.log('\nVerifying with constraint query...');
    const result = await client.query("SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'booking_services'::regclass AND contype = 'c'");
    console.log('Constraint check result:');
    result.rows.forEach(r => console.log(`  ${r.conname}: ${r.def}`));
    
    client.release();
    await pool.end();
    console.log('\nMigration applied successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    await pool.end();
  }
}

main().catch(console.error);
