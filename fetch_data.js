require('dotenv').config({ path: '.env.local' });
// Bypass self‑signed SSL certificate validation for Supabase connection (development only)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { Client } = require('pg');

// Prefer non‑pooling URL to avoid PgBouncer complexities
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await client.connect();
    console.log('Fetching latest 20 camp_finances...');
    const financesRes = await client.query('SELECT * FROM camp_finances ORDER BY created_at DESC LIMIT 20;');
    console.log('camp_finances rows:');
    console.log(JSON.stringify(financesRes.rows, null, 2));
    console.log('Fetching latest 20 payments...');
    const paymentsRes = await client.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT 20;');
    console.log('payments rows:');
    console.log(JSON.stringify(paymentsRes.rows, null, 2));
  } catch (err) {
    console.error('Error running queries:', err);
  } finally {
    await client.end();
  }
}

run();
